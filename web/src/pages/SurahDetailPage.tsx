import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, PlayCircle } from "lucide-react";
import Container from "../components/Container";
import SectionHeader from "../components/SectionHeader";
import { Card, ErrorState, LoadingState } from "../components/State";
import { fetchJson, fetchJsonCached } from "../lib/api";
import { useAudio } from "../lib/audio";
import { toArabicNumber } from "../lib/arabic";
import type { SurahDetail, SurahItem } from "../lib/types";

const PAGE_LIMIT = 20;

const SurahDetailPage = () => {
  const { surahId } = useParams();
  const [data, setData] = useState<SurahDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState<number | null>(null);
  const [surahList, setSurahList] = useState<SurahItem[]>([]);
  const { setTrack } = useAudio();

  useEffect(() => {
    setPage(1);
    setData(null);
    setTotal(null);
  }, [surahId]);

  useEffect(() => {
    if (!surahId) return;
    let active = true;
    setLoading(true);
    setError(null);

    fetchJson<SurahDetail>(`/quran/${surahId}?page=${page}&limit=${PAGE_LIMIT}`)
      .then((res) => {
        if (!active) return;
        const incoming = res.data ?? null;
        if (!incoming) return;
        setTotal(res.pagination?.total ?? null);
        if (page === 1) {
          setData(incoming);
        } else {
          setData((prev) =>
            prev
              ? {
                  ...incoming,
                  ayahs: [...(prev.ayahs ?? []), ...(incoming.ayahs ?? [])],
                }
              : incoming,
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
  }, [surahId, page]);

  useEffect(() => {
    fetchJsonCached<SurahItem[]>("/quran", {
      ttl: 12 * 60 * 60,
      key: "quran-list",
      staleIfError: true,
    })
      .then((res) => setSurahList(res.data ?? []))
      .catch(() => undefined);
  }, []);

  const handleLoadMore = () => {
    setPage((prev) => prev + 1);
  };

  const hasMore = total ? (data?.ayahs?.length ?? 0) < total : false;

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
              {data?.ayahs.map((ayah) => (
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
                        {ayah.audio_url ? (
                          <button
                            type="button"
                            onClick={() =>
                              setTrack({
                                title: `${meta.name_latin} · Ayat ${ayah.ayah_number}`,
                                subtitle: meta.translation,
                                src: ayah.audio_url ?? "",
                                module: "quran",
                              })
                            }
                            className="rounded-full border border-emerald-200 px-3 py-2 font-semibold"
                          >
                            Putar di Player
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {hasMore ? (
                <button
                  type="button"
                  onClick={handleLoadMore}
                  className="w-full rounded-full border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-700"
                >
                  Muat lebih banyak ayat
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </Container>
    </div>
  );
};

export default SurahDetailPage;
