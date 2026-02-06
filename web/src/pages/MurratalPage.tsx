import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Headphones, Play, Shuffle, Search } from "lucide-react";
import Container from "../components/Container";
import SectionHeader from "../components/SectionHeader";
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
} from "../components/State";
import { fetchJsonCached } from "../lib/api";
import { useAudio } from "../lib/audio";
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

const getSurahAudio = (item: SurahItem) =>
  resolveAudioUrl(
    (item as { audio_url?: unknown; audio?: unknown; audioFull?: unknown })
      .audio_url ??
      (item as { audio?: unknown }).audio ??
      (item as { audioFull?: unknown }).audioFull,
  );

const MurratalPage = () => {
  const { track, setQueue, setShuffle, setTrack } = useAudio();
  const [surah, setSurah] = useState<SurahItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("number");

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

  const buildTrack = (item: SurahItem, audioUrl: string) => ({
    title: item.name_latin,
    subtitle: `Surah ${item.number} · ${item.translation}`,
    src: audioUrl,
    sourceLabel: "MyQuran CDN",
    quality: "Default MyQuran",
    format: "MP3",
    module: "murratal",
  });

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

  const handlePlay = (item: SurahItem) => {
    const audioUrl = getSurahAudio(item);
    if (!audioUrl) return;
    const playlist = filteredWithAudio.map((entry) =>
      buildTrack(entry.item, entry.audioUrl),
    );
    const startIndex = filteredWithAudio.findIndex(
      (entry) => entry.audioUrl === audioUrl,
    );
    setShuffle(false);
    setQueue(playlist, startIndex >= 0 ? startIndex : 0);
  };

  const handleRandom = () => {
    if (filteredWithAudio.length === 0) return;
    const playlist = filteredWithAudio.map((entry) =>
      buildTrack(entry.item, entry.audioUrl),
    );
    const randomIndex = Math.floor(Math.random() * playlist.length);
    setShuffle(true);
    setQueue(playlist, randomIndex);
  };

  return (
    <div className="py-10">
      <Container>
        <SectionHeader
          title="Murratal Quran"
          subtitle="Dengarkan murattal per surah dari audio resmi API MyQuran."
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

            <div className="mt-4 space-y-3">
              {loading ? (
                <LoadingState message="Memuat daftar murratal..." />
              ) : null}
              {error ? <ErrorState message={error} /> : null}
              {!loading && !error && filtered.length === 0 ? (
                <EmptyState message="Surah tidak ditemukan." />
              ) : null}
              {filtered.map((item) => {
                const audioUrl = audioLookup.get(item.number);
                const isPlaying = Boolean(audioUrl) && track?.src === audioUrl;
                return (
                  <div
                    key={item.number}
                    className={`cv-auto flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
                      isPlaying
                        ? "border-emerald-300 bg-emerald-50"
                        : "border-emerald-100"
                    }`}
                  >
                    <div>
                      <p className="font-semibold text-textPrimary">
                        {item.name_latin}
                      </p>
                      <p className="text-xs text-textSecondary">
                        {item.translation} · {item.revelation} ·{" "}
                        {item.number_of_ayahs} ayat
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <Link
                        to={`/quran/${item.number}`}
                        className="w-full rounded-full border border-emerald-200 px-3 py-2 text-center text-xs font-semibold text-emerald-700 sm:w-auto"
                      >
                        Buka Surah
                      </Link>
                      <button
                        type="button"
                        onClick={() => handlePlay(item)}
                        disabled={!audioUrl}
                        className={`inline-flex w-full items-center justify-center gap-2 rounded-full px-3 py-2 text-xs font-semibold sm:w-auto ${
                          audioUrl
                            ? "bg-emerald-600 text-white"
                            : "bg-emerald-100 text-emerald-400"
                        }`}
                      >
                        <Play className="h-4 w-4" />
                        {isPlaying ? "Sedang Diputar" : "Play"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="space-y-6">
            <Card>
              <div className="flex items-center gap-2 text-emerald-700">
                <Headphones className="h-5 w-5" />
                <h3 className="text-sm font-semibold text-textPrimary">
                  Now Playing
                </h3>
              </div>
              {track ? (
                <div className="mt-3 text-sm text-textSecondary">
                  <p className="font-semibold text-textPrimary">
                    {track.title}
                  </p>
                  {track.subtitle ? (
                    <p className="text-xs">{track.subtitle}</p>
                  ) : null}
                  <p className="mt-3 text-xs text-textSecondary">
                    Pemutar audio tampil di bagian bawah layar.
                  </p>
                  <button
                    type="button"
                    onClick={() => setTrack(null)}
                    className="mt-3 rounded-full border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700"
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
                Audio murattal diambil langsung dari API MyQuran dengan reciter
                default. Saat menekan play, aplikasi membentuk antrian surah
                sesuai daftar yang sedang ditampilkan.
              </p>
            </Card>
          </div>
        </div>
      </Container>
    </div>
  );
};

export default MurratalPage;
