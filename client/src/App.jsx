import { useReducer, useState } from "react";
import { useRecorder } from "./audio/useRecorder";
import { useTranscriptionSocket } from "./net/useTranscriptionSocket";
import { initialTranscript, transcriptReducer } from "./transcript/transcriptReducer";
import LiveTranscript from "./transcript/LiveTranscript";

// Temporary UI: replaced by the recorder and notes UI in step 4.3.
function App() {
  const [transcript, dispatch] = useReducer(transcriptReducer, initialTranscript);
  const [streamError, setStreamError] = useState(null);

  const { status, startStream, sendAudio, stopStream } = useTranscriptionSocket({
    onPartial: (text) => dispatch({ type: "PARTIAL", text }),
    onFinal: (text) => dispatch({ type: "FINAL", text }),
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
    navigator.clipboard.writeText(transcript.committed);
  };

  const onClearTranscription = () => {
    dispatch({ type: "CLEAR" });
  };

  return (
    <div>
      <p>Server: {status}</p>
      {recorderError && <p role="alert">{recorderError.message}</p>}
      {streamError && <p role="alert">{streamError}</p>}
      {isRecording ? (
        <LiveTranscript committed={transcript.committed} partial={transcript.partial} />
      ) : (
        <textarea
          style={{ display: "block" }}
          value={transcript.committed}
          onChange={(e) => dispatch({ type: "EDIT", text: e.target.value })}
          rows="10"
          cols="50"
        />
      )}
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
