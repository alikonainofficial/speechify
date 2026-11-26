import { useState } from "react";
import { useRecorder } from "./audio/useRecorder";
import { useTranscriptionSocket } from "./net/useTranscriptionSocket";

// Temporary UI: replaced by the recorder and notes UI in step 4.3.
function App() {
  const [transcription, setTranscription] = useState("");
  const [partialTranscription, setPartialTranscription] = useState("");
  const [streamError, setStreamError] = useState(null);

  const { status, startStream, sendAudio, stopStream } = useTranscriptionSocket({
    onPartial: (text) => setPartialTranscription(text),
    onFinal: (text) => {
      setTranscription((prev) => prev + text + " ");
      setPartialTranscription("");
    },
    onEnded: () => stopRecording(),
    onError: (error) => setStreamError(error.message),
  });

  const { start: startRecording, stop: stopRecording, isRecording, error: recorderError } = useRecorder({
    onChunk: sendAudio,
  });

  const onStartRecordingPress = async () => {
    setStreamError(null);
    const sampleRate = await startRecording();
    if (sampleRate) startStream(sampleRate);
  };

  const onStopRecordingPress = () => {
    stopRecording();
    stopStream();
  };

  const onCopyTranscription = () => {
    navigator.clipboard.writeText(transcription);
  };

  const onClearTranscription = () => {
    setTranscription("");
    setPartialTranscription("");
  };

  return (
    <div>
      <p>Server: {status}</p>
      {recorderError && <p role="alert">{recorderError.message}</p>}
      {streamError && <p role="alert">{streamError}</p>}
      <textarea
        style={{ display: "block" }}
        value={transcription + partialTranscription}
        onChange={(e) => setTranscription(e.target.value)}
        rows="10"
        cols="50"
      />
      <button onClick={onStartRecordingPress} disabled={isRecording || status !== "connected"}>
        Start Recording
      </button>
      <button onClick={onStopRecordingPress} disabled={!isRecording}>
        Stop Recording
      </button>
      <button onClick={onCopyTranscription}>Copy</button>
      <button onClick={onClearTranscription}>Clear</button>
    </div>
  );
}

export default App;
