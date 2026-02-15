import { Hono } from "hono";
import type { Context } from "hono";
import apimuslimSpec from "../apimuslim.json";

export const app = new Hono();

const toPositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.floor(parsed);
  return normalized > 0 ? normalized : fallback;
};

const TARGET_ORIGIN = process.env.TARGET_ORIGIN ?? "https://api.myquran.com";
const DOA_ORIGIN = process.env.DOA_ORIGIN ?? "https://equran.id";
const MUSLIM_ORIGIN =
  process.env.MUSLIM_ORIGIN ?? "https://muslim-api-three.vercel.app";
const ALQURAN_ORIGIN =
  process.env.ALQURAN_ORIGIN ?? "https://api.alquran.cloud";
const ALQURAN_BASE = process.env.ALQURAN_BASE ?? "/v1";
const ALQURAN_AR_EDITION = process.env.ALQURAN_AR_EDITION ?? "quran-uthmani";
const ALQURAN_ID_EDITION = process.env.ALQURAN_ID_EDITION ?? "id.indonesian";
const QURANCOM_ORIGIN =
  process.env.QURANCOM_ORIGIN ?? "https://api.quran.com/api/v4";
const QURANCOM_TRANSLATION_ID = toPositiveInt(
  process.env.QURANCOM_TRANSLATION_ID,
  33,
);
const QURANCOM_AUDIO_RECITER = toPositiveInt(
  process.env.QURANCOM_AUDIO_RECITER,
  7,
);
const QURAN_AUDIO_ORIGIN =
  process.env.QURAN_AUDIO_ORIGIN ?? "https://audio.qurancdn.com";
const AUDIO_ALLOWED_HOSTS = new Set(
  (
    process.env.AUDIO_ALLOWED_HOSTS ??
    "audio.qurancdn.com,cdn.myquran.com,api.myquran.com,archive.org"
  )
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);
const QURANCOM_PER_PAGE = toPositiveInt(process.env.QURANCOM_PER_PAGE, 200);
const MYQURAN_LIMIT = toPositiveInt(process.env.MYQURAN_LIMIT, 100);
const MAX_PROXY_PAGES = toPositiveInt(process.env.MAX_PROXY_PAGES, 120);
const DOA_BASE = process.env.DOA_BASE ?? "/api/doa";
const DOA_TTL = toPositiveInt(process.env.DOA_TTL, 3600);
const MAX_DOA_KEYWORD_LENGTH = toPositiveInt(
  process.env.MAX_DOA_KEYWORD_LENGTH,
  100,
);
const UPSTREAM_TIMEOUT_MS = toPositiveInt(
  process.env.UPSTREAM_TIMEOUT_MS,
  15000,
);
const READ_ONLY_MODE = /^(1|true|yes)$/i.test(
  (process.env.READ_ONLY_MODE ?? "").trim(),
);
const MAX_BODY_BYTES = toPositiveInt(process.env.MAX_BODY_BYTES, 256 * 1024);
const WRITE_RATE_LIMIT_WINDOW_MS =
  toPositiveInt(process.env.WRITE_RATE_LIMIT_WINDOW_SECONDS, 60) * 1000;
const WRITE_RATE_LIMIT_MAX = toPositiveInt(
  process.env.WRITE_RATE_LIMIT_MAX,
  180,
);
const normalizePrefix = (value: string) => {
  const withSlash = value.startsWith("/") ? value : `/${value}`;
  const trimmed = withSlash.replace(/\/+$/, "");
  return trimmed || "/";
};
const PRIMARY_PREFIX = normalizePrefix(process.env.PROXY_PREFIX ?? "/api");
const ALT_PREFIX = normalizePrefix(
  process.env.ALT_PREFIX ?? (PRIMARY_PREFIX === "/api" ? "/v3" : "/api"),
);
const UPSTREAM_PREFIX = normalizePrefix(process.env.UPSTREAM_PREFIX ?? "/v3");
const MUSLIM_UPSTREAM_PREFIX = normalizePrefix(
  process.env.MUSLIM_PREFIX ?? "/v1",
);
const PROXY_PREFIXES = Array.from(new Set([PRIMARY_PREFIX, ALT_PREFIX]));
const MUSLIM_PREFIXES = PROXY_PREFIXES.map((prefix) => `${prefix}/muslim`);
const PORT = toPositiveInt(process.env.PORT, 3002);
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL;
const METHODS_WITH_BODY = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type RateBucket = {
  count: number;
  resetAt: number;
};

