/**
 * Per-socket transcription session.
 *
 * Client → server events:
 * - configure-stream { sampleRate }: start a transcriber for this socket.
 * - incoming-audio <PCM chunk>: forward audio to the transcriber.
 * - stop-stream: end the transcriber.
 * - disconnect: end the transcriber.
 *
 * Server → client events:
 * - transcriber-ready: the transcriber is ready.
 * - partial (string): an interim transcript.
 * - final (string): a final transcript.
 * - error (string): something went wrong.
 */
export function handleConnection(socket, { createTranscriber }) {
  console.log(`connection made (${socket.id})`);
  let transcriber = null;

  socket.on("configure-stream", ({ sampleRate }) => {
    transcriber = createTranscriber({ sampleRate });
    transcriber.on("ready", () => socket.emit("transcriber-ready"));
    transcriber.on("partial", (text) => socket.emit("partial", text));
    transcriber.on("final", (text) => socket.emit("final", text));
    transcriber.on("error", (error) => socket.emit("error", error.message));
  });

  socket.on("incoming-audio", (audioData) => {
    if (transcriber) {
      transcriber.send(audioData);
    }
  });

  socket.on("stop-stream", () => {
    if (transcriber) {
      transcriber.close();
      transcriber = null;
    }
  });

  socket.on("disconnect", () => {
    if (transcriber) {
      transcriber.close();
      transcriber = null;
    }
    console.log(`connection closed (${socket.id})`);
  });
}
