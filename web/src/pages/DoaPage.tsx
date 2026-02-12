import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Shuffle } from "lucide-react";
import Container from "../components/Container";
import SectionHeader from "../components/SectionHeader";
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
} from "../components/State";
import AudioPlayer from "../components/AudioPlayer";
import { ApiError, fetchJson, fetchJsonCached, postJson } from "../lib/api";
import { useDebouncedValue } from "../lib/hooks";
import { highlightText } from "../lib/highlight";
import { useAudio } from "../lib/audio";

type AnyRecord = Record<string, unknown>;

const extractString = (obj: AnyRecord, keys: string[]) => {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
};

const getAudioUrl = (obj: AnyRecord) =>
  extractString(obj, ["audio_url", "audio", "audioUrl", "audio_mp3"]);

const DoaPage = () => {
  const [categories, setCategories] = useState<AnyRecord[]>([]);
  const [catLoading, setCatLoading] = useState(true);
  const [catError, setCatError] = useState<string | null>(null);

  const [selectedCategory, setSelectedCategory] = useState<AnyRecord | null>(
    null,
  );
  const [list, setList] = useState<AnyRecord[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [audioOnly, setAudioOnly] = useState(false);

  const [keyword, setKeyword] = useState("");
  const debouncedKeyword = useDebouncedValue(keyword, 300);
  const [searchResults, setSearchResults] = useState<AnyRecord[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [detail, setDetail] = useState<AnyRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const listRequestRef = useRef(0);
  const detailRequestRef = useRef(0);
  const detailAbortRef = useRef<AbortController | null>(null);
  const { setTrack } = useAudio();

  const isSearch = debouncedKeyword.length >= 3;

  const isAborted = (err: unknown) =>
    err instanceof ApiError && err.code === "aborted";

  const friendlyError = (err: unknown) => {
    if (err instanceof Error && err.message) return err.message;
    return "Terjadi kesalahan. Silakan coba lagi.";
  };

  useEffect(() => {
    let active = true;
    setCatLoading(true);
    setCatError(null);
    fetchJsonCached<AnyRecord[]>("/doa/harian", {
      ttl: 6 * 60 * 60,
      key: "doa-categories",
      staleIfError: true,
    })
      .then((res) => {
        if (!active) return;
        setCategories(res.data ?? []);
      })
      .catch((err) => {
        if (!active || isAborted(err)) return;
        setCatError(friendlyError(err));
      })
      .finally(() => {
        if (!active) return;
        setCatLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (selectedCategory || categories.length === 0) return;
    setSelectedCategory(categories[0]);
  }, [categories, selectedCategory]);

  useEffect(() => {
    if (!selectedCategory) return;
    const categoryId = String(
      selectedCategory.id ?? selectedCategory.slug ?? "",
    ).trim();
    if (!categoryId) {
      setList([]);
      setListLoading(false);
      setListError("Kategori tidak valid.");
      return;
    }

    const requestId = listRequestRef.current + 1;
    listRequestRef.current = requestId;
    const controller = new AbortController();
    setListLoading(true);
    setListError(null);

    fetchJson<AnyRecord[]>(`/doa/harian/kategori/${categoryId}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (requestId !== listRequestRef.current) return;
        setList(res.data ?? []);
      })
      .catch((err) => {
        if (requestId !== listRequestRef.current || isAborted(err)) return;
        setListError(friendlyError(err));
      })
      .finally(() => {
        if (requestId !== listRequestRef.current) return;
        setListLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [selectedCategory]);

  useEffect(() => {
    if (!isSearch) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }

    let active = true;
    const controller = new AbortController();
    setSearchLoading(true);
    setSearchError(null);

    postJson<AnyRecord[]>(
      "/doa/harian/cari",
      { keyword: debouncedKeyword },
      {
        signal: controller.signal,
      },
    )
      .then((res) => {
        if (!active) return;
        setSearchResults(res.data ?? []);
      })
      .catch((err) => {
        if (!active || isAborted(err)) return;
        setSearchError(friendlyError(err));
      })
      .finally(() => {
        if (!active) return;
        setSearchLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [debouncedKeyword, isSearch]);

  useEffect(() => {
    if (debouncedKeyword) {
      setActiveTag(null);
    }
  }, [debouncedKeyword]);

  useEffect(() => {
    if (activeTag) {
      setAudioOnly(false);
    }
  }, [activeTag]);

  useEffect(
    () => () => {
      detailAbortRef.current?.abort();
      detailAbortRef.current = null;
    },
    [],
  );

  const requestDetail = (path: string) => {
    detailAbortRef.current?.abort();
    const controller = new AbortController();
    detailAbortRef.current = controller;
    const requestId = detailRequestRef.current + 1;
    detailRequestRef.current = requestId;
    setDetailLoading(true);
    setDetailError(null);

    fetchJson<AnyRecord>(path, { signal: controller.signal })
      .then((res) => {
        if (requestId !== detailRequestRef.current) return;
        setDetail(res.data ?? null);
      })
      .catch((err) => {
        if (requestId !== detailRequestRef.current || isAborted(err)) return;
        setDetailError(friendlyError(err));
      })
      .finally(() => {
        if (requestId !== detailRequestRef.current) return;
        setDetailLoading(false);
      });
  };

  const handleRandom = () => {
    requestDetail("/doa/harian/random");
  };

  const handleSelectDoa = (item: AnyRecord) => {
    const id = item.id ?? item.slug ?? item.code;
    if (!id) {
      detailRequestRef.current += 1;
      detailAbortRef.current?.abort();
      detailAbortRef.current = null;
      setDetailLoading(false);
      setDetailError(null);
      setDetail(item);
      return;
    }
    requestDetail(`/doa/harian/${id}`);
  };

  const activeList = isSearch ? searchResults : list;

  const filteredList = useMemo(() => {
    let list = activeList;
    if (activeTag) {
      list = list.filter((item) => {
        const tags = (item.tags ?? item.tag ?? []) as string[];
        if (!Array.isArray(tags)) return false;
        return tags
          .map((tag) => tag.toLowerCase())
          .includes(activeTag.toLowerCase());
      });
    }
    if (audioOnly) {
      list = list.filter((item) => Boolean(getAudioUrl(item)));
    }
    return list;
  }, [activeList, activeTag, audioOnly]);

  const availableWithAudio = useMemo(
    () => activeList.filter((item) => Boolean(getAudioUrl(item))),
    [activeList],
  );

  const hasAnyAudio = availableWithAudio.length > 0;
  const audioCount = availableWithAudio.length;

  const availableTags = useMemo(() => {
    const bucket = new Set<string>();
    activeList.forEach((item) => {
      const tags = (item.tags ?? item.tag ?? []) as string[];
      if (Array.isArray(tags)) {
        tags.forEach((tag) => bucket.add(tag));
      }
    });
    return Array.from(bucket).slice(0, 12);
  }, [activeList]);

  const detailContent = useMemo(() => {
    if (!detail) return null;
    const title =
      extractString(detail, ["title", "judul", "name", "nama"]) || "Doa";
    const arabic = extractString(detail, ["arabic", "arab", "ar", "teks_arab"]);
    const translation = extractString(detail, [
      "translation",
      "terjemah",
      "arti",
      "id",
      "idn",
    ]);
    const transliteration = extractString(detail, [
      "transliteration",
      "latin",
      "transliterasi",
      "tr",
    ]);
    const source = extractString(detail, ["source", "sumber", "tentang"]);
    const notes = extractString(detail, ["notes", "keterangan"]);
    const audioUrl = extractString(detail, [
      "audio_url",
      "audio",
      "audioUrl",
      "audio_mp3",
    ]);
    const category = extractString(detail, ["category", "grup", "group"]);
    const tags = Array.isArray(detail.tags ?? detail.tag)
      ? ((detail.tags ?? detail.tag) as string[])
      : [];

    return {
      title,
      arabic,
      translation,
      transliteration,
      source,
      notes,
      audioUrl,
      category,
      tags,
    };
  }, [detail]);

  return (
    <div className="py-10">
      <Container>
        <SectionHeader
          title="Doa Harian"
          subtitle="Kumpulan doa Hisnul Muslim dengan terjemah dan audio dasar."
        />

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <Card>
              <h3 className="text-sm font-semibold text-textPrimary">
                Kategori Doa
              </h3>
              {catLoading ? (
                <LoadingState message="Memuat kategori..." />
              ) : null}
              {catError ? <ErrorState message={catError} /> : null}
              {!catLoading && !catError && categories.length === 0 ? (
                <EmptyState message="Kategori belum tersedia." />
              ) : null}
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {categories.map((item) => {
                  const label =
                    extractString(item, [
                      "title",
                      "name",
                      "kategori",
                      "label",
                    ]) || String(item.id ?? "Kategori");
                  const total =
                    typeof item.total === "number" ? item.total : null;
                  const audioTotal =
                    typeof item.audio_total === "number"
                      ? item.audio_total
                      : typeof item.audioTotal === "number"
                        ? item.audioTotal
                        : null;
                  const isActive =
                    String(selectedCategory?.id ?? "") ===
                    String(item.id ?? "");
                  return (
                    <button
                      key={String(item.id ?? label)}
                      type="button"
                      data-active={isActive}
                      onClick={() => {
                        setSelectedCategory(item);
                        setActiveTag(null);
                      }}
                      title={label}
                      className={`flex w-full flex-col items-start gap-1.5 rounded-xl border px-2.5 py-2 text-[11px] font-semibold transition ${
                        isActive
                          ? "border-emerald-600 bg-emerald-600 text-white shadow"
                          : "border-emerald-100 text-emerald-700 hover:border-emerald-200 hover:bg-emerald-50"
                      }`}
                    >
                      <div className="flex w-full items-start gap-1.5">
                        <span
                          className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full transition-transform duration-150 ${
                            isActive ? "scale-110 bg-white" : "bg-emerald-400"
                          }`}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1 break-words text-left leading-snug">
                          {label}
                          {total ? (
                            <span className="ml-1 text-[9px] opacity-80">
                              ({total})
                            </span>
                          ) : null}
                        </span>
                      </div>
                      <span className="flex w-full flex-wrap items-center gap-1">
                        {isActive ? (
                          <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
                            Aktif
                          </span>
                        ) : null}
                        {audioTotal && audioTotal > 0 ? (
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                              isActive
                                ? "bg-white/20 text-white"
                                : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                            }`}
                            title={`${audioTotal} doa punya audio`}
                          >
                            Audio
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Card>

            <Card>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex w-full min-w-0 items-center gap-2 rounded-full border border-emerald-100 px-3 py-2 sm:w-auto sm:flex-1">
                  <Search className="h-4 w-4 text-emerald-600" />
                  <input
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    placeholder="Cari doa (min 3 huruf)"
                    className="min-w-0 w-full text-sm outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleRandom}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white sm:w-auto"
                >
                  <Shuffle className="h-4 w-4" /> Random Doa
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {availableTags.length > 0 || hasAnyAudio ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-textSecondary">
                      Filter tag:
                    </span>
                    {hasAnyAudio ? (
                      <button
                        type="button"
                        onClick={() => {
                          setAudioOnly((prev) => !prev);
                          setActiveTag(null);
                        }}
                        className={`rounded-full border px-3 py-2 text-xs ${
                          audioOnly
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : "border-emerald-100 text-emerald-700"
                        }`}
                      >
                        Audio ({audioCount})
                      </button>
                    ) : null}
                    {availableTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setActiveTag(tag)}
                        className={`rounded-full border px-3 py-2 text-xs ${
                          activeTag === tag
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : "border-emerald-100 text-emerald-700"
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                    {activeTag ? (
                      <button
                        type="button"
                        onClick={() => setActiveTag(null)}
                        className="rounded-full border border-emerald-200 px-3 py-2 text-xs text-emerald-700"
                      >
                        Reset
                      </button>
                    ) : null}
                    {audioOnly ? (
                      <button
                        type="button"
                        onClick={() => setAudioOnly(false)}
                        className="rounded-full border border-emerald-200 px-3 py-2 text-xs text-emerald-700"
                      >
                        Reset Audio
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {isSearch && searchLoading ? (
                  <LoadingState message="Mencari doa..." />
                ) : null}
                {isSearch && searchError ? (
                  <ErrorState message={searchError} />
                ) : null}
                {!isSearch && listLoading ? (
                  <LoadingState message="Memuat daftar doa..." />
                ) : null}
                {!isSearch && listError ? (
                  <ErrorState message={listError} />
                ) : null}

                {!isSearch &&
                !listLoading &&
                !listError &&
                list.length === 0 ? (
                  <EmptyState message="Pilih kategori untuk menampilkan doa." />
                ) : null}

                {isSearch &&
                !searchLoading &&
                !searchError &&
                searchResults.length === 0 ? (
                  <EmptyState message="Doa tidak ditemukan." />
                ) : null}
                {activeTag &&
                !listLoading &&
                !searchLoading &&
                filteredList.length === 0 ? (
                  <EmptyState message="Tidak ada doa untuk tag ini." />
                ) : null}
                {audioOnly &&
                !listLoading &&
                !searchLoading &&
                filteredList.length === 0 ? (
                  <EmptyState message="Tidak ada doa yang memiliki audio." />
                ) : null}

                <div className="max-h-none space-y-3 overflow-visible pr-0 -mr-0 lg:max-h-[60vh] lg:overflow-y-auto lg:pr-2 lg:-mr-2 scrollbar-slim">
                  {filteredList.map((item) => {
                    const label =
                      extractString(item, ["title", "judul", "name", "nama"]) ||
                      `Doa ${item.id ?? ""}`;
                    const translation = extractString(item, [
                      "translation",
                      "terjemah",
                      "arti",
                      "id",
                      "idn",
                    ]);
                    const category = extractString(item, [
                      "category",
                      "grup",
                      "group",
                    ]);
                    const audioUrl = getAudioUrl(item);
                    const hasAudio = Boolean(audioUrl);
                    return (
                      <button
                        key={String(item.id ?? label)}
                        type="button"
                        onClick={() => handleSelectDoa(item)}
                        className="cv-auto w-full rounded-xl border border-emerald-100 px-3 py-2.5 text-left text-[13px] transition hover:border-emerald-200 hover:bg-emerald-50"
                      >
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-2">
                          <p className="min-w-0 flex-1 break-words font-semibold leading-snug text-textPrimary">
                            {isSearch
                              ? highlightText(label, debouncedKeyword)
                              : label}
                          </p>
                          {hasAudio ? (
                            <span className="self-start rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 sm:ml-auto">
                              Audio
                            </span>
                          ) : null}
                        </div>
                        {category ? (
                          <p className="mt-1 break-words text-[11px] leading-snug text-emerald-700">
                            {category}
                          </p>
                        ) : null}
                        <p className="mt-1 break-words text-[11px] leading-snug text-textSecondary">
                          {isSearch
                            ? highlightText(translation, debouncedKeyword)
                            : translation}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </Card>
          </div>

          <Card className="lg:sticky lg:top-24">
            <h3 className="text-sm font-semibold text-textPrimary">
              Detail Doa
            </h3>
            {detailLoading ? (
              <LoadingState message="Memuat detail doa..." />
            ) : null}
            {detailError ? <ErrorState message={detailError} /> : null}
            {!detailLoading && !detail ? (
              <EmptyState message="Pilih doa untuk melihat detail." />
            ) : null}

            {detailContent ? (
              <div className="mt-4 space-y-4">
                <div>
                  <p className="break-words text-xs text-emerald-700">
                    {detailContent.title}
                  </p>
                  {detailContent.category ? (
                    <p className="mt-1 break-words text-[11px] text-emerald-700">
                      {detailContent.category}
                    </p>
                  ) : null}
                  {detailContent.arabic ? (
                    <p
                      className="mt-3 whitespace-pre-line break-words text-right font-arabic text-xl leading-relaxed text-textPrimary sm:text-2xl"
                      dir="rtl"
                    >
                      {detailContent.arabic}
                    </p>
                  ) : null}
                  {detailContent.translation ? (
                    <p className="mt-3 whitespace-pre-line break-words text-sm text-textSecondary">
                      {detailContent.translation}
                    </p>
                  ) : null}
                  {detailContent.transliteration ? (
                    <p className="mt-3 whitespace-pre-line break-words text-sm italic text-textSecondary">
                      {detailContent.transliteration}
                    </p>
                  ) : null}
                  {detailContent.audioUrl ? (
                    <button
                      type="button"
                      onClick={() =>
                        setTrack({
                          title: detailContent.title,
                          subtitle: "Doa Harian",
                          src: detailContent.audioUrl,
                          module: "doa",
                        })
                      }
                      className="mt-3 inline-flex w-full rounded-full border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 sm:w-auto"
                    >
                      Putar di Player
                    </button>
                  ) : null}
                </div>

                {detailContent.source || detailContent.notes ? (
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-textSecondary">
                    {detailContent.source ? (
                      <p>
                        <span className="font-semibold text-textPrimary">
                          Sumber:
                        </span>{" "}
                        {detailContent.source}
                      </p>
                    ) : null}
                    {detailContent.notes ? (
                      <p className="mt-2">Catatan: {detailContent.notes}</p>
                    ) : null}
                  </div>
                ) : null}

                {detailContent.tags && detailContent.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {detailContent.tags.map((tag: string) => (
                      <span
                        key={tag}
                        className="max-w-full break-words rounded-full border border-emerald-100 px-3 py-2 text-[11px] text-emerald-700"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}

                {detailContent.audioUrl ? (
                  <AudioPlayer title="Doa" src={detailContent.audioUrl} />
                ) : null}
              </div>
            ) : null}
          </Card>
        </div>
      </Container>
    </div>
  );
};

export default DoaPage;
