// Friendly text for every way a recording can fail. Server codes come from `stream-error`.
const MESSAGES = {
  BUSY: "The demo is busy right now. Try again in a minute.",
  DAILY_LIMIT: "You've used today's free recording time. Come back tomorrow.",
  INVALID_CONFIG: "The server didn't accept the recorder's settings. Reload the page and try again.",
  TRANSCRIBER_ERROR: "Transcription stopped because of a problem with the speech service.",
  DISCONNECTED: "Can't reach the transcription server. It reconnects automatically; try again in a moment.",
};

export function errorMessage(code, serverMessage) {
  if (code === "TRANSCRIBER_ERROR" && serverMessage) return serverMessage;
  return MESSAGES[code] ?? serverMessage ?? "Something went wrong. Try again.";
}
