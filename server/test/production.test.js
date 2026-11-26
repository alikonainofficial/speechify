import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { nextEvent, startTestServer, waitFor } from "./helpers.js";

describe("production config", () => {
  it("refuses to start in production without the Deepgram key and allowed origins", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow(/DEEPGRAM_API_KEY, ALLOWED_ORIGINS/);
    expect(() => loadConfig({ NODE_ENV: "production", DEEPGRAM_API_KEY: "k" })).toThrow(/ALLOWED_ORIGINS/);
  });

  it("starts in production when both are set, with AI optional", () => {
    const config = loadConfig({
      NODE_ENV: "production",
      DEEPGRAM_API_KEY: "k",
      ALLOWED_ORIGINS: "https://alikonainofficial.github.io",
    });
    expect(config.allowedOrigins).toEqual(["https://alikonainofficial.github.io"]);
    expect(config.geminiApiKey).toBe("");
  });

  it("uses safe defaults in development", () => {
    expect(loadConfig({}).allowedOrigins).toEqual(["http://localhost:5173"]);
  });
});

describe("HTTP basics", () => {
  let server;
  afterEach(async () => {
    await server?.cleanup();
    server = null;
  });

  it("GET /health answers ok with the uptime in seconds", async () => {
    let time = 1_000_000;
    server = await startTestServer({ now: () => time });
    time += 42_000;

    const res = await fetch(`${server.url}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", uptime: 42 });
  });

  it("GET /health sends CORS headers, so the browser app on another origin can read it", async () => {
    server = await startTestServer({ env: { ALLOWED_ORIGINS: "https://alikonainofficial.github.io" } });

    const res = await fetch(`${server.url}/health`, { headers: { origin: "https://alikonainofficial.github.io" } });
    expect(res.headers.get("access-control-allow-origin")).toBe("https://alikonainofficial.github.io");
  });

  it("answers unknown paths with a JSON 404 (no static files or SPA fallback)", async () => {
    server = await startTestServer();

    const res = await fetch(`${server.url}/index.html`);
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });
});

describe("graceful shutdown", () => {
  let server;
  afterEach(async () => {
    await server?.cleanup();
    server = null;
  });

  it("finishes active streams so users keep their last words, then closes", async () => {
    server = await startTestServer();
    const { client, fakes } = server;
    client.emit("configure-stream", { sampleRate: 16000 });
    const transcriber = await waitFor(() => fakes.instances[0]);

    const finals = [];
    client.on("final", (text) => finals.push(text));
    const ended = nextEvent(client, "stream-ended");
    const disconnected = nextEvent(client, "disconnect");

    const done = server.shutdown({ timeoutMs: 2000 });
    await waitFor(() => transcriber.finishCalls === 1);
    transcriber.emitFinal("last words");
    transcriber.resolveFinish();

    expect(await ended).toEqual({ reason: "server-shutdown" });
    expect(finals).toEqual(["last words"]);
    await done;
    await disconnected;
  });

  it("refuses new connections while shutting down", async () => {
    server = await startTestServer();
    server.client.emit("configure-stream", { sampleRate: 16000 });
    await waitFor(() => server.fakes.instances[0]);

    const done = server.shutdown({ timeoutMs: 300 }); // the fake never finishes: wait for the timeout
    await expect(server.connect()).rejects.toThrow();
    await done;
  });
});
