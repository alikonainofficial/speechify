import { once } from "events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DeepgramTranscriber from "../src/transcription/deepgram-transcriber.js";
import { results, startFakeDeepgram } from "./fakes/fake-deepgram.js";
import { waitFor } from "./helpers.js";

const API_KEY = "test-key-never-real";

describe("DeepgramTranscriber", () => {
  let deepgram;
  let transcriber;

  beforeEach(async () => {
    deepgram = await startFakeDeepgram();
  });

  afterEach(async () => {
    vi.useRealTimers();
    transcriber?.close();
    await deepgram.close();
  });

  function create(options = {}) {
    transcriber = new DeepgramTranscriber({ sampleRate: 16000, apiKey: API_KEY, url: deepgram.url, ...options });
    return transcriber;
  }

  it("connects with nova-3, linear16, the sample rate and the API key", async () => {
    create();
    await once(transcriber, "ready");
    const { requestUrl, headers } = deepgram.connections[0];
    const params = new URL(requestUrl, "ws://x").searchParams;

    expect(params.get("model")).toBe("nova-3");
    expect(params.get("encoding")).toBe("linear16");
    expect(params.get("sample_rate")).toBe("16000");
    expect(params.get("interim_results")).toBe("true");
    expect(params.has("endpointing")).toBe(false);
    expect(headers.authorization).toBe(`Token ${API_KEY}`);
  });

  it("delivers audio sent before the socket opens, in order, after it opens", async () => {
    deepgram.holdHandshake();
    create();
    transcriber.send(Buffer.from([1]));
    transcriber.send(Buffer.from([2]));

    deepgram.releaseHandshake();
    await once(transcriber, "ready");
    transcriber.send(Buffer.from([3]));

    await waitFor(() => deepgram.connections[0]?.audio.length === 3);
    expect(deepgram.connections[0].audio.map((b) => b[0])).toEqual([1, 2, 3]);
  });

  it("keeps at most ~10 s of early audio, dropping the oldest", async () => {
    deepgram.holdHandshake();
    create({ sampleRate: 8000 }); // 10 s at 8 kHz, 16-bit = 160,000 bytes
    const second = 16000;
    for (let i = 0; i < 12; i += 1) transcriber.send(Buffer.alloc(second, i));

    deepgram.releaseHandshake();
    await once(transcriber, "ready");
    await waitFor(() => deepgram.connections[0]?.audio.length === 10);
    expect(deepgram.connections[0].audio.map((b) => b[0])).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("sends KeepAlive after 4 s without audio, but not while audio is flowing", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    create();
    await once(transcriber, "ready");

    vi.advanceTimersByTime(3000);
    transcriber.send(Buffer.from([1]));
    vi.advanceTimersByTime(3000); // only 3 s since the audio
    await waitFor(() => deepgram.connections[0].audio.length === 1);
    expect(deepgram.connections[0].control).toEqual([]);

    vi.advanceTimersByTime(1000); // now 4 s of silence
    await waitFor(() => deepgram.connections[0].control.length === 1);
    expect(deepgram.connections[0].control[0]).toEqual({ type: "KeepAlive" });
  });

  it("finish() sends CloseStream, still emits finals that arrive afterwards, and resolves when Deepgram closes", async () => {
    deepgram.onCloseStream = (connection) => {
      connection.ws.send(results("the last words", true));
      connection.ws.close(1000);
    };
    create();
    await once(transcriber, "ready");

    const finals = [];
    transcriber.on("final", (text) => finals.push(text));
    const closed = once(transcriber, "closed");

    await transcriber.finish();

    expect(deepgram.connections[0].control).toContainEqual({ type: "CloseStream" });
    expect(finals).toEqual(["the last words"]);
    expect(await closed).toEqual(["finished"]);
  });

  it("finish() force-closes after the timeout if Deepgram never closes", async () => {
    create({ finishTimeoutMs: 50 });
    await once(transcriber, "ready");

    const closed = once(transcriber, "closed");
    await transcriber.finish();

    expect(await closed).toEqual(["finished"]);
  });

  it("forwards partials (without repeats) and finals, ignoring other message types and bad JSON", async () => {
    create();
    await once(transcriber, "ready");
    const events = [];
    transcriber.on("partial", (t) => events.push(["partial", t]));
    transcriber.on("final", (t) => events.push(["final", t]));
    const ws = deepgram.connections[0].ws;

    ws.send("not json");
    ws.send(JSON.stringify({ type: "Metadata", request_id: "abc" }));
    ws.send(results("hello", false));
    ws.send(results("hello", false));
    ws.send(results("hello world", true));

    await waitFor(() => events.length === 2);
    expect(events).toEqual([
      ["partial", "hello"],
      ["final", "hello world"],
    ]);
  });

  it("reports an auth failure as a short, safe error without crashing", async () => {
    await deepgram.close();
    deepgram = await startFakeDeepgram({ rejectWithStatus: 401 });
    create();
    const errorEvent = once(transcriber, "error");
    // events.once() rejects on "error", so listen for "closed" with a plain listener.
    const closedEvent = new Promise((resolve) => transcriber.once("closed", resolve));

    const [error] = await errorEvent;
    const reason = await closedEvent;

    expect(error.message).toMatch(/rejected/i);
    expect(error.message).not.toContain(API_KEY);
    expect(error.message).not.toContain("localhost");
    expect(reason).toBe("error");
  });

  it("close() before the socket opens does not emit an error", async () => {
    deepgram.holdHandshake();
    create();
    const errors = [];
    transcriber.on("error", (e) => errors.push(e));

    const closed = once(transcriber, "closed");
    transcriber.close();
    expect(await closed).toEqual(["closed"]);
    expect(errors).toEqual([]);
  });
});
