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
 * - stream-ended { reason }           The stream is over: "stopped" | "closed".
 * - stream-error { code, message }    Codes: INVALID_CONFIG, TRANSCRIBER_ERROR.
 */

export const MIN_SAMPLE_RATE = 8000;
export const MAX_SAMPLE_RATE = 48000;

function readSampleRate(payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null;
  const { sampleRate } = payload;
  if (!Number.isInteger(sampleRate)) return null;
  if (sampleRate < MIN_SAMPLE_RATE || sampleRate > MAX_SAMPLE_RATE) return null;
  return sampleRate;
}

export function handleConnection(socket, { createTranscriber }) {
  // The active stream, or null. `stopping` is true between stop-stream and stream-ended.
  let active = null;

  function sendError(code, message) {
    socket.emit("stream-error", { code, message });
  }

  // Stop forwarding a transcriber's events (it may still emit while shutting down).
  function detach(stream) {
    stream.transcriber.removeAllListeners();
    stream.transcriber.on("error", () => {}); // an unhandled "error" event would crash the process
    if (active === stream) active = null;
  }

  function start(sampleRate) {
    const transcriber = createTranscriber({ sampleRate });
    const stream = { transcriber, stopping: false };
    active = stream;

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
    start(sampleRate);
  });

  socket.on("incoming-audio", (chunk) => {
    if (active && !active.stopping) active.transcriber.send(chunk);
  });

  socket.on("stop-stream", async () => {
    const stream = active;
    if (!stream || stream.stopping) return;
    stream.stopping = true;

    await stream.transcriber.finish();

    // A new configure-stream may have replaced this stream while it was finishing.
    if (active !== stream) return;
    detach(stream);
    socket.emit("stream-ended", { reason: "stopped" });
  });

  socket.on("disconnect", () => {
    if (!active) return;
    const stream = active;
    detach(stream);
    stream.transcriber.close();
  });
}
