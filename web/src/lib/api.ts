export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";
const DIRECT_MYQURAN_BASE = "https://api.myquran.com/v3";
const DIRECT_DOA_BASE = "https://equran.id/api/doa";
const DOA_TTL = 60 * 60 * 1000;
const toPositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.floor(parsed);
  return normalized > 0 ? normalized : fallback;
};
const API_TIMEOUT_MS = toPositiveInt(
  import.meta.env.VITE_API_TIMEOUT_MS,
  12000,
);
const API_MAX_ATTEMPTS = toPositiveInt(
  import.meta.env.VITE_API_MAX_ATTEMPTS,
  2,
);
const MAX_DOA_KEYWORD_LENGTH = 100;

export type ApiResult<T> = {
  status: boolean;
  message?: string;
  data?: T;
  pagination?: {
    page: number;
    limit: number;
    total: number;
  };
};

type ApiErrorCode =
  | "network"
  | "timeout"
  | "aborted"
  | "http"
  | "non-json"
  | "parse";
type ApiStatus = "unknown" | "ok" | "fallback";
type ApiSource = "unknown" | "proxy" | "myquran" | "equran";

export class ApiError extends Error {
  status: number;
  code: ApiErrorCode;
  constructor(message: string, status: number, code: ApiErrorCode) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type CacheEntry<T> = {
  data: ApiResult<T>;
  expiresAt: number;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();
const listeners = new Set<() => void>();
let apiStatus: ApiStatus = "unknown";
let apiSource: ApiSource = "unknown";

const getStorageKey = (key: string) => `ibadahmu:cache:${key}`;

export const getApiStatus = () => apiStatus;
export const getApiSource = () => apiSource;

export const subscribeApiStatus = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const setApiStatus = (next: ApiStatus, source?: ApiSource) => {
  const nextSource = source ?? apiSource;
  if (apiStatus === next && apiSource === nextSource) return;
  apiStatus = next;
  apiSource = nextSource;
  listeners.forEach((listener) => listener());
};

const readCache = <T>(
  key: string,
  allowExpired = false,
): ApiResult<T> | null => {
  const now = Date.now();
  const memory = memoryCache.get(key);
  if (memory && (memory.expiresAt > now || allowExpired)) {
    return memory.data as ApiResult<T>;
  }
  if (memory && memory.expiresAt <= now) {
    memoryCache.delete(key);
  }

  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(getStorageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (parsed.expiresAt > now || allowExpired) {
      memoryCache.set(key, parsed as CacheEntry<unknown>);
      return parsed.data;
    }
    window.localStorage.removeItem(getStorageKey(key));
  } catch {
    return null;
  }

  return null;
};

const writeCache = <T>(key: string, data: ApiResult<T>, ttlSeconds: number) => {
  if (ttlSeconds <= 0) return;
  const entry: CacheEntry<T> = {
    data,
    expiresAt: Date.now() + ttlSeconds * 1000,
  };
  memoryCache.set(key, entry as CacheEntry<unknown>);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(getStorageKey(key), JSON.stringify(entry));
  } catch {
    // ignore
  }
};

const buildUrl = (path: string, baseOverride?: string) => {
  if (path.startsWith("http")) return path;
  const base = (baseOverride ?? API_BASE_URL).replace(/\/$/, "");
  const cleaned = path.startsWith("/") ? path : `/${path}`;
  return `${base}${cleaned}`;
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });

const isRetryableApiError = (error: ApiError) => {
  if (
    error.code === "network" ||
    error.code === "timeout" ||
    error.code === "non-json"
  ) {
    return true;
  }
  if (error.code === "parse") return true;
  if (error.code === "http") {
    return (
      error.status === 408 ||
      error.status === 429 ||
      (error.status >= 500 && error.status <= 599)
    );
  }
  return false;
};

