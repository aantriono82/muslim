export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

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

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type CacheEntry<T> = {
  data: ApiResult<T>;
  expiresAt: number;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();

const getStorageKey = (key: string) => `ibadahmu:cache:${key}`;

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

const buildUrl = (path: string) => {
  if (path.startsWith("http")) return path;
  const base = API_BASE_URL.replace(/\/$/, "");
  const cleaned = path.startsWith("/") ? path : `/${path}`;
  return `${base}${cleaned}`;
};

export const fetchJson = async <T>(
  path: string,
  init?: RequestInit,
): Promise<ApiResult<T>> => {
  let response: Response;
  try {
    response = await fetch(buildUrl(path), {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Network error";
    throw new ApiError(`Tidak dapat terhubung ke server API. ${detail}`, 0);
  }

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const payload = (await response.json()) as { message?: string };
      if (payload?.message) message = payload.message;
    } catch {
      // ignore
    }
    throw new ApiError(message, response.status);
  }

  return (await response.json()) as ApiResult<T>;
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
