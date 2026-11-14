import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const makeJsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

// Cloudflare Pages tanpa proxy: /api/muslim/* jatuh ke SPA fallback (index.html).
const makeSpaHtmlResponse = () =>
  new Response("<!doctype html><html><body></body></html>", {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });

describe("muslimApi availability", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const settle = async <T>(promise: Promise<T>) => {
    const result = promise.then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    await vi.runAllTimersAsync();
    return result;
  };

  it("treats an HTML (SPA fallback) response as service unavailable", async () => {
    const fetchMock = vi.fn(async () => makeSpaHtmlResponse());
    vi.stubGlobal("fetch", fetchMock);
    const api = await import("./muslimApi");

    const result = await settle(api.fetchMuslimAyah("2", "6"));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(api.isMuslimApiUnavailableError(result.error)).toBe(true);
    }
  });

  it("stops calling the service during cooldown after it is detected down", async () => {
    const fetchMock = vi.fn(async () => makeSpaHtmlResponse());
    vi.stubGlobal("fetch", fetchMock);
    const api = await import("./muslimApi");

    await settle(api.fetchMuslimAyah("2", "6"));
    const callsAfterFirstFailure = fetchMock.mock.calls.length;

    const second = await settle(api.fetchAsbabByAyahId("13"));
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(api.isMuslimApiUnavailableError(second.error)).toBe(true);
    }
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirstFailure);

    // Setelah cooldown habis, layanan dicoba lagi.
    vi.setSystemTime(Date.now() + 5 * 60 * 1000 + 1);
    fetchMock.mockImplementation(async () =>
      makeJsonResponse({ status: 200, data: { id: "13", surah: "2", ayah: "6" } }),
    );
    const third = await settle(api.fetchMuslimAyah("2", "6"));
    expect(third.ok).toBe(true);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterFirstFailure);
  });

  it("does not treat a 404 for missing asbab as service unavailable", async () => {
    const fetchMock = vi.fn(async () =>
      makeJsonResponse({ message: "not found" }, 404),
    );
    vi.stubGlobal("fetch", fetchMock);
    const api = await import("./muslimApi");

    const result = await settle(api.fetchAsbabById("999"));

    expect(result).toEqual({ ok: true, value: null });

    // Layanan tidak ditandai mati: request berikutnya tetap dikirim.
    const before = fetchMock.mock.calls.length;
    await settle(api.fetchAsbabById("1000"));
    expect(fetchMock.mock.calls.length).toBeGreaterThan(before);
  });
});
