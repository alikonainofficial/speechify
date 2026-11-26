// Reads environment variables once, applies defaults and validates them.
// Everything else in the server receives this object instead of reading process.env.

function toPort(value, fallback) {
  if (value === undefined || value === "") return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`PORT must be an integer between 0 and 65535 (got "${value}")`);
  }
  return port;
}

export function loadConfig(env = process.env) {
  return Object.freeze({
    nodeEnv: env.NODE_ENV || "development",
    port: toPort(env.PORT, 8080),
    deepgramApiKey: env.DEEPGRAM_API_KEY || "",
  });
}
