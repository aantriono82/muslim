import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import { Headphones, Play, Shuffle, Search } from "lucide-react";
import Container from "../components/Container";
import SectionHeader from "../components/SectionHeader";
import GlobalAudioPlayer from "../components/GlobalAudioPlayer";
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
} from "../components/State";
import { API_BASE_URL, fetchJson, fetchJsonCached } from "../lib/api";
import { useAudio, type AudioTrack } from "../lib/audio";
import { juzMeta, type JuzMeta } from "../data/juzMeta";
import type { SurahItem } from "../lib/types";

const resolveAudioUrl = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim()) return value;
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = resolveAudioUrl(item);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const preferredKeys = ["01", "1", "default", "primary", "alafasy"];
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

const proxyAudioUrl = (url: string | null) => {
  if (!url) return null;
  if (url.startsWith("blob:")) return url;
  if (url.startsWith("/api/") || url.startsWith(`${API_BASE_URL}/`)) {
    return url;
  }
  const base = API_BASE_URL.replace(/\/$/, "");
  return `${base}/audio?url=${encodeURIComponent(url)}`;
};

const getSurahAudio = (item: SurahItem) =>
  proxyAudioUrl(
    resolveAudioUrl(
      (item as { audio_url?: unknown; audio?: unknown; audioFull?: unknown })
        .audio_url ??
        (item as { audio?: unknown }).audio ??
        (item as { audioFull?: unknown }).audioFull,
    ),
  );

