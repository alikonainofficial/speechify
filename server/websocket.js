import Transcriber from "./transcriber.js";

/**
 * Events to subscribe to:
 * - connection: Triggered when a client connects to the server.
 * - configure-stream: Requires an object with a 'sampleRate' property.
 * - incoming-audio: Requires audio data as the parameter.
 * - stop-stream: Triggered when the client requests to stop the transcription stream.
 * - disconnect: Triggered when a client disconnects from the server.
 *
 *
 * Events to emit:
 * - transcriber-ready: Emitted when the transcriber is ready.
 * - final: Emits the final transcription result (string).
 * - partial: Emits the partial transcription result (string).
 * - error: Emitted when an error occurs.
 */

const initializeWebSocket = (io) => {
  io.on("connection", (socket) => {
    console.log(`connection made (${socket.id})`);

    // ... add needed event handlers and logic
    let transcriber = null;

    socket.on("configure-stream", ({sampleRate}) => {
      transcriber = new Transcriber(sampleRate);
      transcriber.on("ready", () => {
        socket.emit("transcriber-ready");
      });
      transcriber.on("partial", (result) => {
        socket.emit("partial", result);
      });
      transcriber.on("final", (result) => {
        socket.emit("final", result);
      });
      transcriber.on("error", (error) => {
        socket.emit("error", error.message);
      });
    });

    socket.on("incoming-audio", (audioData) => {
      if(transcriber) {
        transcriber.send(audioData);
      }
    });

    socket.on("stop-stream", () => {
      if(transcriber) {
        transcriber.endTranscriptionStream();
        transcriber = null;
      }
    });

    socket.on("disconnect", () => {
      if(transcriber) {
        transcriber.endTranscriptionStream();
        transcriber = null;
      }
      console.log(`connection closed (${socket.id})`);
    });
  });

  return io;
};

export default initializeWebSocket;
