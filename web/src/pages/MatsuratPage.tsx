import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Play, Search } from "lucide-react";
import Container from "../components/Container";
import SectionHeader from "../components/SectionHeader";
import { Card, EmptyState } from "../components/State";
import GlobalAudioPlayer from "../components/GlobalAudioPlayer";
import type { AudioTrack } from "../lib/audio";
import { useAudio } from "../lib/audio";
import { API_BASE_URL, fetchJsonCached } from "../lib/api";
import { toArabicNumber } from "../lib/arabic";
import { formatDateId } from "../lib/date";
import { readStorage, writeStorage } from "../lib/storage";
import type { SurahDetail } from "../lib/types";
import {
  matsuratItems,
  type MatsuratItem,
  type MatsuratTime,
} from "../data/matsurat";
import matsuratSurahAyahsRaw from "../data/matsuratSurahAyahs.json";
import { useDebouncedValue } from "../lib/hooks";

type AyahMatchItem = { ayah_number: number; arab: string };
type MatsuratLocalAyahPayload = Record<
  string,
  { ayah_number: number; arab: string }[]
>;

const STORAGE_KEY = "ibadahmu:matsurat-progress";
const SEGMENT_OVERRIDE_STORAGE_KEY = "ibadahmu:matsurat-segment-overrides-v3";
const SEGMENT_CALIBRATION_QUERY_KEY = "matsuratCalibrate";

type ProgressStore = Record<string, string[]>;
type SegmentOverrideStore = Record<
  string,
  { startTime: number; endTime: number }
>;

type TimeFilter = "all" | MatsuratTime;
type MatsuratViewMode = "baca" | "dengar-penuh";

