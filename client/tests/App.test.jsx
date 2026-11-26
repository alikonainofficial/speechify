import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Controllable fakes for the two hooks that touch the outside world ---

const fakes = vi.hoisted(() => ({
  socket: null, // { handlers, setStatus, startStream, sendAudio, stopStream }
  recorder: null, // { start, stop, setError }
}));

vi.mock("../src/net/useTranscriptionSocket", () => ({
  useTranscriptionSocket: (handlers) => {
    const [status, setStatus] = useState("connected");
    fakes.socket.handlers = handlers;
    fakes.socket.setStatus = setStatus;
    return {
      status,
      startStream: fakes.socket.startStream,
      sendAudio: fakes.socket.sendAudio,
      stopStream: fakes.socket.stopStream,
    };
  },
}));

vi.mock("../src/audio/useRecorder", () => ({
  useRecorder: () => {
    const [error, setError] = useState(null);
    fakes.recorder.setError = setError;
    return { start: fakes.recorder.start, stop: fakes.recorder.stop, isRecording: false, level: 0, error };
  },
}));

beforeEach(() => {
  localStorage.clear();
  fakes.socket = { startStream: vi.fn(), sendAudio: vi.fn(), stopStream: vi.fn() };
  fakes.recorder = { start: vi.fn(async () => 16000), stop: vi.fn() };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// The app's notes store is created once per module load; load a fresh App for each test.
async function renderApp() {
  vi.resetModules();
  const { default: App } = await import("../src/App.jsx");
  return render(<App />);
}

const toggle = () => screen.getByTestId("record-toggle");
const state = () => screen.getByTestId("recorder-state").textContent;
const server = () => fakes.socket.handlers;

function seedNote(note = {}) {
  const full = {
    id: "n1",
    createdAt: "2026-11-26T09:00:00.000Z",
    updatedAt: "2026-11-26T09:00:00.000Z",
    title: "Groceries",
    text: "Buy milk and bread.",
    durationSec: 5,
    ...note,
  };
  localStorage.setItem("voice-notes:v1", JSON.stringify([full]));
  return full;
}

async function startRecording(user) {
  await user.click(toggle());
  await waitFor(() => expect(fakes.socket.startStream).toHaveBeenCalledWith(16000));
  act(() => server().onReady());
}

describe("recording a note", () => {
  it("start → partial in grey → final → stop → saved note appears in the list", async () => {
    const user = userEvent.setup();
    await renderApp();
    expect(state()).toBe("Ready");

    await startRecording(user);
    expect(state()).toBe("Listening");
    expect(toggle()).toHaveAttribute("aria-pressed", "true");

    act(() => server().onPartial("Call the plum"));
    expect(screen.getByTestId("partial-text")).toHaveTextContent("Call the plum");
    expect(screen.getByTestId("partial-text")).toHaveClass("italic");

    act(() => server().onFinal("Call the plumber about the sink."));
    expect(screen.queryByTestId("partial-text")).toBeNull();
    expect(screen.getByTestId("live-transcript")).toHaveTextContent("Call the plumber about the sink.");

    await user.click(toggle());
    expect(fakes.socket.stopStream).toHaveBeenCalledTimes(1);
    expect(fakes.recorder.stop).toHaveBeenCalled();
    expect(state()).toBe("Finishing…");

    act(() => server().onFinal("Tomorrow morning."));
    act(() => server().onEnded({ reason: "stopped" }));

    expect(screen.getByTestId("note-text")).toHaveValue("Call the plumber about the sink. Tomorrow morning.");
    expect(screen.getByRole("list", { name: "Notes" })).toHaveTextContent("Call the plumber about the sink");
    expect(state()).toBe("Ready");
  });

  it("a double click on Record never opens two streams", async () => {
    await renderApp();

    fireEvent.click(toggle());
    fireEvent.click(toggle()); // the second click cancels the first while the mic starts
    await act(async () => {});

    expect(fakes.socket.startStream.mock.calls.length).toBeLessThanOrEqual(1);
    expect(state()).toBe("Ready");
    expect(fakes.recorder.stop).toHaveBeenCalled();
  });

  it("ignores held-down Space key repeats", async () => {
    await renderApp();

    fireEvent.keyDown(window, { code: "Space" });
    fireEvent.keyDown(window, { code: "Space", repeat: true });
    fireEvent.keyDown(window, { code: "Space", repeat: true });
    await waitFor(() => expect(fakes.socket.startStream).toHaveBeenCalledTimes(1));
    expect(fakes.socket.stopStream).not.toHaveBeenCalled();
  });

  it("saves nothing and says so when nothing was transcribed", async () => {
    const user = userEvent.setup();
    await renderApp();
    await startRecording(user);

    await user.click(toggle());
    act(() => server().onEnded({ reason: "stopped" }));

    expect(screen.getByRole("status")).toHaveTextContent("Nothing was transcribed");
    expect(screen.queryByRole("list", { name: "Notes" })).toBeNull();
  });

  it("saves the note when the server stops it at the time limit", async () => {
    const user = userEvent.setup();
    await renderApp();
    await startRecording(user);

    act(() => server().onFinal("A long thought."));
    act(() => server().onEnded({ reason: "time-limit" }));

    expect(screen.getByTestId("note-text")).toHaveValue("A long thought.");
    expect(screen.getByRole("status")).toHaveTextContent("60-second limit");
    expect(fakes.recorder.stop).toHaveBeenCalled();
  });
});

describe("keyboard shortcut", () => {
  it("Space toggles recording, but not while typing in the title field", async () => {
    const user = userEvent.setup();
    seedNote();
    await renderApp();
    await user.click(screen.getByRole("button", { name: /Groceries/ }));

    await user.click(screen.getByTestId("note-title"));
    await user.keyboard(" ");
    expect(fakes.recorder.start).not.toHaveBeenCalled();
    expect(screen.getByTestId("note-title")).toHaveValue("Groceries ");

    screen.getByTestId("note-title").blur();
    fireEvent.keyDown(document.body, { code: "Space" });
    await waitFor(() => expect(fakes.socket.startStream).toHaveBeenCalledTimes(1));
    act(() => server().onReady());

    fireEvent.keyDown(document.body, { code: "Space" });
    expect(fakes.socket.stopStream).toHaveBeenCalledTimes(1);
  });
});

describe("note actions", () => {
  it("Copy writes the note text to the clipboard and shows Copied", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    seedNote();
    await renderApp();
    await user.click(screen.getByRole("button", { name: /Groceries/ }));

    await user.click(screen.getByRole("button", { name: "Copy text" }));

    expect(writeText).toHaveBeenCalledWith("Buy milk and bread.");
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("edits are saved on blur and shown as Saved", async () => {
    const user = userEvent.setup();
    seedNote();
    await renderApp();
    await user.click(screen.getByRole("button", { name: /Groceries/ }));

    const title = screen.getByTestId("note-title");
    await user.clear(title);
    await user.type(title, "Shopping list");
    await user.tab();

    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("voice-notes:v1"))[0].title).toBe("Shopping list");
  });

  it("Delete asks first, then removes the note", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    seedNote();
    await renderApp();
    await user.click(screen.getByRole("button", { name: /Groceries/ }));

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByTestId("note-title")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("note-title")).toBeNull();
    expect(JSON.parse(localStorage.getItem("voice-notes:v1"))).toEqual([]);
  });
});

