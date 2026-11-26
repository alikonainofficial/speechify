/* global sampleRate */
// Runs on the browser's audio thread. Vite bundles this file (and pcm.js) via the
// "?worker&url" import in useRecorder.js.
//
// Collects mic samples into ~100 ms blocks, downsamples each block to 16 kHz Int16 PCM
// and posts it to the main thread. Also posts the input level about 15 times a second.
import { downsample, floatTo16BitPCM, rms } from "./pcm.js";

const TARGET_SAMPLE_RATE = 16000;

class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // `sampleRate` is the AudioContext's rate (often 44100 or 48000).
    this.block = new Float32Array(Math.round(sampleRate / 10));
    this.filled = 0;
    this.levelEvery = Math.round(sampleRate / 15);
    this.levelSamples = 0;
    this.levelSquares = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true; // no input yet

    this.trackLevel(channel);

    let offset = 0;
    while (offset < channel.length) {
      const count = Math.min(channel.length - offset, this.block.length - this.filled);
      this.block.set(channel.subarray(offset, offset + count), this.filled);
      this.filled += count;
      offset += count;

      if (this.filled === this.block.length) {
        const pcm = floatTo16BitPCM(downsample(this.block, sampleRate, TARGET_SAMPLE_RATE));
        this.port.postMessage({ type: "pcm", pcm: pcm.buffer }, [pcm.buffer]);
        this.filled = 0;
      }
    }
    return true; // keep the processor alive
  }

  trackLevel(channel) {
    const level = rms(channel);
    this.levelSquares += level * level * channel.length;
    this.levelSamples += channel.length;
    if (this.levelSamples >= this.levelEvery) {
      this.port.postMessage({ type: "level", level: Math.sqrt(this.levelSquares / this.levelSamples) });
      this.levelSamples = 0;
      this.levelSquares = 0;
    }
  }
}

registerProcessor("pcm-processor", PcmProcessor);
