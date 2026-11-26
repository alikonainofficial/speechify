import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useServerHealth } from "../../src/net/useServerHealth.js";

const ok = () => Promise.resolve({ ok: true, status: 200 });
const asleep = () => Promise.reject(new TypeError("Failed to fetch"));

let fetchMock;
beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useServerHealth", () => {
  it("is healthy straight away when the server answers, with no waking banner", async () => {
    fetchMock.mockImplementation(ok);
    const { result } = renderHook(() => useServerHealth());

    await act(async () => {});
    expect(result.current).toEqual({ healthy: true, waking: false });
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/health$/);

    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(fetchMock).toHaveBeenCalledTimes(1); // no more polling once healthy
  });

  it("shows waking while the server sleeps and retries every 5 s until it answers", async () => {
    fetchMock.mockImplementationOnce(asleep).mockImplementationOnce(asleep).mockImplementation(ok);
    const { result } = renderHook(() => useServerHealth());

    await act(async () => {});
    expect(result.current).toEqual({ healthy: false, waking: true });

    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.healthy).toBe(false);

    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.current).toEqual({ healthy: true, waking: false });
  });

  it("treats a non-OK answer as not ready yet", async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve({ ok: false, status: 503 })).mockImplementation(ok);
    const { result } = renderHook(() => useServerHealth());

    await act(async () => {});
    expect(result.current.waking).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(result.current.healthy).toBe(true);
  });

  it("shows waking if the first check is just slow", async () => {
    fetchMock.mockImplementation(() => new Promise(() => {})); // never answers
    const { result } = renderHook(() => useServerHealth());

    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(result.current.waking).toBe(false);
    await act(async () => vi.advanceTimersByTimeAsync(600));
    expect(result.current.waking).toBe(true);
  });

  it("stops checking after unmount", async () => {
    fetchMock.mockImplementation(asleep);
    const { unmount } = renderHook(() => useServerHealth());
    await act(async () => {});
    unmount();

    await act(async () => vi.advanceTimersByTimeAsync(20_000));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
