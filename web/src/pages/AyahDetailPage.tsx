import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Container from "../components/Container";
import SectionHeader from "../components/SectionHeader";
import { Card, ErrorState, LoadingState } from "../components/State";
import { ApiError, fetchJson } from "../lib/api";
import { toArabicNumber } from "../lib/arabic";
import { fetchAsbabByAyahId, fetchMuslimAyah } from "../lib/muslimApi";
import type { AyahItem } from "../lib/types";

const ASBAB_EMPTY_TEXT = "Asbabun Nuzul belum tersedia untuk ayat ini.";

const AyahDetailPage = () => {
  const { surahId, ayahId } = useParams();
  const [data, setData] = useState<AyahItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [asbabText, setAsbabText] = useState<string | null>(null);

  useEffect(() => {
    if (!surahId || !ayahId) {
      setLoading(false);
      setData(null);
      setAsbabText(null);
      setError("Parameter ayat tidak valid.");
      return;
    }
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);
    setAsbabText(null);

    fetchJson<AyahItem>(`/quran/${surahId}/${ayahId}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!active) return;
        setData(res.data ?? null);
      })
      .catch((err: unknown) => {
        if (!active || (err instanceof ApiError && err.code === "aborted")) {
          return;
        }
        setError(err instanceof Error ? err.message : "Gagal memuat ayat.");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [surahId, ayahId]);

  useEffect(() => {
    if (!surahId || !ayahId) return;
    let active = true;

    const loadAsbab = async () => {
      setAsbabText(null);

      try {
        const ayah = await fetchMuslimAyah(surahId, ayahId);
        if (!active) return;
        const globalId = ayah?.id?.toString().trim();
        if (!globalId) return;
        const entry = await fetchAsbabByAyahId(globalId);
        if (!active) return;
        const text = entry?.text?.toString().trim() ?? "";
        if (text) setAsbabText(text);
      } catch {
        // ignore asbab fetch errors
      }
    };

    loadAsbab();
    return () => {
      active = false;
    };
  }, [surahId, ayahId]);

  const asbabNuzul = asbabText?.trim() || null;
  const asbabContent = asbabNuzul ?? ASBAB_EMPTY_TEXT;

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
          <div className="ayah-detail-layout mt-6 grid items-stretch gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="mushaf-shell">
              <div className="mushaf-page mushaf-page-scan">
                <div
                  className="mushaf-crown mushaf-crown-top"
                  aria-hidden="true"
                />
                <div
                  className="mushaf-crown mushaf-crown-bottom"
                  aria-hidden="true"
                />
                <div
                  className="mushaf-rosette mushaf-rosette-left"
                  aria-hidden="true"
                />
                <div
                  className="mushaf-rosette mushaf-rosette-right"
                  aria-hidden="true"
                />
                <div
                  className="mushaf-corner-flourish mushaf-corner-flourish-tl"
                  aria-hidden="true"
                />
                <div
                  className="mushaf-corner-flourish mushaf-corner-flourish-tr"
                  aria-hidden="true"
                />
                <div
                  className="mushaf-corner-flourish mushaf-corner-flourish-bl"
                  aria-hidden="true"
                />
                <div
                  className="mushaf-corner-flourish mushaf-corner-flourish-br"
                  aria-hidden="true"
                />
                <div className="mushaf-page-inner">
                  <div className="mushaf-floral-frame" aria-hidden="true">
                    <span className="mushaf-floral-top" />
                    <span className="mushaf-floral-bottom" />
                    <span className="mushaf-floral-side left" />
                    <span className="mushaf-floral-side right" />
                  </div>
                  <div className="mushaf-header">
                    <div className="mushaf-mosaic" />
                    <div className="mushaf-ornament-top" />
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

                  <div className="mushaf-body space-y-4 px-4 pb-6 pt-5">
                    <div className="mushaf-reading-sheet">
                      <p className="mushaf-reading-text" dir="rtl">
                        {data.arab}{" "}
                        <span className="mushaf-ayah-number-inline" dir="ltr">
                          {toArabicNumber(data.ayah_number)}
                        </span>
                      </p>
                    </div>

                    <div className="mushaf-ayah">
                      <div className="flex items-start gap-3">
                        <div className="mushaf-ayah-number">
                          {toArabicNumber(data.ayah_number)}
                        </div>
                        <div className="flex-1">
                          <p className="ayah-detail-translation text-sm leading-relaxed text-textSecondary">
                            {data.translation}
                          </p>
                          {data.tafsir?.kemenag?.short ? (
                            <div className="mushaf-tafsir ayah-detail-tafsir">
                              <p className="mushaf-tafsir-title ayah-detail-tafsir-title">
                                Tafsir Singkat
                              </p>
                              <p className="mt-1">
                                {data.tafsir.kemenag.short}
                              </p>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mushaf-side-tag" aria-hidden="true">
                    <span>وقف</span>
                    <small>١٥</small>
                  </div>
                </div>
              </div>
            </div>

            <Card className="ayah-detail-asbab-card h-full min-h-0 border border-emerald-100 lg:flex lg:max-h-[calc(100vh-9rem)] lg:flex-col">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-textPrimary">
                  Asbabun Nuzul
                </h3>
                <span className="ayah-detail-chip rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                  {data.surah_number}:{data.ayah_number}
                </span>
              </div>
              <div className="ayah-detail-asbab-text mt-3 text-sm leading-relaxed text-textSecondary lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
                <p className="whitespace-pre-line">{asbabContent}</p>
              </div>
            </Card>
          </div>
        ) : null}
      </Container>
    </div>
  );
};

export default AyahDetailPage;
