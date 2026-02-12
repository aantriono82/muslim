import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const APP_API_BASE = process.env.APP_API_BASE ?? "http://127.0.0.1:5173/api";
const QF_API_BASE = process.env.QF_API_BASE ?? "https://api.quran.com/api/v4";
const REFERENCE = (process.env.REFERENCE ?? "qurancom").toLowerCase();
const ALQURAN_ORIGIN =
  process.env.ALQURAN_ORIGIN ?? "https://api.alquran.cloud";
const ALQURAN_BASE = process.env.ALQURAN_BASE ?? "/v1";
const ALQURAN_AR_EDITION = process.env.ALQURAN_AR_EDITION ?? "quran-uthmani";
const LOCAL_QF_PATH =
  process.env.LOCAL_QF_PATH ??
  path.join(__dirname, "data", "qurancom-verse-meta.json");
const USE_LOCAL = (process.env.USE_LOCAL ?? "auto").toLowerCase();
const SAMPLE_COUNT = Number.parseInt(process.env.SAMPLES ?? "3", 10);
const SEED = Number.parseInt(process.env.SEED ?? "20260209", 10);
const TIMEOUT_MS = Number.parseInt(process.env.TIMEOUT_MS ?? "12000", 10);
const FULL = (process.env.FULL ?? "0") === "1";
const RATE_LIMIT_MS = Number.parseInt(process.env.RATE_LIMIT_MS ?? "200", 10);
const RETRY_LIMIT = Number.parseInt(process.env.RETRY_LIMIT ?? "3", 10);
const RETRY_BACKOFF_MS = Number.parseInt(
  process.env.RETRY_BACKOFF_MS ?? "400",
  10,
);
const APP_PAGE_LIMIT = Number.parseInt(process.env.APP_PAGE_LIMIT ?? "200", 10);

const rangesBySource = {
  qurancom: {
    juz: 30,
    page: 604,
    manzil: 7,
    ruku: 558,
    hizb: 60,
  },
  alqurancloud: {
    juz: 30,
    page: 604,
    manzil: 7,
    ruku: 556,
    hizb: 60,
  },
};

const ranges = rangesBySource[REFERENCE] ?? rangesBySource.qurancom;

const types = (process.env.TYPES ?? "juz,page,manzil,ruku,hizb")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

let localIndexPromise = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const lcg = (seed) => {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => (state = (state * 16807) % 2147483647) / 2147483647;
};

const pickSamples = (max, count, seed) => {
  const rand = lcg(seed);
  const chosen = new Set();
  while (chosen.size < Math.min(count, max)) {
    const value = Math.floor(rand() * max) + 1;
    chosen.add(value);
  }
  return Array.from(chosen.values()).sort((a, b) => a - b);
};

const fetchJsonOnce = async (url) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: controller.signal,
  }).finally(() => clearTimeout(timeoutId));
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} for ${url}: ${text}`);
  }
  return res.json();
};

const fetchJson = async (url) => {
  let attempt = 0;
  while (attempt < RETRY_LIMIT) {
    try {
      const data = await fetchJsonOnce(url);
      if (RATE_LIMIT_MS > 0) await sleep(RATE_LIMIT_MS);
      return data;
    } catch (err) {
      attempt += 1;
      if (attempt >= RETRY_LIMIT) throw err;
      await sleep(RETRY_BACKOFF_MS * attempt);
    }
  }
  throw new Error("fetch failed");
};

const buildAlQuranUrl = (path) => {
  const base = ALQURAN_BASE.startsWith("/") ? ALQURAN_BASE : `/${ALQURAN_BASE}`;
  const normalizedBase = base.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${ALQURAN_ORIGIN}${normalizedBase}${normalizedPath}`;
};

const fetchAlQuranAyahs = async (path) => {
  const payload = await fetchJson(buildAlQuranUrl(path));
  return Array.isArray(payload?.data?.ayahs) ? payload.data.ayahs : [];
};