describe("errors", () => {
  it.each([
    ["BUSY", /busy right now/],
    ["DAILY_LIMIT", /today's free recording time/],
    ["INVALID_CONFIG", /didn't accept the recorder's settings/],
  ])("shows a friendly message for %s and goes back to Ready", async (code, message) => {
    const user = userEvent.setup();
    await renderApp();
    await user.click(toggle());

    act(() => server().onError({ code, message: "server text" }));

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(state()).toBe("Ready");
    expect(fakes.recorder.stop).toHaveBeenCalled();
  });

  it("shows the server's message for transcriber errors", async () => {
    const user = userEvent.setup();
    await renderApp();
    await startRecording(user);

    act(() => server().onError({ code: "TRANSCRIBER_ERROR", message: "The transcription service rejected the API key." }));

    expect(screen.getByRole("alert")).toHaveTextContent("rejected the API key");
  });

  it("shows the recorder's message when the mic is blocked", async () => {
    const user = userEvent.setup();
    fakes.recorder.start = vi.fn(async () => {
      fakes.recorder.setError({ code: "permission-denied", message: "Microphone access is blocked." });
      return null;
    });
    await renderApp();

    await user.click(toggle());

    expect(await screen.findByRole("alert")).toHaveTextContent("Microphone access is blocked.");
    expect(fakes.socket.startStream).not.toHaveBeenCalled();
    expect(state()).toBe("Ready");
  });

  it("keeps what was transcribed when the server disconnects mid-recording", async () => {
    const user = userEvent.setup();
    await renderApp();
    await startRecording(user);
    act(() => server().onFinal("Half a thought,"));
    act(() => server().onPartial("and the rest"));

    act(() => fakes.socket.setStatus("disconnected"));

    expect(screen.getByRole("alert")).toHaveTextContent("Can't reach the transcription server");
    expect(screen.getByTestId("note-text")).toHaveValue("Half a thought, and the rest");
    expect(toggle()).toBeDisabled();
  });
});

describe("persistence", () => {
  it("notes survive a remount (real store + localStorage)", async () => {
    const user = userEvent.setup();
    const first = await renderApp();
    await startRecording(user);
    act(() => server().onFinal("Remember the keys."));
    await user.click(toggle());
    act(() => server().onEnded({ reason: "stopped" }));
    first.unmount();

    await renderApp();

    expect(screen.getByRole("list", { name: "Notes" })).toHaveTextContent("Remember the keys");
  });
});