const SURAH_MAP: Record<string, number> = {
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

const DEFAULT_MATSURAT_SEGMENT_OVERRIDES: SegmentOverrideStore = {
  // Calibrated from real pause markers in Kubro Pagi/Petang recordings.
  "taawwudz-0-pagi": { startTime: 0, endTime: 4.1 },
  "taawwudz-0-sore": { startTime: 0.38, endTime: 6.2 },
  "al-fatihah-1-pagi": { startTime: 4.1, endTime: 29.76 },
  "al-fatihah-1-sore": { startTime: 6.2, endTime: 38.8 },
  "do-a-al-matsurat-20-pagi": { startTime: 674.28, endTime: 698.8 },
  "do-a-al-matsurat-21-pagi": { startTime: 698.8, endTime: 744.76 },
  "do-a-al-matsurat-22-pagi": { startTime: 744.76, endTime: 777.64 },
  "do-a-al-matsurat-23-pagi": { startTime: 777.64, endTime: 805.0 },
  "do-a-al-matsurat-24-pagi": { startTime: 805.0, endTime: 821.2 },
  "do-a-al-matsurat-25-pagi": { startTime: 821.2, endTime: 840.08 },
  "do-a-al-matsurat-26-pagi": { startTime: 840.08, endTime: 862.12 },
  "do-a-al-matsurat-27-pagi": { startTime: 862.12, endTime: 884.08 },
  "do-a-al-matsurat-28-pagi": { startTime: 884.08, endTime: 907.6 },
  "do-a-al-matsurat-29-pagi": { startTime: 907.6, endTime: 922.4 },
  "do-a-al-matsurat-30-pagi": { startTime: 922.4, endTime: 963.76 },
  "do-a-al-matsurat-31-pagi": { startTime: 963.76, endTime: 990.0 },
  "do-a-al-matsurat-32-pagi": { startTime: 990.0, endTime: 1015.0 },
  "do-a-al-matsurat-33-pagi": { startTime: 1015.0, endTime: 1076.0 },
  "do-a-al-matsurat-34-pagi": { startTime: 1076.0, endTime: 1090.0 },
  "do-a-al-matsurat-35-pagi": { startTime: 1090.0, endTime: 1337.32 },
  "do-a-al-matsurat-36-pagi": { startTime: 1337.32, endTime: 1816.74 },
  "do-a-al-matsurat-37-pagi": { startTime: 1816.74, endTime: 1849.6 },
  "do-a-al-matsurat-38-pagi": { startTime: 1849.6, endTime: 1871.1 },
  "do-a-al-matsurat-39-pagi": { startTime: 1871.1, endTime: 1964.99 },
  "do-a-robithoh-41-pagi": { startTime: 2113.32, endTime: 2121.16 },
  "do-a-robithoh-42-pagi": { startTime: 2121.16, endTime: 2166.88 },
  "do-a-al-matsurat-20-sore": { startTime: 861.14, endTime: 893.74 },
  "do-a-al-matsurat-21-sore": { startTime: 893.74, endTime: 949.42 },
  "do-a-al-matsurat-22-sore": { startTime: 949.42, endTime: 989.04 },
  "do-a-al-matsurat-23-sore": { startTime: 989.04, endTime: 1022.44 },
  "do-a-al-matsurat-24-sore": { startTime: 1022.44, endTime: 1042.88 },
  "do-a-al-matsurat-25-sore": { startTime: 1042.88, endTime: 1065.32 },
  "do-a-al-matsurat-26-sore": { startTime: 1065.32, endTime: 1091.32 },
  "do-a-al-matsurat-27-sore": { startTime: 1091.32, endTime: 1119.12 },
  "do-a-al-matsurat-28-sore": { startTime: 1119.12, endTime: 1147.98 },
  "do-a-al-matsurat-29-sore": { startTime: 1147.98, endTime: 1167.36 },
  "do-a-al-matsurat-30-sore": { startTime: 1167.36, endTime: 1216.04 },
  "do-a-al-matsurat-31-sore": { startTime: 1216.04, endTime: 1245.86 },
  "do-a-al-matsurat-32-sore": { startTime: 1261.0, endTime: 1280.0 },
  "do-a-al-matsurat-33-sore": { startTime: 1280.0, endTime: 1343.68 },
  "do-a-al-matsurat-34-sore": { startTime: 1343.68, endTime: 1363.9 },
  "do-a-al-matsurat-35-sore": { startTime: 1363.9, endTime: 1656.78 },
  "do-a-al-matsurat-36-sore": { startTime: 1656.78, endTime: 2142.73 },
  "do-a-al-matsurat-37-sore": { startTime: 2142.73, endTime: 2173.21 },
  "do-a-al-matsurat-38-sore": { startTime: 2173.21, endTime: 2196.94 },
  "do-a-al-matsurat-39-sore": { startTime: 2196.94, endTime: 2280.95 },
  "do-a-robithoh-41-sore": { startTime: 2387.2, endTime: 2396.56 },
  "do-a-robithoh-42-sore": { startTime: 2396.56, endTime: 2460.0 },
};

const HARD_LOCKED_MATSURAT_SEGMENTS: SegmentOverrideStore = {
  // Keep critical segments consistent even if stale local overrides exist.
  "taawwudz-0-pagi": { startTime: 0, endTime: 4.1 },
  "taawwudz-0-sore": { startTime: 0.38, endTime: 6.2 },
  "al-fatihah-1-pagi": { startTime: 4.1, endTime: 29.76 },
  "al-fatihah-1-sore": { startTime: 6.2, endTime: 38.8 },
  "do-a-robithoh-41-pagi": { startTime: 2113.32, endTime: 2121.16 },
  "do-a-robithoh-42-pagi": { startTime: 2121.16, endTime: 2166.88 },
  "do-a-robithoh-41-sore": { startTime: 2387.2, endTime: 2396.56 },
  "do-a-robithoh-42-sore": { startTime: 2396.56, endTime: 2460.0 },
};

const HARD_LOCKED_MATSURAT_STARTS: Record<string, number> = {
  // Ensure Al-Baqarah 1-5 starts from ayat awal (alif-lam-mim + dzalikal kitab).
  "al-baqarah-2-pagi": 29.76,
  "al-baqarah-2-sore": 38.8,
};

const AUDIO_PROXY_HOSTS = new Set([
  "audio.qurancdn.com",
  "cdn.myquran.com",
  "api.myquran.com",
  "archive.org",
]);
const MATSURAT_AUDIO_SOURCE_URL: Record<MatsuratTime, string> = {
  pagi: "https://archive.org/download/al-matsurat-kubro-shugro-pagi-dan-petang/Al%20Matsurat%20Kubro%20Pagi.mp3",
  sore: "https://archive.org/download/al-matsurat-kubro-shugro-pagi-dan-petang/Al%20Matsurat%20Kubro%20Petang.mp3",
};
const MATSURAT_TRACK_DURATION: Record<MatsuratTime, number> = {
  pagi: 2173.37,
  sore: 2463.25,
};
const MATSURAT_ESTIMATED_GAP_SEC = 1.2;
const MATSURAT_SEGMENT_PREROLL_SEC = 0.75;
const MAX_SURAH_PROXY_PAGES = 8;

type MatsuratAudioSegment = NonNullable<AudioTrack["segment"]>;

const matsuratLocalSurahAyahs = Object.entries(
  matsuratSurahAyahsRaw as MatsuratLocalAyahPayload,
).reduce<Record<number, AyahMatchItem[]>>((acc, [surahRaw, ayahs]) => {
  const surah = Number(surahRaw);
  if (!Number.isFinite(surah) || surah <= 0 || !Array.isArray(ayahs)) {
    return acc;
  }
  const normalized = ayahs
    .map((item) => ({
      ayah_number: Number(item?.ayah_number ?? 0),
      arab: typeof item?.arab === "string" ? item.arab : "",
    }))
    .filter((item) => item.ayah_number > 0 && item.arab);
  if (normalized.length > 0) {
    acc[surah] = normalized;
  }
  return acc;
}, {});

const dedupeAyahs = (items: AyahMatchItem[]) => {
  const seen = new Set<string>();
  const result: AyahMatchItem[] = [];
  items.forEach((item) => {
    const key = `${item.ayah_number}|${item.arab}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(item);
  });
  result.sort((a, b) => a.ayah_number - b.ayah_number);
  return result;
};

const areAyahsEqual = (a: AyahMatchItem[], b: AyahMatchItem[]) => {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (
      a[index]?.ayah_number !== b[index]?.ayah_number ||
      a[index]?.arab !== b[index]?.arab
    ) {
      return false;
    }
  }
  return true;
};

const fetchSurahAyahsFromProxy = async (surahNumber: number) => {
  const limit = 100;
  const collected: AyahMatchItem[] = [];
  let page = 1;

  while (page <= MAX_SURAH_PROXY_PAGES) {
    const response = await fetchJsonCached<SurahDetail>(
      `/quran/${surahNumber}?page=${page}&limit=${limit}`,
      {
        ttl: 12 * 60 * 60,
        key: `matsurat-surah-proxy-${surahNumber}-${page}`,
        staleIfError: true,
      },
    );
    const chunk = (response.data?.ayahs ?? [])
      .map((ayah) => ({
        ayah_number: Number(ayah?.ayah_number ?? 0),
        arab: typeof ayah?.arab === "string" ? ayah.arab : "",
      }))
      .filter((ayah) => ayah.ayah_number > 0 && ayah.arab);
    collected.push(...chunk);

    const total = response.pagination?.total;
    if (typeof total === "number") {
      if (page * limit >= total) break;
      page += 1;
      continue;
    }
    if (chunk.length < limit) break;
    page += 1;
  }

  return dedupeAyahs(collected);
};

const sanitizeSegment = (
  value?: Partial<MatsuratAudioSegment> | null,
): { startTime: number; endTime: number } | null => {
  if (!value) return null;
  const rawStart = value.startTime;
  const rawEnd = value.endTime;
  if (
    typeof rawStart !== "number" ||
    !Number.isFinite(rawStart) ||
    typeof rawEnd !== "number" ||
    !Number.isFinite(rawEnd)
  ) {
    return null;
  }
  const start = Math.max(rawStart, 0);
  const end = Math.max(rawEnd, 0);
  if (end <= start + 0.1) return null;
  return {
    startTime: Number(start.toFixed(2)),
    endTime: Number(end.toFixed(2)),
  };
};

const resolveAudioUrl = (raw?: string | null) => {
  if (!raw) return null;
  if (raw.startsWith("/")) return raw;
  if (!raw.startsWith("http")) return raw;
  try {
    const parsed = new URL(raw);
    if (AUDIO_PROXY_HOSTS.has(parsed.hostname.toLowerCase())) {
      const base = API_BASE_URL.replace(/\/$/, "");
      return `${base}/audio?url=${encodeURIComponent(raw)}`;
    }
  } catch {
    return raw;
  }
  return raw;
};

const computeSegmentWeight = (item: MatsuratItem) => {
  const arabicWordCount = item.arabic
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean).length;
  const compactArabicLength = item.arabic.replace(/\s+/g, "").length;
  const repeat = Math.max(item.repeat ?? 1, 1);
  const baseWeight = arabicWordCount * 1.2 + compactArabicLength / 20 + 2;
  return baseWeight * (1 + Math.log2(repeat) * 0.45);
};

const buildEstimatedSegmentLookup = (items: MatsuratItem[]) => {
  const lookup = new Map<string, MatsuratAudioSegment>();

  (["pagi", "sore"] as MatsuratTime[]).forEach((time) => {
    const timeItems = items.filter((item) => item.time === time);
    if (timeItems.length === 0) return;

    const totalDuration = MATSURAT_TRACK_DURATION[time];
    const totalGap = MATSURAT_ESTIMATED_GAP_SEC * (timeItems.length - 1);
    const usableDuration = Math.max(
      totalDuration - totalGap,
      timeItems.length * 2,
    );
    const weights = timeItems.map(computeSegmentWeight);
    const totalWeight =
      weights.reduce((sum, value) => sum + value, 0) || timeItems.length;

    let cursor = 0;

    timeItems.forEach((item, index) => {
      const ratio = (weights[index] ?? 1) / totalWeight;
      const allocated = usableDuration * ratio;
      const startTime = Math.max(cursor, 0);
      const endTime =
        index === timeItems.length - 1 ? totalDuration : startTime + allocated;

      lookup.set(item.id, {
        id: item.id,
        startTime: Number(startTime.toFixed(2)),
        endTime: Number(endTime.toFixed(2)),
      });

      cursor = endTime + MATSURAT_ESTIMATED_GAP_SEC;
    });
  });

  return lookup;
};

const isProtectedMatsuratSegmentId = (id: string) =>
  Boolean(HARD_LOCKED_MATSURAT_SEGMENTS[id]) ||
  Boolean(HARD_LOCKED_MATSURAT_STARTS[id]);

const buildBaseMatsuratSegmentLookup = () => {
  const estimated = buildEstimatedSegmentLookup(matsuratItems);
  const base = new Map(estimated);

  Object.entries(DEFAULT_MATSURAT_SEGMENT_OVERRIDES).forEach(
    ([id, segment]) => {
      const sanitized = sanitizeSegment(segment);
      if (!sanitized) return;
      base.set(id, { id, ...sanitized });
    },
  );

  Object.entries(HARD_LOCKED_MATSURAT_SEGMENTS).forEach(([id, segment]) => {
    const sanitized = sanitizeSegment(segment);
    if (!sanitized) return;
    base.set(id, { id, ...sanitized });
  });

  Object.entries(HARD_LOCKED_MATSURAT_STARTS).forEach(([id, startTime]) => {
    const estimatedSegment = estimated.get(id);
    if (!estimatedSegment) return;
    const endTime =
      typeof estimatedSegment.endTime === "number" &&
      Number.isFinite(estimatedSegment.endTime)
        ? estimatedSegment.endTime
        : null;
    if (endTime === null || endTime <= startTime + 0.1) return;
    const sanitized = sanitizeSegment({ startTime, endTime });
    if (!sanitized) return;
    base.set(id, { id, ...sanitized });
  });

  return base;
};

const BASE_MATSURAT_SEGMENT_LOOKUP = buildBaseMatsuratSegmentLookup();

const applySegmentPreroll = (
  segment?: MatsuratAudioSegment,
  preRollSec = MATSURAT_SEGMENT_PREROLL_SEC,
) => {
  if (!segment) return undefined;
  const sanitized = sanitizeSegment(segment);
  if (!sanitized) return undefined;
  const startTime = Number(
    Math.max(0, sanitized.startTime - preRollSec).toFixed(2),
  );
  if (sanitized.endTime <= startTime + 0.1) {
    return { ...segment, ...sanitized };
  }
  return {
    ...segment,
    startTime,
    endTime: sanitized.endTime,
  };
};

const normalizeArabic = (value: string) =>
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

const mapLinesToAyahs = (lines: string[], ayahs: AyahMatchItem[]) => {
  if (!lines.length || !ayahs.length) return lines.map(() => null);
  const normalizedAyahs = ayahs.map((ayah) => normalizeArabic(ayah.arab));
  const compactAyahs = normalizedAyahs.map((text) => text.replace(/\s+/g, ""));
  let cursor = 0;
  return lines.map((line) => {
    const normalizedLine = normalizeArabic(line);
    const compactLine = normalizedLine.replace(/\s+/g, "");
    if (!normalizedLine) return null;

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
      return ayahs[matchIndex]?.ayah_number ?? null;
    }

    return null;
  });
};

const getBaseMatsuratId = (id: string) => id.replace(/-(pagi|sore)$/i, "");
const mapMatsuratAudioId = (id: string, source: MatsuratTime) =>
  id.replace(/-(pagi|sore)$/i, `-${source}`);

const getMatsuratItemNumber = (id: string) => {
  const match = id.match(/-(\d+)-(?:pagi|sore)$/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
};

const MatsuratPage = () => {
  const {
    track: globalTrack,
    setQueue: setGlobalQueue,
    setRepeatMode,
    setShuffle,
    setTrack: setGlobalTrack,
  } = useAudio();
  const [viewMode, setViewMode] = useState<MatsuratViewMode>("dengar-penuh");
  const [filter, setFilter] = useState<TimeFilter>("pagi");
  const [audioSourceMode, setAudioSourceMode] = useState<MatsuratTime>("pagi");
  const [keyword, setKeyword] = useState("");
  const debounced = useDebouncedValue(keyword, 300);
  const [selected, setSelected] = useState<MatsuratItem | null>(null);
  const [progress, setProgress] = useState<ProgressStore>({});
  const [segmentOverrides, setSegmentOverrides] =
    useState<SegmentOverrideStore>({});
  const [calibrationStatus, setCalibrationStatus] = useState<string | null>(
    null,
  );
  const [surahCache, setSurahCache] = useState<Record<number, AyahMatchItem[]>>(
    () => ({ ...matsuratLocalSurahAyahs }),
  );
  const proxyHydratedSurahRef = useRef<Set<number>>(new Set());
  const isFullTrackActive = globalTrack?.module === "matsurat-full";
  const fullTrackSourceMode = globalTrack?.meta?.audioSourceMode;
  const activeFullSourceMode =
    fullTrackSourceMode === "pagi" || fullTrackSourceMode === "sore"
      ? fullTrackSourceMode
      : null;

  useEffect(() => {
    if (viewMode !== "baca") return;
    if (globalTrack?.module !== "matsurat-full") return;
    setGlobalTrack(null);
  }, [globalTrack?.module, setGlobalTrack, viewMode]);
  const isCalibrationMode = useMemo(() => {
    if (typeof window === "undefined") return false;
    const query = new URLSearchParams(window.location.search);
    return query.get(SEGMENT_CALIBRATION_QUERY_KEY) === "1";
  }, []);
  const segmentLookup = useMemo(() => {
    const base = new Map(BASE_MATSURAT_SEGMENT_LOOKUP);
    Object.entries(segmentOverrides).forEach(([id, override]) => {
      if (isProtectedMatsuratSegmentId(id)) return;
      const sanitized = sanitizeSegment(override);
      if (!sanitized) return;
      base.set(id, { id, ...sanitized });
    });
    return base;
  }, [segmentOverrides]);

  const todayKey = formatDateId(new Date());

  useEffect(() => {
    setProgress(readStorage<ProgressStore>(STORAGE_KEY, {}));
    const stored = readStorage<SegmentOverrideStore>(
      SEGMENT_OVERRIDE_STORAGE_KEY,
      {},
    );
    const cleaned = Object.fromEntries(
      Object.entries(stored).filter(
        ([id]) => !isProtectedMatsuratSegmentId(id),
      ),
    ) as SegmentOverrideStore;
    setSegmentOverrides(cleaned);
    writeStorage(SEGMENT_OVERRIDE_STORAGE_KEY, cleaned);
  }, []);

  const completedIds = useMemo(() => {
    const list = progress[todayKey] ?? [];
    return new Set(list);
  }, [progress, todayKey]);

  const list = useMemo(() => {
    return matsuratItems.filter((item) => {
      if (filter !== "all" && item.time !== filter) return false;
      if (!debounced) return true;
      const haystack =
        `${item.title} ${item.translation} ${item.arabic}`.toLowerCase();
      return haystack.includes(debounced.toLowerCase());
    });
  }, [filter, debounced]);

  const surahNumber = useMemo(
    () => (selected ? (SURAH_MAP[selected.title] ?? null) : null),
    [selected],
  );

  const surahAyahs = surahNumber ? (surahCache[surahNumber] ?? null) : null;

  useEffect(() => {
    if (!surahNumber) return;
    if (proxyHydratedSurahRef.current.has(surahNumber)) return;
    proxyHydratedSurahRef.current.add(surahNumber);

    let active = true;
    const loadAyahs = async () => {
      const ayahs = await fetchSurahAyahsFromProxy(surahNumber);
      if (!active) return;
      if (ayahs.length === 0) return;
      setSurahCache((prev) => {
        const current = prev[surahNumber] ?? [];
        if (areAyahsEqual(current, ayahs)) return prev;
        return { ...prev, [surahNumber]: ayahs };
      });
    };

    loadAyahs().catch(() => {
      if (!active) return;
      setSurahCache((prev) =>
        prev[surahNumber] ? prev : { ...prev, [surahNumber]: [] },
      );
    });

    return () => {
      active = false;
    };
  }, [surahNumber]);

  const selectedNumber = useMemo(
    () => (selected ? getMatsuratItemNumber(selected.id) : null),
    [selected?.id],
  );

  useEffect(() => {
    if (list.length === 0) {
      setSelected(null);
      return;
    }
    if (selected && list.find((item) => item.id === selected.id)) return;
    if (selected) {
      const selectedBaseId = getBaseMatsuratId(selected.id);
      const matchedByBase = list.find(
        (item) => getBaseMatsuratId(item.id) === selectedBaseId,
      );
      if (matchedByBase) {
        setSelected(matchedByBase);
        return;
      }
    }
    setSelected(list[0]);
  }, [list, selected]);

  const toggleProgress = (id: string) => {
    const current = new Set(progress[todayKey] ?? []);
    if (current.has(id)) {
      current.delete(id);
    } else {
      current.add(id);
    }
    const next = { ...progress, [todayKey]: Array.from(current) };
    setProgress(next);
    writeStorage(STORAGE_KEY, next);
  };

  const resetProgress = () => {
    const next = { ...progress, [todayKey]: [] };
    setProgress(next);
    writeStorage(STORAGE_KEY, next);
  };

  const completedInList = useMemo(
    () => list.filter((item) => completedIds.has(item.id)).length,
    [completedIds, list],
  );

  const progressValue =
    list.length === 0 ? 0 : Math.round((completedInList / list.length) * 100);

  const arabicLines = useMemo(() => {
    if (!selected?.arabic) return [];
    return selected.arabic
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }, [selected]);

  const arabicLineNumbers = useMemo(() => {
    if (!arabicLines.length) return [];
    if (!surahAyahs || surahAyahs.length === 0) {
      return arabicLines.map(() => null);
    }
    return mapLinesToAyahs(arabicLines, surahAyahs);
  }, [arabicLines, surahAyahs]);

  const zikirToTrack = useCallback(
    (item: MatsuratItem) => {
      const sourceId = mapMatsuratAudioId(item.id, audioSourceMode);
      const sourceUrl = resolveAudioUrl(
        MATSURAT_AUDIO_SOURCE_URL[audioSourceMode],
      );
      if (!sourceUrl) return null;
      const segment = applySegmentPreroll(segmentLookup.get(sourceId));
      const numberPart = getMatsuratItemNumber(item.id);

      return {
        title: item.title,
        subtitle: `${item.time} ${numberPart ? `· #${numberPart}` : ""}`,
        src: sourceUrl,
        segment,
        module: "matsurat",
        meta: {
          matsuratId: item.id,
          matsuratTime: item.time,
          matsuratNumber: numberPart,
          audioSourceMode,
          segmentMapVersion: "matsurat-v4-locked-preroll",
          surahNumber: SURAH_MAP[item.title] || null,
        },
      };
    },
    [audioSourceMode, segmentLookup],
  );

  const fallbackAudioTrack = useMemo(() => {
    if (!selected) return null;
    return zikirToTrack(selected);
  }, [selected, zikirToTrack]);

  const buildFullTrack = useCallback((): AudioTrack | null => {
    const sourceUrl = MATSURAT_AUDIO_SOURCE_URL[audioSourceMode];
    if (!sourceUrl) return null;
    return {
      title: "Al-Matsurat Kubro",
      subtitle: `${audioSourceMode === "pagi" ? "Pagi" : "Petang"} · Ta'awwudz sampai Doa Robithoh`,
      src: sourceUrl,
      module: "matsurat-full",
      meta: {
        matsuratMode: "full",
        audioSourceMode,
      },
    };
  }, [audioSourceMode]);

  const handlePlayFull = useCallback(() => {
    const fullTrack = buildFullTrack();
    if (!fullTrack) return;
    setShuffle(false);
    setRepeatMode("off");
    setGlobalQueue([fullTrack], 0);
  }, [buildFullTrack, setGlobalQueue, setRepeatMode, setShuffle]);

  const handleStopFull = useCallback(() => {
    if (globalTrack?.module !== "matsurat-full") return;
    setGlobalTrack(null);
  }, [globalTrack?.module, setGlobalTrack]);

  useEffect(() => {
    if (!isFullTrackActive) return;
    if (activeFullSourceMode === audioSourceMode) return;
    const fullTrack = buildFullTrack();
    if (!fullTrack) return;
    setShuffle(false);
    setRepeatMode("off");
    setGlobalQueue([fullTrack], 0);
  }, [
    activeFullSourceMode,
    audioSourceMode,
    buildFullTrack,
    isFullTrackActive,
    setGlobalQueue,
    setRepeatMode,
    setShuffle,
  ]);

  const selectedSegment = useMemo(() => {
    if (!selected) return null;
    const sourceId = mapMatsuratAudioId(selected.id, audioSourceMode);
    const segment = segmentLookup.get(sourceId);
    return segment ? sanitizeSegment(segment) : null;
  }, [audioSourceMode, segmentLookup, selected]);

  const persistSegmentOverride = useCallback(
    (id: string, segment: { startTime: number; endTime: number } | null) => {
      setSegmentOverrides((prev) => {
        const next = { ...prev };
        if (!segment) {
          delete next[id];
        } else {
          next[id] = segment;
        }
        writeStorage(SEGMENT_OVERRIDE_STORAGE_KEY, next);
        return next;
      });
    },
    [],
  );

  const adjustSelectedSegment = useCallback(
    (field: "startTime" | "endTime", delta: number) => {
      if (!selected || !selectedSegment) return;
      const sourceId = mapMatsuratAudioId(selected.id, audioSourceMode);
      const minLength = 0.25;
      const nextStart =
        field === "startTime"
          ? Math.max(0, selectedSegment.startTime + delta)
          : selectedSegment.startTime;
      const nextEnd =
        field === "endTime"
          ? Math.max(nextStart + minLength, selectedSegment.endTime + delta)
          : selectedSegment.endTime;
      const normalized = sanitizeSegment({
        startTime: Math.min(nextStart, nextEnd - minLength),
        endTime: nextEnd,
      });
      if (!normalized) return;
      persistSegmentOverride(sourceId, normalized);
    },
    [audioSourceMode, persistSegmentOverride, selected, selectedSegment],
  );

  const resetSelectedSegment = useCallback(() => {
    if (!selected) return;
    const sourceId = mapMatsuratAudioId(selected.id, audioSourceMode);
    persistSegmentOverride(sourceId, null);
    setCalibrationStatus("Segment direset ke estimasi.");
  }, [audioSourceMode, persistSegmentOverride, selected]);

  const copySelectedSegment = useCallback(() => {
    if (!selected || !selectedSegment) return;
    const sourceId = mapMatsuratAudioId(selected.id, audioSourceMode);
    const snippet = `"${sourceId}": { startTime: ${selectedSegment.startTime.toFixed(
      2,
    )}, endTime: ${selectedSegment.endTime.toFixed(2)} },`;
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      setCalibrationStatus("Clipboard tidak tersedia di browser ini.");
      return;
    }
    navigator.clipboard
      .writeText(snippet)
      .then(() =>
        setCalibrationStatus("Snippet override disalin ke clipboard."),
      )
      .catch(() =>
        setCalibrationStatus("Gagal menyalin snippet override ke clipboard."),
      );
  }, [audioSourceMode, selected, selectedSegment]);

  useEffect(() => {
    setCalibrationStatus(null);
  }, [selected?.id]);

  return (
    <div className="py-10">
      <Container>
        <SectionHeader
          title={"Al\u00A0Matsurat Kubro"}
          subtitle="Dzikir pagi dan sore dengan progress tracking harian."
        />

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <Card>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex w-full items-center gap-2 rounded-full border border-emerald-100 px-3 py-2 sm:w-auto">
                  <Search className="h-4 w-4 text-emerald-600" />
                  <input
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    placeholder="Cari dzikir"
                    className="w-full text-sm outline-none"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(["pagi", "sore", "all"] as TimeFilter[]).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setFilter(item)}
                      className={`rounded-full px-4 py-2 text-xs font-semibold ${
                        filter === item
                          ? "bg-emerald-600 text-white"
                          : "border border-emerald-100 text-emerald-700"
                      }`}
                    >
                      {item === "all"
                        ? "Semua"
                        : item === "pagi"
                          ? "Pagi"
                          : "Sore"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                  Mode
                </p>
                <button
                  type="button"
                  onClick={() => setViewMode("baca")}
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                    viewMode === "baca"
                      ? "bg-emerald-600 text-white"
                      : "border border-emerald-200 text-emerald-700"
                  }`}
                >
                  Baca
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("dengar-penuh")}
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                    viewMode === "dengar-penuh"
                      ? "bg-emerald-600 text-white"
                      : "border border-emerald-200 text-emerald-700"
                  }`}
                >
                  Dengar Penuh
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                  Sumber Audio
                </p>
                {(["pagi", "sore"] as MatsuratTime[]).map((source) => (
                  <button
                    key={source}
                    type="button"
                    onClick={() => {
                      setAudioSourceMode(source);
                      setFilter(source);
                    }}
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                      audioSourceMode === source
                        ? "bg-emerald-600 text-white"
                        : "border border-emerald-200 text-emerald-700"
                    }`}
                  >
                    {source === "pagi" ? "Kubro Pagi" : "Kubro Petang"}
                  </button>
                ))}
              </div>

              <p className="mt-3 text-xs text-textSecondary">
                {viewMode === "baca"
                  ? "Mode Baca aktif: pilih zikir untuk dibaca dan tandai progres harian."
                  : "Mode Dengar Penuh aktif: audio diputar utuh dari ta'awwudz sampai doa robithoh."}
              </p>

              <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-textSecondary">
                Progress hari ini: {completedInList}/{list.length} (
                {progressValue}%)
                <button
                  type="button"
                  onClick={resetProgress}
                  className="ml-3 rounded-full border border-emerald-200 px-3 py-2 text-xs text-emerald-700"
                >
                  Reset
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {list.length === 0 ? (
                  <EmptyState message="Dzikir tidak ditemukan." />
                ) : null}
                {list.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelected(item);
                    }}
                    className={`cv-auto w-full rounded-xl border px-4 py-3 text-left text-sm transition ${
                      selected?.id === item.id
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-emerald-100 hover:bg-emerald-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <p className="min-w-0 break-words font-semibold text-textPrimary">
                          {item.title}
                        </p>
                      </div>
                      {completedIds.has(item.id) ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-textSecondary">
                      {item.translation.slice(0, 80)}
                      {item.translation.length > 80 ? "..." : ""}
                    </p>
                  </button>
                ))}
              </div>
            </Card>
          </div>

          <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            <Card>
              <h3 className="text-sm font-semibold text-textPrimary">
                Detail Dzikir
              </h3>
              {!selected ? (
                <EmptyState message="Pilih dzikir untuk melihat detail." />
              ) : null}
              {selected ? (
                <div className="mt-4 space-y-4">
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 flex-1 break-words text-xs text-emerald-700">
                        {selected.title} · {selected.time}
                      </p>
                      {selectedNumber ? (
                        <span className="mushaf-ayah-number-inline shrink-0">
                          {selectedNumber}
                        </span>
                      ) : null}
                    </div>
                    {selected.repeat ? (
                      <p className="mt-1 text-xs text-textSecondary">
                        Dibaca {selected.repeat}×
                      </p>
                    ) : null}
                    <p
                      className="mt-3 whitespace-pre-line text-right font-arabic text-xl leading-relaxed text-textPrimary"
                      dir="rtl"
                    >
                      {arabicLines.length > 0
                        ? arabicLines.map((line, index) => {
                            const ayahNumber = arabicLineNumbers[index];

                            return (
                              <span key={`${selected.id}-${index}`}>
                                {line}
                                {ayahNumber ? (
                                  <span
                                    className="mushaf-ayah-number-inline mushaf-ayah-number-inline--small"
                                    dir="ltr"
                                  >
                                    {toArabicNumber(ayahNumber)}
                                  </span>
                                ) : null}
                                {index < arabicLines.length - 1 ? <br /> : null}
                              </span>
                            );
                          })
                        : selected.arabic}
                    </p>
                    <p className="mt-3 whitespace-pre-line text-sm text-textSecondary">
                      {selected.translation}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {viewMode === "dengar-penuh" ? (
                      <button
                        type="button"
                        onClick={handlePlayFull}
                        className="flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                      >
                        <Play className="h-3.5 w-3.5" />
                        {isFullTrackActive
                          ? "Putar Ulang Audio Lengkap"
                          : "Dengar Audio Lengkap"}
                      </button>
                    ) : (
                      <span className="rounded-full border border-emerald-200 px-4 py-2 text-xs font-semibold text-emerald-700">
                        Mode Baca Aktif
                      </span>
                    )}
                    {viewMode === "dengar-penuh" && isFullTrackActive ? (
                      <button
                        type="button"
                        onClick={handleStopFull}
                        className="rounded-full border border-emerald-200 px-4 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                      >
                        Hentikan Audio
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => toggleProgress(selected.id)}
                      className="rounded-full border border-emerald-200 px-4 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                    >
                      {completedIds.has(selected.id)
                        ? "Tandai Belum"
                        : "Tandai Selesai"}
                    </button>
                  </div>
                  {viewMode === "dengar-penuh" && isFullTrackActive ? (
                    <p className="text-xs text-emerald-700">
                      Sedang memutar:{" "}
                      {activeFullSourceMode === "sore"
                        ? "Kubro Petang"
                        : "Kubro Pagi"}
                      .
                    </p>
                  ) : null}

                  {viewMode === "dengar-penuh" &&
                  globalTrack?.module === "matsurat-full" ? (
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-2 sm:p-3">
                      <GlobalAudioPlayer embedded />
                    </div>
                  ) : null}

                  {viewMode === "baca" &&
                  isCalibrationMode &&
                  fallbackAudioTrack?.segment ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                      <p className="font-semibold">
                        Mode kalibrasi aktif ({SEGMENT_CALIBRATION_QUERY_KEY}=1)
                      </p>
                      <p className="mt-1">
                        Start:{" "}
                        <span className="font-semibold">
                          {selectedSegment?.startTime.toFixed(2) ?? "-"}s
                        </span>{" "}
                        · End:{" "}
                        <span className="font-semibold">
                          {selectedSegment?.endTime.toFixed(2) ?? "-"}s
                        </span>
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            adjustSelectedSegment("startTime", -0.5)
                          }
                          className="rounded-full border border-amber-300 px-3 py-1 font-semibold text-amber-800"
                        >
                          Start -0.5s
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            adjustSelectedSegment("startTime", 0.5)
                          }
                          className="rounded-full border border-amber-300 px-3 py-1 font-semibold text-amber-800"
                        >
                          Start +0.5s
                        </button>
                        <button
                          type="button"
                          onClick={() => adjustSelectedSegment("endTime", -0.5)}
                          className="rounded-full border border-amber-300 px-3 py-1 font-semibold text-amber-800"
                        >
                          End -0.5s
                        </button>
                        <button
                          type="button"
                          onClick={() => adjustSelectedSegment("endTime", 0.5)}
                          className="rounded-full border border-amber-300 px-3 py-1 font-semibold text-amber-800"
                        >
                          End +0.5s
                        </button>
                        <button
                          type="button"
                          onClick={copySelectedSegment}
                          className="rounded-full border border-amber-300 px-3 py-1 font-semibold text-amber-800"
                        >
                          Copy Snippet
                        </button>
                        <button
                          type="button"
                          onClick={resetSelectedSegment}
                          className="rounded-full border border-amber-300 px-3 py-1 font-semibold text-amber-800"
                        >
                          Reset Override
                        </button>
                      </div>
                      {calibrationStatus ? (
                        <p className="mt-2 text-amber-700">
                          {calibrationStatus}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </Card>
          </div>
        </div>
      </Container>
    </div>
  );
};

export default MatsuratPage;
