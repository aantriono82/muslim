import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Search } from "lucide-react";
import Container from "../components/Container";
import SectionHeader from "../components/SectionHeader";
import { Card, EmptyState } from "../components/State";
import AudioPlayer from "../components/AudioPlayer";
import { useAudio } from "../lib/audio";
import { fetchJsonCached } from "../lib/api";
import { toArabicNumber } from "../lib/arabic";
import { formatDateId } from "../lib/date";
import { readStorage, writeStorage } from "../lib/storage";
import {
  matsuratItems,
  type MatsuratItem,
  type MatsuratTime,
} from "../data/matsurat";
import { useDebouncedValue } from "../lib/hooks";
import type { AyahItem, SurahDetail } from "../lib/types";

const STORAGE_KEY = "ibadahmu:matsurat-progress";

type ProgressStore = Record<string, string[]>;

type TimeFilter = "all" | MatsuratTime;

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

const SURAH_PAGE_LIMIT = 100;

const normalizeArabic = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/\u0670/g, "ا")
    .replace(/[\u0610-\u061A\u064B-\u065F\u06D5-\u06ED]/g, "")
    .replace(/[\u08D3-\u08FF]/g, "")
    .replace(/[\u0660-\u0669\u06F0-\u06F9\u0030-\u0039]/g, "")
    .replace(/\u0640/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ى/g, "ي")
    .replace(
      /[^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\s]/g,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();

const mapLinesToAyahs = (lines: string[], ayahs: AyahItem[]) => {
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

const MatsuratPage = () => {
  const [filter, setFilter] = useState<TimeFilter>("pagi");
  const [keyword, setKeyword] = useState("");
  const debounced = useDebouncedValue(keyword, 300);
  const [selected, setSelected] = useState<MatsuratItem | null>(null);
  const [progress, setProgress] = useState<ProgressStore>({});
  const [surahCache, setSurahCache] = useState<Record<number, AyahItem[]>>({});
  const { setTrack } = useAudio();

  const todayKey = formatDateId(new Date());

  useEffect(() => {
    setProgress(readStorage<ProgressStore>(STORAGE_KEY, {}));
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
    if (!surahNumber || surahAyahs) return;
    let active = true;
    const loadAyahs = async () => {
      const collected: AyahItem[] = [];
      let page = 1;
      let total = Infinity;

      while (collected.length < total && page <= 5) {
        const res = await fetchJsonCached<SurahDetail>(
          `/quran/${surahNumber}?page=${page}&limit=${SURAH_PAGE_LIMIT}`,
          {
            ttl: 12 * 60 * 60,
            key: `matsurat-surah-${surahNumber}-p${page}`,
            staleIfError: true,
          },
        );
        if (!active) return;
        const ayahs = res.data?.ayahs ?? [];
        collected.push(...ayahs);
        total = res.pagination?.total ?? collected.length;
        if (ayahs.length === 0) break;
        page += 1;
      }

      setSurahCache((prev) => ({ ...prev, [surahNumber]: collected }));
    };

    loadAyahs().catch(() => {
      if (!active) return;
      setSurahCache((prev) => ({ ...prev, [surahNumber]: [] }));
    });

    return () => {
      active = false;
    };
  }, [surahAyahs, surahNumber]);

  const selectedNumber = useMemo(() => {
    if (!selected) return null;
    const index = list.findIndex((item) => item.id === selected.id);
    return index >= 0 ? index + 1 : null;
  }, [list, selected]);

  useEffect(() => {
    if (list.length === 0) {
      setSelected(null);
      return;
    }
    if (selected && list.find((item) => item.id === selected.id)) return;
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

  const progressValue =
    list.length === 0 ? 0 : Math.round((completedIds.size / list.length) * 100);

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

              <p className="mt-3 text-xs text-textSecondary">
                Koleksi ringkas Al Matsurat Kubro. Data bisa ditambah sesuai
                kebutuhan.
              </p>

              <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-textSecondary">
                Progress hari ini: {completedIds.size}/{list.length} (
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
                    onClick={() => setSelected(item)}
                    className={`cv-auto w-full rounded-xl border px-4 py-3 text-left text-sm transition ${
                      selected?.id === item.id
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-emerald-100 hover:bg-emerald-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-textPrimary">
                        {item.title}
                      </p>
                      {completedIds.has(item.id) ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
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
                    <p className="text-xs text-emerald-700">
                      {selected.title} · {selected.time}
                    </p>
                    {selectedNumber ? (
                      <span className="mushaf-ayah-number-inline">
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
                  <button
                    type="button"
                    onClick={() => toggleProgress(selected.id)}
                    className="rounded-full border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700"
                  >
                    {completedIds.has(selected.id)
                      ? "Tandai Belum"
                      : "Tandai Selesai"}
                  </button>
                  {selected.audioUrl ? (
                    <button
                      type="button"
                      onClick={() =>
                        setTrack({
                          title: selected.title,
                          subtitle: "Al Matsurat",
                          src: selected.audioUrl ?? "",
                          module: "matsurat",
                        })
                      }
                      className="rounded-full border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700"
                    >
                      Putar di Player
                    </button>
                  ) : null}
                </div>

                <AudioPlayer title={selected.title} src={selected.audioUrl} />
              </div>
            ) : null}
          </Card>
        </div>
      </Container>
    </div>
  );
};

export default MatsuratPage;