const writeRateBuckets = new Map<string, RateBucket>();

const fetchWithTimeout = async (
  input: RequestInfo | URL,
  init?: RequestInit,
) => {
  const useTimeout = !init?.signal && typeof AbortController !== "undefined";
  const controller = useTimeout ? new AbortController() : null;
  const timeoutId =
    controller !== null
      ? globalThis.setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
      : null;

  try {
    return await fetch(input, {
      ...init,
      signal: controller?.signal ?? init?.signal,
    });
  } finally {
    if (timeoutId !== null) {
      globalThis.clearTimeout(timeoutId);
    }
  }
};

const hasAbortErrorName = (err: unknown) =>
  typeof err === "object" &&
  err !== null &&
  "name" in err &&
  (err as { name?: unknown }).name === "AbortError";

const toUpstreamFailure = (err: unknown) => {
  if (hasAbortErrorName(err)) {
    return {
      status: 504 as const,
      message: `Timeout upstream (${UPSTREAM_TIMEOUT_MS}ms).`,
    };
  }
  return {
    status: 502 as const,
    message:
      err instanceof Error && err.message
        ? err.message
        : "Gagal terhubung ke upstream.",
  };
};

const respondUpstreamError = (
  c: Context,
  err: unknown,
  fallbackMessage: string,
) => {
  const failure = toUpstreamFailure(err);
  if (failure.status === 504) {
    return c.json({ status: false, message: failure.message }, 504);
  }
  const message =
    err instanceof Error && err.message ? err.message : fallbackMessage;
  return c.json({ status: false, message }, failure.status);
};

