import { describe, expect, it } from "vitest";
import { downsample, floatTo16BitPCM, rms } from "../../src/audio/pcm.js";

describe("downsample", () => {
  it("turns 100 ms at 48 kHz into 100 ms at 16 kHz", () => {
    expect(downsample(new Float32Array(4800), 48000, 16000)).toHaveLength(1600);
  });

  it("handles non-integer ratios like 44.1 kHz", () => {
    expect(downsample(new Float32Array(4410), 44100, 16000)).toHaveLength(1600);
  });

  it("averages each window of input samples", () => {
    const input = Float32Array.from([1, 1, 1, 0, 0, 0, -0.5, -0.5, -0.5]);
    expect(Array.from(downsample(input, 48000, 16000))).toEqual([1, 0, -0.5]);
  });

  it("returns a copy when the rates match", () => {
    const input = Float32Array.from([0.1, 0.2]);
    const output = downsample(input, 16000, 16000);
    expect(output).toEqual(input);
    expect(output).not.toBe(input);
  });

  it("refuses to upsample", () => {
    expect(() => downsample(new Float32Array(10), 8000, 16000)).toThrow(/upsample/);
  });
});

describe("floatTo16BitPCM", () => {
  it("maps -1..1 to the full Int16 range and keeps the sign", () => {
    const pcm = floatTo16BitPCM(Float32Array.from([-1, -0.5, 0, 0.5, 1]));
    expect(pcm).toBeInstanceOf(Int16Array);
    expect(Array.from(pcm)).toEqual([-32768, -16384, 0, 16383, 32767]);
  });

  it("clamps values outside -1..1", () => {
    expect(Array.from(floatTo16BitPCM(Float32Array.from([-3, 3])))).toEqual([-32768, 32767]);
  });
});

describe("rms", () => {
  it("is 0 for silence and 1 for a full-scale square wave", () => {
    expect(rms(new Float32Array(8))).toBe(0);
    expect(rms(Float32Array.from([1, -1, 1, -1]))).toBe(1);
  });
});