const MurratalPage = () => {
  const {
    track,
    queue,
    currentIndex,
    setQueue,
    appendQueue,
    setShuffle,
    setTrack,
    setRepeatMode,
  } = useAudio();
  const masonryRef = useRef<HTMLDivElement | null>(null);
  const [surah, setSurah] = useState<SurahItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [juzAudioCache, setJuzAudioCache] = useState<
    Record<number, AudioTrack[]>
  >({});
  const [juzAudioLoading, setJuzAudioLoading] = useState<number | null>(null);
  const [juzAudioError, setJuzAudioError] = useState<Record<number, string>>(
    {},
  );
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("number");
  const juzAutoAdvanceRef = useRef<{
    active: boolean;
    lastAppended: number;
    inFlight: boolean;
  }>({ active: false, lastAppended: 0, inFlight: false });

  useEffect(() => {
    fetchJsonCached<SurahItem[]>("/quran", {
      ttl: 12 * 60 * 60,
      key: "quran-list",
      staleIfError: true,
    })
      .then((res) => setSurah(res.data ?? []))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let list = [...surah];
    if (filter !== "all") {
      list = list.filter((item) => item.revelation.toLowerCase() === filter);
    }
    if (query) {
      const needle = query.toLowerCase();
      list = list.filter(
        (item) =>
          item.name_latin.toLowerCase().includes(needle) ||
          item.translation.toLowerCase().includes(needle),
      );
    }
    if (sort === "name") {
      list.sort((a, b) => a.name_latin.localeCompare(b.name_latin));
    } else if (sort === "verses") {
      list.sort((a, b) => a.number_of_ayahs - b.number_of_ayahs);
    } else {
      list.sort((a, b) => a.number - b.number);
    }
    return list;
  }, [surah, filter, sort, query]);

  const surahLookup = useMemo(
    () => new Map(surah.map((item) => [item.number, item])),
    [surah],
  );
  const filteredLookup = useMemo(
    () => new Map(filtered.map((item) => [item.number, item])),
    [filtered],
  );
  const filteredOrder = useMemo(
    () => new Map(filtered.map((item, index) => [item.number, index])),
    [filtered],
  );

  const buildTrack = (
    item: SurahItem,
    audioUrl: string,
    options?: { juz?: number },
  ): AudioTrack => ({
    title: item.name_latin,
    subtitle: `Surah ${item.number} · ${item.translation}`,
    src: audioUrl,
    sourceLabel: "MyQuran CDN",
    quality: "Default MyQuran",
    format: "MP3",
    module: "murratal",
    meta: {
      surahNumber: item.number,
      ...(typeof options?.juz === "number" ? { juz: options.juz } : {}),
    },
  });

  const buildJuzTrack = (payload: {
    juz: number;
    surahNumber: number;
    ayahNumber: number;
    audioUrl: string;
  }) => {
    const meta = surahLookup.get(payload.surahNumber);
    const name = meta?.name_latin ?? `Surah ${payload.surahNumber}`;
    return {
      title: `${name} · Ayat ${payload.ayahNumber}`,
      subtitle: `Juz ${payload.juz}`,
      src: payload.audioUrl,
      sourceLabel: "Quran.com CDN",
      quality: "Alafasy",
      format: "MP3",
      module: "murratal-juz",
      meta: {
        juz: payload.juz,
        surahNumber: payload.surahNumber,
        ayahNumber: payload.ayahNumber,
      },
    } satisfies AudioTrack;
  };

  const filteredWithAudio = useMemo(
    () =>
      filtered
        .map((item) => ({ item, audioUrl: getSurahAudio(item) }))
        .filter((entry): entry is { item: SurahItem; audioUrl: string } =>
          Boolean(entry.audioUrl),
        ),
    [filtered],
  );

  const audioLookup = useMemo(
    () =>
      new Map(
        filteredWithAudio.map((entry) => [entry.item.number, entry.audioUrl]),
      ),
    [filteredWithAudio],
  );

  const juzGroups = useMemo(() => {
    return juzMeta
      .map((meta) => {
        const items = meta.surahNumbers
          .map((number) => filteredLookup.get(number))
          .filter((item): item is SurahItem => Boolean(item));
        items.sort(
          (a, b) =>
            (filteredOrder.get(a.number) ?? 0) -
            (filteredOrder.get(b.number) ?? 0),
        );
        if (items.length === 0) return null;
        const startMeta = surahLookup.get(meta.start.surah);
        const endMeta = surahLookup.get(meta.end.surah);
        return {
          ...meta,
          items,
          startName: startMeta?.name_latin ?? `Surah ${meta.start.surah}`,
          endName: endMeta?.name_latin ?? `Surah ${meta.end.surah}`,
        };
      })
      .filter(
        (
          group,
        ): group is JuzMeta & {
          items: SurahItem[];
          startName: string;
          endName: string;
        } => Boolean(group),
      );
  }, [filteredLookup, filteredOrder, surahLookup]);

  const firstJuzBySurah = useMemo(() => {
    const map = new Map<number, number>();
    juzGroups.forEach((group) => {
      group.items.forEach((item) => {
        if (!map.has(item.number)) {
          map.set(item.number, group.juz);
        }
      });
    });
    return map;
  }, [juzGroups]);

  const buildSurahPlaylist = useCallback(
    (items: SurahItem[], options?: { juz?: number }) =>
      items
        .map((entry) => {
          const audioUrl = getSurahAudio(entry);
          return audioUrl ? buildTrack(entry, audioUrl, options) : null;
        })
        .filter((entry): entry is AudioTrack => Boolean(entry)),
    [buildTrack],
  );

  const handlePlay = (
    item: SurahItem,
    listOverride?: SurahItem[],
    groupJuz?: number,
  ) => {
    const audioUrl = getSurahAudio(item);
    if (!audioUrl) return;
    juzAutoAdvanceRef.current.active = false;
    const playlistItems = listOverride ?? filtered;
    const playlist = buildSurahPlaylist(playlistItems, { juz: groupJuz });
    const startIndex = playlist.findIndex(
      (entry) => entry.meta?.surahNumber === item.number,
    );
    setShuffle(false);
    setRepeatMode("off");
    setQueue(playlist, startIndex >= 0 ? startIndex : 0);
  };

  const handleRandom = () => {
    if (filteredWithAudio.length === 0) return;
    juzAutoAdvanceRef.current.active = false;
    const playlist = filteredWithAudio.map((entry) =>
      buildTrack(entry.item, entry.audioUrl),
    );
    const randomIndex = Math.floor(Math.random() * playlist.length);
    setShuffle(true);
    setRepeatMode("off");
    setQueue(playlist, randomIndex);
  };

  const fetchJuzAudio = useCallback(
    async (juz: number) => {
      const result = await fetchJson<
        { surah_number: number; ayah_number: number; audio_url: string }[]
      >(`/quran/juz/${juz}/audio`);
      const list = Array.isArray(result.data) ? result.data : [];
      return list
        .filter((item) => item.audio_url)
        .map((item) =>
          buildJuzTrack({
            juz,
            surahNumber: item.surah_number,
            ayahNumber: item.ayah_number,
            audioUrl: item.audio_url,
          }),
        );
    },
    [buildJuzTrack],
  );

  const handlePlayJuz = useCallback(
    async (juz: number) => {
      juzAutoAdvanceRef.current = {
        active: true,
        lastAppended: juz,
        inFlight: false,
      };
      setJuzAudioError((prev) => {
        if (!prev[juz]) return prev;
        const next = { ...prev };
        delete next[juz];
        return next;
      });
      const cached = juzAudioCache[juz];
      if (cached && cached.length > 0) {
        setShuffle(false);
        setRepeatMode("off");
        setQueue(cached, 0);
        return;
      }
      try {
        setJuzAudioLoading(juz);
        const tracks = await fetchJuzAudio(juz);
        if (tracks.length === 0) {
          throw new Error("Audio juz tidak tersedia.");
        }
        setJuzAudioCache((prev) => ({ ...prev, [juz]: tracks }));
        setShuffle(false);
        setRepeatMode("off");
        setQueue(tracks, 0);
      } catch (err) {
        setJuzAudioError((prev) => ({
          ...prev,
          [juz]: (err as Error).message,
        }));
      } finally {
        setJuzAudioLoading((current) => (current === juz ? null : current));
      }
    },
    [fetchJuzAudio, juzAudioCache, setQueue, setRepeatMode, setShuffle],
  );

  useEffect(() => {
    if (!juzAutoAdvanceRef.current.active) return;
    if (!track || track.module !== "murratal-juz") return;
    if (!queue.length) return;
    if (currentIndex < Math.max(queue.length - 3, 0)) return;
    const lastTrack = queue[queue.length - 1];
    const lastJuz =
      typeof lastTrack?.meta?.juz === "number" ? lastTrack.meta.juz : null;
    if (!lastJuz || lastJuz >= 30) return;
    const nextJuz = lastJuz + 1;
    const state = juzAutoAdvanceRef.current;
    if (state.inFlight || state.lastAppended >= nextJuz) return;

    let cancelled = false;
    const run = async () => {
      state.inFlight = true;
      try {
        const cached = juzAudioCache[nextJuz];
        const tracks =
          cached && cached.length > 0 ? cached : await fetchJuzAudio(nextJuz);
        if (cancelled) return;
        if (!tracks.length) return;
        if (!cached || cached.length === 0) {
          setJuzAudioCache((prev) => ({ ...prev, [nextJuz]: tracks }));
        }
        appendQueue(tracks);
        state.lastAppended = nextJuz;
      } catch (err) {
        if (cancelled) return;
        setJuzAudioError((prev) => ({
          ...prev,
          [nextJuz]: (err as Error).message,
        }));
      } finally {
        state.inFlight = false;
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [appendQueue, currentIndex, fetchJuzAudio, juzAudioCache, queue, track]);

  const layoutMasonry = useCallback(() => {
    if (typeof window === "undefined") return;
    const container = masonryRef.current;
    if (!container) return;
    const items = Array.from(
      container.querySelectorAll<HTMLElement>("[data-masonry-item]"),
    );
    if (items.length === 0) {
      container.style.height = "auto";
      return;
    }

    const gap = 24;
    const containerWidth = container.clientWidth;
    const columns = containerWidth > 640 ? 2 : 1;
    const columnWidth = (containerWidth - gap * (columns - 1)) / columns;
    const columnHeights = new Array(columns).fill(0);

    items.forEach((item) => {
      item.style.position = "absolute";
      item.style.width = `${columnWidth}px`;
    });

    items.forEach((item) => {
      let targetColumn = 0;
      for (let i = 1; i < columns; i += 1) {
        if (columnHeights[i] < columnHeights[targetColumn]) {
          targetColumn = i;
        }
      }
      const x = targetColumn * (columnWidth + gap);
      const y = columnHeights[targetColumn];
      item.style.transform = `translate(${x}px, ${y}px)`;
      columnHeights[targetColumn] = y + item.offsetHeight + gap;
    });

    const height = Math.max(...columnHeights) - gap;
    container.style.height = `${Math.max(0, height)}px`;
  }, []);

  useLayoutEffect(() => {
    layoutMasonry();
  }, [layoutMasonry, juzGroups]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleResize = () => layoutMasonry();
    window.addEventListener("resize", handleResize);
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => layoutMasonry())
        : null;
    if (observer) {
      const container = masonryRef.current;
      if (container) {
        observer.observe(container);
        const items = container.querySelectorAll<HTMLElement>(
          "[data-masonry-item]",
        );
        items.forEach((item) => observer.observe(item));
      }
    }
    if (document.fonts?.ready) {
      document.fonts.ready.then(layoutMasonry).catch(() => undefined);
    }
    return () => {
      window.removeEventListener("resize", handleResize);
      observer?.disconnect();
    };
  }, [layoutMasonry, juzGroups]);

  return (
    <div className="py-10">
      <Container>
        <SectionHeader
          title="Murratal Quran"
          subtitle="Dengarkan murattal per surah (MyQuran) atau per juz sesuai rentang ayat (Quran.com)."
        />

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <div className="flex w-full items-center gap-2 rounded-full border border-emerald-100 px-3 py-2 sm:w-auto">
                <Search className="h-4 w-4 text-emerald-600" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Cari surah"
                  className="w-full text-sm outline-none"
                />
              </div>
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                className="w-full rounded-full border border-emerald-100 px-3 py-2 text-sm sm:w-auto"
              >
                <option value="all">Semua</option>
                <option value="makkiyah">Makkiyah</option>
                <option value="madaniyah">Madaniyah</option>
              </select>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value)}
                className="w-full rounded-full border border-emerald-100 px-3 py-2 text-sm sm:w-auto"
              >
                <option value="number">Urut Nomor</option>
                <option value="name">Urut Nama</option>
                <option value="verses">Jumlah Ayat</option>
              </select>
              <button
                type="button"
                onClick={handleRandom}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 sm:w-auto"
              >
                <Shuffle className="h-4 w-4" /> Putar Acak
              </button>
            </div>

            <div className="mt-4">
              {loading ? (
                <LoadingState message="Memuat daftar murratal..." />
              ) : null}
              {error ? <ErrorState message={error} /> : null}
              {!loading && !error && filtered.length === 0 ? (
                <EmptyState message="Surah tidak ditemukan." />
              ) : null}
              {!loading &&
              !error &&
              filtered.length > 0 &&
              juzGroups.length === 0 ? (
                <EmptyState message="Data juz belum tersedia." />
              ) : null}
              {!loading &&
              !error &&
              filtered.length > 0 &&
              juzGroups.length > 0 ? (
                <div ref={masonryRef} className="relative mt-4">
                  {juzGroups.map((group) => (
                    <div
                      key={group.juz}
                      data-masonry-item
                      className="rounded-2xl border border-amber-200 bg-white/95 p-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
                            Juz {group.juz}
                          </span>
                          <span className="text-xs text-textSecondary">
                            {group.startName} - {group.endName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700">
                            {group.items.length} surah
                          </span>
                          <button
                            type="button"
                            onClick={() => handlePlayJuz(group.juz)}
                            disabled={juzAudioLoading === group.juz}
                            className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {juzAudioLoading === group.juz
                              ? "Memuat..."
                              : "Putar Juz"}
                          </button>
                        </div>
                      </div>
                      {juzAudioError[group.juz] ? (
                        <p className="mt-2 text-[11px] text-rose-600">
                          {juzAudioError[group.juz]}
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-textSecondary">
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700">
                          {group.start.surah}:{group.start.ayah} -{" "}
                          {group.end.surah}:{group.end.ayah}
                        </span>
                        <span>Urutan sesuai mushaf.</span>
                      </div>
                      <div className="mt-3 space-y-2 md:space-y-3">
                        {group.items.map((item) => {
                          const audioUrl = audioLookup.get(item.number);
                          const activeSurahNumber =
                            typeof track?.meta?.surahNumber === "number"
                              ? track.meta.surahNumber
                              : null;
                          const activeJuzNumber =
                            typeof track?.meta?.juz === "number"
                              ? track.meta.juz
                              : null;
                          const isPlaying =
                            activeSurahNumber === item.number &&
                            (typeof activeJuzNumber === "number"
                              ? activeJuzNumber === group.juz
                              : firstJuzBySurah.get(item.number) === group.juz);
                          const rangeStart =
                            group.start.surah === item.number
                              ? group.start.ayah
                              : 1;
                          const rangeEnd =
                            group.end.surah === item.number
                              ? group.end.ayah
                              : item.number_of_ayahs;
                          const isPartialRange =
                            rangeStart !== 1 ||
                            rangeEnd !== item.number_of_ayahs;
                          const rangeQuery = isPartialRange
                            ? `?start=${rangeStart}&end=${rangeEnd}`
                            : "";
                          return (
                            <div
                              key={item.number}
                              className={`cv-auto flex flex-col gap-2 rounded-xl border px-3 py-3 text-sm ${
                                isPlaying
                                  ? "border-emerald-300 bg-emerald-50"
                                  : "border-emerald-100 bg-white/80"
                              }`}
                            >
                              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                                <div className="flex min-w-0 items-start gap-2">
                                  <span className="mt-0.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                                    {item.number}
                                  </span>
                                  <div className="min-w-0">
                                    <p className="font-semibold leading-snug text-textPrimary">
                                      {item.name_latin}
                                    </p>
                                    <p className="mt-1 break-words text-[11px] text-textSecondary">
                                      {item.translation} · {item.revelation} ·{" "}
                                      {item.number_of_ayahs} ayat
                                    </p>
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-2 sm:justify-end">
                                  <Link
                                    to={`/quran/${item.number}${rangeQuery}`}
                                    className="w-full rounded-full border border-emerald-200 px-3 py-1.5 text-center text-[11px] font-semibold text-emerald-700 sm:w-auto sm:min-w-[96px]"
                                  >
                                    Buka Surah
                                  </Link>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handlePlay(item, group.items, group.juz)
                                    }
                                    disabled={!audioUrl}
                                    className={`inline-flex w-full items-center justify-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold sm:w-auto sm:min-w-[96px] ${
                                      audioUrl
                                        ? "border-emerald-200 text-emerald-700"
                                        : "border-emerald-100 text-emerald-300"
                                    }`}
                                  >
                                    <Play className="h-4 w-4" />
                                    {isPlaying ? "Sedang Diputar" : "Play"}
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </Card>

          <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            <Card>
              <div className="flex items-center gap-2 text-emerald-700">
                <Headphones className="h-5 w-5" />
                <h3 className="text-sm font-semibold text-textPrimary">
                  Now Playing
                </h3>
              </div>
              {track ? (
                <div className="mt-3 text-sm text-textSecondary">
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-2 sm:p-3">
                    <GlobalAudioPlayer embedded />
                  </div>
                  <button
                    type="button"
                    onClick={() => setTrack(null)}
                    className="mt-4 rounded-full border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700"
                  >
                    Hentikan Audio
                  </button>
                </div>
              ) : (
                <EmptyState message="Pilih surah untuk mulai mendengarkan." />
              )}
            </Card>

            <Card>
              <h3 className="text-sm font-semibold text-textPrimary">
                Informasi Reciter
              </h3>
              <p className="mt-2 text-sm text-textSecondary">
                Nikmati tilawah Al-Qur'an yang jernih dan menenangkan. Anda
                dapat mendengarkan murattal lengkap per surah, atau memutar
                bacaan berdasarkan Juz untuk mengikuti urutan ayat secara
                berurutan dan teratur.
              </p>
            </Card>
          </div>
        </div>
      </Container>
    </div>
  );
};

export default MurratalPage;
