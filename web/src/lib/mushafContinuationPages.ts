export const MUSHAF_TOTAL_PAGES = 604;

export const MUSHAF_CONTINUATION_APPEND_PAGE_LIST = [] as const;

export const MUSHAF_CONTINUATION_APPEND_PAGES = new Set<number>(
  MUSHAF_CONTINUATION_APPEND_PAGE_LIST,
);

export const MUSHAF_CONTINUATION_SKIP_PAGES = new Set<number>(
  MUSHAF_CONTINUATION_APPEND_PAGE_LIST.map((page) => page + 1).filter(
    (page) => page <= MUSHAF_TOTAL_PAGES,
  ),
);
