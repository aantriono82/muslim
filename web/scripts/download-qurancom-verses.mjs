import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const QF_API_BASE = process.env.QF_API_BASE ?? "https://api.quran.com/api/v4";
const OUT_PATH =
  process.env.OUT_PATH ??
  path.join(__dirname, "data", "qurancom-verse-meta.json");
const TIMEOUT_MS = Number.parseInt(process.env.TIMEOUT_MS ?? "20000", 10);
const RATE_LIMIT_MS = Number.parseInt(process.env.RATE_LIMIT_MS ?? "150", 10);
const RETRY_LIMIT = Number.parseInt(process.env.RETRY_LIMIT ?? "3", 10);
const RETRY_BACKOFF_MS = Number.parseInt(
  process.env.RETRY_BACKOFF_MS ?? "400",
  10,
);
const START_PAGE = Number.parseInt(process.env.START_PAGE ?? "1", 10);
const END_PAGE = Number.parseInt(process.env.END_PAGE ?? "604", 10);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

const getPagination = (payload) => {
  if (payload?.pagination) return payload.pagination;
  if (payload?.meta?.pagination) return payload.meta.pagination;
  if (payload?.meta) return payload.meta;
  return null;
};

const fetchPageVerses = async (pageNumber) => {
  const perPage = 50;
  const verses = [];
  let page = 1;
  while (true) {
    const params = new URLSearchParams({
      per_page: String(perPage),
      page: String(page),
      fields:
        "verse_key,chapter_id,verse_number,juz_number,hizb_number,rub_el_hizb_number,page_number,ruku_number,manzil_number",
    });
    const url = `${QF_API_BASE}/verses/by_page/${pageNumber}?${params.toString()}`;
    const payload = await fetchJson(url);
    const data = payload?.verses ?? payload?.data ?? [];
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

const normalizeVerse = (item) => ({
  verse_key: item.verse_key ?? `${item.chapter_id}:${item.verse_number}`,
  chapter_id: item.chapter_id ?? null,
  verse_number: item.verse_number ?? null,
  juz_number: item.juz_number ?? null,
  hizb_number: item.hizb_number ?? null,
  rub_el_hizb_number: item.rub_el_hizb_number ?? null,
  page_number: item.page_number ?? null,
  ruku_number: item.ruku_number ?? null,
  manzil_number: item.manzil_number ?? null,
});

const main = async () => {
  const allVerses = [];

  for (let pageNumber = START_PAGE; pageNumber <= END_PAGE; pageNumber += 1) {
    try {
      const verses = await fetchPageVerses(pageNumber);
      const normalized = verses.map(normalizeVerse);
      allVerses.push(...normalized);
      console.log(
        `OK page ${pageNumber}: ${normalized.length} ayat (total ${allVerses.length})`,
      );
    } catch (err) {
      console.error(`ERROR page ${pageNumber}:`, err?.message ?? err);
    }
  }

  const payload = {
    source: "quran.com",
    baseUrl: QF_API_BASE,
    generatedAt: new Date().toISOString(),
    pages: { start: START_PAGE, end: END_PAGE },
    verses: allVerses,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`\nSaved ${allVerses.length} ayat to ${OUT_PATH}`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
