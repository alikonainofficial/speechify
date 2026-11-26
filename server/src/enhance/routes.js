import { Router } from "express";
import { createRateLimiter } from "../limits.js";

export const MAX_ENHANCE_CHARS = 6000;

const ERRORS = {
  AI_DISABLED: [503, "AI clean-up isn't available on this server."],
  INVALID_TEXT: [400, `Send { text } with 1 to ${MAX_ENHANCE_CHARS} characters.`],
  RATE_LIMITED: [429, "You've used the AI clean-up a lot this hour. Try again later."],
  AI_BUSY: [503, "AI is busy, try later."],
  AI_FAILED: [502, "The AI service couldn't clean up this note. Try again."],
};

function sendError(res, code) {
  const [status, message] = ERRORS[code];
  res.status(status).json({ error: { code, message } });
}

/**
 * GET  /api/config         → { aiEnabled, maxSessionSeconds }
 * POST /api/notes/enhance  { text } → { title, summary, tags, cleanedText, model }
 *
 * Errors are JSON: { error: { code, message } }.
 */
export function createApiRouter({ config, enhancer, now }) {
  const router = Router();
  const limiter = createRateLimiter({ limit: config.enhancePerHour, windowMs: 60 * 60 * 1000, now });

  router.get("/config", (req, res) => {
    res.json({ aiEnabled: Boolean(enhancer), maxSessionSeconds: config.maxSessionSeconds });
  });

  router.post("/notes/enhance", async (req, res) => {
    if (!enhancer) return sendError(res, "AI_DISABLED");

    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text || text.length > MAX_ENHANCE_CHARS) return sendError(res, "INVALID_TEXT");

    if (!limiter.tryUse(req.ip)) return sendError(res, "RATE_LIMITED");

    try {
      res.json(await enhancer.enhance(text));
    } catch (error) {
      sendError(res, error?.code === "QUOTA" ? "AI_BUSY" : "AI_FAILED");
    }
  });

  return router;
}
