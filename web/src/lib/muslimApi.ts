const MUSLIM_API_BASE =
  import.meta.env.VITE_MUSLIM_API_BASE_URL ?? "/api/muslim";
const MUSLIM_TIMEOUT_MS = 12000;
const MUSLIM_MAX_ATTEMPTS = 2;
const ASBAB_CACHE_TTL = 6 * 60 * 60 * 1000;

type MuslimApiErrorCode = "network" | "timeout" | "http" | "non-json" | "parse";

class MuslimApiError extends Error {
  status: number;
  code: MuslimApiErrorCode;
  constructor(message: string, status: number, code: MuslimApiErrorCode) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type MuslimApiResponse<T> = {
  status: number;
  data: T;
};

export type MuslimAyah = {
  id?: string;
  _id?: string;
  arab?: string;
  asbab?: string | null;
  ayah?: string;
  surah?: string;
  text?: string;
};

export type MuslimAsbabEntry = {
  _id?: string;
  ayah?: string;
  id: string;
  text: string;
};

export type SurahAsbabEntry = {
  id: string;
  ayah: string;
  text: string;
};

const buildMuslimUrl = (path: string) => {
  if (path.startsWith("http")) return path;
  const cleaned = path.startsWith("/") ? path : `/${path}`;
  return `${MUSLIM_API_BASE}${cleaned}`;
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });

const isRetryable = (err: unknown) => {
  if (!(err instanceof MuslimApiError)) return false;
  if (err.code === "network" || err.code === "timeout") return true;
  if (err.code === "non-json" || err.code === "parse") return true;
  if (err.code === "http") {
    return (
      err.status === 408 ||
      err.status === 429 ||
      (err.status >= 500 && err.status <= 599)
    );
  }
  return false;
};

const getCacheKey = (suffix: string) => `ibadahmu:muslim:${suffix}`;

const readCache = <T>(key: string): T | undefined => {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { expiresAt: number; data: T };
    if (parsed.expiresAt > Date.now()) {
      return parsed.data;
    }
    window.localStorage.removeItem(key);
  } catch {
    return undefined;
  }
  return undefined;
};

const writeCache = <T>(key: string, data: T, ttlMs: number) => {
  if (typeof window === "undefined") return;
  if (ttlMs <= 0) return;
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({ data, expiresAt: Date.now() + ttlMs }),
    );
  } catch {
    // ignore
  }
};

const parseJsonLoose = <T>(raw: string) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const isAbortError = (err: unknown) =>
  typeof err === "object" &&
  err !== null &&
  "name" in err &&
  (err as { name?: unknown }).name === "AbortError";

const fetchMuslimApi = async <T>(
  path: string,
): Promise<MuslimApiResponse<T>> => {
  const url = buildMuslimUrl(path);

  for (let attempt = 1; attempt <= MUSLIM_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(
      () => controller.abort(),
      MUSLIM_TIMEOUT_MS,
    );

    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      globalThis.clearTimeout(timeoutId);

      const contentType = response.headers.get("content-type") ?? "";
      const raw = await response.text();
      const parsed = parseJsonLoose<MuslimApiResponse<T>>(raw);

      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        if (
          parsed &&
          typeof (parsed as { message?: unknown }).message === "string"
        ) {
          message = (parsed as { message?: string }).message ?? message;
        }
        const error = new MuslimApiError(message, response.status, "http");
        if (attempt < MUSLIM_MAX_ATTEMPTS && isRetryable(error)) {
          await sleep(350 * attempt);
          continue;
        }
        throw error;
      }

      if (parsed) {
        return parsed;
      }

      if (!contentType.includes("application/json")) {
        const error = new MuslimApiError(
          "Server asbabun nuzul tidak mengembalikan JSON yang valid. " +
            "Pastikan proxy Muslim API aktif atau set VITE_MUSLIM_API_BASE_URL.",
          response.status,
          "non-json",
        );
        if (attempt < MUSLIM_MAX_ATTEMPTS && isRetryable(error)) {
          await sleep(350 * attempt);
          continue;
        }
        throw error;
      }

      const error = new MuslimApiError(
        "Gagal membaca data asbabun nuzul.",
        response.status,
        "parse",
      );
      if (attempt < MUSLIM_MAX_ATTEMPTS && isRetryable(error)) {
        await sleep(350 * attempt);
        continue;
      }
      throw error;
    } catch (err) {
      globalThis.clearTimeout(timeoutId);
      if (err instanceof MuslimApiError) {
        if (attempt < MUSLIM_MAX_ATTEMPTS && isRetryable(err)) {
          await sleep(350 * attempt);
          continue;
        }
        throw err;
      }
      const detail = err instanceof Error ? err.message : "Network error";
      const error = new MuslimApiError(
        `Tidak dapat terhubung ke server asbabun nuzul. ${detail}`,
        0,
        isAbortError(err) ? "timeout" : "network",
      );
      if (attempt < MUSLIM_MAX_ATTEMPTS && isRetryable(error)) {
        await sleep(350 * attempt);
        continue;
      }
      throw error;
    }
  }

  throw new MuslimApiError("Gagal membaca data asbabun nuzul.", 0, "parse");
};

