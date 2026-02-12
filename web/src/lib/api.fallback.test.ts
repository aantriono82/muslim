import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const makeJsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

const createAbortError = () => {
  const error = new Error("Aborted");
  (error as Error & { name: string }).name = "AbortError";
  return error;
};

const makePendingAbortableFetch = () =>
  vi.fn((_: unknown, init?: RequestInit) => {
    return new Promise<Response>((_, reject) => {
      const signal = init?.signal;
      if (!signal) return;
      if (signal.aborted) {
        reject(createAbortError());
        return;
      }
      signal.addEventListener(
        "abort",
        () => {
          reject(createAbortError());
        },
        { once: true },
      );
    });
  });

describe("api fallback policy", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("falls back to direct MyQuran for /cal when proxy is unreachable", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("proxy offline"))
      .mockRejectedValueOnce(new TypeError("proxy offline"))
      .mockResolvedValueOnce(
        makeJsonResponse({
          status: true,
          message: "ok",
          data: {
            ce: { today: "2026-02-11" },
            hijr: { today: "24 Syaban 1447 H" },
          },
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    const { fetchJson } = await import("./api");
    const result = await fetchJson<{
      ce: { today: string };
      hijr: { today: string };
    }>("/cal/today");

    expect(result.status).toBe(true);
    expect(result.data?.ce.today).toBe("2026-02-11");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      "https://api.myquran.com/v3/cal/today",
    );
  });

  it("does not fallback to direct MyQuran for /tools endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("proxy offline"))
      .mockRejectedValueOnce(new TypeError("proxy offline"));

    vi.stubGlobal("fetch", fetchMock);

    const { fetchJson } = await import("./api");
    await expect(
      fetchJson("/tools/geocode", {
        method: "POST",
        body: JSON.stringify({ query: "Bandung, Indonesia" }),
      }),
    ).rejects.toMatchObject({
      message:
        "Fitur ini membutuhkan koneksi ke Proxy API. Silakan coba lagi nanti.",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.every(([url]) =>
        String(url).startsWith("/api/tools/geocode"),
      ),
    ).toBe(true);
  });

  it("applies timeout even when caller provides abort signal", async () => {
    vi.stubEnv("VITE_API_TIMEOUT_MS", "25");
    vi.stubEnv("VITE_API_MAX_ATTEMPTS", "1");
    const fetchMock = makePendingAbortableFetch();
    vi.stubGlobal("fetch", fetchMock);

    const { fetchJson } = await import("./api");
    const userController = new AbortController();

    const startedAt = Date.now();
    await expect(
      fetchJson("/tools/geocode", {
        method: "POST",
        body: JSON.stringify({ query: "Bandung, Indonesia" }),
        signal: userController.signal,
      }),
    ).rejects.toMatchObject({
      code: "timeout",
      message:
        "Fitur ini membutuhkan koneksi ke Proxy API. Silakan coba lagi nanti.",
    });
    const elapsed = Date.now() - startedAt;

    expect(elapsed).toBeLessThan(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps aborted code when request is cancelled by caller signal", async () => {
    vi.stubEnv("VITE_API_TIMEOUT_MS", "5000");
    vi.stubEnv("VITE_API_MAX_ATTEMPTS", "1");
    const fetchMock = makePendingAbortableFetch();
    vi.stubGlobal("fetch", fetchMock);

    const { fetchJson } = await import("./api");
    const controller = new AbortController();
    const pending = fetchJson("/tools/geocode", {
      method: "POST",
      body: JSON.stringify({ query: "Bandung, Indonesia" }),
      signal: controller.signal,
    });
    controller.abort();

    await expect(pending).rejects.toMatchObject({
      code: "aborted",
      message: "Permintaan dibatalkan.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
