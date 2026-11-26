import "dotenv/config";
import { loadConfig } from "./config.js";
import { createServer } from "./app.js";
import DeepgramTranscriber from "./transcription/deepgram-transcriber.js";
import { createGeminiEnhancer } from "./enhance/gemini-enhancer.js";

// The only file that starts listening. Everything else can be imported without side effects.
const config = loadConfig();

if (!config.geminiApiKey) {
  console.warn("GEMINI_API_KEY is not set: AI clean-up is disabled.");
}
const enhancer = config.geminiApiKey
  ? createGeminiEnhancer({ apiKey: config.geminiApiKey, model: config.geminiModel })
  : null;

const { httpServer } = createServer({
  config,
  enhancer,
  createTranscriber: ({ sampleRate }) =>
    new DeepgramTranscriber({ sampleRate, apiKey: config.deepgramApiKey }),
});

httpServer.listen(config.port, () => {
  console.log(`Server listening at http://localhost:${config.port}`);
});
