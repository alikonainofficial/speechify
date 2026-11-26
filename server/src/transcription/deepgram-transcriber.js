import EventEmitter from "events";
import WebSocket from "ws";

// Streams raw PCM audio to Deepgram's live transcription API.
// Events: "ready", "partial" (text), "final" (text), "error" (Error), "closed".
export default class DeepgramTranscriber extends EventEmitter {
  constructor({ sampleRate, apiKey }) {
    super();
    this.sampleRate = sampleRate;
    this.apiKey = apiKey;
    this.connection = null;
    this.ready = false;
    this.partialBuffer = "";
    this.start();
  }

  start() {
    const params = {
      model: "nova-2",
      punctuate: true,
      language: "en",
      interim_results: true,
      diarize: false,
      smart_format: true,
      endpointing: 0,
      encoding: "linear16",
      sample_rate: this.sampleRate,
    };

    const url = `wss://api.deepgram.com/v1/listen?${new URLSearchParams(params).toString()}`;

    this.connection = new WebSocket(url, {
      headers: { Authorization: `Token ${this.apiKey}` },
    });

    this.connection.on("open", () => {
      console.log("Deepgram connection opened");
      this.ready = true;
      this.emit("ready");
    });

    this.connection.on("message", (data) => {
      const message = JSON.parse(data);
      const {
        is_final,
        channel: { alternatives },
      } = message;
      const transcript = alternatives[0]?.transcript;

      if (transcript) {
        if (is_final) {
          this.emit("final", transcript);
          this.partialBuffer = "";
        } else if (transcript !== this.partialBuffer) {
          this.partialBuffer = transcript;
          this.emit("partial", transcript);
        }
      }
    });

    this.connection.on("error", (error) => {
      this.emit("error", error);
    });

    this.connection.on("close", () => {
      this.ready = false;
      console.log("Deepgram connection closed");
      this.emit("closed");
    });
  }

  // Audio sent before Deepgram's socket is open is dropped (fixed in step 2.3).
  send(payload) {
    if (this.ready && this.connection) {
      this.connection.send(payload);
    }
  }

  // Closes the Deepgram connection immediately.
  close() {
    if (this.connection) {
      this.connection.close();
      this.connection = null;
      this.ready = false;
    }
  }
}
