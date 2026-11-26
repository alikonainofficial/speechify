import { io as connectClient } from "socket.io-client";
import { createServer } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createFakeTranscriberFactory } from "./fakes/fake-transcriber.js";

/**
 * Starts the real server on a free port with a fake transcriber.
 * Returns a connected client, a way to connect more clients, the fakes, and cleanup().
 */
export async function startTestServer({ env = {}, ...overrides } = {}) {
  const fakes = createFakeTranscriberFactory();
  const config = loadConfig({ PORT: "0", ...env });
  const { httpServer, io, shutdown } = createServer({
    config,
    createTranscriber: fakes.create,
    ...overrides,
  });

  await new Promise((resolve) => httpServer.listen(0, resolve));
  const url = `http://localhost:${httpServer.address().port}`;
  const clients = [];

  async function connect(options = {}) {
    const client = connectClient(url, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
      ...options,
    });
    clients.push(client);
    await new Promise((resolve, reject) => {
      client.once("connect", resolve);
      client.once("connect_error", reject);
    });
    return client;
  }

  const client = await connect();

  async function cleanup() {
    clients.forEach((c) => c.close());
    await new Promise((resolve) => io.close(() => resolve()));
  }

  return { client, connect, fakes, url, config, cleanup, shutdown };
}

// Resolves with the first payload of `event`, or rejects after `ms`.
export function nextEvent(emitter, event, ms = 1000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for "${event}"`)), ms);
    emitter.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

// Polls until check() returns a truthy value (for server-side effects of client events).
export async function waitFor(check, ms = 1000) {
  const start = Date.now();
  for (;;) {
    const value = check();
    if (value) return value;
    if (Date.now() - start > ms) throw new Error("waitFor timed out");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