const PARTITION_MAX: Record<string, number> = {
  juz: 30,
  page: 604,
  manzil: 7,
  ruku: 556,
  hizb: 60,
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

type AlQuranAyah = {
  number: number;
  text: string;
  numberInSurah: number;
  surah?: {
    number: number;
    name?: string;
    englishName?: string;
    englishNameTranslation?: string;
    revelationType?: string;
    numberOfAyahs?: number;
  };
  juz?: number;
  manzil?: number;
  page?: number;
  ruku?: number;
  hizbQuarter?: number;
};

type AlQuranResponse = {
  data?: {
    ayahs?: AlQuranAyah[];
  };
};

type QuranComVerse = {
  id: number;
  verse_number: number;
  verse_key: string;
  text_uthmani?: string;
  juz_number?: number;
  page_number?: number;
  manzil_number?: number;
  ruku_number?: number;
  hizb_number?: number;
  rub_el_hizb_number?: number;
  translations?: { text?: string }[];
};

type QuranComAudioVerse = {
  verse_key?: string;
  verse_number?: number;
  audio?: { url?: string | null };
};

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

const buildAlQuranUrl = (path: string) => {
  const base = ALQURAN_BASE.startsWith("/") ? ALQURAN_BASE : `/${ALQURAN_BASE}`;
  const normalizedBase = base.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${ALQURAN_ORIGIN}${normalizedBase}${normalizedPath}`;
};

const buildQuranComUrl = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${QURANCOM_ORIGIN}${normalizedPath}`;
};

const fetchAlQuranAyahs = async (path: string) => {
  const response = await fetchWithTimeout(buildAlQuranUrl(path), {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Gagal mengambil data AlQuran.cloud (${response.status}).`);
  }
  const payload = (await response.json()) as AlQuranResponse;
  return Array.isArray(payload?.data?.ayahs) ? payload.data.ayahs : [];
};

const getAyahKey = (item: AlQuranAyah) =>
  `${item.surah?.number ?? 0}:${item.numberInSurah ?? 0}`;

const toAyahItem = (
  arab: AlQuranAyah | null,
  translation: AlQuranAyah | null,
) => {
  const source = translation ?? arab;
  return {
    id: source?.number ?? 0,
    surah_number: source?.surah?.number ?? 0,
    ayah_number: source?.numberInSurah ?? 0,
    arab: arab?.text ?? "",
    translation: translation?.text ?? "",
    audio_url: null,
    image_url: null,
    meta: {
      juz: translation?.juz ?? arab?.juz ?? null,
      page: translation?.page ?? arab?.page ?? null,
      manzil: translation?.manzil ?? arab?.manzil ?? null,
      ruku: translation?.ruku ?? arab?.ruku ?? null,
      hizb_quarter: translation?.hizbQuarter ?? arab?.hizbQuarter ?? null,
    },
  };
};

const mergeAyahs = (
  arabicAyahs: AlQuranAyah[],
  translationAyahs: AlQuranAyah[],
) => {
  const arabMap = new Map<string, AlQuranAyah>();
  const translationMap = new Map<string, AlQuranAyah>();

  arabicAyahs.forEach((item) => arabMap.set(getAyahKey(item), item));
  translationAyahs.forEach((item) =>
    translationMap.set(getAyahKey(item), item),
  );

  const keys = new Set([
    ...Array.from(arabMap.keys()),
    ...Array.from(translationMap.keys()),
  ]);

  return Array.from(keys)
    .map((key) =>
      toAyahItem(arabMap.get(key) ?? null, translationMap.get(key) ?? null),
    )
    .sort((a, b) => {
      if (a.surah_number !== b.surah_number) {
        return a.surah_number - b.surah_number;
      }
      return a.ayah_number - b.ayah_number;
    });
};

const fetchAlQuranPartition = async (type: string, number: number) => {
  if (type === "hizb") {
    const start = (number - 1) * 4 + 1;
    const quarters = [start, start + 1, start + 2, start + 3];
    const arabicParts = await Promise.all(
      quarters.map((value) =>
        fetchAlQuranAyahs(`/hizbQuarter/${value}/${ALQURAN_AR_EDITION}`),
      ),
    );
    const translationParts = await Promise.all(
      quarters.map((value) =>
        fetchAlQuranAyahs(`/hizbQuarter/${value}/${ALQURAN_ID_EDITION}`),
      ),
    );
    return mergeAyahs(arabicParts.flat(), translationParts.flat());
  }

  const arabicAyahs = await fetchAlQuranAyahs(
    `/${type}/${number}/${ALQURAN_AR_EDITION}`,
  );
  const translationAyahs = await fetchAlQuranAyahs(
    `/${type}/${number}/${ALQURAN_ID_EDITION}`,
  );
  return mergeAyahs(arabicAyahs, translationAyahs);
};

const buildMyQuranUrl = (path: string) => {
  const normalizedUpstream = UPSTREAM_PREFIX === "/" ? "" : UPSTREAM_PREFIX;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${TARGET_ORIGIN}${normalizedUpstream}${normalizedPath}`;
};

const fetchMyQuranPartition = async (type: string, number: number) => {
  const data: unknown[] = [];
  let page = 1;

  while (true) {
    if (page > MAX_PROXY_PAGES) {
      throw new Error("Batas halaman upstream terlampaui.");
    }
    const url = new URL(buildMyQuranUrl(`/quran/${type}/${number}`));
    url.searchParams.set("page", String(page));
    url.searchParams.set("limit", String(MYQURAN_LIMIT));

    const response = await fetchWithTimeout(url.toString(), {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Gagal mengambil data MyQuran (${response.status}).`);
    }
    const payload = (await response.json()) as {
      data?: unknown[];
      pagination?: { total?: number; page?: number; limit?: number };
    };
    const chunk = Array.isArray(payload?.data) ? payload.data : [];
    data.push(...chunk);

    const pagination = payload?.pagination ?? null;
    const total = pagination?.total ?? null;
    const limit = pagination?.limit ?? MYQURAN_LIMIT;
    const currentPage = pagination?.page ?? page;
    if (typeof total === "number") {
      const totalPages = Math.ceil(total / limit);
      if (currentPage >= totalPages) break;
    } else if (chunk.length < limit) {
      break;
    }
    page += 1;
  }

  return data;
};

const stripHtml = (value: string) => value.replace(/<[^>]*>/g, "");

const parseVerseKey = (key: string) => {
  const [surahRaw, ayahRaw] = key.split(":");
  const surah = Number(surahRaw);
  const ayah = Number(ayahRaw);
  if (!Number.isFinite(surah) || !Number.isFinite(ayah)) return null;
  return { surah, ayah };
};

const toAyahItemFromQuranCom = (verse: QuranComVerse) => {
  const parsed = parseVerseKey(verse.verse_key);
  return {
    id: verse.id,
    surah_number: parsed?.surah ?? 0,
    ayah_number: verse.verse_number ?? parsed?.ayah ?? 0,
    arab: verse.text_uthmani ?? "",
    translation: stripHtml(verse.translations?.[0]?.text ?? ""),
    audio_url: null,
    image_url: null,
    meta: {
      juz: verse.juz_number ?? null,
      page: verse.page_number ?? null,
      manzil: verse.manzil_number ?? null,
      ruku: verse.ruku_number ?? null,
      hizb_quarter: verse.rub_el_hizb_number ?? null,
    },
  };
};

const fetchQuranComPartition = async (type: string, number: number) => {
  const verses: QuranComVerse[] = [];
  let page = 1;

  while (true) {
    if (page > MAX_PROXY_PAGES) {
      throw new Error("Batas halaman upstream terlampaui.");
    }
    const url = new URL(buildQuranComUrl(`/verses/by_${type}/${number}`));
    url.searchParams.set("translations", String(QURANCOM_TRANSLATION_ID));
    url.searchParams.set("fields", "text_uthmani,verse_key");
    url.searchParams.set("per_page", String(QURANCOM_PER_PAGE));
    url.searchParams.set("page", String(page));

    const response = await fetchWithTimeout(url.toString(), {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Gagal mengambil data Quran.com (${response.status}).`);
    }
    const payload = (await response.json()) as {
      verses?: QuranComVerse[];
      pagination?: {
        next_page?: number | null;
        current_page?: number;
        total_pages?: number;
      };
    };
    const chunk = Array.isArray(payload?.verses) ? payload.verses : [];
    verses.push(...chunk);

    const pagination = payload?.pagination ?? null;
    if (pagination?.next_page) {
      page = pagination.next_page;
      continue;
    }
    if (pagination?.current_page && pagination?.total_pages) {
      if (pagination.current_page >= pagination.total_pages) break;
      page += 1;
      continue;
    }
    if (chunk.length < QURANCOM_PER_PAGE) break;
    page += 1;
  }

  return verses.map(toAyahItemFromQuranCom).sort((a, b) => {
    if (a.surah_number !== b.surah_number) {
      return a.surah_number - b.surah_number;
    }
    return a.ayah_number - b.ayah_number;
  });
};

const fetchQuranComJuzAudio = async (juz: number) => {
  const items: {
    surah_number: number;
    ayah_number: number;
    audio_path: string;
  }[] = [];
  let page = 1;

  while (true) {
    if (page > MAX_PROXY_PAGES) {
      throw new Error("Batas halaman upstream audio terlampaui.");
    }
    const url = new URL(buildQuranComUrl(`/verses/by_juz/${juz}`));
    url.searchParams.set("audio", String(QURANCOM_AUDIO_RECITER));
    url.searchParams.set("per_page", String(QURANCOM_PER_PAGE));
    url.searchParams.set("page", String(page));

    const response = await fetchWithTimeout(url.toString(), {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
    });
    if (!response.ok) {
      throw new Error(`Gagal mengambil audio Quran.com (${response.status}).`);
    }
    const payload = (await response.json()) as {
      verses?: QuranComAudioVerse[];
      pagination?: { total_pages?: number };
    };
    const verses = Array.isArray(payload?.verses) ? payload.verses : [];
    verses.forEach((verse) => {
      const key = verse.verse_key ?? "";
      const [surahRaw, ayahRaw] = key.split(":");
      const surah_number = Number(surahRaw);
      const ayah_number =
        Number(ayahRaw) ||
        (typeof verse.verse_number === "number" ? verse.verse_number : 0);
      if (!Number.isFinite(surah_number) || !Number.isFinite(ayah_number)) {
        return;
      }
      const audio_path = verse.audio?.url ?? "";
      if (!audio_path) return;
      items.push({ surah_number, ayah_number, audio_path });
    });

    const totalPages = payload?.pagination?.total_pages ?? page;
    if (page >= totalPages) break;
    page += 1;
  }

  return items;
};

const resolveProxyBase = (prefix: string) =>
  prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;

const buildProxyAudioUrl = (prefix: string, rawUrl: string) => {
  if (!rawUrl) return rawUrl;
  const normalizedPrefix = resolveProxyBase(prefix);
  let targetUrl = rawUrl;
  try {
    targetUrl = new URL(rawUrl).toString();
  } catch {
    const path = rawUrl.replace(/^\/+/, "");
    targetUrl = `${QURAN_AUDIO_ORIGIN}/${path}`;
  }
  return `${normalizedPrefix}/audio?url=${encodeURIComponent(targetUrl)}`;
};

const fetchDoaList = async (): Promise<DoaItem[]> => {
  const now = Date.now();
  if (doaCache && now - doaCache.fetchedAt < DOA_TTL * 1000) {
    return doaCache.data;
  }

  const response = await fetchWithTimeout(`${DOA_ORIGIN}${DOA_BASE}`);
  if (!response.ok) {
    throw new Error(`Gagal mengambil data doa (${response.status}).`);
  }

  const payload = (await response.json()) as { data?: DoaItem[] };
  const data = Array.isArray(payload?.data) ? payload.data : [];
  doaCache = { data, fetchedAt: now };
  return data;
};

const fetchDoaDetail = async (id: string): Promise<DoaItem | null> => {
  const response = await fetchWithTimeout(`${DOA_ORIGIN}${DOA_BASE}/${id}`);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Gagal mengambil detail doa (${response.status}).`);
  }
  const payload = (await response.json()) as { data?: DoaItem };
  return payload?.data ?? null;
};

const applySecurityHeaders = (c: Context) => {
  c.header("x-content-type-options", "nosniff");
  c.header("x-frame-options", "DENY");
  c.header("referrer-policy", "no-referrer");
  c.header("permissions-policy", "geolocation=(), microphone=(), camera=()");
  c.header("x-permitted-cross-domain-policies", "none");
};

const getClientIp = (c: Context) => {
  const forwardedFor = c.req.header("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = c.req.header("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
};

app.use("*", async (c, next) => {
  applySecurityHeaders(c);
  c.header("access-control-allow-origin", "*");
  c.header("access-control-allow-headers", "Content-Type, Authorization");
  c.header(
    "access-control-allow-methods",
    "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
  );
  if (c.req.method === "OPTIONS") {
    return c.body(null, 204);
  }
  await next();
});

app.use("*", async (c, next) => {
  if (!METHODS_WITH_BODY.has(c.req.method)) {
    await next();
    return;
  }

  const contentLengthHeader = c.req.header("content-length");
  if (!contentLengthHeader) {
    await next();
    return;
  }

  const contentLength = Number.parseInt(contentLengthHeader, 10);
  if (!Number.isFinite(contentLength) || contentLength < 0) {
    return c.json(
      { status: false, message: "Content-Length tidak valid." },
      400,
    );
  }
  if (contentLength > MAX_BODY_BYTES) {
    return c.json(
      {
        status: false,
        message: `Body request terlalu besar. Maksimal ${MAX_BODY_BYTES} bytes.`,
      },
      413,
    );
  }

  await next();
});

app.use("*", async (c, next) => {
  if (!METHODS_WITH_BODY.has(c.req.method)) {
    await next();
    return;
  }

  if (READ_ONLY_MODE) {
    return c.json(
      {
        status: false,
        message: "Proxy sedang mode read-only. Endpoint tulis dinonaktifkan.",
      },
      503,
    );
  }

  const now = Date.now();
  const key = `write:${getClientIp(c)}`;
  const bucket = writeRateBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    writeRateBuckets.set(key, {
      count: 1,
      resetAt: now + WRITE_RATE_LIMIT_WINDOW_MS,
    });
    await next();
    return;
  }

  if (bucket.count >= WRITE_RATE_LIMIT_MAX) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    c.header("retry-after", String(retryAfter));
    return c.json(
      {
        status: false,
        message: "Terlalu banyak request tulis. Coba lagi nanti.",
      },
      429,
    );
  }

  bucket.count += 1;

  if (writeRateBuckets.size > 4096) {
    for (const [bucketKey, entry] of writeRateBuckets) {
      if (entry.resetAt <= now) {
        writeRateBuckets.delete(bucketKey);
      }
    }
  }

  await next();
});

const buildOpenApi = () => {
  if (!PUBLIC_BASE_URL) return apimuslimSpec;
  const base = PUBLIC_BASE_URL.replace(/\/$/, "");
  const url = base.endsWith(PRIMARY_PREFIX) ? base : `${base}${PRIMARY_PREFIX}`;
  return {
    ...apimuslimSpec,
    servers: [
      {
        url,
        description: "Local proxy",
      },
    ],
  };
};

app.onError((err, c) => {
  console.error(err);
  applySecurityHeaders(c);
  return c.json({ status: false, message: "Terjadi kesalahan server." }, 500);
});

app.get("/", (c) =>
  c.json({
    status: true,
    message: "Proxy API Muslim berjalan.",
    readOnly: READ_ONLY_MODE,
    proxyPrefix: PRIMARY_PREFIX,
    proxyPrefixes: PROXY_PREFIXES,
    upstream: `${TARGET_ORIGIN}${UPSTREAM_PREFIX}`,
  }),
);

app.get("/openapi.json", (c) => c.json(buildOpenApi()));

app.get("/docs", (c) => {
  const html = `<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>API Muslim Docs</title>
    <link
      rel="stylesheet"
      href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"
    />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: '/openapi.json',
        dom_id: '#swagger-ui'
      });
    </script>
  </body>
</html>`;

  return c.html(html);
});

const registerDoaRoutes = (prefix: string) => {
  app.get(`${prefix}/doa/harian`, async (c) => {
    try {
      const list = await fetchDoaList();
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

      return c.json({ status: true, message: "success", data });
    } catch (err) {
      return respondUpstreamError(c, err, "Gagal mengambil data doa.");
    }
  });

  app.get(`${prefix}/doa/harian/kategori/:id`, async (c) => {
    const slug = c.req.param("id").trim();
    if (!slug || slug.length > 80) {
      return c.json(
        { status: false, message: "ID kategori tidak valid." },
        400,
      );
    }
    try {
      const list = await fetchDoaList();
      const data = list
        .filter((item) => slugify(item.grup ?? "lainnya") === slug)
        .map(normalizeDoa);
      return c.json({ status: true, message: "success", data });
    } catch (err) {
      return respondUpstreamError(c, err, "Gagal mengambil kategori doa.");
    }
  });

  app.post(`${prefix}/doa/harian/cari`, async (c) => {
    let body: { keyword?: string } = {};
    try {
      body = await c.req.json();
    } catch {
      return c.json({ status: false, message: "Body JSON tidak valid." }, 400);
    }

    const keyword = (body.keyword ?? "").toString().trim().toLowerCase();
    if (!keyword) {
      return c.json({ status: false, message: "Keyword wajib diisi." }, 400);
    }
    if (keyword.length > MAX_DOA_KEYWORD_LENGTH) {
      return c.json(
        {
          status: false,
          message: `Keyword maksimal ${MAX_DOA_KEYWORD_LENGTH} karakter.`,
        },
        400,
      );
    }

    try {
      const list = await fetchDoaList();
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
      return c.json({ status: true, message: "success", data });
    } catch (err) {
      return respondUpstreamError(c, err, "Gagal mencari doa.");
    }
  });

  app.get(`${prefix}/doa/harian/random`, async (c) => {
    try {
      const list = await fetchDoaList();
      if (list.length === 0) {
        return c.json({ status: false, message: "Data doa kosong." }, 404);
      }
      const item = list[Math.floor(Math.random() * list.length)];
      return c.json({
        status: true,
        message: "success",
        data: normalizeDoa(item),
      });
    } catch (err) {
      return respondUpstreamError(c, err, "Gagal mengambil doa acak.");
    }
  });

  app.get(`${prefix}/doa/harian/:id`, async (c) => {
    const id = c.req.param("id").trim();
    if (!/^\d+$/.test(id)) {
      return c.json({ status: false, message: "ID doa tidak valid." }, 400);
    }
    try {
      const item = await fetchDoaDetail(id);
      if (!item) {
        return c.json({ status: false, message: "Doa tidak ditemukan." }, 404);
      }
      return c.json({
        status: true,
        message: "success",
        data: normalizeDoa(item),
      });
    } catch (err) {
      return respondUpstreamError(c, err, "Gagal mengambil detail doa.");
    }
  });
};

PROXY_PREFIXES.forEach((prefix) => registerDoaRoutes(prefix));

const registerQuranPartitionRoutes = (prefix: string) => {
  const types = ["juz", "page", "manzil", "ruku", "hizb"];
  types.forEach((type) => {
    app.get(`${prefix}/quran/${type}/:number`, async (c) => {
      const number = Number(c.req.param("number"));
      const rawSource = (c.req.query("source") ?? "alquran").toLowerCase();
      const source = rawSource === "alqurancloud" ? "alquran" : rawSource;

      if (!Number.isFinite(number) || number <= 0) {
        return c.json({ status: false, message: "Nomor tidak valid." }, 400);
      }
      const maxAllowed = PARTITION_MAX[type];
      if (Number.isFinite(maxAllowed) && number > maxAllowed) {
        return c.json(
          {
            status: false,
            message: `Nomor ${type} harus antara 1-${maxAllowed}.`,
          },
          400,
        );
      }
      if (
        source !== "alquran" &&
        source !== "myquran" &&
        source !== "qurancom"
      ) {
        return c.json({ status: false, message: "Sumber tidak valid." }, 400);
      }

      try {
        const data =
          source === "myquran"
            ? await fetchMyQuranPartition(type, number)
            : source === "qurancom"
              ? await fetchQuranComPartition(type, number)
              : await fetchAlQuranPartition(type, number);
        return c.json({ status: true, message: "success", data });
      } catch (err) {
        console.error(err);
        return respondUpstreamError(c, err, "Gagal mengambil data sumber.");
      }
    });
  });
};

PROXY_PREFIXES.forEach((prefix) => registerQuranPartitionRoutes(prefix));

const registerQuranAudioRoutes = (prefix: string) => {
  app.get(`${prefix}/audio`, async (c) => {
    const rawUrl = c.req.query("url");
    if (!rawUrl) {
      return c.json({ status: false, message: "URL audio tidak valid." }, 400);
    }
    let target: URL;
    try {
      target = new URL(rawUrl);
    } catch {
      return c.json({ status: false, message: "URL audio tidak valid." }, 400);
    }
    if (target.protocol !== "https:" && target.protocol !== "http:") {
      return c.json(
        { status: false, message: "Protocol audio tidak didukung." },
        400,
      );
    }
    if (target.username || target.password) {
      return c.json(
        {
          status: false,
          message: "URL audio tidak boleh mengandung kredensial.",
        },
        400,
      );
    }
    if (!AUDIO_ALLOWED_HOSTS.has(target.hostname.toLowerCase())) {
      return c.json(
        { status: false, message: "Host audio tidak diizinkan." },
        403,
      );
    }

    let response: Response;
    try {
      response = await fetchWithTimeout(target.toString(), {
        headers: { Accept: "*/*", "User-Agent": "Mozilla/5.0" },
      });
    } catch (err) {
      const failure = toUpstreamFailure(err);
      return c.json(
        { status: false, message: failure.message },
        failure.status,
      );
    }
    const headers = new Headers(response.headers);
    headers.delete("content-encoding");
    headers.delete("transfer-encoding");
    headers.delete("content-length");
    headers.set("access-control-allow-origin", "*");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  });

  app.get(`${prefix}/quran/juz/:number/audio`, async (c) => {
    const number = Number(c.req.param("number"));
    if (!Number.isFinite(number) || number <= 0) {
      return c.json({ status: false, message: "Nomor tidak valid." }, 400);
    }
    const maxJuz = PARTITION_MAX.juz;
    if (number > maxJuz) {
      return c.json(
        {
          status: false,
          message: `Nomor juz harus antara 1-${maxJuz}.`,
        },
        400,
      );
    }
    try {
      const items = await fetchQuranComJuzAudio(number);
      const data = items.map((item) => {
        return {
          surah_number: item.surah_number,
          ayah_number: item.ayah_number,
          audio_url: buildProxyAudioUrl(prefix, item.audio_path),
        };
      });
      return c.json({ status: true, message: "success", data });
    } catch (err) {
      console.error(err);
      return respondUpstreamError(c, err, "Gagal mengambil audio juz.");
    }
  });

  app.get(`${prefix}/quran/audio/*`, async (c) => {
    const audioPath = c.req.param("*");
    if (!audioPath) {
      return c.json({ status: false, message: "Path audio tidak valid." }, 400);
    }
    const targetUrl = `${QURAN_AUDIO_ORIGIN}/${audioPath.replace(/^\/+/, "")}`;
    let response: Response;
    try {
      response = await fetchWithTimeout(targetUrl, {
        headers: { Accept: "*/*", "User-Agent": "Mozilla/5.0" },
      });
    } catch (err) {
      const failure = toUpstreamFailure(err);
      return c.json(
        { status: false, message: failure.message },
        failure.status,
      );
    }
    const headers = new Headers(response.headers);
    headers.delete("content-encoding");
    headers.delete("transfer-encoding");
    headers.delete("content-length");
    headers.set("access-control-allow-origin", "*");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  });
};

