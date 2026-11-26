import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TARGET_SAMPLE_RATE, useRecorder } from "../../src/audio/useRecorder.js";

vi.mock("../../src/audio/pcm-worklet.js?worker&url", () => ({ default: "/pcm-worklet.js" }));

// --- Fakes for the browser audio APIs (jsdom has none of them) ---

let contexts;
let nodes;
let tracks;
let getUserMedia;

class FakeAudioContext {
  constructor() {
    this.state = "running";
    this.sampleRate = 48000;
    this.destination = {};
    this.audioWorklet = { addModule: vi.fn(async () => {}) };
    this.close = vi.fn(async () => {
      this.state = "closed";
    });
    this.resume = vi.fn(async () => {});
    this.source = { connect: vi.fn(), disconnect: vi.fn() };
    contexts.push(this);
  }
  createMediaStreamSource() {
    return this.source;
  }
}

class FakeAudioWorkletNode {
  constructor(context, name) {
    this.name = name;
    this.port = { onmessage: null };
    this.connect = vi.fn();
    this.disconnect = vi.fn();
    nodes.push(this);
  }
}

function fakeStream() {
  const track = { stop: vi.fn() };
  tracks.push(track);
  return { getTracks: () => [track] };
}

beforeEach(() => {
  contexts = [];
  nodes = [];
  tracks = [];
  getUserMedia = vi.fn(async () => fakeStream());
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderRecorder(onChunk = vi.fn()) {
  return renderHook(() => useRecorder({ onChunk }));
}

describe("useRecorder", () => {
  it("asks for a mono, cleaned-up mic, loads the worklet and returns 16000", async () => {
    const { result } = renderRecorder();

    let rate;
    await act(async () => {
      rate = await result.current.start();
    });

    expect(rate).toBe(TARGET_SAMPLE_RATE);
    expect(TARGET_SAMPLE_RATE).toBe(16000);
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    expect(contexts[0].audioWorklet.addModule).toHaveBeenCalledWith("/pcm-worklet.js");
    expect(nodes[0].name).toBe("pcm-processor");
    expect(contexts[0].source.connect).toHaveBeenCalledWith(nodes[0]);
    expect(result.current.isRecording).toBe(true);
  });

  it("passes PCM chunks from the worklet to onChunk and exposes the input level", async () => {
    const onChunk = vi.fn();
    const { result } = renderRecorder(onChunk);
    await act(async () => {
      await result.current.start();
    });

    const pcm = Int16Array.from([1, -2, 3]);
    act(() => {
      nodes[0].port.onmessage({ data: { type: "pcm", pcm: pcm.buffer } });
      nodes[0].port.onmessage({ data: { type: "level", level: 0.4 } });
    });

    expect(onChunk).toHaveBeenCalledTimes(1);
    expect(Array.from(onChunk.mock.calls[0][0])).toEqual([1, -2, 3]);
    expect(result.current.level).toBe(0.4);
  });

  it("stop() stops every mic track and closes the AudioContext", async () => {
    const { result } = renderRecorder();
    await act(async () => {
      await result.current.start();
    });

    act(() => result.current.stop());

    expect(tracks[0].stop).toHaveBeenCalledTimes(1);
    expect(contexts[0].close).toHaveBeenCalledTimes(1);
    expect(nodes[0].disconnect).toHaveBeenCalled();
    expect(contexts[0].source.disconnect).toHaveBeenCalled();
    expect(result.current.isRecording).toBe(false);
    expect(result.current.level).toBe(0);
  });

  it("stop() is safe to call twice, and before start()", async () => {
    const { result } = renderRecorder();
    act(() => result.current.stop());
    await act(async () => {
      await result.current.start();
    });

    act(() => {
      result.current.stop();
      result.current.stop();
    });

    expect(tracks[0].stop).toHaveBeenCalledTimes(1);
    expect(contexts[0].close).toHaveBeenCalledTimes(1);
  });

  it("uses a fresh AudioContext for every recording", async () => {
    const { result } = renderRecorder();
    for (let i = 0; i < 2; i += 1) {
      await act(async () => {
        await result.current.start();
      });
      act(() => result.current.stop());
    }

    expect(contexts).toHaveLength(2);
    expect(contexts.every((c) => c.close.mock.calls.length === 1)).toBe(true);
  });

  it("releases the mic on unmount", async () => {
    const { result, unmount } = renderRecorder();
    await act(async () => {
      await result.current.start();
    });

    unmount();

    expect(tracks[0].stop).toHaveBeenCalledTimes(1);
    expect(contexts[0].close).toHaveBeenCalledTimes(1);
  });

  it("releases the mic if stop() happens while permission is still pending", async () => {
    let grant;
    getUserMedia.mockImplementation(() => new Promise((resolve) => (grant = resolve)));
    const { result } = renderRecorder();

    let rate;
    let starting;
    act(() => {
      starting = result.current.start();
    });
    act(() => result.current.stop());
    await act(async () => {
      grant(fakeStream());
      rate = await starting;
    });

    expect(rate).toBeNull();
    expect(tracks[0].stop).toHaveBeenCalledTimes(1);
    expect(result.current.isRecording).toBe(false);
  });

  it.each([
    ["NotAllowedError", "permission-denied"],
    ["NotFoundError", "no-microphone"],
    ["AbortError", "unavailable"],
  ])("reports %s as %s and returns null", async (name, code) => {
    getUserMedia.mockRejectedValue(Object.assign(new Error("nope"), { name }));
    const { result } = renderRecorder();

    let rate;
    await act(async () => {
      rate = await result.current.start();
    });

    expect(rate).toBeNull();
    expect(result.current.error.code).toBe(code);
    expect(result.current.error.message).toEqual(expect.any(String));
    expect(result.current.isRecording).toBe(false);
  });

  it("reports a missing mediaDevices API (e.g. plain http) as unsupported", async () => {
    vi.stubGlobal("navigator", {});
    const { result } = renderRecorder();

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.error.code).toBe("unsupported");
  });

  it("closes the AudioContext if loading the worklet fails", async () => {
    const { result } = renderRecorder();
    vi.stubGlobal(
      "AudioContext",
      class extends FakeAudioContext {
        constructor() {
          super();
          this.audioWorklet.addModule = vi.fn(async () => {
            throw new Error("load failed");
          });
        }
      },
    );

    await act(async () => {
      await result.current.start();
    });

    expect(contexts[0].close).toHaveBeenCalledTimes(1);
    expect(tracks[0].stop).toHaveBeenCalledTimes(1);
    expect(result.current.error.code).toBe("unavailable");
  });
});
