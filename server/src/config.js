// Reads environment variables once, applies defaults and validates them.
// Everything else in the server receives this object instead of reading process.env.

function readNumber(env, name, fallback, { min = 0, integer = false } = {}) {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  const valid = Number.isFinite(value) && value >= min && (!integer || Number.isInteger(value));
  if (!valid) {
    const kind = integer ? "an integer" : "a number";
    throw new Error(`${name} must be ${kind} ≥ ${min} (got "${raw}")`);
  }
  return value;
}

function readList(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function loadConfig(env = process.env) {
  return Object.freeze({
    nodeEnv: env.NODE_ENV || "development",
    port: readNumber(env, "PORT", 8080, { integer: true }),
    deepgramApiKey: env.DEEPGRAM_API_KEY || "",

    // Browser origins allowed to use the API and open sockets.
    allowedOrigins: Object.freeze(readList(env, "ALLOWED_ORIGINS", ["http://localhost:5173"])),
    // Behind a proxy (Render), the client IP comes from X-Forwarded-For.
    trustProxy: env.TRUST_PROXY === "1",

    // Public-demo limits.
    maxSessionSeconds: readNumber(env, "MAX_SESSION_SECONDS", 60, { min: 0.001 }),
    maxConcurrentStreams: readNumber(env, "MAX_CONCURRENT_STREAMS", 3, { min: 1, integer: true }),
    dailySecondsPerIp: readNumber(env, "DAILY_SECONDS_PER_IP", 600, { min: 0 }),
    maxMessageBytes: 64 * 1024,
  });
}
