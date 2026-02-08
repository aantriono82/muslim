import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Container from "../components/Container";
import SectionHeader from "../components/SectionHeader";
import { ErrorState, LoadingState } from "../components/State";
import { fetchJson } from "../lib/api";
import { toArabicNumber } from "../lib/arabic";
import type { AyahItem } from "../lib/types";

const AyahDetailPage = () => {
  const { surahId, ayahId } = useParams();
  const [data, setData] = useState<AyahItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!surahId || !ayahId) return;
    setLoading(true);
    setError(null);

    fetchJson<AyahItem>(`/quran/${surahId}/${ayahId}`)
      .then((res) => setData(res.data ?? null))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [surahId, ayahId]);

  return (
    <div className="py-10">
      <Container>
        <Link
          to={`/quran/${surahId}`}
          className="inline-flex items-center gap-2 text-sm text-emerald-700"
        >
          <ArrowLeft className="h-4 w-4" /> Kembali ke surah
        </Link>
        <SectionHeader title={`Detail Ayat ${ayahId}`} />
        <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
          Untuk mendengar bacaan ayat, buka halaman{" "}
          <Link to="/murratal" className="font-semibold underline">
            Murratal
          </Link>
          .
        </div>

        {loading ? <LoadingState message="Memuat ayat..." /> : null}
        {error ? <ErrorState message={error} /> : null}

        {data ? (
          <div className="mushaf-shell mt-6">
            <div className="mushaf-header">
              <div className="mushaf-mosaic" />
              <div className="mushaf-ornament-bottom" />
              <div className="mushaf-ornament-side left" />
              <div className="mushaf-ornament-side right" />
              <div className="mushaf-header-content space-y-3">
                <div className="mushaf-title">
                  <span>Surah {data.surah_number}</span>
                  <span className="font-arabic text-base sm:text-lg">
                    Ayat {data.ayah_number}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-4 px-4 pb-6 pt-5">
              <div className="mushaf-ayah">
                <div className="flex items-start gap-4">
                  <div className="mushaf-ayah-number">
                    {toArabicNumber(data.ayah_number)}
                  </div>
                  <div className="flex-1">
                    <p className="font-arabic text-xl leading-relaxed text-right text-textPrimary sm:text-2xl">
                      {data.arab}
                    </p>
                    <p className="mt-2 text-sm text-textSecondary">
                      {data.translation}
                    </p>
                    {data.tafsir?.kemenag?.short ? (
                      <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-textSecondary">
                        <p className="font-semibold text-textPrimary">
                          Tafsir Singkat
                        </p>
                        <p className="mt-1">{data.tafsir.kemenag.short}</p>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </Container>
    </div>
  );
};

export default AyahDetailPage;
