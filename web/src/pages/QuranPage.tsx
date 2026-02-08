import { useEffect, useMemo, useState } from "react";
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
import { fetchJson, fetchJsonCached, postJson } from "../lib/api";
import { useDebouncedValue } from "../lib/hooks";
import type { SearchHit, SurahItem, AyahItem } from "../lib/types";

const QuranPage = () => {
  const [surah, setSurah] = useState<SurahItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("number");
  const [query, setQuery] = useState("");

  const [searchKeyword, setSearchKeyword] = useState("");
  const debouncedSearch = useDebouncedValue(searchKeyword, 300);
  const [searchResults, setSearchResults] = useState<SearchHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [exploreType, setExploreType] = useState("juz");
  const [exploreNumber, setExploreNumber] = useState("1");
  const [exploreResults, setExploreResults] = useState<AyahItem[]>([]);
  const [exploreLoading, setExploreLoading] = useState(false);
  const [exploreError, setExploreError] = useState<string | null>(null);

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
    setSearchLoading(true);
    setSearchError(null);

    postJson<SearchHit[]>("/quran/search", {
      keyword: debouncedSearch,
      limit: 10,
    })
      .then((res) => {
        if (!active) return;
        setSearchResults(res.data ?? []);
      })
      .catch((err: Error) => {
        if (!active) return;
        setSearchError(err.message);
      })
      .finally(() => {
        if (!active) return;
        setSearchLoading(false);
      });

    return () => {
      active = false;
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

  const handleExplore = async () => {
    setExploreLoading(true);
    setExploreError(null);
    try {
      const res = await fetchJson<AyahItem[]>(
        `/quran/${exploreType}/${exploreNumber}`,
      );
      setExploreResults(res.data ?? []);
    } catch (err) {
      setExploreError((err as Error).message);
    } finally {
      setExploreLoading(false);
    }
  };

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
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
            </div>

            <div className="mt-4 space-y-3">
              {loading ? (
                <LoadingState message="Memuat daftar surah..." />
              ) : null}
              {error ? <ErrorState message={error} /> : null}
              {!loading && !error && filtered.length === 0 ? (
                <EmptyState message="Surah tidak ditemukan." />
              ) : null}
              {filtered.map((item) => (
                <Link
                  key={item.number}
                  to={`/quran/${item.number}`}
                  className="cv-auto flex items-center justify-between rounded-xl border border-emerald-100 px-4 py-3 text-sm hover:bg-emerald-50"
                >
                  <div>
                    <p className="font-semibold text-textPrimary">
                      {item.name_latin}
                    </p>
                    <p className="text-xs text-textSecondary">
                      {item.translation} · {item.revelation}
                    </p>
                  </div>
                  <span className="text-xs text-emerald-700">
                    {item.number}
                  </span>
                </Link>
              ))}
            </div>
          </Card>

          <div className="space-y-6">
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
                  <div className="max-h-64 space-y-2 overflow-auto pr-2 scrollbar-slim">
                    {exploreResults.slice(0, 10).map((item) => (
                      <div
                        key={item.id}
                        className="rounded-lg border border-emerald-100 px-3 py-2"
                      >
                        <p className="text-xs text-textSecondary">
                          {item.surah_number}:{item.ayah_number}
                        </p>
                        <p className="mt-1 text-xs text-textSecondary">
                          {item.translation}
                        </p>
                      </div>
                    ))}
                  </div>
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
