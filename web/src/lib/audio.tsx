import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";

export type AudioTrack = {
  title: string;
  subtitle?: string;
  src: string;
  sourceLabel?: string;
  quality?: string;
  format?: string;
  module?: string;
};

type AudioContextValue = {
  track: AudioTrack | null;
  queue: AudioTrack[];
  currentIndex: number;
  isShuffle: boolean;
  playbackRate: number;
  repeatMode: "off" | "one" | "all";
  lastAction: "restore" | "user";
  history: AudioTrack[];
  lastByModule: Record<string, AudioTrack>;
  setTrack: (track: AudioTrack | null) => void;
  setQueue: (tracks: AudioTrack[], startIndex?: number) => void;
  setQueueByTrack: (track: AudioTrack) => void;
  jumpTo: (index: number) => void;
  next: (options?: { wrap?: boolean }) => void;
  prev: (options?: { wrap?: boolean }) => void;
  toggleShuffle: () => void;
  setShuffle: (value: boolean) => void;
  setRepeatMode: (mode: "off" | "one" | "all") => void;
  setPlaybackRate: (rate: number) => void;
};

const AudioContext = createContext<AudioContextValue | undefined>(undefined);

const SHUFFLE_KEY = "ibadahmu:audio:shuffle";
const RATE_KEY = "ibadahmu:audio:rate";
const QUEUE_KEY = "ibadahmu:audio:queue";
const INDEX_KEY = "ibadahmu:audio:index";
const REPEAT_KEY = "ibadahmu:audio:repeat";
const HISTORY_KEY = "ibadahmu:audio:history";
const HISTORY_LIMIT = 12;
const MODULE_LAST_KEY = "ibadahmu:audio:last-module";

const readStoredBoolean = (key: string, fallback: boolean) => {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw === "true";
  } catch {
    return fallback;
  }
};

const readStoredNumber = (key: string, fallback: number) => {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const readStoredQueue = (key: string) => {
  if (typeof window === "undefined") return [] as AudioTrack[];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [] as AudioTrack[];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [] as AudioTrack[];
    return parsed.filter(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof item.title === "string" &&
        typeof item.src === "string",
    ) as AudioTrack[];
  } catch {
    return [] as AudioTrack[];
  }
};

const readStoredHistory = (key: string) => {
  if (typeof window === "undefined") return [] as AudioTrack[];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [] as AudioTrack[];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [] as AudioTrack[];
    return parsed.filter(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof item.title === "string" &&
        typeof item.src === "string",
    ) as AudioTrack[];
  } catch {
    return [] as AudioTrack[];
  }
};

const readStoredLastByModule = (key: string) => {
  if (typeof window === "undefined") return {} as Record<string, AudioTrack>;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {} as Record<string, AudioTrack>;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object")
      return {} as Record<string, AudioTrack>;
    const entries = Object.entries(parsed as Record<string, AudioTrack>);
    const cleaned: Record<string, AudioTrack> = {};
    entries.forEach(([module, item]) => {
      if (
        item &&
        typeof item === "object" &&
        typeof item.title === "string" &&
        typeof item.src === "string"
      ) {
        cleaned[module] = item;
      }
    });
    return cleaned;
  } catch {
    return {} as Record<string, AudioTrack>;
  }
};

const readStoredRepeat = (key: string) => {
  if (typeof window === "undefined") return "off" as const;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === "one" || raw === "all") return raw;
    return "off";
  } catch {
    return "off";
  }
};

