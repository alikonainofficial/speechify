import { EventEmitter } from "events";

// Stands in for DeepgramTranscriber in tests. It never touches the network:
// the test decides when it becomes ready, what it transcribes and when it finishes.
export class FakeTranscriber extends EventEmitter {
  constructor(options) {
    super();
    this.options = options;
    this.sent = [];
    this.finishCalls = 0;
    this.closeCalls = 0;
    this.finishPromise = new Promise((resolve) => {
      this.resolveFinish = resolve;
    });
  }

  send(chunk) {
    this.sent.push(chunk);
  }

  // Resolves when the test calls resolveFinish(), like Deepgram flushing its last results.
  finish() {
    this.finishCalls += 1;
    return this.finishPromise;
  }

  close() {
    this.closeCalls += 1;
  }

  emitReady() {
    this.emit("ready");
  }

  emitPartial(text) {
    this.emit("partial", text);
  }

  emitFinal(text) {
    this.emit("final", text);
  }

  emitError(error) {
    this.emit("error", error);
  }
}

// A createTranscriber() replacement that remembers every transcriber it made.
export function createFakeTranscriberFactory() {
  const instances = [];
  const create = (options) => {
    const transcriber = new FakeTranscriber(options);
    instances.push(transcriber);
    return transcriber;
  };
  return { create, instances };
}
