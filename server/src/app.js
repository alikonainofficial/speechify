import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import { handleConnection } from "./socket/session.js";
import { createStreamLimits, getClientIp } from "./limits.js";
import { createApiRouter } from "./enhance/routes.js";

/**
 * Builds the HTTP and Socket.IO server without listening on a port.
 * Dependencies are passed in so tests can swap the real Deepgram transcriber for a fake.
 *
 * @param {object} deps
 * @param {object} deps.config              frozen config from loadConfig()
 * @param {Function} deps.createTranscriber ({ sampleRate }) => transcriber (an EventEmitter)
 * @param {object|null} [deps.enhancer]     AI clean-up service ({ enhance(text) }), or null to disable AI
 * @param {Function} [deps.now]             clock in ms, for limits (tests pass a fake)
 */
export function createServer({ config, createTranscriber, enhancer = null, now = Date.now }) {
  const isAllowedOrigin = (origin) => config.allowedOrigins.includes(origin);
  const startedAt = now();
  let shuttingDown = false;
  const shutdownHooks = new Set(); // one per connected socket: finishes its active stream

  const app = express();
  if (config.trustProxy) app.set("trust proxy", 1);
  const httpServer = http.createServer(app);

  const io = new Server(httpServer, {
    cors: { origin: config.allowedOrigins, methods: ["GET", "POST"] },
    maxHttpBufferSize: config.maxMessageBytes,
    // CORS headers only matter to browsers; this refuses disallowed origins outright.
    // Requests without an Origin header (non-browser clients) are allowed.
    allowRequest: (req, callback) => {
      if (shuttingDown) return callback(null, false);
      const origin = req.headers.origin;
      callback(null, origin === undefined || isAllowedOrigin(origin));
    },
  });

  const limits = createStreamLimits({
    maxConcurrentStreams: config.maxConcurrentStreams,
    dailySecondsPerIp: config.dailySecondsPerIp,
    now,
  });

  io.on("connection", (socket) =>
    handleConnection(socket, {
      createTranscriber,
      config,
      limits,
      clientIp: getClientIp(socket, config),
      shutdownHooks,
    }),
  );

  app.use(cors({ origin: config.allowedOrigins }));

  // Cheap and dependency-free, so it answers quickly when the free server wakes up.
  // (After CORS: the browser app calls it from another origin.)
  app.get("/health", (req, res) => {
    res.json({ status: "ok", uptime: Math.round((now() - startedAt) / 1000) });
  });
  app.use(express.json({ limit: "64kb" }));
  app.use("/api", createApiRouter({ config, enhancer, now }));

  app.use((req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "No such endpoint." } });
  });

  // Malformed JSON bodies and other request errors: answer in JSON, never with a stack trace.
  // eslint-disable-next-line no-unused-vars -- Express needs all four arguments to treat this as an error handler
  app.use((error, req, res, next) => {
    const status = error.status ?? 500;
    res.status(status).json({ error: { code: status === 500 ? "SERVER_ERROR" : "BAD_REQUEST", message: "The request couldn't be processed." } });
  });

  /**
   * Graceful shutdown (e.g. on SIGTERM during a deploy): refuse new connections,
   * let active streams finish (up to `timeoutMs`) so users keep their last words,
   * then close every socket and the HTTP server.
   */
  async function shutdown({ timeoutMs = 5000 } = {}) {
    shuttingDown = true;
    const finishing = Promise.all([...shutdownHooks].map((finish) => finish()));
    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    });
    await Promise.race([finishing, timeout]);
    clearTimeout(timer);
    await new Promise((resolve) => io.close(() => resolve()));
  }

  return { app, httpServer, io, shutdown };
}