const isDoaPath = (path: string) => path.startsWith("/doa/harian");
const myQuranFallbackPrefixes = ["/sholat", "/hadis", "/cal"];
const canFallbackToMyQuran = (path: string) =>
  myQuranFallbackPrefixes.some((prefix) => path.startsWith(prefix));
const resolveSourceForBase = (base: string): ApiSource => {
  if (base === "/api") return "proxy";
  if (base.includes("api.myquran.com")) return "myquran";
  if (base.includes("equran.id")) return "equran";
  return "unknown";
};

type DoaItem = {
  id: number;
  grup?: string;
  nama?: string;
  ar?: string;
  tr?: string;
  idn?: string;
  tentang?: string;
  tag?: string[];
  audio_url?: unknown;
  audio?: unknown;
  audioUrl?: unknown;
  audio_mp3?: unknown;
};

type DoaCache = {
  data: DoaItem[];
  fetchedAt: number;
};

let doaCache: DoaCache | null = null;

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const resolveAudioUrl = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim()) return value;
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const hit = resolveAudioUrl(entry);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const preferredKeys = ["01", "1", "default", "primary"];
    for (const key of preferredKeys) {
      const hit = resolveAudioUrl(record[key]);
      if (hit) return hit;
    }
    for (const entry of Object.values(record)) {
      const hit = resolveAudioUrl(entry);
      if (hit) return hit;
    }
  }
  return null;
};

const getDoaAudioUrl = (item: DoaItem) =>
  resolveAudioUrl(
    item.audio_url ?? item.audio ?? item.audioUrl ?? item.audio_mp3,
  );

const normalizeDoa = (item: DoaItem) => ({
  id: item.id,
  title: item.nama ?? "",
  name: item.nama ?? "",
  arabic: item.ar ?? "",
  translation: item.idn ?? "",
  transliteration: item.tr ?? "",
  source: item.tentang ?? "",
  category: item.grup ?? "",
  tags: item.tag ?? [],
  audio_url: getDoaAudioUrl(item),
});

const fetchDoaListDirect = async () => {
  const now = Date.now();
  if (doaCache && now - doaCache.fetchedAt < DOA_TTL) {
    return doaCache.data;
  }
  const response = await fetch(DIRECT_DOA_BASE, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new ApiError("Gagal mengambil data doa.", response.status, "http");
  }
  const payload = (await response.json()) as { data?: DoaItem[] };
  const data = Array.isArray(payload?.data) ? payload.data : [];
  doaCache = { data, fetchedAt: now };
  return data;
};

