import { useEffect, useMemo, useState } from "react";
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
import { fetchJson, fetchJsonCached, postJson } from "../lib/api";
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
  const { setTrack } = useAudio();

  const isSearch = debouncedKeyword.length >= 3;

  const friendlyError = (err: unknown) => (err as Error).message;

  useEffect(() => {
    fetchJsonCached<AnyRecord[]>("/doa/harian", {
      ttl: 6 * 60 * 60,
      key: "doa-categories",
      staleIfError: true,
    })
      .then((res) => setCategories(res.data ?? []))
      .catch((err) => setCatError(friendlyError(err)))
      .finally(() => setCatLoading(false));
  }, []);

  useEffect(() => {
    if (selectedCategory || categories.length === 0) return;
    setSelectedCategory(categories[0]);
  }, [categories, selectedCategory]);

  useEffect(() => {
    if (!selectedCategory) return;
    setListLoading(true);
    setListError(null);

    const categoryId = String(
      selectedCategory.id ?? selectedCategory.slug ?? "",
    );
    fetchJson<AnyRecord[]>(`/doa/harian/kategori/${categoryId}`)
      .then((res) => setList(res.data ?? []))
      .catch((err) => setListError(friendlyError(err)))
      .finally(() => setListLoading(false));
  }, [selectedCategory]);

  useEffect(() => {
    if (!isSearch) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }

    let active = true;
    setSearchLoading(true);
    setSearchError(null);

    postJson<AnyRecord[]>("/doa/harian/cari", { keyword: debouncedKeyword })
      .then((res) => {
        if (!active) return;
        setSearchResults(res.data ?? []);
      })
      .catch((err) => {
        if (!active) return;
        setSearchError(friendlyError(err));
      })
      .finally(() => {
        if (!active) return;
        setSearchLoading(false);
      });

    return () => {
      active = false;
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

  const handleRandom = () => {
    setDetailLoading(true);
    setDetailError(null);
    fetchJson<AnyRecord>("/doa/harian/random")
      .then((res) => setDetail(res.data ?? null))
      .catch((err) => setDetailError(friendlyError(err)))
      .finally(() => setDetailLoading(false));
  };

  const handleSelectDoa = (item: AnyRecord) => {
    const id = item.id ?? item.slug ?? item.code;
    if (!id) {
      setDetail(item);
      return;
    }
    setDetailLoading(true);
    setDetailError(null);
    fetchJson<AnyRecord>(`/doa/harian/${id}`)
      .then((res) => setDetail(res.data ?? null))
      .catch((err) => setDetailError(friendlyError(err)))
      .finally(() => setDetailLoading(false));
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

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
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
                  const isActive = selectedCategory?.id === item.id;
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
                      className={`flex w-full items-center justify-start gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition ${
                        isActive
                          ? "border-emerald-600 bg-emerald-600 text-white shadow"
                          : "border-emerald-100 text-emerald-700 hover:border-emerald-200 hover:bg-emerald-50"
                      }`}
                    >
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full transition-transform duration-150 ${
                          isActive ? "scale-110 bg-white" : "bg-emerald-400"
                        }`}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate text-left">
                        {label}
                      </span>
                      <span className="ml-auto flex items-center gap-1">
                        {isActive ? (
                          <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                            Aktif
                          </span>
                        ) : null}
                        {audioTotal && audioTotal > 0 ? (
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              isActive
                                ? "bg-white/20 text-white"
                                : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                            }`}
                            title={`${audioTotal} doa punya audio`}
                          >
                            Audio
                          </span>
                        ) : null}
                        {total ? (
                          <span
                            className="hidden shrink-0 text-[10px] opacity-80 sm:inline"
                            title={`${total} doa`}
                          >
                            ({total})
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
                      className="cv-auto w-full rounded-xl border border-emerald-100 px-4 py-3 text-left text-sm hover:bg-emerald-50"
                    >
                      <div className="flex flex-wrap items-start gap-2 sm:flex-nowrap">
                        <p className="min-w-0 flex-1 break-words font-semibold text-textPrimary">
                          {isSearch
                            ? highlightText(label, debouncedKeyword)
                            : label}
                        </p>
                        {hasAudio ? (
                          <span className="ml-auto shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                            Audio
                          </span>
                        ) : null}
                      </div>
                      {category ? (
                        <p className="mt-1 break-words text-[11px] text-emerald-700">
                          {category}
                        </p>
                      ) : null}
                      <p className="mt-1 break-words text-xs text-textSecondary">
                        {isSearch
                          ? highlightText(translation, debouncedKeyword)
                          : translation}
                      </p>
                    </button>
                  );
                })}
              </div>
            </Card>
          </div>

          <Card>
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
