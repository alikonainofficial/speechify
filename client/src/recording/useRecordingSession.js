import { useCallback, useEffect, useRef, useState } from "react";
import { useRecorder } from "../audio/useRecorder";
import { useTranscriptionSocket } from "../net/useTranscriptionSocket";
import { initialTranscript, joinText, transcriptReducer } from "../transcript/transcriptReducer";
import { errorMessage } from "./messages";

export const MAX_SESSION_SECONDS = 60;
// The server waits up to 5 s for Deepgram's last results; give up a little after that.
const FINISH_TIMEOUT_MS = 8000;

/**
 * One recording, from Start to a saved note.
 *
 * phase: "idle" → "connecting" (mic + stream starting) → "listening" → "finishing" (waiting for
 * the last words after Stop) → "idle". When a recording ends, onComplete({ text, durationSec })
 * is called once, if anything was transcribed.
 */
export function useRecordingSession({ onComplete }) {
  const [phase, setPhaseState] = useState("idle");
  const [transcript, setTranscript] = useState(initialTranscript);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  // Refs hold the latest values for socket callbacks, which can fire between renders.
  const phaseRef = useRef("idle");
  const transcriptRef = useRef(initialTranscript);
  const streamStartedAt = useRef(null);
  const finishTimer = useRef(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const recorderRef = useRef(null);

  const setPhase = useCallback((next) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  const applyTranscript = useCallback((action) => {
    transcriptRef.current = transcriptReducer(transcriptRef.current, action);
    setTranscript(transcriptRef.current);
  }, []);

  // Ends the recording and hands the text to onComplete. Safe to call more than once.
  const complete = useCallback(() => {
    if (phaseRef.current === "idle") return;
    clearTimeout(finishTimer.current);
    recorderRef.current?.stop();

    const { committed, partial } = transcriptRef.current;
    const text = joinText(committed, partial).trim();
    const durationSec = streamStartedAt.current ? Math.round((Date.now() - streamStartedAt.current) / 1000) : 0;
    streamStartedAt.current = null;
    setElapsed(0);
    setPhase("idle");

    if (text) onCompleteRef.current?.({ text, durationSec });
    else setNotice("Nothing was transcribed, so no note was saved.");
  }, [setPhase]);

  const socket = useTranscriptionSocket({
    onReady: () => {
      if (phaseRef.current === "connecting") setPhase("listening");
    },
    onPartial: (text) => applyTranscript({ type: "PARTIAL", text }),
    onFinal: (text) => applyTranscript({ type: "FINAL", text }),
    onEnded: ({ reason } = {}) => {
      if (reason === "time-limit") setNotice(`Recording stopped at the ${MAX_SESSION_SECONDS}-second limit.`);
      complete();
    },
    onError: ({ code, message } = {}) => {
      setError(errorMessage(code, message));
      // These mean no stream was started, so there's nothing to wait for or save.
      if (code !== "TRANSCRIBER_ERROR" && phaseRef.current !== "idle") {
        recorderRef.current?.stop();
        streamStartedAt.current = null;
        setPhase("idle");
      }
    },
  });

  const recorder = useRecorder({ onChunk: socket.sendAudio });
  recorderRef.current = recorder;

  const start = useCallback(async () => {
    if (phaseRef.current !== "idle") return;
    if (socket.status !== "connected") {
      setError(errorMessage("DISCONNECTED"));
      return;
    }
    setError(null);
    setNotice(null);
    applyTranscript({ type: "CLEAR" });
    setElapsed(0);
    setPhase("connecting");

    const sampleRate = await recorder.start();
    if (!sampleRate || phaseRef.current !== "connecting") {
      if (sampleRate) recorder.stop(); // Stop was pressed while the mic was starting
      if (phaseRef.current === "connecting") setPhase("idle");
      return;
    }
    streamStartedAt.current = Date.now();
    socket.startStream(sampleRate);
  }, [applyTranscript, recorder, setPhase, socket]);

  const stop = useCallback(() => {
    const current = phaseRef.current;
    if (current !== "connecting" && current !== "listening") return;
    recorder.stop();
    if (!streamStartedAt.current) {
      setPhase("idle"); // the stream never started
      return;
    }
    setPhase("finishing");
    socket.stopStream();
    finishTimer.current = setTimeout(complete, FINISH_TIMEOUT_MS);
  }, [complete, recorder, setPhase, socket]);

  // Latest stop() for the timer below, so the interval isn't recreated on every render.
  const stopRef = useRef(stop);
  stopRef.current = stop;

  const toggle = useCallback(() => {
    if (phaseRef.current === "idle") start();
    else stop();
  }, [start, stop]);

  // Timer while recording, plus a client-side backstop in case the server's limit never arrives.
  useEffect(() => {
    if (phase !== "connecting" && phase !== "listening") return undefined;
    const interval = setInterval(() => {
      if (!streamStartedAt.current) return;
      const seconds = (Date.now() - streamStartedAt.current) / 1000;
      setElapsed(seconds);
      if (seconds >= MAX_SESSION_SECONDS + 3) stopRef.current();
    }, 250);
    return () => clearInterval(interval);
  }, [phase]);

  // Losing the server mid-recording: keep what was transcribed so far.
  useEffect(() => {
    if (socket.status === "disconnected" && phaseRef.current !== "idle") {
      setError(errorMessage("DISCONNECTED"));
      complete();
    }
  }, [socket.status, complete]);

  useEffect(() => () => clearTimeout(finishTimer.current), []);

  return {
    phase,
    transcript,
    elapsed,
    level: recorder.level,
    error: error ?? recorder.error?.message ?? null,
    notice,
    connection: socket.status,
    maxSeconds: MAX_SESSION_SECONDS,
    start,
    stop,
    toggle,
  };
}
