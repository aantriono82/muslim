#!/usr/bin/env bun

import {
  MUSHAF_CONTINUATION_APPEND_PAGE_LIST,
  MUSHAF_CONTINUATION_APPEND_PAGES,
  MUSHAF_CONTINUATION_SKIP_PAGES,
  MUSHAF_TOTAL_PAGES,
} from "../src/lib/mushafContinuationPages.ts";

const API_BASE = "https://api.myquran.com/v3";
const PAGE_FETCH_DELAY_MS = 120;
const MAX_FETCH_ATTEMPTS = 6;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const printHelp = () => {
  console.log(`
Audit sinkronisasi jumlah ayat kartu penjelasan vs batas halaman mushaf.

Usage:
  bun scripts/audit-mushaf-explanation-pages.mjs [options]

Options:
  --all                 Audit semua halaman 1-${MUSHAF_TOTAL_PAGES}
  --pages=1,2,3         Audit halaman tertentu (comma-separated)
  --strict              Exit code 1 jika ditemukan mismatch
  --help                Tampilkan bantuan

Tanpa opsi, script akan audit halaman continuation + tetangganya.
`);
};

const parsePagesArg = (raw) => {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => Number(part.trim()))
    .filter(
      (value) =>
        Number.isFinite(value) &&
        value >= 1 &&
        value <= MUSHAF_TOTAL_PAGES &&
        Number.isInteger(value),
    );
};

const parseArgs = (argv) => {
  const result = {
    strict: false,
    all: false,
    pages: [],
    help: false,
  };

  argv.forEach((arg) => {
    if (arg === "--strict") result.strict = true;
    else if (arg === "--all") result.all = true;
    else if (arg === "--help" || arg === "-h") result.help = true;
    else if (arg.startsWith("--pages=")) {
      result.pages = parsePagesArg(arg.slice("--pages=".length));
    }
  });

  return result;
};

const uniqueSorted = (values) =>
  Array.from(new Set(values)).sort((a, b) => a - b);

const resolveAuditPages = ({ all, pages }) => {
  if (all) {
    return Array.from({ length: MUSHAF_TOTAL_PAGES }, (_, idx) => idx + 1);
  }
  if (pages.length) return uniqueSorted(pages);

  const baseline = new Set([
    ...MUSHAF_CONTINUATION_APPEND_PAGE_LIST,
    ...MUSHAF_CONTINUATION_APPEND_PAGE_LIST.map((page) => page + 1),
  ]);
  return uniqueSorted(
    Array.from(baseline).filter(
      (page) => page >= 1 && page <= MUSHAF_TOTAL_PAGES,
    ),
  );
};

const resolveFetchPages = (auditPages) =>
  uniqueSorted(
    auditPages.flatMap((page) => [
      page,
      page > 1 ? page - 1 : null,
      page < MUSHAF_TOTAL_PAGES ? page + 1 : null,
    ]),
  ).filter((page) => page !== null);

const fetchJsonWithRetry = async (url) => {
  let attempt = 0;
  while (true) {
    const response = await fetch(url);
    if (response.ok) return response.json();

    const shouldRetry =
      response.status === 429 ||
      response.status === 408 ||
      response.status >= 500;

    if (shouldRetry && attempt < MAX_FETCH_ATTEMPTS - 1) {
      const waitMs = 600 * (attempt + 1);
      await sleep(waitMs);
      attempt += 1;
      continue;
    }
    throw new Error(`HTTP ${response.status} saat fetch ${url}`);
  }
};

const fetchSurahTotals = async () => {
  const payload = await fetchJsonWithRetry(`${API_BASE}/quran`);
  const entries = Array.isArray(payload?.data) ? payload.data : [];
  const totals = new Map();

  entries.forEach((entry) => {
    const surahNumber = Number(entry?.number);
    const ayahCount = Number(entry?.number_of_ayahs);
    if (
      Number.isFinite(surahNumber) &&
      surahNumber > 0 &&
      Number.isFinite(ayahCount) &&
      ayahCount > 0
    ) {
      totals.set(surahNumber, ayahCount);
    }
  });

  return totals;
};

const fetchPageAyahs = async (pageNumber) => {
  const ayahs = [];
  let cursor = 1;

  while (true) {
    const payload = await fetchJsonWithRetry(
      `${API_BASE}/quran/page/${pageNumber}?page=${cursor}&limit=100`,
    );
    const rows = Array.isArray(payload?.data) ? payload.data : [];

    ayahs.push(
      ...rows
        .map((item) => ({
          surahNumber: Number(item?.surah_number),
          ayahNumber: Number(item?.ayah_number),
        }))
        .filter(
          (item) =>
            Number.isFinite(item.surahNumber) &&
            item.surahNumber > 0 &&
            Number.isFinite(item.ayahNumber) &&
            item.ayahNumber > 0,
        ),
    );

    const pagination = payload?.pagination ?? null;
    if (
      pagination &&
      Number.isFinite(pagination.page) &&
      Number.isFinite(pagination.limit) &&
      Number.isFinite(pagination.total)
    ) {
      const totalPages = Math.ceil(pagination.total / pagination.limit);
      if (pagination.page >= totalPages) break;
    } else if (rows.length < 100) {
      break;
    }

    cursor += 1;
  }

  return ayahs;
};

const pickRangeLabel = (ayahs) => {
  if (!ayahs.length) return "-";
  const first = ayahs[0];
  const last = ayahs[ayahs.length - 1];
  return `${first.surahNumber}:${first.ayahNumber}-${last.surahNumber}:${last.ayahNumber}`;
};

