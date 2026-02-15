import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import Container from "../components/Container";
import SectionHeader from "../components/SectionHeader";
import { ErrorState, LoadingState } from "../components/State";
import { fetchJson, fetchJsonCached } from "../lib/api";
import { toArabicNumber } from "../lib/arabic";
import {
  MUSHAF_CONTINUATION_APPEND_PAGES,
  MUSHAF_CONTINUATION_SKIP_PAGES,
  MUSHAF_TOTAL_PAGES,
} from "../lib/mushafContinuationPages";
import { fetchAsbabByAyahId, fetchMuslimAyah } from "../lib/muslimApi";
import type { SurahDetail, SurahItem } from "../lib/types";

const PAGE_LIMIT = 20;
const DEFAULT_MUSHAF_TOTAL_PAGES = MUSHAF_TOTAL_PAGES;
const MUSHAF_IMAGE_CDN_BASE = "https://cdn.myquran.com/img/page";
const ASBAB_UNAVAILABLE_TEXT = "Asbabun Nuzul belum tersedia untuk ayat ini.";
const BASMALAH_ARABIC = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ";
const BASMALAH_TRANSLATION =
  "Dengan nama Allah Yang Maha Pengasih, Maha Penyayang.";
const normalizeAsbabText = (text: string) => text.replace(/\s+/g, " ").trim();
const isValidGlobalAyahId = (value: string) => /^\d+$/.test(value);
const ARABIC_DIACRITIC_REGEX =
  /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const BASMALAH_NORMALIZED = "بسم الله الرحمن الرحيم";
