import "dotenv/config";
import { loadConfig } from "./config.js";
import { createServer } from "./app.js";
import DeepgramTranscriber from "./transcription/deepgram-transcriber.js";
import { createGeminiEnhancer } from "./enhance/gemini-enhancer.js";

// The only file that starts listening. Everything else can be imported without side effects.
let config;
try {
  config = loadConfig();
} catch (error) {
  console.error(`Can't start: ${error.message}`);
  process.exit(1);
}

if (!config.geminiApiKey) {
  console.warn("GEMINI_API_KEY is not set: AI clean-up is disabled.");
}
const enhancer = config.geminiApiKey
  ? createGeminiEnhancer({ apiKey: config.geminiApiKey, model: config.geminiModel })
  : null;

const { httpServer, shutdown } = createServer({
  config,
  enhancer,
  createTranscriber: ({ sampleRate }) =>
    new DeepgramTranscriber({ sampleRate, apiKey: config.deepgramApiKey }),
});

httpServer.listen(config.port, () => {
  console.log(`Server listening at http://localhost:${config.port}`);
});

// Render sends SIGTERM before replacing or stopping the instance.
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    console.log(`${signal} received: finishing active streams and shutting down.`);
    await shutdown({ timeoutMs: 5000 });
    process.exit(0);
  });
}
