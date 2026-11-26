// Pure audio helpers, shared by the AudioWorklet and the tests.

// Downsamples by averaging each window of input samples (a simple low-pass filter,
// which keeps high frequencies from folding back as noise).
export function downsample(input, inRate, outRate) {
  if (outRate > inRate) throw new Error("downsample() can't upsample");
  if (outRate === inRate) return Float32Array.from(input);

  const ratio = inRate / outRate;
  const output = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < output.length; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let sum = 0;
    for (let j = start; j < end; j += 1) sum += input[j];
    output[i] = sum / (end - start);
  }
  return output;
}

// Converts floats in -1..1 to 16-bit signed integers ("linear16", what Deepgram expects).
export function floatTo16BitPCM(input) {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
}

// Root mean square: a simple loudness measure from 0 (silence) to 1 (full scale).
export function rms(samples) {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}