const parseVerseKey = (key) => {
  if (typeof key !== "string") return null;
  const [surahRaw, ayahRaw] = key.split(":");
  const surah = Number.parseInt(surahRaw, 10);
  const ayah = Number.parseInt(ayahRaw, 10);
  if (!Number.isFinite(surah) || !Number.isFinite(ayah)) return null;
  return { surah, ayah };
};

const verseKeySort = (a, b) => {
  const parsedA = parseVerseKey(a);
  const parsedB = parseVerseKey(b);
  if (!parsedA || !parsedB) return 0;
  if (parsedA.surah !== parsedB.surah) return parsedA.surah - parsedB.surah;
  return parsedA.ayah - parsedB.ayah;
};

const loadLocalIndex = async () => {
  if (REFERENCE !== "qurancom") return null;
  if (USE_LOCAL === "0" || USE_LOCAL === "false" || USE_LOCAL === "no") {
    return null;
  }
  if (!fs.existsSync(LOCAL_QF_PATH)) {
    if (USE_LOCAL === "1" || USE_LOCAL === "true" || USE_LOCAL === "yes") {
      throw new Error(`LOCAL_QF_PATH not found: ${LOCAL_QF_PATH}`);
    }
    return null;
  }

  const raw = fs.readFileSync(LOCAL_QF_PATH, "utf-8");
  const payload = JSON.parse(raw);
  const verses = Array.isArray(payload?.verses) ? payload.verses : [];
  const index = {
    juz: new Map(),
    page: new Map(),
    manzil: new Map(),
    ruku: new Map(),
    hizb: new Map(),
  };

  const pushKey = (map, number, key) => {
    if (!Number.isFinite(number)) return;
    if (typeof key !== "string") return;
    if (!map.has(number)) map.set(number, []);
    map.get(number).push(key);
  };

  for (const verse of verses) {
    const key = verse.verse_key ?? null;
    pushKey(index.juz, Number(verse.juz_number), key);
    pushKey(index.page, Number(verse.page_number), key);
    pushKey(index.manzil, Number(verse.manzil_number), key);
    pushKey(index.ruku, Number(verse.ruku_number), key);
    pushKey(index.hizb, Number(verse.hizb_number), key);
  }

  for (const map of Object.values(index)) {
    for (const [number, keys] of map.entries()) {
      const sorted = Array.from(new Set(keys)).sort(verseKeySort);
      map.set(number, sorted);
    }
  }

  return index;
};

const getLocalIndex = async () => {
  if (!localIndexPromise) {
    localIndexPromise = loadLocalIndex();
  }
  return localIndexPromise;
};

const getPagination = (payload) => {
  if (payload?.pagination) return payload.pagination;
  if (payload?.meta?.pagination) return payload.meta.pagination;
  if (payload?.meta) return payload.meta;
  return null;
};

const fetchAllQfVerses = async (type, number) => {
  if (REFERENCE === "alqurancloud") {
    if (type === "hizb") {
      const start = (number - 1) * 4 + 1;
      const quarters = [start, start + 1, start + 2, start + 3];
      const parts = await Promise.all(
        quarters.map((value) =>
          fetchAlQuranAyahs(`/hizbQuarter/${value}/${ALQURAN_AR_EDITION}`),
        ),
      );
      return parts
        .flat()
        .map((item) => ({
          verse_key: `${item?.surah?.number ?? 0}:${item?.numberInSurah ?? 0}`,
        }))
        .filter((item) => item.verse_key.includes(":"));
    }

    const ayahs = await fetchAlQuranAyahs(
      `/${type}/${number}/${ALQURAN_AR_EDITION}`,
    );
    return ayahs
      .map((item) => ({
        verse_key: `${item?.surah?.number ?? 0}:${item?.numberInSurah ?? 0}`,
      }))
      .filter((item) => item.verse_key.includes(":"));
  }

  const localIndex = await getLocalIndex();
  if (localIndex?.[type]?.has(number)) {
    return localIndex[type].get(number).map((verse_key) => ({ verse_key }));
  }

  const perPage = 200;
  let page = 1;
  const verses = [];

  while (true) {
    const params = new URLSearchParams({
      per_page: String(perPage),
      page: String(page),
    });
    params.set(`${type}_number`, String(number));

    const url = `${QF_API_BASE}/quran/verses/uthmani?${params.toString()}`;
    const payload = await fetchJson(url);
    const data = payload?.verses ?? [];
    if (!Array.isArray(data) || data.length === 0) break;
    verses.push(...data);

    const pagination = getPagination(payload);
    if (pagination?.next_page) {
      page = pagination.next_page;
      continue;
    }
    if (pagination?.current_page && pagination?.total_pages) {
      if (pagination.current_page >= pagination.total_pages) break;
      page += 1;
      continue;
    }
    if (data.length < perPage) break;
    page += 1;
  }

  return verses;
};

