import { SERVER_URL } from "./serverUrl";

// Calls the server's JSON API. Errors come back as { error: { code, message } };
// they are thrown as Error(message) so the UI can show them as-is.
async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${SERVER_URL}${path}`, {
      ...options,
      headers: { "content-type": "application/json", ...options.headers },
    });
  } catch {
    throw new Error("Can't reach the server. Check your connection and try again.");
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error?.message ?? `The server answered with an error (${response.status}).`);
  }
  return body;
}

// → { aiEnabled, maxSessionSeconds }
export function fetchServerConfig() {
  return request("/api/config");
}

// → { title, summary, tags, cleanedText, model }
export function enhanceNote(text) {
  return request("/api/notes/enhance", { method: "POST", body: JSON.stringify({ text }) });
}