const fetchDoaDetailDirect = async (id: string) => {
  const response = await fetch(`${DIRECT_DOA_BASE}/${id}`, {
    headers: { Accept: "application/json" },
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new ApiError(
      `Gagal mengambil detail doa. (${response.status})`,
      response.status,
      "http",
    );
  }
  const payload = (await response.json()) as { data?: DoaItem };
  return payload?.data ?? null;
};

const handleDoaFallback = async <T>(
  path: string,
  init?: RequestInit,
): Promise<ApiResult<T>> => {
  const list = await fetchDoaListDirect();
  if (path === "/doa/harian") {
    const categories = new Map<
      string,
      { id: string; title: string; total: number; audio_total: number }
    >();
    list.forEach((item) => {
      const groupName = item.grup ?? "Lainnya";
      const slug = slugify(groupName) || "lainnya";
      const current = categories.get(slug) ?? {
        id: slug,
        title: groupName,
        total: 0,
        audio_total: 0,
      };
      current.total += 1;
      if (getDoaAudioUrl(item)) {
        current.audio_total += 1;
      }
      categories.set(slug, current);
    });
    const data = Array.from(categories.values()).sort((a, b) =>
      a.title.localeCompare(b.title),
    );
    return { status: true, message: "success", data: data as T };
  }

  if (path.startsWith("/doa/harian/kategori/")) {
    const slug = path.replace("/doa/harian/kategori/", "");
    const data = list
      .filter((item) => slugify(item.grup ?? "lainnya") === slug)
      .map(normalizeDoa);
    return { status: true, message: "success", data: data as T };
  }

  if (path === "/doa/harian/random") {
    if (list.length === 0) {
      throw new ApiError("Data doa kosong.", 404, "http");
    }
    const item = list[Math.floor(Math.random() * list.length)];
    return {
      status: true,
      message: "success",
      data: normalizeDoa(item) as T,
    };
  }

  if (path === "/doa/harian/cari") {
    let keyword = "";
    if (init?.body) {
      try {
        const parsed =
          typeof init.body === "string"
            ? JSON.parse(init.body)
            : (init.body as { keyword?: string });
        keyword = (parsed?.keyword ?? "").toString().trim().toLowerCase();
      } catch {
        keyword = "";
      }
    }
    if (!keyword) {
      throw new ApiError("Keyword wajib diisi.", 400, "http");
    }
    if (keyword.length > MAX_DOA_KEYWORD_LENGTH) {
      throw new ApiError(
        `Keyword maksimal ${MAX_DOA_KEYWORD_LENGTH} karakter.`,
        400,
        "http",
      );
    }
    const filtered = list.filter((item) => {
      const haystack = [item.nama, item.idn, item.grup, item.tentang, item.tr]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const tagMatch = item.tag?.some((tag) =>
        tag.toLowerCase().includes(keyword),
      );
      return haystack.includes(keyword) || Boolean(tagMatch);
    });
    const data = filtered.slice(0, 50).map(normalizeDoa);
    return { status: true, message: "success", data: data as T };
  }

  if (path.startsWith("/doa/harian/")) {
    const id = path.replace("/doa/harian/", "");
    const item = await fetchDoaDetailDirect(id);
    if (!item) {
      throw new ApiError("Doa tidak ditemukan.", 404, "http");
    }
    return {
      status: true,
      message: "success",
      data: normalizeDoa(item) as T,
    };
  }

  throw new ApiError("Endpoint doa tidak dikenal.", 404, "http");
};

const fetchJsonWithBase = async <T>(
  path: string,
  baseOverride?: string,
  init?: RequestInit,
): Promise<ApiResult<T>> => {
  for (let attempt = 1; attempt <= API_MAX_ATTEMPTS; attempt += 1) {
    const hasAbortController = typeof AbortController !== "undefined";
    const controller = hasAbortController ? new AbortController() : null;
    const externalSignal = init?.signal;
    const abortFromExternal = () => {
      if (!controller) return;
      controller.abort();
    };
    if (externalSignal && controller) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener("abort", abortFromExternal, {
          once: true,
        });
      }
    }
    const timeoutId =
      controller !== null
        ? globalThis.setTimeout(() => controller.abort(), API_TIMEOUT_MS)
        : null;

    try {
      const method = (init?.method ?? "GET").toUpperCase();
      const headers = new Headers(init?.headers ?? {});
      if (!headers.has("Accept")) {
        headers.set("Accept", "application/json");
      }
      if (
        method !== "GET" &&
        method !== "HEAD" &&
        init?.body !== undefined &&
        init?.body !== null &&
        !headers.has("Content-Type")
      ) {
        headers.set("Content-Type", "application/json");
      }

      const response = await fetch(buildUrl(path, baseOverride), {
        ...init,
        method,
        signal: controller?.signal ?? externalSignal,
        headers,
      });

      const contentType = response.headers.get("content-type") ?? "";
      const raw = await response.text();

      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try {
          const payload = JSON.parse(raw) as { message?: string };
          if (payload?.message) message = payload.message;
        } catch {
          // ignore
        }
        throw new ApiError(message, response.status, "http");
      }

      if (!contentType.includes("application/json")) {
        throw new ApiError(
          "Server API tidak mengembalikan JSON yang valid.",
          response.status,
          "non-json",
        );
      }

      try {
        return JSON.parse(raw) as ApiResult<T>;
      } catch {
        throw new ApiError(
          "Gagal membaca data dari server API.",
          response.status,
          "parse",
        );
      }
    } catch (err) {
      const isAbortError =
        typeof err === "object" &&
        err !== null &&
        "name" in err &&
        (err as { name?: unknown }).name === "AbortError";
      const isUserAbort = Boolean(init?.signal?.aborted);
      const error =
        err instanceof ApiError
          ? err
          : new ApiError(
              isAbortError
                ? isUserAbort
                  ? "Permintaan dibatalkan."
                  : `Tidak dapat terhubung ke server API. Request timeout (${API_TIMEOUT_MS}ms).`
                : `Tidak dapat terhubung ke server API. ${
                    err instanceof Error ? err.message : "Network error"
                  }`,
              0,
              isAbortError ? (isUserAbort ? "aborted" : "timeout") : "network",
            );

      if (attempt < API_MAX_ATTEMPTS && isRetryableApiError(error)) {
        await sleep(250 * attempt);
        continue;
      }
      throw error;
    } finally {
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
      if (externalSignal && controller) {
        externalSignal.removeEventListener("abort", abortFromExternal);
      }
    }
  }

  throw new ApiError("Gagal mengambil data dari server API.", 0, "network");
};

