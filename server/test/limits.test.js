import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { getClientIp } from "../src/limits.js";
import { nextEvent, startTestServer, waitFor } from "./helpers.js";

// A clock the test moves by hand, so time-based limits don't depend on real waiting.
function fakeClock(start = Date.UTC(2026, 10, 26, 12, 0, 0)) {
  const clock = () => clock.time;
  clock.time = start;
  clock.advance = (ms) => {
    clock.time += ms;
  };
  return clock;
}

async function startStream(client, fakes, sampleRate = 16000) {
  const before = fakes.instances.length;
  client.emit("configure-stream", { sampleRate });
  return waitFor(() => fakes.instances[before]);
}

describe("demo limits", () => {
  let server;

  afterEach(async () => {
    await server?.cleanup();
    server = null;
  });

  it("auto-stops a stream at the session time limit", async () => {
    server = await startTestServer({ env: { MAX_SESSION_SECONDS: "0.05" } });
    const { client, fakes } = server;
    const transcriber = await startStream(client, fakes);
    const ended = nextEvent(client, "stream-ended");

    await waitFor(() => transcriber.finishCalls === 1);
    transcriber.resolveFinish();
    expect(await ended).toEqual({ reason: "time-limit" });
  });

  it("does not auto-stop a stream that was stopped first", async () => {
    server = await startTestServer({ env: { MAX_SESSION_SECONDS: "0.1" } });
    const { client, fakes } = server;
    const transcriber = await startStream(client, fakes);
    transcriber.resolveFinish();
    client.emit("stop-stream");
    expect(await nextEvent(client, "stream-ended")).toEqual({ reason: "stopped" });

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(transcriber.finishCalls).toBe(1);
  });

  it("rejects a stream beyond the concurrent limit, and frees the slot when one ends", async () => {
    server = await startTestServer({ env: { MAX_CONCURRENT_STREAMS: "3" } });
    const { fakes, connect } = server;
    const clients = [server.client, await connect(), await connect(), await connect()];

    for (const c of clients.slice(0, 3)) await startStream(c, fakes);

    const busy = nextEvent(clients[3], "stream-error");
    clients[3].emit("configure-stream", { sampleRate: 16000 });
    expect(await busy).toMatchObject({ code: "BUSY" });
    expect(fakes.instances).toHaveLength(3);

    clients[0].disconnect();
    await waitFor(() => fakes.instances[0].closeCalls === 1);
    await startStream(clients[3], fakes);
    expect(fakes.instances).toHaveLength(4);
  });

  it("replacing a stream on the same socket does not use up a second slot", async () => {
    server = await startTestServer({ env: { MAX_CONCURRENT_STREAMS: "1" } });
    const { client, fakes } = server;
    await startStream(client, fakes);
    await startStream(client, fakes);
    expect(fakes.instances).toHaveLength(2);
  });

  it("enforces the per-IP daily budget and resets it at UTC midnight", async () => {
    const clock = fakeClock();
    server = await startTestServer({ env: { DAILY_SECONDS_PER_IP: "30" }, now: clock });
    const { client, fakes } = server;

    const first = await startStream(client, fakes);
    clock.advance(30_000);
    first.resolveFinish();
    client.emit("stop-stream");
    await nextEvent(client, "stream-ended");

    const limited = nextEvent(client, "stream-error");
    client.emit("configure-stream", { sampleRate: 16000 });
    expect(await limited).toMatchObject({ code: "DAILY_LIMIT" });

    clock.advance(12 * 60 * 60 * 1000); // past midnight UTC
    await startStream(client, fakes);
    expect(fakes.instances).toHaveLength(2);
  });

  it("caps a session at the IP's remaining daily budget", async () => {
    const clock = fakeClock();
    // 60 s sessions, but only 0.05 s of budget left for today.
    server = await startTestServer({ env: { DAILY_SECONDS_PER_IP: "0.05" }, now: clock });
    const { client, fakes } = server;
    const transcriber = await startStream(client, fakes);
    const ended = nextEvent(client, "stream-ended");

    await waitFor(() => transcriber.finishCalls === 1);
    transcriber.resolveFinish();
    expect(await ended).toEqual({ reason: "time-limit" });
  });

  it("refuses sockets from origins that are not allowed", async () => {
    server = await startTestServer({ env: { ALLOWED_ORIGINS: "https://good.example" } });

    await expect(server.connect({ extraHeaders: { origin: "https://evil.example" } })).rejects.toThrow();
    await expect(server.connect({ extraHeaders: { origin: "https://good.example" } })).resolves.toBeDefined();
  });

  it("only sends CORS headers to allowed origins", async () => {
    server = await startTestServer({ env: { ALLOWED_ORIGINS: "https://good.example" } });

    const good = await fetch(server.url, { headers: { origin: "https://good.example" } });
    const evil = await fetch(server.url, { headers: { origin: "https://evil.example" } });

    expect(good.headers.get("access-control-allow-origin")).toBe("https://good.example");
    expect(evil.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("disconnects a client that sends a message over the size cap", async () => {
    server = await startTestServer();
    const { client, fakes } = server;
    await startStream(client, fakes);

    const disconnected = nextEvent(client, "disconnect");
    client.emit("incoming-audio", Buffer.alloc(100 * 1024));
    await disconnected;
  });
});

describe("getClientIp", () => {
  const socket = (address, forwardedFor) => ({
    handshake: { address, headers: forwardedFor ? { "x-forwarded-for": forwardedFor } : {} },
  });

  it("uses the socket address when the proxy is not trusted", () => {
    const config = loadConfig({});
    expect(getClientIp(socket("10.0.0.1", "1.2.3.4"), config)).toBe("10.0.0.1");
  });

  it("uses the first X-Forwarded-For entry behind a trusted proxy", () => {
    const config = loadConfig({ TRUST_PROXY: "1" });
    expect(getClientIp(socket("10.0.0.1", "1.2.3.4, 10.0.0.2"), config)).toBe("1.2.3.4");
    expect(getClientIp(socket("10.0.0.1"), config)).toBe("10.0.0.1");
  });
});

