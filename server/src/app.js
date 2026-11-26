import express from "express";
import cors from "cors";
import http from "http";
import path from "path";
import { Server } from "socket.io";
import { handleConnection } from "./socket/session.js";
import { createStreamLimits, getClientIp } from "./limits.js";

/**
 * Builds the HTTP and Socket.IO server without listening on a port.
 * Dependencies are passed in so tests can swap the real Deepgram transcriber for a fake.
 *
 * @param {object} deps
 * @param {object} deps.config              frozen config from loadConfig()
 * @param {Function} deps.createTranscriber ({ sampleRate }) => transcriber (an EventEmitter)
 * @param {Function} [deps.now]             clock in ms, for the daily budget (tests pass a fake)
 */
export function createServer({ config, createTranscriber, now = Date.now }) {
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
  app.use(express.json());

  const staticPath = path.resolve("public/");
  app.use(express.static(staticPath));

  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) {
      return next();
    }
    res.sendFile(path.join(staticPath, "index.html"));
  });

  return { app, httpServer, io };
}
