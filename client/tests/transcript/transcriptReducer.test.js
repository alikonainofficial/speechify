import { describe, expect, it } from "vitest";
import { initialTranscript, joinText, transcriptReducer } from "../../src/transcript/transcriptReducer.js";

const run = (actions, state = initialTranscript) => actions.reduce(transcriptReducer, state);

describe("transcriptReducer", () => {
  it("starts empty", () => {
    expect(initialTranscript).toEqual({ committed: "", partial: "", editing: false });
  });

  it("shows the latest partial without committing it", () => {
    const state = run([
      { type: "PARTIAL", text: "hello" },
      { type: "PARTIAL", text: "hello wor" },
    ]);
    expect(state).toEqual({ committed: "", partial: "hello wor", editing: false });
  });

  it("partial, then final, never duplicates", () => {
    const state = run([
      { type: "FINAL", text: "First sentence." },
      { type: "PARTIAL", text: "Second sen" },
      { type: "FINAL", text: "Second sentence." },
    ]);
    expect(state.committed).toBe("First sentence. Second sentence.");
    expect(state.partial).toBe("");
  });

  it("ignores empty finals and partials made only of spaces", () => {
    const state = run([
      { type: "FINAL", text: "Hi." },
      { type: "FINAL", text: "   " },
      { type: "PARTIAL", text: " " },
    ]);
    expect(state).toEqual({ committed: "Hi.", partial: "", editing: false });
  });

  it("EDIT replaces the committed text and drops the partial", () => {
    const state = run([
      { type: "FINAL", text: "teh cat" },
      { type: "PARTIAL", text: "sat" },
      { type: "EDIT", text: "the cat" },
    ]);
    expect(state).toEqual({ committed: "the cat", partial: "", editing: true });
  });

  it("while editing, partials are ignored but finals are still kept", () => {
    const state = run([
      { type: "EDIT", text: "my note" },
      { type: "PARTIAL", text: "ignored" },
      { type: "FINAL", text: "kept." },
    ]);
    expect(state.partial).toBe("");
    expect(state.committed).toBe("my note kept.");
  });

  it("CLEAR resets everything and LOAD replaces the text", () => {
    const loaded = run([{ type: "FINAL", text: "old" }, { type: "LOAD", text: "saved note" }]);
    expect(loaded).toEqual({ committed: "saved note", partial: "", editing: false });
    expect(run([{ type: "CLEAR" }], loaded)).toEqual(initialTranscript);
  });

  it("returns the same state for unknown actions", () => {
    const state = run([{ type: "FINAL", text: "x" }]);
    expect(transcriptReducer(state, { type: "NOPE" })).toBe(state);
  });
});

describe("joinText", () => {
  it.each([
    ["", "Hello", "Hello"],
    ["Hello", "world", "Hello world"],
    ["Hello ", " world", "Hello world"],
    ["Hello", ", world", "Hello, world"],
    ["Wait", "...", "Wait..."],
    ["Really", "?", "Really?"],
    ["Line one\n", "Line two", "Line one\nLine two"],
  ])("joinText(%j, %j) = %j", (a, b, expected) => {
    expect(joinText(a, b)).toBe(expected);
  });
});
