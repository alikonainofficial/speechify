import express from "express";
import cors from "cors";
import http from "http";
import path from "path";
import { Server } from "socket.io";
import { handleConnection } from "./socket/session.js";

/**
 * Builds the HTTP and Socket.IO server without listening on a port.
 * Dependencies are passed in so tests can swap the real Deepgram transcriber for a fake.
 *
 * @param {object} deps
 * @param {object} deps.config            frozen config from loadConfig()
 * @param {Function} deps.createTranscriber ({ sampleRate }) => transcriber (an EventEmitter)
 * @param {Function} [deps.now]           clock, for time-based limits (step 2.5)
 */
export function createServer({ config, createTranscriber, now = Date.now }) {
  const app = express();
  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => handleConnection(socket, { config, createTranscriber, now }));

  app.use(cors({ credentials: false, origin: "*" }));
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
