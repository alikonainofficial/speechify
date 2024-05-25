import EventEmitter from "events";
import { createClient } from "@deepgram/sdk";
import dotenv from 'dotenv';
import WebSocket from 'ws';

dotenv.config();

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

class Transcriber extends EventEmitter {
  constructor(sampleRate) {
    super();
    this.sampleRate = sampleRate;
    this.deepgram = createClient(DEEPGRAM_API_KEY);
    this.connection = null;
    this.ready = false;
    this.startTranscriptionStream(this.sampleRate);
  }

  // sampleRate: number
  startTranscriptionStream(sampleRate) {
    const config = {
      model: "nova-2",
      punctuate: true,
      language: "en",
      interim_results: true,
      diarize: false,
      smart_format: true,
      endpointing: 0,
      encoding: "linear16",
      sample_rate: sampleRate,
    };

    const url = `wss://api.deepgram.com/v1/listen?${new URLSearchParams(config).toString()}`;

    this.connection = new WebSocket(url, {
      headers: {
        Authorization: `Token ${DEEPGRAM_API_KEY}`
      }
    });

    this.connection.on('open', () => {
      console.log("Deepgram connection opened");
      this.ready = true;
      this.emit("ready");
    });

    // this.connection.on('message', (data) => {
    //   const message = JSON.parse(data);
    //   const { is_final, channel: { alternatives } } = message;
    //   const transcript = alternatives[0]?.transcript;

    //   if (transcript) {
    //     if (is_final) {
    //       this.emit("final", transcript);
    //     } else {
    //       this.emit("partial", transcript);
    //     }
    //   }
    // });

    this.connection.on('message', (data) => {
      const message = JSON.parse(data);
      const { is_final, channel: { alternatives } } = message;
      const transcript = alternatives[0]?.transcript;

      if (transcript) {
        if (is_final) {
          this.emit("final", transcript);
          this.partialBuffer = ''; // Clear the partial buffer on final result
        } else {
          if (transcript !== this.partialBuffer) {
            this.partialBuffer = transcript;
            this.emit("partial", transcript);
          }
        }
      }
    });

    this.connection.on('error', (error) => {
      this.emit("error", error);
    });

    this.connection.on('close', () => {
      this.ready = false;
      console.log("Deepgram connection closed");
    });
  }

  endTranscriptionStream() {
    // close deepgram connection here
    if (this.connection) {
      this.connection.close();
      this.connection = null;
      this.ready = false;
    }
  }

  // NOTE: deepgram must be ready before sending audio payload or it will close the connection
  send(payload) {
    if (this.ready && this.connection) {
      this.connection.send(payload);
    }
  }

  // ... feel free to add more functions
}

export default Transcriber;