const normalizeArabicForBasmalah = (text: string) =>
  text
    .replace(ARABIC_DIACRITIC_REGEX, "")
    .replace(/[ٱأإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
const stripLeadingBasmalahFromAyah = (
  arabicText: string,
  surahNumber: number,
  ayahNumber: number,
) => {
  if (ayahNumber !== 1 || surahNumber === 1 || surahNumber === 9) {
    return arabicText;
  }
  const trimmed = arabicText.trim();
  if (!trimmed) return arabicText;
  const normalized = normalizeArabicForBasmalah(trimmed);
  if (!normalized.startsWith(BASMALAH_NORMALIZED)) {
    return arabicText;
  }
  const words = trimmed.split(/\s+/);
  if (words.length <= 4) return arabicText;
  const withoutBasmalah = words.slice(4).join(" ").trim();
  return withoutBasmalah || arabicText;
};
const getSharedPrefixLength = (left: string, right: string) => {
  const max = Math.min(left.length, right.length);
  let index = 0;
  while (index < max && left[index] === right[index]) {
    index += 1;
  }
  return index;
};
const getSharedSuffixLength = (left: string, right: string) => {
  const max = Math.min(left.length, right.length);
  let index = 0;
  while (
    index < max &&
    left[left.length - 1 - index] === right[right.length - 1 - index]
  ) {
    index += 1;
  }
  return index;
};
const isNearDuplicateAsbabText = (leftRaw: string, rightRaw: string) => {
  const left = normalizeAsbabText(leftRaw);
  const right = normalizeAsbabText(rightRaw);
  if (!left || !right) return false;
  if (left === right) return true;
  const maxLength = Math.max(left.length, right.length);
  const minLength = Math.min(left.length, right.length);
  if (minLength < 280) return false;
  if (maxLength - minLength > 8) return false;
  const sharedPrefix = getSharedPrefixLength(left, right);
  const sharedSuffix = getSharedSuffixLength(left, right);
  const covered = Math.min(maxLength, sharedPrefix + sharedSuffix);
  return covered / maxLength >= 0.96;
};

type SurahLabelVariant = "gold" | "blue";

type MyQuranMushafPageResponse = {
  status?: boolean;
  message?: string;
  meta?: {
    url?: {
      image?: string;
    };
  };
  data?: Array<{
    id?: number | string | null;
    surah_number?: number | string | null;
    ayah_number?: number | string | null;
    arab?: string | null;
    translation?: string | null;
  }>;
};

type MushafPageAyah = {
  id: string;
  surahNumber: number;
  ayahNumber: number;
  arab: string;
  translation: string;
};

type MushafPageResolved = {
  imageUrl: string;
  surahNumbers: number[];
  ayahs: MushafPageAyah[];
};

type MushafRenderedAyah = MushafPageAyah & {
  renderKey: string;
  mushafPage: number;
  isContinuationFromNextPage: boolean;
};

const resolveMushafPagePayload = (
  payload: MyQuranMushafPageResponse,
  pageNumber: number,
): MushafPageResolved | null => {
  const imageUrl =
    payload.meta?.url?.image?.trim() ??
    `${MUSHAF_IMAGE_CDN_BASE}/${pageNumber}.png`;
  if (!payload.status) return null;
  const ayahs = (payload.data ?? [])
    .map((item) => {
      const surahNumber = Number(item.surah_number);
      const ayahNumber = Number(item.ayah_number);
      if (
        !Number.isFinite(surahNumber) ||
        surahNumber <= 0 ||
        !Number.isFinite(ayahNumber) ||
        ayahNumber <= 0
      ) {
        return null;
      }
      const rawId = item.id;
      const resolvedId =
        rawId === null || rawId === undefined || `${rawId}`.trim() === ""
          ? `${surahNumber}:${ayahNumber}`
          : `${rawId}`.trim();
      return {
        id: resolvedId,
        surahNumber: Math.floor(surahNumber),
        ayahNumber: Math.floor(ayahNumber),
        arab: item.arab?.trim() ?? "",
        translation: item.translation?.trim() ?? "",
      } satisfies MushafPageAyah;
    })
    .filter((ayah): ayah is MushafPageAyah => ayah !== null);
  const surahNumbers = Array.from(
    new Set(ayahs.map((ayah) => ayah.surahNumber)),
  ).sort((a, b) => a - b);
  return { imageUrl, surahNumbers, ayahs };
};

const getAsbabAyahKey = (surahNumber: number, ayahNumber: number) =>
  `${surahNumber}:${ayahNumber}`;

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
    surahLabel?: string;
  } | null>(null);
  const [readingMode, setReadingMode] = useState<"pdf" | "interactive">("pdf");
  const [isInteractiveFallback, setIsInteractiveFallback] = useState(false);
  const [mushafFallbackReason, setMushafFallbackReason] = useState<
    string | null
  >(null);
  const [isExplanationExpanded, setIsExplanationExpanded] = useState(true);
  const [surahLabelVariant, setSurahLabelVariant] =
    useState<SurahLabelVariant>("gold");
  const [isOrnamentStrong, setIsOrnamentStrong] = useState(true);
  const [interactiveMushafPage, setInteractiveMushafPage] = useState<
    number | null
  >(null);
  const [isAdvancingInteractivePage, setIsAdvancingInteractivePage] =
    useState(false);
  const [mushafPage, setMushafPage] = useState<number | null>(null);
  const [isMushafPageLoading, setIsMushafPageLoading] = useState(false);
  const [mushafPageError, setMushafPageError] = useState<string | null>(null);
  const [mushafPageImageUrl, setMushafPageImageUrl] = useState<string | null>(
    null,
  );
  const [mushafPageSurahNumbers, setMushafPageSurahNumbers] = useState<
    number[]
  >([]);
  const [mushafPageAyahs, setMushafPageAyahs] = useState<MushafPageAyah[]>([]);
  const [mushafSkipFirstAyah, setMushafSkipFirstAyah] = useState(false);
  const [mushafTrailingAyah, setMushafTrailingAyah] =
    useState<MushafPageAyah | null>(null);
  const asbabCloseRef = useRef<HTMLButtonElement | null>(null);
  const asbabRequestIdRef = useRef(0);
  const asbabPrefetchAttemptedRef = useRef<Set<string>>(new Set());
  const pdfPanelRef = useRef<HTMLDivElement | null>(null);
  const firstMushafAyahRef = useRef<HTMLDivElement | null>(null);
  const lastMushafAyahRef = useRef<HTMLDivElement | null>(null);
  const mushafPageCacheRef = useRef<Map<number, MushafPageResolved>>(new Map());

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
    asbabPrefetchAttemptedRef.current.clear();
    asbabRequestIdRef.current += 1;
    setAsbabModal(null);
    setReadingMode("pdf");
    setIsInteractiveFallback(false);
    setMushafFallbackReason(null);
    setMushafPage(null);
    setMushafPageError(null);
    setIsMushafPageLoading(false);
    setMushafPageImageUrl(null);
    setMushafPageSurahNumbers([]);
    setMushafPageAyahs([]);
    setMushafSkipFirstAyah(false);
    setMushafTrailingAyah(null);
    setInteractiveMushafPage(null);
    setIsAdvancingInteractivePage(false);
  }, [surahId, startPage, range?.end]);

  useEffect(() => {
    if (!surahId) return;
    if (range && page < startPage) return;
    const currentLimit = readingMode === "pdf" && !range ? 1 : PAGE_LIMIT;
    let active = true;
    setLoading(true);
    setError(null);

    fetchJson<SurahDetail>(
      `/quran/${surahId}?page=${page}&limit=${currentLimit}`,
    )
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
  }, [surahId, page, range, startPage, readingMode]);

  useEffect(() => {
    fetchJsonCached<SurahItem[]>("/quran", {
      ttl: 12 * 60 * 60,
      key: "quran-list",
      staleIfError: true,
    })
      .then((res) => setSurahList(res.data ?? []))
      .catch(() => undefined);
  }, []);

  const closeAsbabModal = () => {
    asbabRequestIdRef.current += 1;
    setAsbabModal(null);
  };

  useEffect(() => {
    if (!asbabModal) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeAsbabModal();
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

  const openAsbabModal = async (
    surahNumber: number,
    ayahNumber: number,
    surahLabel?: string,
    globalAyahId?: string | number | null,
  ) => {
    const ayahKey = getAsbabAyahKey(surahNumber, ayahNumber);
    const cached = asbabLookup[ayahKey];
    if (cached?.text) {
      setAsbabModal({
        surahLabel,
        ayah: ayahNumber.toString(),
        text: cached.text,
      });
      return;
    }

    const requestId = asbabRequestIdRef.current + 1;
    asbabRequestIdRef.current = requestId;
    const applyModalText = (text: string) => {
      if (asbabRequestIdRef.current !== requestId) return;
      setAsbabModal({
        surahLabel,
        ayah: ayahNumber.toString(),
        text,
      });
    };
    applyModalText("Memuat Asbabun Nuzul...");

    try {
      const providedGlobalAyahId = globalAyahId?.toString().trim() ?? "";
      const resolvedGlobalAyahId = isValidGlobalAyahId(providedGlobalAyahId)
        ? providedGlobalAyahId
        : "";

      let globalId = resolvedGlobalAyahId;
      if (!globalId) {
        const ayahDetail = await fetchMuslimAyah(
          surahNumber.toString(),
          ayahNumber.toString(),
        );
        globalId = ayahDetail?.id?.toString().trim() ?? "";
      }
      if (!isValidGlobalAyahId(globalId)) {
        applyModalText(ASBAB_UNAVAILABLE_TEXT);
        return;
      }

      const cachedByGlobalAyahId = asbabLookup[globalId];
      if (cachedByGlobalAyahId?.text) {
        setAsbabLookup((prev) => ({
          ...prev,
          [ayahKey]: cachedByGlobalAyahId,
        }));
        applyModalText(cachedByGlobalAyahId.text);
        return;
      }

      const entry = await fetchAsbabByAyahId(globalId);
      const text = entry?.text?.toString().trim() ?? "";
      if (!text) {
        applyModalText(ASBAB_UNAVAILABLE_TEXT);
        return;
      }

      const normalized = {
        id: entry?.id ?? globalId,
        text,
        ayah: entry?.ayah,
      };
      setAsbabLookup((prev) => ({
        ...prev,
        [globalId]: normalized,
        [ayahKey]: normalized,
      }));
      applyModalText(text);
    } catch {
      applyModalText(ASBAB_UNAVAILABLE_TEXT);
    }
  };

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
  const pageSizeForPagination =
    readingMode === "pdf" && !range ? 1 : PAGE_LIMIT;
  const hasMoreByPage = totalAyahCount
    ? page * pageSizeForPagination < totalAyahCount
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
  const surahMap = useMemo(() => {
    const map = new Map<number, SurahItem>();
    surahList.forEach((item) => {
      map.set(item.number, item);
    });
    return map;
  }, [surahList]);
  const mushafHeaderLatin = useMemo(() => {
    if (!mushafPageSurahNumbers.length) {
      return meta?.name_latin ?? "Mushaf Madinah";
    }
    return mushafPageSurahNumbers
      .map((number) => surahMap.get(number)?.name_latin ?? `Surah ${number}`)
      .join(" • ");
  }, [mushafPageSurahNumbers, surahMap, meta?.name_latin]);
  const mushafHeaderArabic = useMemo(() => {
    if (!mushafPageSurahNumbers.length) {
      return meta?.name ?? "المصحف";
    }
    return mushafPageSurahNumbers
      .map(
        (number) =>
          surahMap.get(number)?.name ?? `سورة ${toArabicNumber(number)}`,
      )
      .join(" • ");
  }, [mushafPageSurahNumbers, surahMap, meta?.name]);
  const mushafTotalPages = useMemo(() => {
    const raw = Number(
      import.meta.env.VITE_MUSHAF_TOTAL_PAGES ?? DEFAULT_MUSHAF_TOTAL_PAGES,
    );
    if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_MUSHAF_TOTAL_PAGES;
    return Math.max(1, Math.floor(raw));
  }, []);
  const clampMushafPage = (pageNumber: number) =>
    Math.min(mushafTotalPages, Math.max(1, Math.floor(pageNumber)));
  const mushafPageRange = useMemo(() => {
    if (!data?.ayahs?.length) return null;
    const pages = data.ayahs
      .map((ayah) => ayah.meta?.page)
      .filter(
        (page): page is number =>
          typeof page === "number" && Number.isFinite(page) && page > 0,
      );
    if (!pages.length) return null;
    return {
      start: Math.min(...pages),
      end: Math.max(...pages),
    };
  }, [data?.ayahs]);
  const activeMushafPage =
    mushafPage !== null
      ? clampMushafPage(mushafPage)
      : mushafPageRange
        ? clampMushafPage(mushafPageRange.start)
        : 1;
  const canGoPrevMushafPage = activeMushafPage > 1;
  const canGoNextMushafPage = activeMushafPage < mushafTotalPages;
  const displayedAyahs = data?.ayahs ?? [];
  const interactivePageNumbers = useMemo(() => {
    if (!displayedAyahs.length) return [];
    const pageSet = new Set<number>();
    displayedAyahs.forEach((ayah) => {
      const mushafPage = ayah.meta?.page;
      if (
        typeof mushafPage === "number" &&
        Number.isFinite(mushafPage) &&
        mushafPage > 0
      ) {
        pageSet.add(mushafPage);
      }
    });
    return Array.from(pageSet).sort((a, b) => a - b);
  }, [displayedAyahs]);
  const hasInteractivePageMeta = interactivePageNumbers.length > 0;
  const activeInteractivePage = hasInteractivePageMeta
    ? (interactiveMushafPage ?? interactivePageNumbers[0])
    : null;
  const activeInteractivePageIndex =
    activeInteractivePage === null
      ? -1
      : interactivePageNumbers.indexOf(activeInteractivePage);
  const prevInteractivePage =
    activeInteractivePageIndex > 0
      ? interactivePageNumbers[activeInteractivePageIndex - 1]
      : null;
  const nextLoadedInteractivePage =
    activeInteractivePageIndex >= 0 &&
    activeInteractivePageIndex < interactivePageNumbers.length - 1
      ? interactivePageNumbers[activeInteractivePageIndex + 1]
      : null;
  const canGoPrevInteractivePage = prevInteractivePage !== null;
  const canGoNextInteractivePage =
    nextLoadedInteractivePage !== null || hasMore;
  const visibleAyahs =
    hasInteractivePageMeta && activeInteractivePage !== null
      ? displayedAyahs.filter(
          (ayah) => ayah.meta?.page === activeInteractivePage,
        )
      : displayedAyahs;

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsExplanationExpanded(window.innerWidth > 640);
  }, [surahId]);

  useEffect(() => {
    if (readingMode !== "pdf") return;
    setIsExplanationExpanded(true);
  }, [readingMode, activeMushafPage]);

  useEffect(() => {
    if (readingMode !== "pdf" || !data?.ayahs?.length) return;
    let active = true;
    setMushafFallbackReason(null);
    setMushafSkipFirstAyah(false);
    setMushafTrailingAyah(null);
    const cached = mushafPageCacheRef.current.get(activeMushafPage);
    if (cached) {
      setIsMushafPageLoading(false);
      setMushafPageError(null);
      setMushafPageImageUrl(cached.imageUrl);
      setMushafPageSurahNumbers(cached.surahNumbers);
      setMushafPageAyahs(cached.ayahs);
      setIsInteractiveFallback(false);
      firstMushafAyahRef.current = null;
      lastMushafAyahRef.current = null;
      return () => {
        active = false;
      };
    }
    setIsMushafPageLoading(true);
    setMushafPageError(null);
    setMushafPageImageUrl(null);
    setMushafPageSurahNumbers([]);
    setMushafPageAyahs([]);
    firstMushafAyahRef.current = null;
    lastMushafAyahRef.current = null;

    fetchJsonCached<MyQuranMushafPageResponse>(
      `/quran/page/${activeMushafPage}`,
      {
        key: `quran-page:${activeMushafPage}`,
        ttl: 24 * 60 * 60,
        staleIfError: true,
      },
    )
      .then((raw) => {
        if (!active) return;
        const payload = raw as MyQuranMushafPageResponse;
        const resolved = resolveMushafPagePayload(payload, activeMushafPage);
        if (!resolved) {
          throw new Error(
            payload.message ??
              `Halaman mushaf ${activeMushafPage} belum tersedia.`,
          );
        }
        mushafPageCacheRef.current.set(activeMushafPage, resolved);
        setMushafPageImageUrl(resolved.imageUrl);
        setMushafPageSurahNumbers(resolved.surahNumbers);
        setMushafPageAyahs(resolved.ayahs);
        setIsInteractiveFallback(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        const message =
          err instanceof Error ? err.message : "Terjadi kesalahan jaringan.";
        setMushafPageImageUrl(null);
        setMushafPageSurahNumbers([]);
        setMushafPageAyahs([]);
        setMushafPageError(`Gagal memuat halaman mushaf dari API. ${message}`);
        setMushafFallbackReason(message);
        setIsInteractiveFallback(true);
        setReadingMode("interactive");
      })
      .finally(() => {
        if (!active) return;
        setIsMushafPageLoading(false);
      });

    return () => {
      active = false;
    };
  }, [readingMode, activeMushafPage, data?.ayahs?.length]);

  useEffect(() => {
    if (readingMode !== "pdf" || !mushafPageAyahs.length) {
      setMushafSkipFirstAyah(false);
      return;
    }
    if (!MUSHAF_CONTINUATION_SKIP_PAGES.has(activeMushafPage)) {
      setMushafSkipFirstAyah(false);
      return;
    }
    const previousPage = activeMushafPage - 1;
    if (previousPage < 1) {
      setMushafSkipFirstAyah(false);
      return;
    }
    const currentFirstAyah = mushafPageAyahs[0];
    if (!currentFirstAyah) {
      setMushafSkipFirstAyah(false);
      return;
    }

    const applySkipRule = (resolved: MushafPageResolved | null) => {
      const previousLastAyah =
        resolved?.ayahs?.[resolved.ayahs.length - 1] ?? null;
      if (!previousLastAyah) {
        setMushafSkipFirstAyah(false);
        return;
      }
      const shouldSkip =
        previousLastAyah.surahNumber === currentFirstAyah.surahNumber &&
        previousLastAyah.ayahNumber + 1 === currentFirstAyah.ayahNumber;
      setMushafSkipFirstAyah(shouldSkip);
    };

    const cachedPreviousPage = mushafPageCacheRef.current.get(previousPage);
    if (cachedPreviousPage) {
      applySkipRule(cachedPreviousPage);
      return;
    }

    let active = true;
    fetchJsonCached<MyQuranMushafPageResponse>(`/quran/page/${previousPage}`, {
      key: `quran-page:${previousPage}`,
      ttl: 24 * 60 * 60,
      staleIfError: true,
    })
      .then((raw) => {
        if (!active) return;
        const resolved = resolveMushafPagePayload(
          raw as MyQuranMushafPageResponse,
          previousPage,
        );
        if (!resolved) {
          setMushafSkipFirstAyah(false);
          return;
        }
        mushafPageCacheRef.current.set(previousPage, resolved);
        applySkipRule(resolved);
      })
      .catch(() => {
        if (!active) return;
        setMushafSkipFirstAyah(false);
      });

    return () => {
      active = false;
    };
  }, [readingMode, mushafPageAyahs, activeMushafPage]);

  useEffect(() => {
    const baseAyahs =
      mushafSkipFirstAyah && mushafPageAyahs.length > 0
        ? mushafPageAyahs.slice(1)
        : mushafPageAyahs;
    if (readingMode !== "pdf" || !baseAyahs.length) {
      setMushafTrailingAyah(null);
      return;
    }
    if (!MUSHAF_CONTINUATION_APPEND_PAGES.has(activeMushafPage)) {
      setMushafTrailingAyah(null);
      return;
    }
    const nextPage = activeMushafPage + 1;
    if (nextPage > mushafTotalPages) {
      setMushafTrailingAyah(null);
      return;
    }
    const lastAyah = baseAyahs[baseAyahs.length - 1];
    if (!lastAyah) {
      setMushafTrailingAyah(null);
      return;
    }

    const applyTrailingAyah = (resolved: MushafPageResolved | null) => {
      if (!resolved || !resolved.ayahs.length) {
        setMushafTrailingAyah(null);
        return;
      }
      const candidate = resolved.ayahs[0];
      const isSequential =
        candidate.surahNumber === lastAyah.surahNumber &&
        candidate.ayahNumber === lastAyah.ayahNumber + 1;
      setMushafTrailingAyah(isSequential ? candidate : null);
    };

    const cachedNextPage = mushafPageCacheRef.current.get(nextPage);
    if (cachedNextPage) {
      applyTrailingAyah(cachedNextPage);
      return;
    }

    let active = true;
    fetchJsonCached<MyQuranMushafPageResponse>(`/quran/page/${nextPage}`, {
      key: `quran-page:${nextPage}`,
      ttl: 24 * 60 * 60,
      staleIfError: true,
    })
      .then((raw) => {
        if (!active) return;
        const resolved = resolveMushafPagePayload(
          raw as MyQuranMushafPageResponse,
          nextPage,
        );
        if (!resolved) {
          setMushafTrailingAyah(null);
          return;
        }
        mushafPageCacheRef.current.set(nextPage, resolved);
        applyTrailingAyah(resolved);
      })
      .catch(() => {
        if (!active) return;
        setMushafTrailingAyah(null);
      });

    return () => {
      active = false;
    };
  }, [
    readingMode,
    mushafPageAyahs,
    mushafSkipFirstAyah,
    activeMushafPage,
    mushafTotalPages,
  ]);

  useEffect(() => {
    if (!hasInteractivePageMeta) {
      setInteractiveMushafPage(null);
      setIsAdvancingInteractivePage(false);
      return;
    }
    setInteractiveMushafPage((current) => {
      if (current !== null && interactivePageNumbers.includes(current)) {
        return current;
      }
      return interactivePageNumbers[0] ?? null;
    });
  }, [hasInteractivePageMeta, interactivePageNumbers]);

  useEffect(() => {
    if (!isAdvancingInteractivePage) return;
    if (nextLoadedInteractivePage !== null) {
      setInteractiveMushafPage(nextLoadedInteractivePage);
      setIsAdvancingInteractivePage(false);
      return;
    }
    if (!hasMore && !loading) {
      setIsAdvancingInteractivePage(false);
    }
  }, [isAdvancingInteractivePage, nextLoadedInteractivePage, hasMore, loading]);

  const handleInteractivePrevPage = () => {
    if (prevInteractivePage === null) return;
    setIsAdvancingInteractivePage(false);
    setInteractiveMushafPage(prevInteractivePage);
  };

  const handleInteractiveNextPage = () => {
    if (nextLoadedInteractivePage !== null) {
      setIsAdvancingInteractivePage(false);
      setInteractiveMushafPage(nextLoadedInteractivePage);
      return;
    }
    if (!hasMore || loading) return;
    setIsAdvancingInteractivePage(true);
    handleLoadMore();
  };
  const mushafBaseAyahs = useMemo(
    () =>
      mushafSkipFirstAyah && mushafPageAyahs.length > 0
        ? mushafPageAyahs.slice(1)
        : mushafPageAyahs,
    [mushafPageAyahs, mushafSkipFirstAyah],
  );
  const mushafRenderedAyahs = useMemo<MushafRenderedAyah[]>(() => {
    const rows: MushafRenderedAyah[] = mushafBaseAyahs.map((ayah) => ({
      ...ayah,
      renderKey: `${ayah.id}-${ayah.surahNumber}-${ayah.ayahNumber}`,
      mushafPage: activeMushafPage,
      isContinuationFromNextPage: false,
    }));
    if (!mushafTrailingAyah) return rows;
    rows.push({
      ...mushafTrailingAyah,
      renderKey: `${mushafTrailingAyah.id}-${mushafTrailingAyah.surahNumber}-${mushafTrailingAyah.ayahNumber}-next-${activeMushafPage + 1}`,
      mushafPage: clampMushafPage(activeMushafPage + 1),
      isContinuationFromNextPage: true,
    });
    return rows;
  }, [mushafBaseAyahs, mushafTrailingAyah, activeMushafPage]);
  const activeExplanationAyahs = useMemo(
    () =>
      readingMode === "pdf"
        ? mushafRenderedAyahs.map((ayah) => ({
            globalAyahId: ayah.id?.toString().trim() ?? "",
            surahNumber: ayah.surahNumber,
            ayahNumber: ayah.ayahNumber,
          }))
        : visibleAyahs.map((ayah) => ({
            globalAyahId: ayah.id?.toString().trim() ?? "",
            surahNumber: ayah.surah_number,
            ayahNumber: ayah.ayah_number,
          })),
    [readingMode, mushafRenderedAyahs, visibleAyahs],
  );
  useEffect(() => {
    if (!activeExplanationAyahs.length) return;
    const pendingAyahs = activeExplanationAyahs.filter((ayah) => {
      if (!isValidGlobalAyahId(ayah.globalAyahId)) return false;
      const ayahKey = getAsbabAyahKey(ayah.surahNumber, ayah.ayahNumber);
      if (asbabLookup[ayahKey]?.text) return false;
      if (asbabPrefetchAttemptedRef.current.has(ayahKey)) return false;
      return true;
    });
    if (!pendingAyahs.length) return;
    let active = true;
    const prefetch = async () => {
      for (const ayah of pendingAyahs) {
        const ayahKey = getAsbabAyahKey(ayah.surahNumber, ayah.ayahNumber);
        asbabPrefetchAttemptedRef.current.add(ayahKey);
        try {
          const entry = await fetchAsbabByAyahId(ayah.globalAyahId);
          if (!active) return;
          const text = entry?.text?.toString().trim() ?? "";
          if (!text) continue;
          const normalized = {
            id: entry?.id ?? ayah.globalAyahId,
            text,
            ayah: entry?.ayah,
          };
          setAsbabLookup((prev) => {
            if (prev[ayahKey]?.text) return prev;
            return {
              ...prev,
              [ayah.globalAyahId]: normalized,
              [ayahKey]: normalized,
            };
          });
        } catch {
          if (!active) return;
        }
      }
    };
    void prefetch();
    return () => {
      active = false;
    };
  }, [activeExplanationAyahs, asbabLookup]);
  const mushafAsbabDuplicateSourceByAyahKey = useMemo(() => {
    const firstAsbabBySurah = new Map<
      number,
      Array<{ text: string; ayahNumber: number }>
    >();
    const duplicateSourceByAyahKey = new Map<string, number>();
    mushafRenderedAyahs.forEach((ayah) => {
      const ayahKey = getAsbabAyahKey(ayah.surahNumber, ayah.ayahNumber);
      const text = asbabLookup[ayahKey]?.text ?? "";
      if (!text) return;
      const seenInSurah = firstAsbabBySurah.get(ayah.surahNumber) ?? [];
      const duplicate = seenInSurah.find((entry) =>
        isNearDuplicateAsbabText(entry.text, text),
      );
      if (duplicate) {
        if (duplicate.ayahNumber !== ayah.ayahNumber) {
          duplicateSourceByAyahKey.set(ayahKey, duplicate.ayahNumber);
        }
        return;
      }
      seenInSurah.push({ text, ayahNumber: ayah.ayahNumber });
      firstAsbabBySurah.set(ayah.surahNumber, seenInSurah);
    });
    return duplicateSourceByAyahKey;
  }, [mushafRenderedAyahs, asbabLookup]);
  const interactiveAsbabDuplicateSourceByAyahKey = useMemo(() => {
    const firstAsbabBySurah = new Map<
      number,
      Array<{ text: string; ayahNumber: number }>
    >();
    const duplicateSourceByAyahKey = new Map<string, number>();
    visibleAyahs.forEach((ayah) => {
      const ayahKey = getAsbabAyahKey(ayah.surah_number, ayah.ayah_number);
      const text = asbabLookup[ayahKey]?.text ?? "";
      if (!text) return;
      const seenInSurah = firstAsbabBySurah.get(ayah.surah_number) ?? [];
      const duplicate = seenInSurah.find((entry) =>
        isNearDuplicateAsbabText(entry.text, text),
      );
      if (duplicate) {
        if (duplicate.ayahNumber !== ayah.ayah_number) {
          duplicateSourceByAyahKey.set(ayahKey, duplicate.ayahNumber);
        }
        return;
      }
      seenInSurah.push({ text, ayahNumber: ayah.ayah_number });
      firstAsbabBySurah.set(ayah.surah_number, seenInSurah);
    });
    return duplicateSourceByAyahKey;
  }, [visibleAyahs, asbabLookup]);
  const mushafPageAyahCount = mushafRenderedAyahs.length;
  const scrollToMushafAyahEdge = (edge: "first" | "last") => {
    const target =
      edge === "first" ? firstMushafAyahRef.current : lastMushafAyahRef.current;
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  };

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
          <>
            <div
              className={`mushaf-shell mushaf-shell-surah ${
                isOrnamentStrong ? "ornament-strong" : "ornament-soft"
              } mt-6`}
            >
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
              <div className="mushaf-mode-toggle-row">
                <button
                  type="button"
                  className="mushaf-mode-toggle is-active"
                  onClick={() => {
                    setReadingMode("pdf");
                    setIsInteractiveFallback(false);
                    setMushafFallbackReason(null);
                  }}
                  aria-pressed={true}
                >
                  Mushaf Madinah
                </button>
              </div>

              {isInteractiveFallback ? (
                <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <p>
                    Mushaf Madinah gagal dimuat. Menampilkan mode interaktif
                    sebagai fallback.
                  </p>
                  {mushafFallbackReason ? (
                    <p className="mt-1 text-[11px] text-amber-700">
                      {mushafFallbackReason}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setReadingMode("pdf");
                      setIsInteractiveFallback(false);
                      setMushafFallbackReason(null);
                    }}
                    className="mt-2 rounded-full border border-amber-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-amber-700"
                  >
                    Coba Lagi Mushaf Madinah
                  </button>
                </div>
              ) : null}

              {readingMode === "interactive" ? (
                <>
                  <div className="mushaf-ornament-toggle-row">
                    <button
                      type="button"
                      className="mushaf-ornament-toggle"
                      onClick={() => setIsOrnamentStrong((prev) => !prev)}
                      aria-pressed={isOrnamentStrong}
                    >
                      Ornamen: {isOrnamentStrong ? "Dominan" : "Normal"}
                    </button>
                  </div>

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
                            <span>{meta.name_latin}</span>
                            <span className="font-arabic text-base sm:text-lg">
                              {meta.name}
                            </span>
                          </div>
                          <div className="flex flex-wrap justify-center gap-2">
                            <span className="mushaf-chip">
                              {meta.revelation}
                            </span>
                            <span className="mushaf-chip">
                              {meta.translation}
                            </span>
                            <span className="mushaf-chip">
                              {meta.number_of_ayahs} ayat
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="mushaf-body space-y-4 px-4 pb-6 pt-5">
                        {range ? (
                          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs text-emerald-800">
                            Menampilkan ayat {range.start}&ndash;{range.end}.
                          </div>
                        ) : null}
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                          <span>
                            {activeInteractivePage !== null
                              ? `Halaman Mushaf ${activeInteractivePage}`
                              : "Halaman mushaf belum tersedia"}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={handleInteractivePrevPage}
                              disabled={!canGoPrevInteractivePage}
                              className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Sebelumnya
                            </button>
                            <button
                              type="button"
                              onClick={handleInteractiveNextPage}
                              disabled={
                                !canGoNextInteractivePage ||
                                (loading && nextLoadedInteractivePage === null)
                              }
                              className="rounded-full border border-emerald-300 bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isAdvancingInteractivePage && loading
                                ? "Memuat..."
                                : "Berikutnya"}
                            </button>
                          </div>
                        </div>
                        {data?.ayahs?.length ? (
                          <div className="mushaf-reading-sheet cv-auto">
                            <p className="mushaf-reading-text" dir="rtl">
                              {showBismillah ? (
                                <span className="mushaf-reading-bismillah">
                                  بِسْمِ ٱللَّٰهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
                                </span>
                              ) : null}
                              {visibleAyahs.map((ayah) => (
                                <span
                                  key={`reading-${ayah.id}`}
                                  className="mushaf-reading-chunk"
                                >
                                  {stripLeadingBasmalahFromAyah(
                                    ayah.arab,
                                    ayah.surah_number,
                                    ayah.ayah_number,
                                  )}
                                  <span
                                    className="mushaf-ayah-number-inline mushaf-ayah-number-inline-reading"
                                    dir="ltr"
                                  >
                                    {toArabicNumber(ayah.ayah_number)}
                                  </span>
                                </span>
                              ))}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="mushaf-side-tag" aria-hidden="true">
                      <span>وقف</span>
                      <small>١٥</small>
                    </div>
                  </div>
                </>
              ) : (
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
                          <span>{mushafHeaderLatin}</span>
                          <span className="font-arabic text-base sm:text-lg">
                            {mushafHeaderArabic}
                          </span>
                        </div>
                        <div className="flex flex-wrap justify-center gap-2">
                          <span className="mushaf-chip">Mushaf Madinah</span>
                          <span className="mushaf-chip">
                            Halaman {activeMushafPage}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="mushaf-body space-y-4 px-4 pb-6 pt-5">
                      <div className="mushaf-pdf-panel" ref={pdfPanelRef}>
                        <div className="mushaf-pdf-single-page">
                          <button
                            type="button"
                            className="mushaf-pdf-side-nav is-left"
                            onClick={() =>
                              setMushafPage((current) =>
                                clampMushafPage(
                                  (current ?? activeMushafPage) - 1,
                                ),
                              )
                            }
                            disabled={
                              !canGoPrevMushafPage || !data?.ayahs?.length
                            }
                            aria-label="Halaman mushaf sebelumnya"
                          >
                            <ChevronLeft className="h-5 w-5" />
                          </button>

                          <div className="mushaf-pdf-canvas-wrap">
                            {!data?.ayahs?.length ? (
                              <p className="mushaf-pdf-loading">
                                Menyiapkan halaman mushaf...
                              </p>
                            ) : isMushafPageLoading ? (
                              <p className="mushaf-pdf-loading">
                                Memuat halaman mushaf dari API...
                              </p>
                            ) : null}
                            {mushafPageError ? (
                              <div className="mushaf-pdf-missing">
                                {mushafPageError}
                              </div>
                            ) : null}
                            {!isMushafPageLoading &&
                            !mushafPageError &&
                            mushafPageImageUrl ? (
                              <img
                                key={`mushaf-page-image-${activeMushafPage}`}
                                className="mushaf-pdf-image"
                                src={mushafPageImageUrl}
                                alt={`Mushaf Madinah halaman ${activeMushafPage}`}
                                loading="eager"
                                decoding="async"
                              />
                            ) : null}
                          </div>

                          <button
                            type="button"
                            className="mushaf-pdf-side-nav is-right"
                            onClick={() =>
                              setMushafPage((current) =>
                                clampMushafPage(
                                  (current ?? activeMushafPage) + 1,
                                ),
                              )
                            }
                            disabled={
                              !canGoNextMushafPage || !data?.ayahs?.length
                            }
                            aria-label="Halaman mushaf berikutnya"
                          >
                            <ChevronRight className="h-5 w-5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mushaf-side-tag" aria-hidden="true">
                    <span>وقف</span>
                    <small>١٥</small>
                  </div>
                </div>
              )}
            </div>

            {readingMode === "pdf" ? (
              <div className="surah-explanation-shell mt-6">
                <div className="surah-explanation">
                  <div className="surah-explanation-header">
                    <div className="surah-explanation-header-main">
                      <p className="surah-explanation-kicker">
                        Penjelasan Surah
                      </p>
                      <h3 className="surah-explanation-title">
                        Penjelasan Ayat
                      </h3>
                      <p className="surah-explanation-subtitle">
                        {`Terjemah per ayat halaman ${activeMushafPage} (${mushafHeaderLatin})`}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                          {mushafPageAyahCount} ayat
                        </span>
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                          {mushafPageSurahNumbers.length} surah
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div
                        className="surah-label-variant-switch"
                        role="group"
                        aria-label="Warna kartu nama surat"
                      >
                        <button
                          type="button"
                          className={`surah-label-variant-btn ${
                            surahLabelVariant === "gold" ? "is-active" : ""
                          }`}
                          onClick={() => setSurahLabelVariant("gold")}
                          aria-pressed={surahLabelVariant === "gold"}
                        >
                          Emas
                        </button>
                        <button
                          type="button"
                          className={`surah-label-variant-btn ${
                            surahLabelVariant === "blue" ? "is-active" : ""
                          }`}
                          onClick={() => setSurahLabelVariant("blue")}
                          aria-pressed={surahLabelVariant === "blue"}
                        >
                          Biru
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => scrollToMushafAyahEdge("first")}
                        disabled={
                          mushafPageAyahCount === 0 || !isExplanationExpanded
                        }
                        className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Ayat Pertama
                      </button>
                      <button
                        type="button"
                        onClick={() => scrollToMushafAyahEdge("last")}
                        disabled={
                          mushafPageAyahCount === 0 || !isExplanationExpanded
                        }
                        className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Ayat Terakhir
                      </button>
                      <button
                        type="button"
                        className="surah-explanation-toggle"
                        onClick={() =>
                          setIsExplanationExpanded(
                            (prevExpanded) => !prevExpanded,
                          )
                        }
                        aria-expanded={isExplanationExpanded}
                        aria-controls="surah-explanation-list-pdf"
                      >
                        {isExplanationExpanded
                          ? "Sembunyikan"
                          : "Lihat Penjelasan"}
                      </button>
                    </div>
                  </div>
                  <div
                    id="surah-explanation-list-pdf"
                    className={`surah-explanation-list ${
                      isExplanationExpanded ? "" : "is-collapsed"
                    }`}
                  >
                    {isMushafPageLoading ? (
                      <p className="surah-explanation-empty">
                        Memuat detail ayat halaman ini...
                      </p>
                    ) : null}
                    {!isMushafPageLoading &&
                    mushafRenderedAyahs.length === 0 ? (
                      <p className="surah-explanation-empty">
                        Detail ayat belum tersedia untuk halaman ini.
                      </p>
                    ) : null}
                    {mushafRenderedAyahs.map((ayah, index) => {
                      const ayahKey = getAsbabAyahKey(
                        ayah.surahNumber,
                        ayah.ayahNumber,
                      );
                      const asbabEntry = asbabLookup[ayahKey];
                      const duplicateAsbabSourceAyah =
                        mushafAsbabDuplicateSourceByAyahKey.get(ayahKey) ??
                        null;
                      const surahLabel =
                        surahMap.get(ayah.surahNumber)?.name_latin ??
                        `Surah ${ayah.surahNumber}`;
                      const surahArabicLabel =
                        surahMap.get(ayah.surahNumber)?.name ??
                        `سورة ${toArabicNumber(ayah.surahNumber)}`;
                      const surahSectionLabel =
                        ayah.ayahNumber === 1
                          ? `${ayah.surahNumber}. ${surahLabel}`
                          : `${ayah.surahNumber}. ${surahLabel} (lanjutan ayat ${ayah.ayahNumber})`;
                      const previousSurahNumber =
                        index > 0
                          ? mushafRenderedAyahs[index - 1]?.surahNumber
                          : 0;
                      const isNewSurahSection =
                        index === 0 || previousSurahNumber !== ayah.surahNumber;
                      const showBasmalahRow =
                        isNewSurahSection &&
                        ayah.ayahNumber === 1 &&
                        ayah.surahNumber !== 1 &&
                        ayah.surahNumber !== 9;
                      const ayahMushafPage = ayah.mushafPage;
                      const showGoToMushafButton =
                        ayahMushafPage !== activeMushafPage;
                      return (
                        <div
                          key={ayah.renderKey}
                          className="surah-explanation-group"
                        >
                          {isNewSurahSection ? (
                            <div
                              className={`surah-explanation-surah-label ${
                                surahLabelVariant === "blue" ? "is-blue" : ""
                              }`}
                            >
                              <span>{surahSectionLabel}</span>
                              <span className="surah-explanation-surah-label-arabic">
                                {surahArabicLabel}
                              </span>
                            </div>
                          ) : null}
                          {showBasmalahRow ? (
                            <div className="surah-explanation-basmalah">
                              <p
                                className="surah-explanation-basmalah-arabic"
                                dir="rtl"
                              >
                                {BASMALAH_ARABIC}
                              </p>
                              <p className="surah-explanation-basmalah-translation">
                                {BASMALAH_TRANSLATION}
                              </p>
                            </div>
                          ) : null}
                          <div
                            className="surah-explanation-item cv-auto"
                            ref={
                              index === 0
                                ? firstMushafAyahRef
                                : index === mushafRenderedAyahs.length - 1
                                  ? lastMushafAyahRef
                                  : null
                            }
                          >
                            <div className="flex items-start gap-3">
                              <div className="mushaf-ayah-number">
                                {ayah.ayahNumber}
                              </div>
                              <div className="flex-1">
                                <p className="surah-explanation-arab" dir="rtl">
                                  {stripLeadingBasmalahFromAyah(
                                    ayah.arab || "—",
                                    ayah.surahNumber,
                                    ayah.ayahNumber,
                                  )}{" "}
                                  <span
                                    className="mushaf-ayah-number-inline mushaf-ayah-number-inline--small"
                                    dir="ltr"
                                  >
                                    {toArabicNumber(ayah.ayahNumber)}
                                  </span>
                                </p>
                                <p className="surah-explanation-translation">
                                  {ayah.translation ||
                                    "Terjemah belum tersedia."}
                                </p>
                                {ayah.isContinuationFromNextPage ? (
                                  <p className="surah-explanation-continuation-note">
                                    Ayat ini melanjutkan ke halaman berikutnya.
                                  </p>
                                ) : null}
                                <div className="surah-explanation-actions">
                                  {showGoToMushafButton ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setReadingMode("pdf");
                                        setMushafPage(
                                          clampMushafPage(ayahMushafPage),
                                        );
                                      }}
                                      className="surah-action-btn surah-action-btn--mushaf is-active"
                                    >
                                      {`Ke Halaman ${ayahMushafPage}`}
                                    </button>
                                  ) : null}
                                  <Link
                                    to={`/quran/${ayah.surahNumber}/${ayah.ayahNumber}`}
                                    className="surah-action-btn surah-action-btn--detail"
                                  >
                                    Detail Ayat
                                  </Link>
                                  {duplicateAsbabSourceAyah !== null ? (
                                    <span className="surah-asbab-duplicate-note">
                                      {`Asbab sama dengan ayat ${duplicateAsbabSourceAyah}.`}
                                    </span>
                                  ) : asbabEntry ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        openAsbabModal(
                                          ayah.surahNumber,
                                          ayah.ayahNumber,
                                          surahLabel,
                                          ayah.id,
                                        )
                                      }
                                      aria-haspopup="dialog"
                                      className="surah-action-btn surah-action-btn--asbab is-active"
                                    >
                                      Asbabun Nuzul
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}

            {readingMode !== "pdf" && data?.ayahs?.length ? (
              <div className="surah-explanation-shell mt-6">
                <div className="surah-explanation">
                  <div className="surah-explanation-header">
                    <div className="surah-explanation-header-main">
                      <p className="surah-explanation-kicker">
                        Penjelasan Surah
                      </p>
                      <h3 className="surah-explanation-title">
                        Penjelasan Ayat
                      </h3>
                      <p className="surah-explanation-subtitle">
                        {`Terjemah per ayat untuk surah ${meta.name_latin}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="surah-explanation-toggle"
                      onClick={() =>
                        setIsExplanationExpanded(
                          (prevExpanded) => !prevExpanded,
                        )
                      }
                      aria-expanded={isExplanationExpanded}
                      aria-controls="surah-explanation-list"
                    >
                      {isExplanationExpanded
                        ? "Sembunyikan"
                        : "Lihat Penjelasan"}
                    </button>
                  </div>
                  <div
                    id="surah-explanation-list"
                    className={`surah-explanation-list ${
                      isExplanationExpanded ? "" : "is-collapsed"
                    }`}
                  >
                    {visibleAyahs.length === 0 ? (
                      <p className="surah-explanation-empty">
                        Data ayat belum tersedia.
                      </p>
                    ) : null}
                    {visibleAyahs.map((ayah) => {
                      const ayahKey = getAsbabAyahKey(
                        ayah.surah_number,
                        ayah.ayah_number,
                      );
                      const asbabEntry = asbabLookup[ayahKey];
                      const duplicateAsbabSourceAyah =
                        interactiveAsbabDuplicateSourceByAyahKey.get(ayahKey) ??
                        null;
                      const ayahMushafPage = ayah.meta?.page ?? null;
                      return (
                        <div
                          key={ayah.id}
                          className="surah-explanation-item cv-auto"
                        >
                          <div className="flex items-start gap-3">
                            <div className="mushaf-ayah-number">
                              {ayah.ayah_number}
                            </div>
                            <div className="flex-1">
                              <p className="surah-explanation-arab" dir="rtl">
                                {stripLeadingBasmalahFromAyah(
                                  ayah.arab,
                                  ayah.surah_number,
                                  ayah.ayah_number,
                                )}{" "}
                                <span
                                  className="mushaf-ayah-number-inline mushaf-ayah-number-inline--small"
                                  dir="ltr"
                                >
                                  {toArabicNumber(ayah.ayah_number)}
                                </span>
                              </p>
                              <p className="surah-explanation-translation">
                                {ayah.translation}
                              </p>
                              <div className="surah-explanation-actions">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!ayahMushafPage) return;
                                    const shouldScrollToPdf =
                                      readingMode !== "pdf";
                                    setReadingMode("pdf");
                                    setMushafPage(
                                      clampMushafPage(ayahMushafPage),
                                    );
                                    if (shouldScrollToPdf) {
                                      window.setTimeout(() => {
                                        pdfPanelRef.current?.scrollIntoView({
                                          behavior: "smooth",
                                          block: "start",
                                        });
                                      }, 100);
                                    }
                                  }}
                                  disabled={!ayahMushafPage}
                                  className={`surah-action-btn surah-action-btn--mushaf ${
                                    ayahMushafPage ? "is-active" : "is-muted"
                                  }`}
                                >
                                  {ayahMushafPage
                                    ? `Lihat Mushaf (Hal. ${ayahMushafPage})`
                                    : "Halaman Mushaf —"}
                                </button>
                                <Link
                                  to={`/quran/${ayah.surah_number}/${ayah.ayah_number}`}
                                  className="surah-action-btn surah-action-btn--detail"
                                >
                                  Detail Ayat
                                </Link>
                                {duplicateAsbabSourceAyah !== null ? (
                                  <span className="surah-asbab-duplicate-note">
                                    {`Asbab sama dengan ayat ${duplicateAsbabSourceAyah}.`}
                                  </span>
                                ) : asbabEntry ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openAsbabModal(
                                        ayah.surah_number,
                                        ayah.ayah_number,
                                        meta?.name_latin,
                                        ayah.id,
                                      )
                                    }
                                    aria-haspopup="dialog"
                                    className="surah-action-btn surah-action-btn--asbab is-active"
                                  >
                                    Asbabun Nuzul
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {asbabModal ? (
          <div
            className="asbab-modal-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="Asbabun Nuzul"
            onClick={closeAsbabModal}
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
                    {asbabModal.surahLabel ??
                      (meta ? meta.name_latin : "Surah")}{" "}
                    · Ayat {asbabModal.ayah}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeAsbabModal}
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