PROXY_PREFIXES.forEach((prefix) => registerQuranAudioRoutes(prefix));

const createProxyHandler =
  (prefix: string, origin: string, upstreamPrefix: string) =>
  async (c: Context) => {
    const url = new URL(c.req.raw.url);
    const incomingPath = url.pathname;
    const trimmedPath = incomingPath.startsWith(prefix)
      ? incomingPath.slice(prefix.length)
      : incomingPath;
    const normalizedUpstream = upstreamPrefix === "/" ? "" : upstreamPrefix;
    const targetPath = `${normalizedUpstream}${trimmedPath}`;
    const targetUrl = new URL(targetPath + url.search, origin);

    const headers = new Headers(c.req.raw.headers);
    headers.delete("host");
    headers.delete("content-length");
    headers.delete("connection");
    headers.delete("keep-alive");
    headers.delete("proxy-authenticate");
    headers.delete("proxy-authorization");
    headers.delete("te");
    headers.delete("trailer");
    headers.delete("upgrade");
    if (!headers.has("user-agent")) {
      headers.set("user-agent", "Mozilla/5.0 (MuslimKit)");
    }
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }

    const method = c.req.method;
    const body =
      method === "GET" || method === "HEAD" ? undefined : c.req.raw.body;

    let upstreamResponse: Response;
    try {
      upstreamResponse = await fetchWithTimeout(targetUrl.toString(), {
        method,
        headers,
        body,
        redirect: "manual",
      });
    } catch (err) {
      const failure = toUpstreamFailure(err);
      return c.json(
        { status: false, message: failure.message },
        failure.status,
      );
    }

    const responseHeaders = new Headers(upstreamResponse.headers);
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("content-length");
    responseHeaders.delete("transfer-encoding");
    responseHeaders.set("x-proxy-target", origin);
    responseHeaders.set("access-control-allow-origin", "*");

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  };

MUSLIM_PREFIXES.forEach((prefix) => {
  const handler = createProxyHandler(
    prefix,
    MUSLIM_ORIGIN,
    MUSLIM_UPSTREAM_PREFIX,
  );
  app.all(`${prefix}`, handler);
  app.all(`${prefix}/*`, handler);
});

PROXY_PREFIXES.forEach((prefix) => {
  const handler = createProxyHandler(prefix, TARGET_ORIGIN, UPSTREAM_PREFIX);
  app.all(`${prefix}`, handler);
  app.all(`${prefix}/*`, handler);
});

if (import.meta.main) {
  console.log(`Proxy berjalan di http://localhost:${PORT}`);
  console.log(`Prefix aktif: ${PROXY_PREFIXES.join(", ")}`);
  console.log(`Docs: http://localhost:${PORT}/docs`);

  Bun.serve({
    port: PORT,
    fetch: app.fetch,
  });
}

export default app;
