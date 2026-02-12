import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Container from "../components/Container";
import SectionHeader from "../components/SectionHeader";
import { Card, ErrorState, LoadingState } from "../components/State";
import { ApiError, fetchJson } from "../lib/api";
import { toArabicNumber } from "../lib/arabic";
import { fetchAsbabByAyahId, fetchMuslimAyah } from "../lib/muslimApi";
import type { AyahItem } from "../lib/types";

const AyahDetailPage = () => {
  const { surahId, ayahId } = useParams();
  const [data, setData] = useState<AyahItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [asbabText, setAsbabText] = useState<string | null>(null);
  const [asbabModalOpen, setAsbabModalOpen] = useState(false);
  const asbabCloseRef = useRef<HTMLButtonElement | null>(null);

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
    setAsbabModalOpen(false);

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

  useEffect(() => {
    if (!asbabModalOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAsbabModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [asbabModalOpen]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (asbabModalOpen) {
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
  }, [asbabModalOpen]);

  const asbabNuzul = asbabText?.trim() || data?.asbabun_nuzul?.trim() || null;

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
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="mushaf-shell">
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

            {data ? (
              <Card className="border border-emerald-100">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-textPrimary">
                    Asbabun Nuzul
                  </h3>
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                    {data.surah_number}:{data.ayah_number}
                  </span>
                </div>
                <div className="mt-3 text-sm leading-relaxed text-textSecondary">
                  <p>
                    {asbabNuzul ??
                      "Asbabun Nuzul belum tersedia untuk ayat ini."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAsbabModalOpen(true)}
                  className="mt-4 rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700"
                >
                  Lihat Asbabun Nuzul
                </button>
              </Card>
            ) : null}
          </div>
        ) : null}

        {asbabModalOpen && data ? (
          <div
            className="asbab-modal-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="Asbabun Nuzul"
            onClick={() => setAsbabModalOpen(false)}
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
                    Surah {data?.surah_number} · Ayat {data?.ayah_number}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAsbabModalOpen(false)}
                  className="asbab-modal-close"
                  ref={asbabCloseRef}
                >
                  Tutup
                </button>
              </div>
              <div className="asbab-modal-body">
                <p>
                  {asbabNuzul ?? "Asbabun Nuzul belum tersedia untuk ayat ini."}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </Container>
    </div>
  );
};

export default AyahDetailPage;
