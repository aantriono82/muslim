import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import Container from "../components/Container";
import SectionHeader from "../components/SectionHeader";
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
} from "../components/State";
import { ApiError, fetchJson, fetchJsonCached, postJson } from "../lib/api";
import { useDebouncedValue } from "../lib/hooks";
import type { SearchHit, SurahItem, AyahItem } from "../lib/types";

const parsePositiveInteger = (value: string) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const QuranPage = () => {
  const [surah, setSurah] = useState<SurahItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("number");
  const [query, setQuery] = useState("");
  const [listMode, setListMode] = useState<"surah" | "juz">("juz");

  const [searchKeyword, setSearchKeyword] = useState("");
  const debouncedSearch = useDebouncedValue(searchKeyword, 300);
  const [searchResults, setSearchResults] = useState<SearchHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [exploreType, setExploreType] = useState("juz");
  const [exploreNumber, setExploreNumber] = useState("1");
  const [exploreSource, setExploreSource] = useState("myquran");
  const [exploreResults, setExploreResults] = useState<AyahItem[]>([]);
  const [exploreLoading, setExploreLoading] = useState(false);
  const [exploreError, setExploreError] = useState<string | null>(null);
  const [explorePage, setExplorePage] = useState(1);
  const [explorePageSize, setExplorePageSize] = useState(20);
  const exploreRequestRef = useRef(0);
  const exploreAbortRef = useRef<AbortController | null>(null);

  const surahMap = useMemo(() => {
    const map = new Map<number, SurahItem>();
    surah.forEach((item) => map.set(item.number, item));
    return map;
  }, [surah]);

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

  useEffect(() => {
    if (!debouncedSearch || debouncedSearch.length < 3) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }

    let active = true;
    const controller = new AbortController();
    setSearchLoading(true);
    setSearchError(null);

    postJson<SearchHit[]>(
      "/quran/search",
      {
        keyword: debouncedSearch,
        limit: 10,
      },
      {
        signal: controller.signal,
      },
    )
      .then((res) => {
        if (!active) return;
        setSearchResults(res.data ?? []);
      })
      .catch((err: unknown) => {
        if (!active || (err instanceof ApiError && err.code === "aborted")) {
          return;
        }
        setSearchError(
          err instanceof Error ? err.message : "Gagal mencari ayat.",
        );
      })
      .finally(() => {
        if (!active) return;
        setSearchLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [debouncedSearch]);

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

  useEffect(
    () => () => {
      exploreAbortRef.current?.abort();
      exploreAbortRef.current = null;
    },
    [],
  );

  const runExplore = async (type: string, number: string) => {
    setExploreType(type);
    setExploreNumber(number);
    const parsedNumber = parsePositiveInteger(number);
    if (!parsedNumber) {
      setExploreLoading(false);
      setExploreResults([]);
      setExplorePage(1);
      setExploreError("Nomor harus bilangan bulat positif.");
      return;
    }

    exploreAbortRef.current?.abort();
    const controller = new AbortController();
    exploreAbortRef.current = controller;
    const requestId = exploreRequestRef.current + 1;
    exploreRequestRef.current = requestId;
    setExploreLoading(true);
    setExploreError(null);
    setExploreResults([]);
    setExplorePage(1);

    try {
      const params = new URLSearchParams();
      if (exploreSource && exploreSource !== "alquran") {
        params.set("source", exploreSource);
      }
      const query = params.toString();
      const path = query
        ? `/quran/${type}/${parsedNumber}?${query}`
        : `/quran/${type}/${parsedNumber}`;
      const res = await fetchJson<AyahItem[]>(path, {
        signal: controller.signal,
      });
      if (requestId !== exploreRequestRef.current) return;
      setExploreResults(res.data ?? []);
    } catch (err: unknown) {
      if (
        requestId !== exploreRequestRef.current ||
        (err instanceof ApiError && err.code === "aborted")
      ) {
        return;
      }
      setExploreError(
        err instanceof Error ? err.message : "Gagal memuat data ayat.",
      );
    } finally {
      if (requestId !== exploreRequestRef.current) return;
      setExploreLoading(false);
    }
  };

  const handleExplore = async () => {
    await runExplore(exploreType, exploreNumber);
  };

  const totalExplorePages = useMemo(() => {
    if (!exploreResults.length) return 1;
    return Math.max(1, Math.ceil(exploreResults.length / explorePageSize));
  }, [exploreResults.length, explorePageSize]);

  useEffect(() => {
    if (explorePage > totalExplorePages) {
      setExplorePage(totalExplorePages);
    }
  }, [explorePage, totalExplorePages]);

  const pagedExploreResults = useMemo(() => {
    const start = (explorePage - 1) * explorePageSize;
    const end = start + explorePageSize;
    return exploreResults.slice(start, end);
  }, [explorePage, explorePageSize, exploreResults]);

  const groupedExploreResults = useMemo(() => {
    const groups: { surahNumber: number; items: AyahItem[] }[] = [];
    let currentSurah: number | null = null;
    let bucket: AyahItem[] = [];

    pagedExploreResults.forEach((item) => {
      if (currentSurah === null || item.surah_number !== currentSurah) {
        if (bucket.length) {
          groups.push({ surahNumber: currentSurah ?? 0, items: bucket });
        }
        currentSurah = item.surah_number;
        bucket = [item];
      } else {
        bucket.push(item);
      }
    });

    if (bucket.length) {
      groups.push({ surahNumber: currentSurah ?? 0, items: bucket });
    }

    return groups;
  }, [pagedExploreResults]);

  return (
    <div className="py-10">
      <Container>
        <SectionHeader
          title="Al-Qur'an"
          subtitle="Fokus membaca Al-Qur'an dan pencarian ayat."
        />

        <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
          Untuk mendengar bacaan, gunakan halaman{" "}
          <Link to="/murratal" className="font-semibold underline">
            Murratal
          </Link>
          .
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-full border border-emerald-100 bg-white p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setListMode("surah")}
                  className={`rounded-full px-3 py-1 ${listMode === "surah"
                    ? "bg-emerald-600 text-white"
                    : "text-emerald-700"
                    }`}
                >
                  Surah
                </button>
                <button
                  type="button"
                  onClick={() => setListMode("juz")}
                  className={`rounded-full px-3 py-1 ${listMode === "juz"
                    ? "bg-emerald-600 text-white"
                    : "text-emerald-700"
                    }`}
                >
                  Juz
                </button>
              </div>

              {listMode === "surah" ? (
                <>
                  <div className="flex w-full items-center gap-2 rounded-full border border-emerald-100 px-3 py-2 sm:w-auto">
                    <Search className="h-4 w-4 text-emerald-600" />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Cari nama surah"
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
                </>
              ) : null}
            </div>

            <div className="mt-3 space-y-2">
              {listMode === "surah" ? (
                <>
                  {loading ? (
                    <LoadingState message="Memuat daftar surah..." />
                  ) : null}
                  {error ? <ErrorState message={error} /> : null}
                  {!loading && !error && filtered.length === 0 ? (
                    <EmptyState message="Surah tidak ditemukan." />
                  ) : null}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {filtered.map((item) => (
                      <Link
                        key={item.number}
                        to={`/quran/${item.number}`}
                        className="cv-auto flex items-center justify-between gap-3 rounded-xl border border-emerald-100 px-3 py-2 text-xs hover:bg-emerald-50"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-textPrimary">
                            {item.name_latin}
                          </p>
                          <p className="text-[11px] text-textSecondary">
                            {item.translation} · {item.revelation}
                          </p>
                        </div>
                        <span className="shrink-0 text-[11px] text-emerald-700">
                          {item.number}
                        </span>
                      </Link>
                    ))}
                  </div>
                </>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {Array.from({ length: 30 }, (_, idx) => {
                    const juzNumber = idx + 1;
                    const isActive =
                      exploreType === "juz" &&
                      Number(exploreNumber) === juzNumber;
                    return (
                      <button
                        key={juzNumber}
                        type="button"
                        onClick={() => runExplore("juz", String(juzNumber))}
                        className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-xs transition ${isActive
                          ? "border-emerald-300 bg-emerald-50"
                          : "border-emerald-100 hover:border-emerald-200 hover:bg-emerald-50"
                          }`}
                      >
                        <div>
                          <p className="text-sm font-semibold text-textPrimary">
                            Juz {juzNumber}
                          </p>
                          <p className="text-[11px] text-textSecondary">
                            Klik untuk tampilkan ayat
                          </p>
                        </div>
                        <span className="shrink-0 text-[11px] text-emerald-700">
                          {juzNumber}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>

          <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            <Card>
              <h3 className="text-sm font-semibold text-textPrimary">
                Pencarian Ayat
              </h3>
              <div className="mt-3 flex w-full items-center gap-2 rounded-full border border-emerald-100 px-3 py-2">
                <Search className="h-4 w-4 text-emerald-600" />
                <input
                  value={searchKeyword}
                  onChange={(event) => setSearchKeyword(event.target.value)}
                  placeholder="Masukkan keyword minimal 3 huruf"
                  className="w-full text-sm outline-none"
                />
              </div>
              <div className="mt-3 space-y-2">
                {searchLoading ? (
                  <LoadingState message="Mencari ayat..." />
                ) : null}
                {searchError ? <ErrorState message={searchError} /> : null}
                {!searchLoading &&
                  !searchError &&
                  debouncedSearch.length >= 3 &&
                  searchResults.length === 0 ? (
                  <EmptyState message="Ayat tidak ditemukan." />
                ) : null}
                {searchResults.map((hit) => (
                  <Link
                    key={hit.id}
                    to={`/quran/${hit.surah_number}/${hit.ayah_number}`}
                    className="cv-auto block rounded-xl border border-emerald-100 px-4 py-3 text-sm hover:bg-emerald-50"
                  >
                    <p className="font-semibold text-textPrimary">
                      {hit.surah?.name_latin ?? `Surah ${hit.surah_number}`} ·
                      Ayat {hit.ayah_number}
                    </p>
                    <p className="mt-1 text-xs text-textSecondary">
                      {hit.translation}
                    </p>
                  </Link>
                ))}
              </div>
            </Card>

            <Card>
              <h3 className="text-sm font-semibold text-textPrimary">
                Navigasi Juz/Page/Manzil/Ruku/Hizb
              </h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <select
                  value={exploreType}
                  onChange={(event) => setExploreType(event.target.value)}
                  className="rounded-lg border border-emerald-100 px-3 py-2 text-sm"
                >
                  <option value="juz">Juz</option>
                  <option value="page">Page</option>
                  <option value="manzil">Manzil</option>
                  <option value="ruku">Ruku</option>
                  <option value="hizb">Hizb</option>
                </select>
                <input
                  value={exploreNumber}
                  onChange={(event) => setExploreNumber(event.target.value)}
                  type="number"
                  min="1"
                  className="rounded-lg border border-emerald-100 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={handleExplore}
                className="mt-3 w-full rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"
              >
                Tampilkan Ayat
              </button>
              <div className="mt-3 space-y-2">
                {exploreLoading ? (
                  <LoadingState message="Memuat ayat..." />
                ) : null}
                {exploreError ? <ErrorState message={exploreError} /> : null}
                {exploreResults.length > 0 ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-textSecondary">
                      <span>Total ayat: {exploreResults.length}</span>
                      <div className="flex items-center gap-2">
                        <span>Per halaman</span>
                        <select
                          value={explorePageSize}
                          onChange={(event) => {
                            setExplorePageSize(
                              Number.parseInt(event.target.value, 10),
                            );
                            setExplorePage(1);
                          }}
                          className="rounded-md border border-emerald-100 px-2 py-1 text-xs"
                        >
                          <option value="10">10</option>
                          <option value="20">20</option>
                          <option value="30">30</option>
                          <option value="50">50</option>
                        </select>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-textSecondary">
                      <button
                        type="button"
                        onClick={() =>
                          setExplorePage((current) => Math.max(1, current - 1))
                        }
                        disabled={explorePage <= 1}
                        className="rounded-md border border-emerald-100 px-2 py-1 disabled:opacity-50"
                      >
                        Sebelumnya
                      </button>
                      <span>
                        Halaman {explorePage} dari {totalExplorePages}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setExplorePage((current) =>
                            Math.min(totalExplorePages, current + 1),
                          )
                        }
                        disabled={explorePage >= totalExplorePages}
                        className="rounded-md border border-emerald-100 px-2 py-1 disabled:opacity-50"
                      >
                        Berikutnya
                      </button>
                    </div>
                    <div className="mt-3 max-h-[28rem] space-y-3 overflow-auto pr-2 scrollbar-slim">
                      {groupedExploreResults.map((group) => {
                        const surahInfo = surahMap.get(group.surahNumber);
                        return (
                          <div key={group.surahNumber} className="space-y-2">
                            <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
                              <span
                                className="min-w-0 truncate"
                                title={
                                  surahInfo?.name_latin ??
                                  `Surah ${group.surahNumber}`
                                }
                              >
                                {surahInfo?.name_latin ??
                                  `Surah ${group.surahNumber}`}
                              </span>
                              <span className="shrink-0 rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                {group.surahNumber}
                              </span>
                            </div>
                            {group.items.map((item) => (
                              <Link
                                key={item.id}
                                to={`/quran/${item.surah_number}/${item.ayah_number}`}
                                className="block rounded-lg border border-emerald-100 px-3 py-2 transition hover:border-emerald-200 hover:bg-emerald-50"
                              >
                                <p className="text-xs text-textSecondary">
                                  Ayat {item.ayah_number}
                                </p>
                                <p className="mt-1 text-lg leading-relaxed text-right text-emerald-900 font-arabic">
                                  {item.arab}
                                </p>
                                <p className="mt-1 text-xs text-textSecondary">
                                  {item.translation}
                                </p>
                              </Link>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : null}
              </div>
            </Card>
          </div>
        </div>
      </Container>
    </div>
  );
};

export default QuranPage;
