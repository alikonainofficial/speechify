import EventEmitter from "events";
import WebSocket from "ws";

export const DEEPGRAM_URL = "wss://api.deepgram.com/v1/listen";

const BYTES_PER_SAMPLE = 2; // linear16
const MAX_BUFFERED_SECONDS = 10;
const KEEP_ALIVE_MS = 4000; // Deepgram closes a stream after ~10 s with no data
const KEEP_ALIVE_CHECK_MS = 1000;
const FINISH_TIMEOUT_MS = 5000;

/**
 * Streams raw 16-bit PCM audio to Deepgram's live transcription API.
 *
 * Events:
 * - "ready": the Deepgram socket is open.
 * - "partial" (text) / "final" (text): transcripts.
 * - "error" (Error): a short message that is safe to show to users.
 * - "closed" (reason): "finished" after finish(), "closed" after close(),
 *   "remote" if Deepgram closed the stream, "error" after a connection error.
 *
 * Methods:
 * - send(chunk): buffers audio until the socket is open, then sends it in order.
 * - finish(): asks Deepgram to flush its last results, resolves once it closes.
 * - close(): closes immediately (used when the browser disconnects).
 */
export default class DeepgramTranscriber extends EventEmitter {
  constructor({
    sampleRate,
    apiKey,
    url = DEEPGRAM_URL,
    finishTimeoutMs = FINISH_TIMEOUT_MS,
  }) {
    super();
    this.sampleRate = sampleRate;
    this.finishTimeoutMs = finishTimeoutMs;

    this.pending = []; // audio received before the socket opened
    this.pendingBytes = 0;
    this.maxPendingBytes = sampleRate * BYTES_PER_SAMPLE * MAX_BUFFERED_SECONDS;

    this.lastSentAt = 0;
    this.keepAliveTimer = null;
    this.lastPartial = "";
    this.finishing = null; // Promise while finish() is in progress
    this.closeReason = null; // set once we decide why the stream is ending
    this.closedEmitted = false;

    this.socket = this.connect(url, apiKey);
  }

  connect(url, apiKey) {
    const params = new URLSearchParams({
      model: "nova-3",
      encoding: "linear16",
      sample_rate: String(this.sampleRate),
      interim_results: "true",
      smart_format: "true",
      punctuate: "true",
      language: "en",
    });

    const socket = new WebSocket(`${url}?${params}`, {
      headers: { Authorization: `Token ${apiKey}` },
    });

    socket.on("open", () => this.handleOpen());
    socket.on("message", (data, isBinary) => {
      if (!isBinary) this.handleMessage(data);
    });
    socket.on("error", (error) => this.handleError(error));
    socket.on("close", () => this.handleClose());
    return socket;
  }

  handleOpen() {
    // Flush audio that arrived while connecting, oldest first.
    for (const chunk of this.pending) this.socket.send(chunk);
    this.pending = [];
    this.pendingBytes = 0;
    this.lastSentAt = Date.now();

    this.keepAliveTimer = setInterval(() => {
      if (Date.now() - this.lastSentAt >= KEEP_ALIVE_MS) {
        this.sendControl("KeepAlive");
      }
    }, KEEP_ALIVE_CHECK_MS);

    this.emit("ready");
    if (this.finishing) this.sendControl("CloseStream");
  }

  handleMessage(data) {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      return; // not JSON: ignore
    }
    if (message?.type !== "Results") return; // Metadata, SpeechStarted, etc.

    const transcript = message.channel?.alternatives?.[0]?.transcript;
    if (!transcript) return;

    if (message.is_final) {
      this.lastPartial = "";
      this.emit("final", transcript);
    } else if (transcript !== this.lastPartial) {
      this.lastPartial = transcript;
      this.emit("partial", transcript);
    }
  }

  handleError(error) {
    if (this.closeReason === "closed") return; // we closed it on purpose
    this.closeReason = this.closeReason ?? "error";
    this.emit("error", new Error(safeErrorMessage(error)));
  }

  handleClose() {
    clearInterval(this.keepAliveTimer);
    this.keepAliveTimer = null;
    this.pending = [];
    if (this.closedEmitted) return;
    this.closedEmitted = true;
    this.emit("closed", this.closeReason ?? (this.finishing ? "finished" : "remote"));
  }

  send(chunk) {
    if (this.closeReason || this.finishing) return;

    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(chunk);
      this.lastSentAt = Date.now();
      return;
    }

    if (this.socket.readyState === WebSocket.CONNECTING) {
      this.pending.push(chunk);
      this.pendingBytes += chunk.length;
      while (this.pendingBytes > this.maxPendingBytes && this.pending.length > 1) {
        this.pendingBytes -= this.pending.shift().length;
      }
    }
  }

  sendControl(type) {
    if (this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ type }));
    this.lastSentAt = Date.now();
  }

  finish() {
    if (this.finishing) return this.finishing;
    if (this.closedEmitted) return Promise.resolve();

    this.finishing = new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.closeReason = this.closeReason ?? "finished";
        this.socket.terminate();
      }, this.finishTimeoutMs);
      this.once("closed", () => {
        clearTimeout(timer);
        resolve();
      });
    });

    // If still connecting, CloseStream is sent right after the buffered audio in handleOpen().
    this.sendControl("CloseStream");
    return this.finishing;
  }

  close() {
    if (this.closedEmitted) return;
    this.closeReason = "closed";
    this.socket.terminate();
  }
}

// Never pass raw errors on: they can contain the URL, headers or other internals.
function safeErrorMessage(error) {
  const status = /Unexpected server response: (\d+)/.exec(error?.message ?? "")?.[1];
  if (status === "401" || status === "403") return "The transcription service rejected the API key.";
  if (status === "429") return "The transcription service is busy. Please try again shortly.";
  if (status) return `The transcription service refused the connection (HTTP ${status}).`;
  return "Lost connection to the transcription service.";
}
