import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

import { SERVER_URL } from "./serverUrl";

export { SERVER_URL };

// One socket for the whole app, created on first use (not per render or per component).
let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(SERVER_URL, {
      transports: ["websocket"],
      reconnection: true,
    });
  }
  return socket;
}

// Server events → handler names passed to the hook.
const EVENTS = {
  "transcriber-ready": "onReady",
  partial: "onPartial",
  final: "onFinal",
  "stream-ended": "onEnded",
  "stream-error": "onError",
};

/**
 * Talks to the transcription server.
 *
 * Returns:
 * - status: "connecting" | "connected" | "disconnected" (Socket.IO keeps retrying while disconnected)
 * - startStream(sampleRate), sendAudio(chunk), stopStream()
 *
 * handlers: { onReady, onPartial(text), onFinal(text), onEnded({ reason }), onError({ code, message }) }.
 * The latest handlers are always used, so they can be inline functions.
 */
export function useTranscriptionSocket(handlers = {}) {
  const socketRef = useRef(getSocket());
  const [status, setStatus] = useState(socketRef.current.connected ? "connected" : "connecting");

  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const s = socketRef.current;
    const onConnect = () => setStatus("connected");
    const onDisconnect = () => setStatus("disconnected");
    const onReconnecting = () => setStatus("connecting");

    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("connect_error", onDisconnect);
    s.io.on("reconnect_attempt", onReconnecting);
    setStatus(s.connected ? "connected" : "connecting");

    const forwarders = Object.entries(EVENTS).map(([event, name]) => {
      const forward = (payload) => handlersRef.current[name]?.(payload);
      s.on(event, forward);
      return [event, forward];
    });

    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.off("connect_error", onDisconnect);
      s.io.off("reconnect_attempt", onReconnecting);
      forwarders.forEach(([event, forward]) => s.off(event, forward));
    };
  }, []);

  const startStream = useCallback((sampleRate) => {
    socketRef.current.emit("configure-stream", { sampleRate });
  }, []);

  const sendAudio = useCallback((chunk) => {
    // Socket.IO would buffer audio while offline and replay it later; drop it instead.
    if (socketRef.current.connected) socketRef.current.emit("incoming-audio", chunk);
  }, []);

  const stopStream = useCallback(() => {
    socketRef.current.emit("stop-stream");
  }, []);

  return { status, startStream, sendAudio, stopStream };
}