const asbabCache = new Map<string, MuslimAsbabEntry | null>();
const asbabInFlight = new Map<string, Promise<MuslimAsbabEntry | null>>();
const ASBAB_LIST_CACHE_KEY = getCacheKey("asbab:list:v1");
let asbabListMemory: MuslimAsbabEntry[] | null = null;
let asbabListInFlight: Promise<MuslimAsbabEntry[]> | null = null;
let asbabByAyahMemory: Map<string, MuslimAsbabEntry> | null = null;

export const fetchMuslimAyah = async (surahId: string, ayahId: string) => {
  const response = await fetchMuslimApi<MuslimAyah | MuslimAyah[]>(
    `/quran/ayah/specific?surahId=${surahId}&ayahId=${ayahId}`,
  );
  if (Array.isArray(response.data)) {
    return response.data[0] ?? null;
  }
  return response.data ?? null;
};

export const fetchAsbabById = async (id: string) => {
  const trimmed = id?.toString().trim();
  if (!trimmed || trimmed === "0") return null;

  const cacheKey = getCacheKey(`asbab:${trimmed}`);
  const cached = readCache<MuslimAsbabEntry | null>(cacheKey);
  if (cached !== undefined) {
    asbabCache.set(trimmed, cached);
    return cached;
  }

  if (asbabCache.has(trimmed)) {
    return asbabCache.get(trimmed) ?? null;
  }

  const pending = asbabInFlight.get(trimmed);
  if (pending) return pending;

  const request = (async () => {
    try {
      const response = await fetchMuslimApi<MuslimAsbabEntry>(
        `/quran/asbab?id=${trimmed}`,
      );
      const entry = response.data ?? null;
      asbabCache.set(trimmed, entry);
      writeCache(cacheKey, entry, ASBAB_CACHE_TTL);
      return entry;
    } catch (err) {
      if (err instanceof MuslimApiError && err.status === 404) {
        asbabCache.set(trimmed, null);
        writeCache(cacheKey, null, ASBAB_CACHE_TTL);
        return null;
      }
      throw err;
    }
  })().finally(() => {
    asbabInFlight.delete(trimmed);
  });

  asbabInFlight.set(trimmed, request);
  return request;
};

const fetchAsbabList = async () => {
  if (asbabListMemory) return asbabListMemory;
  const cached = readCache<MuslimAsbabEntry[]>(ASBAB_LIST_CACHE_KEY);
  if (cached !== undefined) {
    asbabListMemory = cached;
    return cached;
  }
  if (asbabListInFlight) return asbabListInFlight;

  const request = (async () => {
    const response = await fetchMuslimApi<MuslimAsbabEntry[]>(`/quran/asbab`);
    const list = Array.isArray(response.data) ? response.data : [];
    asbabListMemory = list;
    asbabByAyahMemory = null;
    writeCache(ASBAB_LIST_CACHE_KEY, list, ASBAB_CACHE_TTL);
    return list;
  })().finally(() => {
    asbabListInFlight = null;
  });

  asbabListInFlight = request;
  return request;
};

const getAsbabByAyahMap = async () => {
  if (asbabByAyahMemory) return asbabByAyahMemory;
  const list = await fetchAsbabList();
  const map = new Map<string, MuslimAsbabEntry>();
  list.forEach((entry) => {
    const key = entry.ayah?.toString().trim();
    if (key) {
      map.set(key, entry);
    }
  });
  asbabByAyahMemory = map;
  return map;
};

export const fetchAsbabByAyahId = async (ayahGlobalId: string) => {
  const trimmed = ayahGlobalId?.toString().trim();
  if (!trimmed) return null;
  const map = await getAsbabByAyahMap();
  return map.get(trimmed) ?? null;
};

export const fetchAsbabMapForAyahs = async (
  ayahIds: Array<string | number | null | undefined>,
) => {
  const map = await getAsbabByAyahMap();
  const result: Record<string, MuslimAsbabEntry> = {};
  ayahIds.forEach((id) => {
    if (id === null || id === undefined) return;
    const key = id.toString().trim();
    if (!key) return;
    const entry = map.get(key);
    if (entry) {
      result[key] = entry;
    }
  });
  return result;
};

export const fetchAsbabForSurah = async (surahId: string) => {
  const cacheKey = getCacheKey(`surah:v2:${surahId}`);
  const cached = readCache<SurahAsbabEntry[]>(cacheKey);

  try {
    const response = await fetchMuslimApi<MuslimAyah[]>(
      `/quran/ayah/surah?id=${surahId}`,
    );
    const ayahs = Array.isArray(response.data) ? response.data : [];
    const asbabByAyah = await getAsbabByAyahMap();
    const entries: SurahAsbabEntry[] = [];
    const seen = new Set<string>();

    ayahs.forEach((ayah) => {
      const globalId = ayah.id?.toString().trim();
      if (!globalId) return;
      const detail = asbabByAyah.get(globalId);
      if (!detail?.text) return;
      if (seen.has(detail.id)) return;
      seen.add(detail.id);
      entries.push({
        id: detail.id,
        ayah: ayah.ayah?.toString() ?? "",
        text: detail.text,
      });
    });

    const sorted = entries.sort(
      (a, b) => Number(a.ayah || 0) - Number(b.ayah || 0),
    );
    writeCache(cacheKey, sorted, ASBAB_CACHE_TTL);
    return sorted;
  } catch (err) {
    if (cached !== undefined) return cached;
    throw err;
  }
};
