import { writeFileSync } from "node:fs";
import { matsuratItems } from "../src/data/matsurat.ts";

const SURAH_MAP = {
  "Al-Fatihah": 1,
  "Al-Baqarah": 2,
  "Ali Imran": 3,
  Thoha: 20,
  "At-Taubah": 9,
  "Al-Isra": 17,
  "Al-Mu'minun": 23,
  "Ar-Rum": 30,
  Ghafir: 40,
  "Al-Hasyr": 59,
  "Az-Zalzalah": 99,
  "Al-Kafirun": 109,
  "An-Nashr": 110,
  "Al-Ikhlas": 112,
  "Al-Falaq": 113,
  "An-Naas": 114,
};

const DEFAULT_PROXY_BASE = "http://127.0.0.1:3000/api";
const PROXY_BASE = process.env.MATSURAT_PROXY_BASE_URL ?? DEFAULT_PROXY_BASE;
const OUTPUT_FILE = new URL(
  "../src/data/matsuratSurahAyahs.json",
  import.meta.url,
);
const FETCH_LIMIT = 100;
const MAX_PROXY_PAGES = 8;

const normalizeArabic = (value) =>
  value
    .normalize("NFKD")
    .replace(/\u0670/g, "")
    .replace(/ء/g, "")
    .replace(/[\u0610-\u061A\u064B-\u065F\u06D6-\u06ED]/g, "")
    .replace(/[\u08D3-\u08FF]/g, "")
    .replace(/[\u0660-\u0669\u06F0-\u06F9\u0030-\u0039]/g, "")
    .replace(/\u0640/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ى/g, "ي")
    .replace(/يي+/g, "ي")
    .replace(/وو+/g, "و")
    .replace(
      /[^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\s]/g,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();

const fetchSurahAyahs = async (surahNumber) => {
  const collected = [];
  let page = 1;

  while (page <= MAX_PROXY_PAGES) {
    const url = `${PROXY_BASE}/quran/${surahNumber}?page=${page}&limit=${FETCH_LIMIT}`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(
        `Gagal fetch surah ${surahNumber} page ${page}: HTTP ${response.status}`,
      );
    }
    const payload = await response.json();
    const chunk = Array.isArray(payload?.data?.ayahs)
      ? payload.data.ayahs
          .map((ayah) => ({
            ayah_number: Number(ayah?.ayah_number ?? 0),
            arab: typeof ayah?.arab === "string" ? ayah.arab : "",
          }))
          .filter((ayah) => ayah.ayah_number > 0 && ayah.arab)
      : [];
    collected.push(...chunk);

    const total = payload?.pagination?.total;
    if (typeof total === "number") {
      if (page * FETCH_LIMIT >= total) break;
      page += 1;
      continue;
    }
    if (chunk.length < FETCH_LIMIT) break;
    page += 1;
  }

  const dedup = [];
  const seen = new Set();
  for (const ayah of collected) {
    const key = `${ayah.ayah_number}|${ayah.arab}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(ayah);
  }
  dedup.sort((a, b) => a.ayah_number - b.ayah_number);
  return dedup;
};

const mapLinesToAyahNumbers = (lines, ayahs) => {
  if (!lines.length || !ayahs.length) return [];

  const normalizedAyahs = ayahs.map((ayah) => normalizeArabic(ayah.arab));
  const compactAyahs = normalizedAyahs.map((text) => text.replace(/\s+/g, ""));
  const hits = [];
  let cursor = 0;

  for (const line of lines) {
    const normalizedLine = normalizeArabic(line);
    const compactLine = normalizedLine.replace(/\s+/g, "");
    if (!normalizedLine) continue;

    let matchIndex = -1;

    for (let i = cursor; i < normalizedAyahs.length; i += 1) {
      if (
        normalizedAyahs[i] === normalizedLine ||
        compactAyahs[i] === compactLine
      ) {
        matchIndex = i;
        break;
      }
    }

    if (matchIndex === -1) {
      for (let i = cursor; i < normalizedAyahs.length; i += 1) {
        const candidate = normalizedAyahs[i];
        if (!candidate) continue;
        const compactCandidate = compactAyahs[i];
        if (
          candidate.includes(normalizedLine) ||
          normalizedLine.includes(candidate) ||
          compactCandidate.includes(compactLine) ||
          compactLine.includes(compactCandidate)
        ) {
          matchIndex = i;
          break;
        }
      }
    }

    if (matchIndex === -1 && cursor > 0) {
      for (let i = 0; i < cursor; i += 1) {
        const candidate = normalizedAyahs[i];
        if (!candidate) continue;
        const compactCandidate = compactAyahs[i];
        if (
          candidate === normalizedLine ||
          candidate.includes(normalizedLine) ||
          normalizedLine.includes(candidate) ||
          compactCandidate === compactLine ||
          compactCandidate.includes(compactLine) ||
          compactLine.includes(compactCandidate)
        ) {
          matchIndex = i;
          break;
        }
      }
    }

    if (matchIndex >= 0) {
      cursor = matchIndex + 1;
      hits.push(ayahs[matchIndex].ayah_number);
    }
  }

  return hits;
};

const toContiguousCandidate = (start, length, maxAyah) => {
  if (!Number.isFinite(start) || start <= 0 || length <= 0) return [];
  const candidate = [];
  for (let index = 0; index < length; index += 1) {
    const value = start + index;
    if (value > maxAyah) return [];
    candidate.push(value);
  }
  return candidate;
};

const linesBySurah = matsuratItems.reduce((acc, item) => {
  const surahNumber = SURAH_MAP[item.title];
  if (!surahNumber) return acc;
  const lines = item.arabic
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!acc[surahNumber]) {
    acc[surahNumber] = [];
  }
  acc[surahNumber].push(lines);
  return acc;
}, {});

const main = async () => {
  const output = {};
  for (const [surahRaw, groupedLines] of Object.entries(linesBySurah)) {
    const surahNumber = Number(surahRaw);
    const fullAyahs = await fetchSurahAyahs(surahNumber);
    const matchedNumbers = new Set();

    groupedLines.forEach((lines) => {
      const hits = mapLinesToAyahNumbers(lines, fullAyahs);
      hits.forEach((number) => matchedNumbers.add(number));

      if (hits.length === 0 || hits.length >= lines.length) return;

      const maxAyahNumber = fullAyahs[fullAyahs.length - 1]?.ayah_number ?? 0;
      const firstHit = hits[0];
      const contiguousFromFirst = toContiguousCandidate(
        firstHit,
        lines.length,
        maxAyahNumber,
      );
      if (
        contiguousFromFirst.length === lines.length &&
        hits.every((number) => contiguousFromFirst.includes(number))
      ) {
        contiguousFromFirst.forEach((number) => matchedNumbers.add(number));
        return;
      }

      const min = Math.min(...hits);
      const max = Math.max(...hits);
      const rangeLength = max - min + 1;
      if (rangeLength > 0 && rangeLength <= lines.length + 1) {
        for (let number = min; number <= max; number += 1) {
          matchedNumbers.add(number);
        }
      }
    });

    const subset = fullAyahs.filter((ayah) =>
      matchedNumbers.has(ayah.ayah_number),
    );
    output[surahNumber] = subset;
    console.log(
      `Surah ${surahNumber}: ${subset.length}/${fullAyahs.length} ayat disimpan.`,
    );
  }

  const sorted = Object.fromEntries(
    Object.entries(output).sort((a, b) => Number(a[0]) - Number(b[0])),
  );
  writeFileSync(OUTPUT_FILE, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
  console.log(`Selesai menulis ${OUTPUT_FILE.pathname}`);
};

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