const fetchQfMeta = async (type, number) => {
  if (REFERENCE === "alqurancloud") {
    const verses = await fetchAllQfVerses(type, number);
    const total = verses.length;
    return { total, totalPages: total > 0 ? 1 : 0 };
  }

  const localIndex = await getLocalIndex();
  if (localIndex?.[type]?.has(number)) {
    const total = localIndex[type].get(number).length;
    return { total, totalPages: total > 0 ? 1 : 0 };
  }

  const params = new URLSearchParams({
    per_page: "1",
    page: "1",
  });
  params.set(`${type}_number`, String(number));
  const url = `${QF_API_BASE}/quran/verses/uthmani?${params.toString()}`;
  const payload = await fetchJson(url);
  const pagination = getPagination(payload);
  const meta = payload?.meta ?? payload?.pagination ?? pagination ?? {};
  const total =
    meta.total_records ??
    meta.total ??
    pagination?.total_records ??
    pagination?.total ??
    null;
  return {
    total,
    totalPages: meta.total_pages ?? pagination?.total_pages ?? null,
  };
};

const fetchQfSampleKeys = async (type, number, totalPages) => {
  if (REFERENCE === "alqurancloud") {
    const verses = await fetchAllQfVerses(type, number);
    if (!verses.length) return [];
    if (verses.length === 1) return [verses[0].verse_key];
    return [verses[0].verse_key, verses[verses.length - 1].verse_key];
  }

  const localIndex = await getLocalIndex();
  if (localIndex?.[type]?.has(number)) {
    const keys = localIndex[type].get(number);
    if (!keys.length) return [];
    return keys.length === 1 ? [keys[0]] : [keys[0], keys[keys.length - 1]];
  }

  if (!totalPages || totalPages < 1) return [];
  const pages = totalPages === 1 ? [1] : [1, totalPages];
  const keys = [];
  for (const page of pages) {
    const params = new URLSearchParams({
      per_page: "1",
      page: String(page),
    });
    params.set(`${type}_number`, String(number));
    const url = `${QF_API_BASE}/quran/verses/uthmani?${params.toString()}`;
    const payload = await fetchJson(url);
    const verseKey =
      payload?.verses?.[0]?.verse_key ??
      payload?.verse_key ??
      payload?.data?.[0]?.verse_key ??
      null;
    if (typeof verseKey === "string") keys.push(verseKey);
  }
  return keys;
};

const fetchAppVerses = async (type, number) => {
  const verses = [];
  let page = 1;

  while (true) {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(APP_PAGE_LIMIT),
    });
    const url = `${APP_API_BASE}/quran/${type}/${number}?${params.toString()}`;
    const payload = await fetchJson(url);
    const data = payload?.data ?? [];
    if (!Array.isArray(data) || data.length === 0) break;
    verses.push(...data);

    const pagination = payload?.pagination ?? payload?.meta?.pagination ?? null;
    if (!pagination) break;
    const total = pagination?.total ?? null;
    const limit = pagination?.limit ?? APP_PAGE_LIMIT;
    const currentPage = pagination?.page ?? page;
    if (typeof total === "number") {
      const totalPages = Math.ceil(total / limit);
      if (currentPage >= totalPages) break;
    } else if (data.length < limit) {
      break;
    }
    page += 1;
  }

  return verses;
};

