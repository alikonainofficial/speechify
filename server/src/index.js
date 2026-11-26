import "dotenv/config";
import { loadConfig } from "./config.js";
import { createServer } from "./app.js";
import DeepgramTranscriber from "./transcription/deepgram-transcriber.js";

// The only file that starts listening. Everything else can be imported without side effects.
const config = loadConfig();

const { httpServer } = createServer({
  config,
  createTranscriber: ({ sampleRate }) =>
    new DeepgramTranscriber({ sampleRate, apiKey: config.deepgramApiKey }),
});

httpServer.listen(config.port, () => {
  console.log(`Server listening at http://localhost:${config.port}`);
});
