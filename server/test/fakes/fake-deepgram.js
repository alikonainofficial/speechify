import { once } from "events";
import { WebSocketServer } from "ws";

// A tiny local stand-in for Deepgram's streaming endpoint, so transcriber tests never leave the machine.
// It records what the transcriber sends and lets each test script Deepgram's replies.
export async function startFakeDeepgram({ rejectWithStatus } = {}) {
  const connections = [];
  const heldHandshakes = [];
  let holding = false;

  const wss = new WebSocketServer({
    port: 0,
    verifyClient: (info, accept) => {
      if (rejectWithStatus) return accept(false, rejectWithStatus, "Rejected");
      if (holding) return heldHandshakes.push(() => accept(true));
      return accept(true);
    },
  });

  const fake = {
    url: "",
    connections,
    // Called with (connection) when the transcriber sends {"type":"CloseStream"}.
    onCloseStream: null,

    // Keep new connections in the CONNECTING state until releaseHandshake().
    holdHandshake() {
      holding = true;
    },
    releaseHandshake() {
      holding = false;
      heldHandshakes.splice(0).forEach((accept) => accept());
    },

    async close() {
      connections.forEach((c) => c.ws.terminate());
      await new Promise((resolve) => wss.close(resolve));
    },
  };

  wss.on("connection", (ws, request) => {
    const connection = { ws, requestUrl: request.url, headers: request.headers, audio: [], control: [] };
    ws.on("message", (data, isBinary) => {
      if (isBinary) {
        connection.audio.push(Buffer.from(data));
        return;
      }
      const message = JSON.parse(data.toString());
      connection.control.push(message);
      if (message.type === "CloseStream" && fake.onCloseStream) fake.onCloseStream(connection);
    });
    connections.push(connection);
  });

  await once(wss, "listening");
  fake.url = `ws://localhost:${wss.address().port}/v1/listen`;
  return fake;
}

// A Deepgram "Results" message.
export function results(transcript, isFinal) {
  return JSON.stringify({
    type: "Results",
    is_final: isFinal,
    channel: { alternatives: [{ transcript }] },
  });
}
