/**
 * Per-socket transcription session.
 *
 * Client → server
 * - configure-stream { sampleRate }   Start streaming. sampleRate: integer 8000–48000.
 *                                     Sending it again replaces the current stream.
 * - incoming-audio <Int16 PCM chunk>  Audio for the active stream (ignored otherwise).
 * - stop-stream                       Finish the stream; late finals still arrive.
 *
 * Server → client
 * - transcriber-ready                 The stream is open; audio sent earlier is not lost.
 * - partial (string)                  Interim text for the current phrase.
 * - final (string)                    Final text for a phrase.
 * - stream-ended { reason }           The stream is over: "stopped" | "time-limit" | "closed" | "server-shutdown".
 * - stream-error { code, message }    Codes: INVALID_CONFIG, BUSY, DAILY_LIMIT, TRANSCRIBER_ERROR.
 *
 * Limits (see limits.js): a stream is auto-stopped after config.maxSessionSeconds,
 * or sooner if the IP's daily budget runs out.
 */
import { LIMIT_MESSAGES } from "../limits.js";

export const MIN_SAMPLE_RATE = 8000;
export const MAX_SAMPLE_RATE = 48000;

function readSampleRate(payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null;
  const { sampleRate } = payload;
  if (!Number.isInteger(sampleRate)) return null;
  if (sampleRate < MIN_SAMPLE_RATE || sampleRate > MAX_SAMPLE_RATE) return null;
  return sampleRate;
}

export function handleConnection(socket, { createTranscriber, config, limits, clientIp, shutdownHooks }) {
  // The active stream, or null. `stopping` is true between stop-stream and stream-ended.
  let active = null;

  function sendError(code, message) {
    socket.emit("stream-error", { code, message });
  }

  // Stop forwarding a transcriber's events (it may still emit while shutting down)
  // and give its slot and remaining time back to the limits.
  function detach(stream) {
    clearTimeout(stream.timeLimit);
    stream.lease.release();
    stream.transcriber.removeAllListeners();
    stream.transcriber.on("error", () => {}); // an unhandled "error" event would crash the process
    if (active === stream) active = null;
  }

  // Finishes the stream: late finals are still forwarded, then stream-ended is sent.
  async function stop(stream, reason) {
    if (stream.stopping) return;
    stream.stopping = true;
    clearTimeout(stream.timeLimit);

    await stream.transcriber.finish();

    // A new configure-stream may have replaced this stream while it was finishing.
    if (active !== stream) return;
    detach(stream);
    socket.emit("stream-ended", { reason });
  }

  function start(sampleRate, lease) {
    const transcriber = createTranscriber({ sampleRate });
    const stream = { transcriber, lease, stopping: false, timeLimit: null };
    active = stream;

    const seconds = Math.min(config.maxSessionSeconds, lease.secondsAllowed);
    stream.timeLimit = setTimeout(() => stop(stream, "time-limit"), seconds * 1000);

    transcriber.on("ready", () => socket.emit("transcriber-ready"));
    transcriber.on("partial", (text) => socket.emit("partial", text));
    transcriber.on("final", (text) => socket.emit("final", text));
    transcriber.on("error", (error) => sendError("TRANSCRIBER_ERROR", error.message));
    transcriber.on("closed", () => {
      if (stream.stopping) return; // stop-stream reports the end itself
      detach(stream);
      socket.emit("stream-ended", { reason: "closed" });
    });
  }

  socket.on("configure-stream", (payload) => {
    const sampleRate = readSampleRate(payload);
    if (sampleRate === null) {
      sendError(
        "INVALID_CONFIG",
        `configure-stream needs { sampleRate } as an integer from ${MIN_SAMPLE_RATE} to ${MAX_SAMPLE_RATE}.`,
      );
      return;
    }

    if (active) {
      const previous = active;
      detach(previous);
      previous.transcriber.close();
    }

    const result = limits.acquire(clientIp);
    if (!result.ok) {
      sendError(result.code, LIMIT_MESSAGES[result.code]);
      return;
    }
    start(sampleRate, result.lease);
  });

  socket.on("incoming-audio", (chunk) => {
    if (active && !active.stopping) active.transcriber.send(chunk);
  });

  socket.on("stop-stream", () => {
    if (active) stop(active, "stopped");
  });

  // On server shutdown: finish the active stream so the user keeps their last words.
  const finishForShutdown = () => (active ? stop(active, "server-shutdown") : Promise.resolve());
  shutdownHooks?.add(finishForShutdown);

  socket.on("disconnect", () => {
    shutdownHooks?.delete(finishForShutdown);
    if (!active) return;
    const stream = active;
    detach(stream);
    stream.transcriber.close();
  });
}
