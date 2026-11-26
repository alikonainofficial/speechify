import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nextEvent, startTestServer, waitFor } from "./helpers.js";

describe("socket session", () => {
  let server;

  beforeEach(async () => {
    server = await startTestServer();
  });

  afterEach(async () => {
    await server.cleanup();
  });

  it("starts a transcriber on configure-stream and forwards ready, partial and final", async () => {
    const { client, fakes } = server;

    client.emit("configure-stream", { sampleRate: 16000 });
    const transcriber = await waitFor(() => fakes.instances[0]);
    expect(transcriber.options).toEqual({ sampleRate: 16000 });

    const ready = nextEvent(client, "transcriber-ready");
    transcriber.emitReady();
    await ready;

    const partial = nextEvent(client, "partial");
    transcriber.emitPartial("hello wor");
    expect(await partial).toBe("hello wor");

    const final = nextEvent(client, "final");
    transcriber.emitFinal("hello world");
    expect(await final).toBe("hello world");
  });

  it("forwards incoming audio to the transcriber", async () => {
    const { client, fakes } = server;

    client.emit("configure-stream", { sampleRate: 16000 });
    const transcriber = await waitFor(() => fakes.instances[0]);
    client.emit("incoming-audio", Buffer.from([1, 2, 3, 4]));

    await waitFor(() => transcriber.sent.length === 1);
    expect(Buffer.from(transcriber.sent[0])).toEqual(Buffer.from([1, 2, 3, 4]));
  });

  async function startStream(client, fakes, sampleRate = 16000) {
    const before = fakes.instances.length;
    client.emit("configure-stream", { sampleRate });
    return waitFor(() => fakes.instances[before]);
  }

  // Lets queued socket messages reach the server before we assert that nothing happened.
  async function roundTrip(client) {
    client.emit("configure-stream", "flush");
    await nextEvent(client, "stream-error");
  }

  it.each([
    ["no payload", undefined],
    ["a non-object", 16000],
    ["a string sample rate", { sampleRate: "16000" }],
    ["a fractional sample rate", { sampleRate: 16000.5 }],
    ["a sample rate below 8000", { sampleRate: 4000 }],
    ["a sample rate above 48000", { sampleRate: 96000 }],
  ])("rejects configure-stream with %s and creates no transcriber", async (_label, payload) => {
    const { client, fakes } = server;
    const error = nextEvent(client, "stream-error");
    client.emit("configure-stream", payload);

    expect(await error).toMatchObject({ code: "INVALID_CONFIG" });
    expect(fakes.instances).toHaveLength(0);
  });

  it("closes the old transcriber when configure-stream is sent again", async () => {
    const { client, fakes } = server;
    const first = await startStream(client, fakes);
    const second = await startStream(client, fakes, 48000);

    expect(first.closeCalls).toBe(1);
    expect(second.options).toEqual({ sampleRate: 48000 });

    // Events from the replaced transcriber are no longer forwarded.
    const final = nextEvent(client, "final");
    first.emitFinal("stale");
    second.emitFinal("fresh");
    expect(await final).toBe("fresh");
  });

  it("stop-stream calls finish(), forwards late finals, then emits stream-ended", async () => {
    const { client, fakes } = server;
    const transcriber = await startStream(client, fakes);

    let ended = false;
    const endedEvent = nextEvent(client, "stream-ended");
    endedEvent.then(() => (ended = true));
    client.emit("stop-stream");
    await waitFor(() => transcriber.finishCalls === 1);

    const final = nextEvent(client, "final");
    transcriber.emitFinal("last words");
    expect(await final).toBe("last words");
    expect(ended).toBe(false);

    transcriber.resolveFinish();
    expect(await endedEvent).toEqual({ reason: "stopped" });
    expect(transcriber.closeCalls).toBe(0);
  });

  it("ignores audio sent after stop-stream", async () => {
    const { client, fakes } = server;
    const transcriber = await startStream(client, fakes);
    client.emit("stop-stream");
    client.emit("incoming-audio", Buffer.from([1]));
    await roundTrip(client);

    expect(transcriber.sent).toHaveLength(0);
  });

  it("treats stop-stream without an active stream as a no-op", async () => {
    const { client, fakes } = server;
    client.emit("stop-stream");
    await roundTrip(client);

    const transcriber = await startStream(client, fakes);
    expect(transcriber).toBeDefined();
  });

  it("closes the transcriber when the client disconnects", async () => {
    const { client, fakes } = server;
    const transcriber = await startStream(client, fakes);
    client.disconnect();

    await waitFor(() => transcriber.closeCalls === 1);
  });

  it("ignores audio sent before configure-stream", async () => {
    const { client, fakes } = server;
    client.emit("incoming-audio", Buffer.from([1]));
    const transcriber = await startStream(client, fakes);
    await roundTrip(client);

    expect(transcriber.sent).toHaveLength(0);
  });

  it("reports transcriber errors as stream-error with a code and message", async () => {
    const { client, fakes } = server;
    const transcriber = await startStream(client, fakes);
    const error = nextEvent(client, "stream-error");
    transcriber.emitError(new Error("The transcription service rejected the API key."));

    expect(await error).toEqual({
      code: "TRANSCRIBER_ERROR",
      message: "The transcription service rejected the API key.",
    });
  });

  it("emits stream-ended when the transcriber closes without a stop", async () => {
    const { client, fakes } = server;
    const transcriber = await startStream(client, fakes);
    const ended = nextEvent(client, "stream-ended");
    transcriber.emit("closed", "remote");

    expect(await ended).toEqual({ reason: "closed" });
  });
});

