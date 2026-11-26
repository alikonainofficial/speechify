import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A stand-in for a Socket.IO client socket: records what the app emits, and lets
// the test play server events with fromServer().
function createFakeSocket() {
  const listeners = new Map();
  const managerListeners = new Map();
  const add = (map) => (event, fn) => {
    if (!map.has(event)) map.set(event, new Set());
    map.get(event).add(fn);
  };
  const remove = (map) => (event, fn) => map.get(event)?.delete(fn);
  return {
    connected: false,
    sent: [],
    on: add(listeners),
    off: remove(listeners),
    emit(event, payload) {
      this.sent.push(payload === undefined ? [event] : [event, payload]);
    },
    io: { on: add(managerListeners), off: remove(managerListeners) },
    fromServer(event, payload) {
      if (event === "connect") this.connected = true;
      if (event === "disconnect") this.connected = false;
      listeners.get(event)?.forEach((fn) => fn(payload));
    },
    fromManager(event) {
      managerListeners.get(event)?.forEach((fn) => fn());
    },
    listenerCount(event) {
      return listeners.get(event)?.size ?? 0;
    },
  };
}

let fakeSocket;
const ioMock = vi.fn(() => fakeSocket);
vi.mock("socket.io-client", () => ({ io: (...args) => ioMock(...args) }));

// The module keeps one socket for the app, so load a fresh copy for each test.
async function loadModule() {
  vi.resetModules();
  return import("../../src/net/useTranscriptionSocket.js");
}

beforeEach(() => {
  fakeSocket = createFakeSocket();
  ioMock.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("useTranscriptionSocket", () => {
  it("connects to VITE_SERVER_URL over websocket", async () => {
    vi.stubEnv("VITE_SERVER_URL", "https://voice-notes.example");
    const { useTranscriptionSocket } = await loadModule();
    renderHook(() => useTranscriptionSocket());

    expect(ioMock).toHaveBeenCalledWith("https://voice-notes.example", expect.objectContaining({ transports: ["websocket"], reconnection: true }));
  });

  it("defaults to http://localhost:8080", async () => {
    vi.stubEnv("VITE_SERVER_URL", "");
    const { SERVER_URL } = await loadModule();
    expect(SERVER_URL).toBe("http://localhost:8080");
  });

  it("shares one socket across components and re-renders", async () => {
    const { useTranscriptionSocket } = await loadModule();
    const a = renderHook(() => useTranscriptionSocket());
    renderHook(() => useTranscriptionSocket());
    a.rerender();

    expect(ioMock).toHaveBeenCalledTimes(1);
  });

  it("tracks connection status", async () => {
    const { useTranscriptionSocket } = await loadModule();
    const { result } = renderHook(() => useTranscriptionSocket());
    expect(result.current.status).toBe("connecting");

    act(() => fakeSocket.fromServer("connect"));
    expect(result.current.status).toBe("connected");

    act(() => fakeSocket.fromServer("disconnect"));
    expect(result.current.status).toBe("disconnected");

    act(() => fakeSocket.fromManager("reconnect_attempt"));
    expect(result.current.status).toBe("connecting");

    act(() => fakeSocket.fromServer("connect_error", new Error("refused")));
    expect(result.current.status).toBe("disconnected");
  });

  it("calls the latest handlers for server events", async () => {
    const { useTranscriptionSocket } = await loadModule();
    const first = { onFinal: vi.fn() };
    const handlers = {
      onReady: vi.fn(),
      onPartial: vi.fn(),
      onFinal: vi.fn(),
      onEnded: vi.fn(),
      onError: vi.fn(),
    };
    const { rerender } = renderHook(({ h }) => useTranscriptionSocket(h), { initialProps: { h: first } });
    rerender({ h: handlers });

    act(() => {
      fakeSocket.fromServer("transcriber-ready");
      fakeSocket.fromServer("partial", "hel");
      fakeSocket.fromServer("final", "hello");
      fakeSocket.fromServer("stream-ended", { reason: "stopped" });
      fakeSocket.fromServer("stream-error", { code: "BUSY", message: "busy" });
    });

    expect(first.onFinal).not.toHaveBeenCalled();
    expect(handlers.onReady).toHaveBeenCalledTimes(1);
    expect(handlers.onPartial).toHaveBeenCalledWith("hel");
    expect(handlers.onFinal).toHaveBeenCalledWith("hello");
    expect(handlers.onEnded).toHaveBeenCalledWith({ reason: "stopped" });
    expect(handlers.onError).toHaveBeenCalledWith({ code: "BUSY", message: "busy" });
  });

  it("emits the stream protocol, and drops audio while offline", async () => {
    const { useTranscriptionSocket } = await loadModule();
    const { result } = renderHook(() => useTranscriptionSocket());
    const chunk = new Int16Array([1, 2]);

    result.current.sendAudio(chunk); // offline: dropped
    act(() => fakeSocket.fromServer("connect"));
    result.current.startStream(16000);
    result.current.sendAudio(chunk);
    result.current.stopStream();

    expect(fakeSocket.sent).toEqual([
      ["configure-stream", { sampleRate: 16000 }],
      ["incoming-audio", chunk],
      ["stop-stream"],
    ]);
  });

  it("removes its listeners on unmount", async () => {
    const { useTranscriptionSocket } = await loadModule();
    const { unmount } = renderHook(() => useTranscriptionSocket());
    expect(fakeSocket.listenerCount("final")).toBe(1);

    unmount();

    expect(fakeSocket.listenerCount("final")).toBe(0);
    expect(fakeSocket.listenerCount("connect")).toBe(0);
  });
});