const toKey = (surah, ayah) => `${surah}:${ayah}`;

const auditFull = async (type, number) => {
  const appVerses = await fetchAppVerses(type, number);
  const qfVerses = await fetchAllQfVerses(type, number);

  const appKeys = new Set(
    appVerses.map((item) => toKey(item.surah_number, item.ayah_number)),
  );
  const qfKeys = new Set(
    qfVerses
      .map((item) => item.verse_key)
      .filter((value) => typeof value === "string" && value.includes(":")),
  );

  const missing = [];
  const extra = [];

  qfKeys.forEach((key) => {
    if (!appKeys.has(key)) missing.push(key);
  });
  appKeys.forEach((key) => {
    if (!qfKeys.has(key)) extra.push(key);
  });

  return {
    type,
    number,
    appCount: appKeys.size,
    qfCount: qfKeys.size,
    missing,
    extra,
  };
};

const auditSample = async (type, number) => {
  const appVerses = await fetchAppVerses(type, number);
  const appKeys = new Set(
    appVerses.map((item) => toKey(item.surah_number, item.ayah_number)),
  );
  const qfMeta = await fetchQfMeta(type, number);
  const qfCount = qfMeta.total;
  const sampleKeys = await fetchQfSampleKeys(type, number, qfMeta.totalPages);
  const missingSamples = sampleKeys.filter((key) => !appKeys.has(key));

  return {
    type,
    number,
    appCount: appKeys.size,
    qfCount,
    missingSamples,
  };
};

const main = async () => {
  const report = [];
  let seed = SEED;

  for (const type of types) {
    const max = ranges[type];
    if (!max) {
      console.error(`Unknown type: ${type}`);
      continue;
    }

    const numbers = FULL
      ? Array.from({ length: max }, (_, idx) => idx + 1)
      : pickSamples(max, SAMPLE_COUNT, seed);

    seed += 101;

    for (const number of numbers) {
      try {
        const result = FULL
          ? await auditFull(type, number)
          : await auditSample(type, number);
        report.push(result);

        if (FULL) {
          const status =
            result.missing.length === 0 && result.extra.length === 0
              ? "OK"
              : "MISMATCH";
          console.log(
            `${status} ${type} ${number} | app=${result.appCount} qf=${result.qfCount} missing=${result.missing.length} extra=${result.extra.length}`,
          );
          if (result.missing.length || result.extra.length) {
            console.log(`  missing: ${result.missing.slice(0, 10).join(", ")}`);
            console.log(`  extra: ${result.extra.slice(0, 10).join(", ")}`);
          }
        } else {
          const countsMatch =
            typeof result.qfCount === "number"
              ? result.appCount === result.qfCount
              : true;
          const status =
            countsMatch && result.missingSamples.length === 0
              ? "OK"
              : "MISMATCH";
          console.log(
            `${status} ${type} ${number} | app=${result.appCount} qf=${
              result.qfCount ?? "unknown"
            } missingSamples=${result.missingSamples.length}`,
          );
          if (!countsMatch) {
            console.log("  count mismatch between app and Quran.com API.");
          }
          if (result.missingSamples.length) {
            console.log(
              `  missingSamples: ${result.missingSamples
                .slice(0, 10)
                .join(", ")}`,
            );
          }
        }
      } catch (err) {
        console.error(`ERROR ${type} ${number}:`, err?.message ?? err);
      }
    }
  }

  const mismatches = report.filter((item) => {
    if (FULL) {
      return item.missing.length > 0 || item.extra.length > 0;
    }
    if (typeof item.qfCount === "number" && item.appCount !== item.qfCount) {
      return true;
    }
    return item.missingSamples.length > 0;
  });
  console.log(
    `\nAudit selesai. Total: ${report.length}, mismatch: ${mismatches.length}.`,
  );
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