const shouldAppendByHeuristic = (page, pageCache, surahTotals) => {
  const current = pageCache.get(page) ?? [];
  if (!current.length || page >= MUSHAF_TOTAL_PAGES) return false;

  const last = current[current.length - 1];
  const hasMultipleSurah =
    new Set(current.map((ayah) => ayah.surahNumber)).size > 1;
  const hasOpeningOfLastSurah = current.some(
    (ayah) => ayah.surahNumber === last.surahNumber && ayah.ayahNumber === 1,
  );
  if (!hasMultipleSurah || !hasOpeningOfLastSurah) return false;
  if (last.surahNumber === 9) return false;

  const totalAyahsInSurah = surahTotals.get(last.surahNumber);
  if (totalAyahsInSurah && last.ayahNumber >= totalAyahsInSurah) return false;

  const next = pageCache.get(page + 1) ?? [];
  const nextFirst = next[0];
  if (!nextFirst) return false;

  return (
    nextFirst.surahNumber === last.surahNumber &&
    nextFirst.ayahNumber === last.ayahNumber + 1
  );
};

const renderCurrentPageAyahs = (page, pageCache) => {
  let ayahs = [...(pageCache.get(page) ?? [])];

  if (MUSHAF_CONTINUATION_SKIP_PAGES.has(page) && ayahs.length) {
    const previous = pageCache.get(page - 1) ?? [];
    const previousLast = previous[previous.length - 1];
    const first = ayahs[0];
    const shouldSkip =
      previousLast &&
      first &&
      previousLast.surahNumber === first.surahNumber &&
      previousLast.ayahNumber + 1 === first.ayahNumber;
    if (shouldSkip) ayahs = ayahs.slice(1);
  }

  if (MUSHAF_CONTINUATION_APPEND_PAGES.has(page) && ayahs.length) {
    const next = pageCache.get(page + 1) ?? [];
    const last = ayahs[ayahs.length - 1];
    const candidate = next[0];
    const shouldAppend =
      last &&
      candidate &&
      candidate.surahNumber === last.surahNumber &&
      candidate.ayahNumber === last.ayahNumber + 1;
    if (shouldAppend) {
      ayahs.push(candidate);
    }
  }

  return ayahs;
};

const formatSet = (setValues) => {
  if (!setValues.length) return "-";
  return setValues.join(",");
};

const run = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const auditPages = resolveAuditPages(args);
  const fetchPages = resolveFetchPages(auditPages);

  if (!auditPages.length) {
    console.log("Tidak ada halaman valid untuk diaudit.");
    return;
  }

  console.log(`Audit pages: ${auditPages.length}`);
  console.log(`Fetch pages: ${fetchPages.length}`);

  const surahTotals = await fetchSurahTotals();
  const pageCache = new Map();

  for (const page of fetchPages) {
    pageCache.set(page, await fetchPageAyahs(page));
    await sleep(PAGE_FETCH_DELAY_MS);
  }

  const expectedAppendPages = new Set(
    auditPages.filter((page) =>
      shouldAppendByHeuristic(page, pageCache, surahTotals),
    ),
  );
  const expectedSkipPages = new Set(
    Array.from(expectedAppendPages, (page) => page + 1).filter(
      (page) => page <= MUSHAF_TOTAL_PAGES,
    ),
  );

  const rows = [];
  const mismatchPages = [];

  auditPages.forEach((page) => {
    const raw = pageCache.get(page) ?? [];
    const rendered = renderCurrentPageAyahs(page, pageCache);
    const expectedCount =
      raw.length +
      (expectedAppendPages.has(page) ? 1 : 0) -
      (expectedSkipPages.has(page) ? 1 : 0);
    const status = rendered.length === expectedCount ? "OK" : "MISMATCH";
    if (status === "MISMATCH") mismatchPages.push(page);
    rows.push({
      page,
      rawCount: raw.length,
      renderedCount: rendered.length,
      expectedCount,
      rawRange: pickRangeLabel(raw),
      renderedRange: pickRangeLabel(rendered),
      status,
    });
  });

  console.log("page\traw\trendered\texpected\traw_range\trendered_range\tstatus");
  rows.forEach((row) => {
    console.log(
      `${row.page}\t${row.rawCount}\t${row.renderedCount}\t${row.expectedCount}\t${row.rawRange}\t${row.renderedRange}\t${row.status}`,
    );
  });

  const configuredAppendInScope = auditPages.filter((page) =>
    MUSHAF_CONTINUATION_APPEND_PAGES.has(page),
  );
  const missingAppendPages = Array.from(expectedAppendPages).filter(
    (page) => !MUSHAF_CONTINUATION_APPEND_PAGES.has(page),
  );
  const extraAppendPages = configuredAppendInScope.filter(
    (page) => !expectedAppendPages.has(page),
  );

  console.log("---");
  console.log(`Mismatch: ${mismatchPages.length}`);
  console.log(`Mismatch pages: ${formatSet(mismatchPages)}`);
  console.log(
    `Expected append pages: ${formatSet(Array.from(expectedAppendPages).sort((a, b) => a - b))}`,
  );
  console.log(
    `Configured append pages (scope): ${formatSet(configuredAppendInScope)}`,
  );
  console.log(`Missing append pages: ${formatSet(missingAppendPages)}`);
  console.log(`Extra append pages: ${formatSet(extraAppendPages)}`);

  if (args.strict && mismatchPages.length) {
    process.exitCode = 1;
  }
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