export const AudioProvider = ({ children }: { children: ReactNode }) => {
  const initialQueue = readStoredQueue(QUEUE_KEY);
  const initialIndex = readStoredNumber(INDEX_KEY, 0);

  const [queue, setQueueState] = useState<AudioTrack[]>(() => initialQueue);
  const [currentIndex, setCurrentIndex] = useState(() => initialIndex);
  const [lastAction, setLastAction] = useState<"restore" | "user">(() =>
    initialQueue.length > 0 ? "restore" : "user",
  );
  const [isShuffle, setIsShuffle] = useState(() =>
    readStoredBoolean(SHUFFLE_KEY, false),
  );
  const [playbackRate, setPlaybackRate] = useState(() =>
    readStoredNumber(RATE_KEY, 1),
  );
  const [repeatMode, setRepeatMode] = useState<"off" | "one" | "all">(() =>
    readStoredRepeat(REPEAT_KEY),
  );
  const [history, setHistory] = useState<AudioTrack[]>(() =>
    readStoredHistory(HISTORY_KEY),
  );
  const [lastByModule, setLastByModule] = useState<Record<string, AudioTrack>>(
    () => readStoredLastByModule(MODULE_LAST_KEY),
  );

  const track = queue[currentIndex] ?? null;

  const setTrack = useCallback((nextTrack: AudioTrack | null) => {
    if (!nextTrack) {
      setQueueState([]);
      setCurrentIndex(0);
      return;
    }
    setQueueState([nextTrack]);
    setCurrentIndex(0);
    setLastAction("user");
  }, []);

  const setQueueByTrack = useCallback((nextTrack: AudioTrack) => {
    if (!nextTrack) return;
    setQueueState([nextTrack]);
    setCurrentIndex(0);
    setLastAction("user");
  }, []);

  const setQueue = useCallback((tracks: AudioTrack[], startIndex = 0) => {
    if (!tracks.length) {
      setQueueState([]);
      setCurrentIndex(0);
      return;
    }
    const safeIndex = Math.min(Math.max(startIndex, 0), tracks.length - 1);
    setQueueState(tracks);
    setCurrentIndex(safeIndex);
    setLastAction("user");
  }, []);

  const jumpTo = useCallback(
    (index: number) => {
      if (!queue.length) return;
      const safeIndex = Math.min(Math.max(index, 0), queue.length - 1);
      setCurrentIndex(safeIndex);
      setLastAction("user");
    },
    [queue.length],
  );

  const next = useCallback(
    (options?: { wrap?: boolean }) => {
      if (!queue.length) return;
      setLastAction("user");
      if (isShuffle && queue.length > 1) {
        let nextIndex = currentIndex;
        while (nextIndex === currentIndex) {
          nextIndex = Math.floor(Math.random() * queue.length);
        }
        setCurrentIndex(nextIndex);
        return;
      }
      if (currentIndex < queue.length - 1) {
        setCurrentIndex(currentIndex + 1);
        return;
      }
      if (options?.wrap && queue.length > 1) {
        setCurrentIndex(0);
      }
    },
    [queue, currentIndex, isShuffle, setLastAction],
  );

  const prev = useCallback(
    (options?: { wrap?: boolean }) => {
      if (!queue.length) return;
      setLastAction("user");
      if (isShuffle && queue.length > 1) {
        let nextIndex = currentIndex;
        while (nextIndex === currentIndex) {
          nextIndex = Math.floor(Math.random() * queue.length);
        }
        setCurrentIndex(nextIndex);
        return;
      }
      if (currentIndex > 0) {
        setCurrentIndex(currentIndex - 1);
        return;
      }
      if (options?.wrap && queue.length > 1) {
        setCurrentIndex(queue.length - 1);
      }
    },
    [queue, currentIndex, isShuffle, setLastAction],
  );

  const toggleShuffle = useCallback(() => {
    setIsShuffle((prevValue) => !prevValue);
  }, []);

  const setShuffle = useCallback((value: boolean) => {
    setIsShuffle(value);
  }, []);

  useEffect(() => {
    if (queue.length === 0 && currentIndex !== 0) {
      setCurrentIndex(0);
    } else if (currentIndex >= queue.length && queue.length > 0) {
      setCurrentIndex(queue.length - 1);
    }
  }, [queue, currentIndex]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (queue.length === 0) {
        window.localStorage.removeItem(QUEUE_KEY);
        return;
      }
      window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch {
      // ignore
    }
  }, [queue]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(INDEX_KEY, String(currentIndex));
    } catch {
      // ignore
    }
  }, [currentIndex]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(SHUFFLE_KEY, String(isShuffle));
    } catch {
      // ignore
    }
  }, [isShuffle]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(RATE_KEY, String(playbackRate));
    } catch {
      // ignore
    }
  }, [playbackRate]);

  useEffect(() => {
    if (!track) return;
    setHistory((prev) => {
      const next = [track, ...prev.filter((item) => item.src !== track.src)];
      return next.slice(0, HISTORY_LIMIT);
    });
  }, [track]);

  useEffect(() => {
    if (!track?.module) return;
    setLastByModule((prev) => ({
      ...prev,
      [track.module as string]: track,
    }));
  }, [track]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (history.length === 0) {
        window.localStorage.removeItem(HISTORY_KEY);
        return;
      }
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      // ignore
    }
  }, [history]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (Object.keys(lastByModule).length === 0) {
        window.localStorage.removeItem(MODULE_LAST_KEY);
        return;
      }
      window.localStorage.setItem(
        MODULE_LAST_KEY,
        JSON.stringify(lastByModule),
      );
    } catch {
      // ignore
    }
  }, [lastByModule]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(REPEAT_KEY, repeatMode);
    } catch {
      // ignore
    }
  }, [repeatMode]);

  const value = useMemo(
    () => ({
      track,
      queue,
      currentIndex,
      isShuffle,
      playbackRate,
      repeatMode,
      lastAction,
      history,
      lastByModule,
      setTrack,
      setQueue,
      setQueueByTrack,
      jumpTo,
      next,
      prev,
      toggleShuffle,
      setShuffle,
      setRepeatMode,
      setPlaybackRate,
    }),
    [
      track,
      queue,
      currentIndex,
      isShuffle,
      playbackRate,
      repeatMode,
      lastAction,
      history,
      lastByModule,
      setTrack,
      setQueue,
      setQueueByTrack,
      jumpTo,
      next,
      prev,
      toggleShuffle,
      setShuffle,
      setRepeatMode,
      setPlaybackRate,
    ],
  );

  return (
    <AudioContext.Provider value={value}>{children}</AudioContext.Provider>
  );
};

export const useAudio = () => {
  const ctx = useContext(AudioContext);
  if (!ctx) throw new Error("useAudio harus dipakai di dalam AudioProvider");
  return ctx;
};
