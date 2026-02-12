import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Container from "../components/Container";
import SectionHeader from "../components/SectionHeader";
import { ErrorState, LoadingState } from "../components/State";
import { fetchJson, fetchJsonCached } from "../lib/api";
import { toArabicNumber } from "../lib/arabic";
import { fetchAsbabMapForAyahs } from "../lib/muslimApi";
import type { SurahDetail, SurahItem } from "../lib/types";

const PAGE_LIMIT = 20;

const SurahDetailPage = () => {
  const { surahId } = useParams();
  const location = useLocation();
  const [data, setData] = useState<SurahDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState<number | null>(null);
  const [surahList, setSurahList] = useState<SurahItem[]>([]);
  const [asbabLookup, setAsbabLookup] = useState<
    Record<string, { id: string; text: string; ayah?: string }>
  >({});
  const [asbabModal, setAsbabModal] = useState<{
    ayah: string;
    text: string;
  } | null>(null);
  const asbabCloseRef = useRef<HTMLButtonElement | null>(null);

  const range = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const start = Number(params.get("start"));
    const end = Number(params.get("end"));
    if (!Number.isFinite(start) || start <= 0) return null;
    if (!Number.isFinite(end) || end <= 0) return null;
    if (end < start) return null;
    return { start, end };
  }, [location.search]);

  const startPage = useMemo(() => {
    const start = range?.start ?? 1;
    return Math.max(1, Math.floor((start - 1) / PAGE_LIMIT) + 1);
  }, [range?.start]);

  useEffect(() => {
    setPage(startPage);
    setData(null);
    setTotal(null);
    setAsbabLookup({});
    setAsbabModal(null);
  }, [surahId, startPage, range?.end]);

  useEffect(() => {
    if (!surahId) return;
    if (range && page < startPage) return;
    let active = true;
    setLoading(true);
    setError(null);

    fetchJson<SurahDetail>(`/quran/${surahId}?page=${page}&limit=${PAGE_LIMIT}`)
      .then((res) => {
        if (!active) return;
        const incoming = res.data ?? null;
        if (!incoming) return;
        setTotal(res.pagination?.total ?? null);
        const filteredAyahs = range
          ? (incoming.ayahs ?? []).filter(
              (ayah) =>
                ayah.ayah_number >= range.start &&
                ayah.ayah_number <= range.end,
            )
          : (incoming.ayahs ?? []);
        if (page === startPage) {
          setData({ ...incoming, ayahs: filteredAyahs });
        } else {
          setData((prev) =>
            prev
              ? {
                  ...incoming,
                  ayahs: [...(prev.ayahs ?? []), ...filteredAyahs],
                }
              : { ...incoming, ayahs: filteredAyahs },
          );
        }
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [surahId, page, range, startPage]);

  useEffect(() => {
    fetchJsonCached<SurahItem[]>("/quran", {
      ttl: 12 * 60 * 60,
      key: "quran-list",
      staleIfError: true,
    })
      .then((res) => setSurahList(res.data ?? []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!asbabModal) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAsbabModal(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [asbabModal]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (asbabModal) {
      document.body.style.overflow = "hidden";
      if (asbabCloseRef.current) {
        asbabCloseRef.current.focus();
      }
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [asbabModal]);

  useEffect(() => {
    if (!data?.ayahs?.length) return;
    let active = true;
    const ids = data.ayahs.map((ayah) => ayah.id);

    const loadAsbab = async () => {
      try {
        const lookup = await fetchAsbabMapForAyahs(ids);
        if (!active) return;
        if (Object.keys(lookup).length === 0) return;
        setAsbabLookup((prev) => ({ ...prev, ...lookup }));
      } catch {
        // ignore asbab lookup errors
      }
    };

    loadAsbab();
    return () => {
      active = false;
    };
  }, [data?.ayahs]);

  const handleLoadMore = () => {
    if (loading || !hasMore) return;
    setPage((prev) => prev + 1);
  };

  const lastAyahNumber = data?.ayahs?.[data.ayahs.length - 1]?.ayah_number ?? 0;
  const totalAyahCount = total ?? data?.number_of_ayahs ?? null;
  const targetLastAyah = range
    ? Math.min(range.end, totalAyahCount ?? range.end)
    : totalAyahCount;
  const hasMoreByAyah = targetLastAyah
    ? lastAyahNumber < targetLastAyah
    : false;
  const hasMoreByPage = totalAyahCount
    ? page * PAGE_LIMIT < totalAyahCount
    : true;
  const hasMore =
    Boolean(data?.ayahs?.length) && hasMoreByAyah && hasMoreByPage;

  const currentNumber = Number(surahId);
  const meta = useMemo(
    () =>
      surahList.find((item) => item.number === currentNumber) ??
      (data
        ? {
            number: data.number,
            name: data.name,
            name_latin: data.name_latin,
            number_of_ayahs: data.number_of_ayahs,
            translation: data.translation,
            revelation: data.revelation,
            description: data.description,
            audio_url: data.audio_url,
          }
        : null),
    [surahList, currentNumber, data],
  );
  const prevMeta = surahList.find((item) => item.number === currentNumber - 1);
  const nextMeta = surahList.find((item) => item.number === currentNumber + 1);
  const showBismillah =
    meta && meta.number !== 1 && meta.number !== 9 && Boolean(data?.ayahs);

  return (
    <div className="py-10">
      <Container>
        <Link
          to="/quran"
          className="inline-flex items-center gap-2 text-sm text-emerald-700"
        >
          <ArrowLeft className="h-4 w-4" /> Kembali ke daftar surah
        </Link>

        <SectionHeader
          title={meta ? `${meta.name_latin} (${meta.name})` : "Detail Surah"}
          subtitle={
            meta ? `${meta.translation} · ${meta.revelation}` : undefined
          }
        />

        <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
          Untuk mendengar bacaan surah, buka halaman{" "}
          <Link to="/murratal" className="font-semibold underline">
            Murratal
          </Link>
          .
        </div>

        {loading && !data ? <LoadingState message="Memuat surah..." /> : null}
        {error ? <ErrorState message={error} /> : null}

        {meta ? (
          <div className="mushaf-shell mt-6">
            <div className="mushaf-topbar">
              {prevMeta ? (
                <Link to={`/quran/${prevMeta.number}`} className="mushaf-tab">
                  {prevMeta.number}. {prevMeta.name_latin}
                </Link>
              ) : (
                <div className="mushaf-tab opacity-60">—</div>
              )}
              <div className="mushaf-tab mushaf-tab-active">
                {meta.number}. {meta.name_latin}
              </div>
              {nextMeta ? (
                <Link to={`/quran/${nextMeta.number}`} className="mushaf-tab">
                  {nextMeta.number}. {nextMeta.name_latin}
                </Link>
              ) : (
                <div className="mushaf-tab opacity-60">—</div>
              )}
            </div>

            <div className="mushaf-header">
              <div className="mushaf-mosaic" />
              <div className="mushaf-ornament-bottom" />
              <div className="mushaf-ornament-side left" />
              <div className="mushaf-ornament-side right" />
              <div className="mushaf-header-content space-y-3">
                <div className="mushaf-title">
                  <span>{meta.name_latin}</span>
                  <span className="font-arabic text-base sm:text-lg">
                    {meta.name}
                  </span>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  <span className="mushaf-chip">{meta.revelation}</span>
                  <span className="mushaf-chip">{meta.translation}</span>
                  <span className="mushaf-chip">
                    {meta.number_of_ayahs} ayat
                  </span>
                </div>
                {showBismillah ? (
                  <div className="mushaf-bismillah">
                    بِسْمِ ٱللَّٰهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
                  </div>
                ) : null}
              </div>
            </div>

            <div className="space-y-4 px-4 pb-6 pt-5">
              {range ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
                  Menampilkan ayat {range.start}&ndash;{range.end}.
                </div>
              ) : null}
              {data?.ayahs.map((ayah) => {
                const ayahKey = ayah.id.toString();
                const asbabEntry = asbabLookup[ayahKey];
                return (
                  <div key={ayah.id} className="mushaf-ayah cv-auto">
                    <div className="flex items-start gap-4">
                      <div className="mushaf-ayah-number">
                        {toArabicNumber(ayah.ayah_number)}
                      </div>
                      <div className="flex-1">
                        <p className="font-arabic text-xl leading-relaxed text-right text-textPrimary sm:text-2xl">
                          {ayah.arab}
                        </p>
                        <p className="mt-2 text-sm text-textSecondary">
                          {ayah.translation}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-emerald-700">
                          <Link
                            to={`/quran/${ayah.surah_number}/${ayah.ayah_number}`}
                            className="rounded-full border border-emerald-200 px-3 py-2 font-semibold"
                          >
                            Detail Ayat
                          </Link>
                          <button
                            type="button"
                            onClick={() =>
                              setAsbabModal({
                                ayah: ayah.ayah_number.toString(),
                                text:
                                  asbabEntry?.text ??
                                  "Asbabun Nuzul belum tersedia untuk ayat ini.",
                              })
                            }
                            aria-haspopup="dialog"
                            className={`rounded-full border px-3 py-2 text-[11px] font-semibold ${
                              asbabEntry
                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                : "border-emerald-200 bg-white text-emerald-700"
                            }`}
                          >
                            Asbabun Nuzul
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {hasMore ? (
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loading || !hasMore}
                  className="w-full rounded-full border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Muat lebih banyak ayat
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {asbabModal ? (
          <div
            className="asbab-modal-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="Asbabun Nuzul"
            onClick={() => setAsbabModal(null)}
          >
            <div
              className="asbab-modal"
              role="document"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="asbab-modal-header">
                <div>
                  <p className="asbab-modal-title">Asbabun Nuzul</p>
                  <p className="asbab-modal-subtitle">
                    {meta ? meta.name_latin : "Surah"} · Ayat {asbabModal.ayah}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAsbabModal(null)}
                  className="asbab-modal-close"
                  ref={asbabCloseRef}
                >
                  Tutup
                </button>
              </div>
              <div className="asbab-modal-body">
                <p>{asbabModal.text}</p>
              </div>
            </div>
          </div>
        ) : null}
      </Container>
    </div>
  );
};

export default SurahDetailPage;
