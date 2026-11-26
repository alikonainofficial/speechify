import express from "express";
import cors from "cors";
import http from "http";
import path from "path";
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

  const app = express();
  if (config.trustProxy) app.set("trust proxy", 1);
  const httpServer = http.createServer(app);

  const io = new Server(httpServer, {
    cors: { origin: config.allowedOrigins, methods: ["GET", "POST"] },
    maxHttpBufferSize: config.maxMessageBytes,
    // CORS headers only matter to browsers; this refuses disallowed origins outright.
    // Requests without an Origin header (non-browser clients) are allowed.
    allowRequest: (req, callback) => {
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
    }),
  );

  app.use(cors({ origin: config.allowedOrigins }));
  app.use(express.json({ limit: "64kb" }));
  app.use("/api", createApiRouter({ config, enhancer, now }));

  const staticPath = path.resolve("public/");
  app.use(express.static(staticPath));

  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) {
      return next();
    }
    res.sendFile(path.join(staticPath, "index.html"));
  });

  // Malformed JSON bodies and other request errors: answer in JSON, never with a stack trace.
  // eslint-disable-next-line no-unused-vars -- Express needs all four arguments to treat this as an error handler
  app.use((error, req, res, next) => {
    const status = error.status ?? 500;
    res.status(status).json({ error: { code: status === 500 ? "SERVER_ERROR" : "BAD_REQUEST", message: "The request couldn't be processed." } });
  });

  return { app, httpServer, io };
}
