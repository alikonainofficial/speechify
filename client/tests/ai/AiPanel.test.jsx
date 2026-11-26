import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AiPanel from "../../src/components/AiPanel.jsx";

const RESULT = {
  title: "Plumber call",
  summary: "Call the plumber about the sink.",
  tags: ["home", "todo"],
  cleanedText: "Call the plumber about the sink.",
  model: "gemini-3.5-flash-lite",
};

const NOTE = {
  id: "n1",
  createdAt: "2026-11-26T09:00:00.000Z",
  updatedAt: "2026-11-26T09:00:00.000Z",
  title: "Um call the plumber",
  text: "um so call the uh plumber about the sink",
  durationSec: 4,
};

// Renders the panel around a tiny in-memory "store", like the app does.
function renderPanel(initial = NOTE) {
  const updates = [];
  function Harness() {
    const [note, setNote] = useState(initial);
    const onUpdate = (id, changes) => {
      updates.push(changes);
      const next = { ...note, ...changes };
      setNote(next);
      return next;
    };
    return (
      <>
        <p data-testid="current-title">{note.title}</p>
        <p data-testid="current-text">{note.text}</p>
        <AiPanel note={note} onUpdate={onUpdate} />
      </>
    );
  }
  render(<Harness />);
  return updates;
}

function respond(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

let fetchMock;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("AiPanel", () => {
  it("enhances a note: loading state, then title, summary and tags, stored in note.ai", async () => {
    const user = userEvent.setup();
    let finish;
    fetchMock.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const updates = renderPanel();

    await user.click(screen.getByRole("button", { name: "Enhance with AI" }));
    expect(screen.getByRole("button", { name: "Enhancing…" })).toBeDisabled();

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/notes\/enhance$/);
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({ text: NOTE.text });

    finish(respond(200, RESULT));
    const result = await screen.findByTestId("ai-result");

    expect(result).toHaveTextContent("Plumber call");
    expect(result).toHaveTextContent("Call the plumber about the sink.");
    expect(screen.getByRole("list", { name: "Tags" })).toHaveTextContent("hometodo");
    expect(updates[0].ai).toMatchObject({ ...RESULT, originalTitle: NOTE.title, originalText: NOTE.text });
    // The note itself is unchanged until the user applies something.
    expect(screen.getByTestId("current-title")).toHaveTextContent(NOTE.title);
  });

  it("applies the AI title and cleaned text, and can undo both", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(respond(200, RESULT));
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Enhance with AI" }));
    await screen.findByTestId("ai-result");

    await user.click(screen.getByRole("button", { name: "Use AI title" }));
    expect(screen.getByTestId("current-title")).toHaveTextContent("Plumber call");
    await user.click(screen.getByRole("button", { name: "Replace text with cleaned version" }));
    expect(screen.getByTestId("current-text")).toHaveTextContent(RESULT.cleanedText);

    await user.click(screen.getByRole("button", { name: "Restore original title" }));
    await user.click(screen.getByRole("button", { name: "Restore original text" }));
    expect(screen.getByTestId("current-title")).toHaveTextContent(NOTE.title);
    expect(screen.getByTestId("current-text")).toHaveTextContent(NOTE.text);
  });

  it("toggles between the original and cleaned text", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(respond(200, RESULT));
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Enhance with AI" }));

    expect(await screen.findByTestId("ai-compare-text")).toHaveTextContent(RESULT.cleanedText);
    await user.click(screen.getByRole("button", { name: "Original" }));
    expect(screen.getByTestId("ai-compare-text")).toHaveTextContent(NOTE.text);
    expect(screen.getByRole("button", { name: "Original" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows the server's error message and leaves the note untouched", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(respond(503, { error: { code: "AI_BUSY", message: "AI is busy, try later." } }));
    const updates = renderPanel();

    await user.click(screen.getByRole("button", { name: "Enhance with AI" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("AI is busy, try later.");
    expect(updates).toEqual([]);
    expect(screen.getByRole("button", { name: "Enhance with AI" })).toBeEnabled();
  });

  it("explains a network failure", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Enhance with AI" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Can't reach the server"));
  });

  it("shows a stored result when a previously enhanced note is opened", () => {
    renderPanel({ ...NOTE, ai: { ...RESULT, originalTitle: NOTE.title, originalText: NOTE.text, createdAt: "x" } });

    expect(screen.getByTestId("ai-result")).toHaveTextContent("Plumber call");
    expect(screen.getByRole("button", { name: "Enhance again" })).toBeInTheDocument();
  });
});
