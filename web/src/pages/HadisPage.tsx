import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Search, Shuffle } from "lucide-react";
import Container from "../components/Container";
import SectionHeader from "../components/SectionHeader";
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
} from "../components/State";
import { ApiError, fetchJson, fetchJsonCached } from "../lib/api";
import { useDebouncedValue } from "../lib/hooks";
import { highlightText } from "../lib/highlight";
import type {
  HadisDetail,
  HadisEntry,
  HadisExploreData,
  HadisMeta,
  HadisPaging,
  HadisSearchData,
  HadisSearchHit,
} from "../lib/types";

const DEFAULT_LIMIT = 5;
const arabicPattern =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const isArabicText = (value: string) => arabicPattern.test(value);

const HadisPage = () => {
  const [meta, setMeta] = useState<HadisMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [metaError, setMetaError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [limit] = useState(DEFAULT_LIMIT);
  const [paging, setPaging] = useState<HadisPaging | null>(null);
  const [entries, setEntries] = useState<HadisEntry[]>([]);
  const [searchEntries, setSearchEntries] = useState<HadisSearchHit[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [keyword, setKeyword] = useState("");
  const debouncedKeyword = useDebouncedValue(keyword, 300);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<HadisDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [jumpId, setJumpId] = useState("");
  const detailRequestRef = useRef(0);
  const detailAbortRef = useRef<AbortController | null>(null);

  const isSearch = debouncedKeyword.length >= 4;
  const isAborted = (err: unknown) =>
    err instanceof ApiError && err.code === "aborted";

  useEffect(() => {
    fetchJsonCached<HadisMeta>("/hadis/enc", {
      ttl: 24 * 60 * 60,
      key: "hadis-meta",
      staleIfError: true,
    })
      .then((res) => setMeta(res.data ?? null))
      .catch((err: Error) => setMetaError(err.message))
      .finally(() => setMetaLoading(false));
  }, []);

  useEffect(() => {
    setPage(1);
  }, [debouncedKeyword]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setListLoading(true);
    setListError(null);

    const load = async () => {
      if (isSearch) {
        const res = await fetchJson<HadisSearchData>(
          `/hadis/enc/cari/${encodeURIComponent(debouncedKeyword)}?page=${page}&limit=10`,
          { signal: controller.signal },
        );
        if (!active) return;
        setSearchEntries(res.data?.hadis ?? []);
        setPaging(res.data?.paging ?? null);
      } else {
        const res = await fetchJson<HadisExploreData>(
          `/hadis/enc/explore?page=${page}&limit=${limit}`,
          { signal: controller.signal },
        );
        if (!active) return;
        setEntries(res.data?.hadis ?? []);
        setPaging(res.data?.paging ?? null);
      }
    };

    load()
      .catch((err: unknown) => {
        if (!active || isAborted(err)) return;
        setListError(
          err instanceof Error ? err.message : "Gagal memuat daftar hadis.",
        );
      })
      .finally(() => {
        if (!active) return;
        setListLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [debouncedKeyword, isSearch, page, limit]);

  const listIds = useMemo(() => {
    if (isSearch) return searchEntries.map((item) => item.id);
    return entries.map((item) => item.id);
  }, [entries, isSearch, searchEntries]);
  const listLabel = isSearch ? "Hasil Pencarian" : "Daftar Hadis";

  useEffect(() => {
    if (listIds.length === 0) return;
    if (selectedId && listIds.includes(selectedId)) return;
    setSelectedId(listIds[0]);
  }, [listIds, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    const controller = new AbortController();
    setDetailLoading(true);
    setDetailError(null);

    fetchJson<HadisDetail>(`/hadis/enc/show/${selectedId}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!active) return;
        setDetail(res.data ?? null);
      })
      .catch((err: unknown) => {
        if (!active || isAborted(err)) return;
        setDetailError(
          err instanceof Error ? err.message : "Gagal memuat detail hadis.",
        );
      })
      .finally(() => {
        if (!active) return;
        setDetailLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedId]);

  useEffect(
    () => () => {
      detailAbortRef.current?.abort();
      detailAbortRef.current = null;
    },
    [],
  );

  const requestDetailByPath = (path: string) => {
    detailAbortRef.current?.abort();
    const controller = new AbortController();
    detailAbortRef.current = controller;
    const requestId = detailRequestRef.current + 1;
    detailRequestRef.current = requestId;
    setDetailLoading(true);
    setDetailError(null);

    fetchJson<HadisDetail>(path, { signal: controller.signal })
      .then((res) => {
        if (requestId !== detailRequestRef.current) return;
        setDetail(res.data ?? null);
        if (res.data?.id) setSelectedId(res.data.id);
      })
      .catch((err: unknown) => {
        if (requestId !== detailRequestRef.current || isAborted(err)) return;
        setDetailError(
          err instanceof Error ? err.message : "Gagal memuat detail hadis.",
        );
      })
      .finally(() => {
        if (requestId !== detailRequestRef.current) return;
        setDetailLoading(false);
      });
  };

  const handleRandom = () => {
    requestDetailByPath("/hadis/enc/random");
  };

  const handleSibling = (type: "next" | "prev") => {
    if (!detail?.id) return;
    requestDetailByPath(`/hadis/enc/${type}/${detail.id}`);
  };

  const handleJump = () => {
    const id = Number.parseInt(jumpId, 10);
    if (!Number.isFinite(id) || id <= 0) return;
    requestDetailByPath(`/hadis/enc/show/${id}`);
  };

  return (
    <div className="py-10">
      <Container>
        <SectionHeader
          title="Hadis"
          subtitle="Eksplorasi ensiklopedia hadis, cari topik, dan navigasi ayat terkait."
        />

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <Card>
              <h3 className="text-sm font-semibold text-textPrimary">
                Info Ensiklopedia
              </h3>
              {metaLoading ? (
                <LoadingState message="Memuat metadata..." />
              ) : null}
              {metaError ? <ErrorState message={metaError} /> : null}
              {meta ? (
                <div className="mt-3 space-y-2 text-sm text-textSecondary">
                  <p className="font-semibold text-textPrimary">{meta.name}</p>
                  <p>{meta.desc}</p>
                  <p className="text-xs">
                    Versi {meta.ver} · Update terakhir {meta.last_update}
                  </p>
                  <p className="text-xs">Sumber: {meta.source}</p>
                </div>
              ) : null}
            </Card>

            <Card>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex w-full items-center gap-2 rounded-full border border-emerald-100 px-3 py-2 sm:w-auto">
                  <Search className="h-4 w-4 text-emerald-600" />
                  <input
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    placeholder="Cari hadis (min 4 huruf)"
                    className="w-full text-sm outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleRandom}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white sm:w-auto"
                >
                  <Shuffle className="h-4 w-4" /> Random Hadis
                </button>
              </div>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  value={jumpId}
                  onChange={(event) => setJumpId(event.target.value)}
                  type="number"
                  min="1"
                  placeholder="Lompat ke ID"
                  className="w-full rounded-full border border-emerald-100 px-3 py-2 text-xs sm:w-32"
                />
                <button
                  type="button"
                  onClick={handleJump}
                  className="w-full rounded-full border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 sm:w-auto"
                >
                  Buka
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {listLoading ? (
                  <LoadingState message="Memuat hadis..." />
                ) : null}
                {listError ? <ErrorState message={listError} /> : null}
                {!listLoading && !listError && listIds.length === 0 ? (
                  <EmptyState message="Hadis tidak ditemukan." />
                ) : null}

                <div className="max-h-none space-y-3 overflow-visible pr-0 -mr-0 lg:max-h-[60vh] lg:overflow-y-auto lg:pr-3 lg:-mr-3">
                  <div className="hidden bg-white/90 lg:sticky lg:top-0 lg:z-10 lg:mb-2 lg:flex lg:items-center lg:justify-between lg:rounded-lg lg:border lg:border-emerald-100 lg:bg-white/90 lg:px-3 lg:py-2 lg:text-[11px] lg:text-textSecondary lg:backdrop-blur">
                    <span>{listLabel}</span>
                    <span>{listIds.length} item</span>
                  </div>
                  {isSearch
                    ? searchEntries.map((item) => {
                        const searchIsArabic = isArabicText(item.text);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setSelectedId(item.id)}
                            className={`cv-auto w-full rounded-xl border bg-white/90 px-4 py-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 [-webkit-tap-highlight-color:transparent] ${
                              selectedId === item.id
                                ? "border-emerald-500 bg-emerald-50"
                                : "border-emerald-100 hover:bg-emerald-50"
                            }`}
                          >
                            <p className="font-semibold text-textPrimary">
                              Hadis #{item.id}
                            </p>
                            <p
                              className={`mt-1 text-sm leading-relaxed text-textSecondary ${
                                searchIsArabic ? "text-right font-arabic" : ""
                              }`}
                              dir={searchIsArabic ? "rtl" : undefined}
                              lang={searchIsArabic ? "ar" : undefined}
                            >
                              {highlightText(item.text, debouncedKeyword)}
                            </p>
                          </button>
                        );
                      })
                    : entries.map((item) => {
                        const entryIsArabic = isArabicText(item.text.id);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setSelectedId(item.id)}
                            className={`cv-auto w-full rounded-xl border bg-white/90 px-4 py-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 [-webkit-tap-highlight-color:transparent] ${
                              selectedId === item.id
                                ? "border-emerald-500 bg-emerald-50"
                                : "border-emerald-100 hover:bg-emerald-50"
                            }`}
                          >
                            <p className="font-semibold text-textPrimary">
                              Hadis #{item.id}
                            </p>
                            <p
                              className={`mt-1 text-sm leading-relaxed text-textSecondary ${
                                entryIsArabic ? "text-right font-arabic" : ""
                              }`}
                              dir={entryIsArabic ? "rtl" : undefined}
                              lang={entryIsArabic ? "ar" : undefined}
                            >
                              {item.text.id}
                            </p>
                            {item.grade ? (
                              <p className="mt-1 text-[11px] text-emerald-700">
                                Grade: {item.grade}
                              </p>
                            ) : null}
                          </button>
                        );
                      })}
                </div>
              </div>

              {paging ? (
                <div className="mt-4 flex items-center justify-between text-xs text-textSecondary">
                  <button
                    type="button"
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    disabled={!paging.has_prev}
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-100 px-3 py-2 disabled:opacity-50"
                  >
                    <ArrowLeft className="h-3 w-3" /> Prev
                  </button>
                  <span>
                    Halaman {paging.current} / {paging.total_pages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((prev) => prev + 1)}
                    disabled={!paging.has_next}
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-100 px-3 py-2 disabled:opacity-50"
                  >
                    Next <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              ) : null}
            </Card>
          </div>

          <Card>
            <h3 className="text-sm font-semibold text-textPrimary">
              Detail Hadis
            </h3>
            {detailLoading ? <LoadingState message="Memuat detail..." /> : null}
            {detailError ? <ErrorState message={detailError} /> : null}
            {!detailLoading && !detail ? (
              <EmptyState message="Pilih hadis untuk melihat detail." />
            ) : null}

            {detail ? (
              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-xs text-emerald-700">ID #{detail.id}</p>
                  <p
                    className="mt-2 text-right font-arabic text-lg leading-relaxed text-textPrimary"
                    dir="rtl"
                    lang="ar"
                  >
                    {detail.text.ar}
                  </p>
                  <p
                    className={`mt-3 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-base leading-relaxed text-textPrimary ${
                      isArabicText(detail.text.id)
                        ? "text-right font-arabic"
                        : ""
                    }`}
                    dir={isArabicText(detail.text.id) ? "rtl" : undefined}
                    lang={isArabicText(detail.text.id) ? "ar" : undefined}
                  >
                    {detail.text.id}
                  </p>
                </div>
                <div className="grid gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-textSecondary">
                  <p>
                    <span className="font-semibold text-textPrimary">
                      Grade:
                    </span>{" "}
                    {detail.grade ?? "-"}
                  </p>
                  <p>
                    <span className="font-semibold text-textPrimary">
                      Takhrij:
                    </span>{" "}
                    {detail.takhrij ?? "-"}
                  </p>
                  <p>
                    <span className="font-semibold text-textPrimary">
                      Hikmah:
                    </span>{" "}
                    {detail.hikmah ?? "-"}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                  <button
                    type="button"
                    onClick={() => handleSibling("prev")}
                    className="w-full rounded-full border border-emerald-200 px-4 py-2 text-xs font-semibold text-emerald-700 sm:flex-1"
                  >
                    Hadis Sebelumnya
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSibling("next")}
                    className="w-full rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white sm:flex-1"
                  >
                    Hadis Berikutnya
                  </button>
                </div>
              </div>
            ) : null}
          </Card>
        </div>
      </Container>
    </div>
  );
};

export default HadisPage;