export const fetchJson = async <T>(
  path: string,
  init?: RequestInit,
): Promise<ApiResult<T>> => {
  const primaryBase = API_BASE_URL;
  try {
    const result = await fetchJsonWithBase<T>(path, primaryBase, init);
    setApiStatus("ok", resolveSourceForBase(primaryBase));
    return result;
  } catch (err) {
    if (
      primaryBase === "/api" &&
      !isDoaPath(path) &&
      canFallbackToMyQuran(path) &&
      err instanceof ApiError &&
      (err.code === "network" ||
        err.code === "timeout" ||
        err.code === "non-json" ||
        (err.code === "http" && err.status === 404))
    ) {
      const result = await fetchJsonWithBase<T>(
        path,
        DIRECT_MYQURAN_BASE,
        init,
      );
      setApiStatus("fallback", "myquran");
      return result;
    }
    if (
      isDoaPath(path) &&
      err instanceof ApiError &&
      (err.code === "network" ||
        err.code === "timeout" ||
        err.code === "non-json" ||
        (err.code === "http" && err.status === 404))
    ) {
      const result = await handleDoaFallback<T>(path, init);
      const status = primaryBase === "/api" ? "fallback" : "ok";
      setApiStatus(status, "equran");
      return result;
    }
    if (
      primaryBase === "/api" &&
      !isDoaPath(path) &&
      !canFallbackToMyQuran(path) &&
      err instanceof ApiError &&
      (err.code === "network" ||
        err.code === "timeout" ||
        err.code === "non-json" ||
        (err.code === "http" && err.status === 404))
    ) {
      throw new ApiError(
        "Fitur ini membutuhkan koneksi ke Proxy API. Silakan coba lagi nanti.",
        err.status,
        err.code,
      );
    }
    throw err;
  }
};

export const postJson = async <T>(
  path: string,
  body: unknown,
  init?: RequestInit,
) => {
  return fetchJson<T>(path, {
    method: "POST",
    body: JSON.stringify(body),
    ...init,
  });
};

export const fetchJsonCached = async <T>(
  path: string,
  options?: { ttl?: number; key?: string; staleIfError?: boolean },
): Promise<ApiResult<T>> => {
  const key = options?.key ?? path;
  const ttl = options?.ttl ?? 3600;
  const cached = readCache<T>(key);
  if (cached) return cached;

  try {
    const result = await fetchJson<T>(path);
    writeCache(key, result, ttl);
    return result;
  } catch (err) {
    if (options?.staleIfError) {
      const stale = readCache<T>(key, true);
      if (stale) return stale;
    }
    throw err;
  }
};
