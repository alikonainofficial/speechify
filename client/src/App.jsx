import { useEffect, useState } from "react";
import useAudioRecorder from "./useAudioRecorder";
import useSocket from "./useSocket";

// IMPORTANT: To ensure proper functionality and microphone access, please follow these steps:
// 1. Access the site using 'localhost' instead of the local IP address.
// 2. When prompted, grant microphone permissions to the site to enable audio recording.
// Failure to do so may result in issues with audio capture and transcription.
// NOTE: Don't use createPortal()

function App() {

  const textAreaStyle = {
    display: "block"
  };
  
  const { socket, initialize } = useSocket();
  const [transcription, setTranscription] = useState("");
  const [partialTranscription, setPartialTranscription] = useState("");
  const { startRecording, stopRecording, isRecording } = useAudioRecorder({
    dataCb: (data) => {
      if(socket) {
        socket.emit("incoming-audio", data);
      }
    },
  });

  useEffect(() => {
    // Note: must connect to server on page load but don't start transcriber
    initialize();
    if(socket){
      socket.on("transcriber-ready", () => {
        console.log("Transcriber is ready");
      });

      socket.on("partial", (text) => {
        setPartialTranscription(text);
      });

      socket.on("final", (text) => {
        setTranscription((prev) => prev + text + " ");
        setPartialTranscription(""); // Clear the partial transcription
      });

      socket.on("error", (error) => {
        console.error("Transcription error: ", error);
      });
    }

    return () => {
      if(socket){
        socket.off("transcriber-ready");
        socket.off("partial");
        socket.off("final");
        socket.off("error");
      }
    };
  }, [initialize, socket]);

  const onStartRecordingPress = async () => {
    // start recorder and transcriber (send configure-stream)
    const sampleRate = await startRecording();
    if(socket){
      socket.emit("configure-stream", {sampleRate});
    }
  };

  const onStopRecordingPress = async () => {
    stopRecording();
    if(socket){
      socket.emit("stop-stream");
    }
  };

  const onCopyTranscription = () => {
    navigator.clipboard.writeText(transcription).then(() => {
      console.log("Transcription copied to clipboard");
    });
  }

  const onClearTranscription = () => {
    setTranscription("");
    setPartialTranscription("");
  }

  // ... add more functions
  return (
    <div>
      {/* <h1>Speechify Voice Notes</h1> */}
      <p>Record or type something in the textbox.</p>
      <textarea
        style={textAreaStyle}
        id="transcription-display"
        value={transcription + partialTranscription}
        onChange={(e) => setTranscription(e.target.value)}
        rows="10"
        cols="50"
      />
      <button id="record-button" onClick={onStartRecordingPress} disabled={isRecording}>
        Start Recording
      </button>
      <button id="stop-button" onClick={onStopRecordingPress} disabled={!isRecording}>
        Stop Recording
      </button>
      <button id="copy-button" onClick={onCopyTranscription}>
        Copy
      </button>
      <button id="reset-button" onClick={onClearTranscription}>
        Clear
      </button>
    </div>
  );
}

export default App;
