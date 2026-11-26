import { useCallback, useEffect, useRef, useState } from "react";
import workletUrl from "./pcm-worklet.js?worker&url";

export const TARGET_SAMPLE_RATE = 16000;

const ERRORS = {
  "permission-denied": "Microphone access is blocked. Allow it in your browser's site settings and try again.",
  "no-microphone": "No microphone was found. Plug one in and try again.",
  unsupported: "This browser can't record audio here. Use a recent browser over HTTPS (or localhost).",
  unavailable: "The microphone couldn't be started. Close other apps using it and try again.",
};

function toRecorderError(error) {
  const code =
    error?.name === "NotAllowedError" || error?.name === "SecurityError"
      ? "permission-denied"
      : error?.name === "NotFoundError" || error?.name === "OverconstrainedError"
        ? "no-microphone"
        : "unavailable";
  return { code, message: ERRORS[code] };
}

/**
 * Records the microphone as 16 kHz, 16-bit mono PCM.
 *
 * - start(): asks for the mic, starts recording, returns 16000 (or null on failure; see `error`).
 * - stop(): disconnects the audio graph, stops every mic track (the browser's mic indicator
 *   turns off) and closes the AudioContext. Safe to call any number of times.
 * - onChunk(Int16Array): called with ~100 ms of audio at a time.
 * - level: input loudness 0–1, updated about 15 times a second.
 */
export function useRecorder({ onChunk }) {
  const [isRecording, setIsRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState(null);

  const onChunkRef = useRef(onChunk);
  onChunkRef.current = onChunk;

  const resources = useRef(null); // { stream, context, source, node } while recording
  const attempt = useRef(0); // lets stop() cancel a start() that is still waiting

  const release = useCallback(() => {
    attempt.current += 1;
    const current = resources.current;
    resources.current = null;
    if (!current) return;

    const { stream, context, source, node } = current;
    if (node) {
      node.port.onmessage = null;
      node.disconnect();
    }
    source?.disconnect();
    stream?.getTracks().forEach((track) => track.stop());
    if (context && context.state !== "closed") context.close().catch(() => {});
  }, []);

  const stop = useCallback(() => {
    release();
    setIsRecording(false);
    setLevel(0);
  }, [release]);

  const start = useCallback(async () => {
    if (resources.current) return TARGET_SAMPLE_RATE; // already recording
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError({ code: "unsupported", message: ERRORS.unsupported });
      return null;
    }

    const myAttempt = ++attempt.current;
    const current = {};
    const cancelled = () => myAttempt !== attempt.current;

    try {
      current.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      if (cancelled()) {
        current.stream.getTracks().forEach((track) => track.stop());
        return null;
      }
      resources.current = current;

      current.context = new AudioContext();
      await current.context.audioWorklet.addModule(workletUrl);
      if (cancelled()) return null; // stop() already released everything

      current.source = current.context.createMediaStreamSource(current.stream);
      current.node = new AudioWorkletNode(current.context, "pcm-processor");
      current.node.port.onmessage = ({ data }) => {
        if (data.type === "pcm") onChunkRef.current?.(new Int16Array(data.pcm));
        else if (data.type === "level") setLevel(data.level);
      };
      current.source.connect(current.node);
      // The worklet writes no output, so this plays silence; it keeps the node running in every browser.
      current.node.connect(current.context.destination);
      if (current.context.state === "suspended") await current.context.resume();

      setIsRecording(true);
      return TARGET_SAMPLE_RATE;
    } catch (err) {
      if (cancelled()) return null;
      resources.current = current;
      release();
      setError(toRecorderError(err));
      return null;
    }
  }, [release]);

  useEffect(() => release, [release]); // release the mic on unmount

  return { start, stop, isRecording, level, error };
}
