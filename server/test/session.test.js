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
});
