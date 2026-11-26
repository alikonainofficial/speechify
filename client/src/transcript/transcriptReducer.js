// The live transcript as a pure reducer.
//
// committed: final text that will be saved.
// partial:   Deepgram's current guess for the phrase being spoken; shown, never saved.
// editing:   the user has edited the text by hand; new partials are not shown.
//
// Keeping `partial` separate from `committed` is what prevents duplicated words:
// the old app saved "text + partial" whenever the textarea changed, then appended
// the final for the same phrase again.

export const initialTranscript = Object.freeze({ committed: "", partial: "", editing: false });

const STARTS_WITH_PUNCTUATION = /^[.,!?;:…)\]}%'"]/;

// Joins two pieces of transcript with sensible spacing.
export function joinText(current, addition) {
  const next = addition.trim();
  if (!next) return current;
  if (!current) return next;
  if (STARTS_WITH_PUNCTUATION.test(next)) return current.trimEnd() + next;
  if (/\s$/.test(current)) return current + next;
  return `${current} ${next}`;
}

export function transcriptReducer(state, action) {
  switch (action.type) {
    case "PARTIAL":
      if (state.editing) return state;
      return { ...state, partial: action.text.trim() };

    case "FINAL":
      return { ...state, committed: joinText(state.committed, action.text), partial: "" };

    case "EDIT":
      return { committed: action.text, partial: "", editing: true };

    case "LOAD":
      return { committed: action.text, partial: "", editing: false };

    case "CLEAR":
      return initialTranscript;

    default:
      return state;
  }
}
