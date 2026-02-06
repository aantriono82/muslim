import {
  Download,
  ListMusic,
  Play,
  PlayCircle,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  Timer,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAudio } from "../lib/audio";

const GlobalAudioPlayer = () => {
  const {
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
    next,
    prev,
    toggleShuffle,
    setPlaybackRate,
    setRepeatMode,
    jumpTo,
    setQueueByTrack,
  } = useAudio();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [sleepMinutes, setSleepMinutes] = useState(0);
  const [sleepEndsAt, setSleepEndsAt] = useState<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const [resumeTime, setResumeTime] = useState<number | null>(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [prevActionLabel, setPrevActionLabel] = useState<string | null>(null);
  const [autoplayLast, setAutoplayLast] = useState(false);
  const lastSavedRef = useRef(0);
  const prevTimerRef = useRef<number | null>(null);
  const POSITION_KEY = "ibadahmu:audio:position";
  const SLEEP_KEY = "ibadahmu:audio:sleep";
  const AUTOPLAY_KEY = "ibadahmu:audio:autoplay";
  const [showQueue, setShowQueue] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const resolvedSrc = typeof track?.src === "string" ? track.src : "";

  const streamInfo = useMemo(() => {
    if (!track || !resolvedSrc) return null;
    const safeSrc = resolvedSrc;
    const format =
      track.format ??
      safeSrc.split("?")[0].split(".").pop()?.toUpperCase() ??
      "Unknown";
    let sourceLabel = track.sourceLabel;
    if (!sourceLabel) {
      try {
        const hostname = new URL(safeSrc).hostname.replace(/^www\./, "");
        sourceLabel = hostname;
      } catch {
        sourceLabel = "Unknown source";
      }
    }
    return {
      format,
      sourceLabel,
      quality: track.quality ?? "Default",
    };
  }, [track, resolvedSrc]);

  useEffect(() => {
    if (track && !resolvedSrc) {
      setTrack(null);
    }
  }, [track, resolvedSrc, setTrack]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const className = "has-audio-player";
    if (track) {
      document.body.classList.add(className);
    } else {
      document.body.classList.remove(className);
    }
    return () => {
      document.body.classList.remove(className);
    };
  }, [track]);

  const formatTime = (value: number) => {
    const minutes = Math.floor(value / 60);
    const seconds = Math.floor(value % 60);
    return `${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  };

  const savePosition = (time: number) => {
    if (!track || !resolvedSrc) return;
    try {
      window.localStorage.setItem(
        POSITION_KEY,
        JSON.stringify({ src: resolvedSrc, time, updatedAt: Date.now() }),
      );
    } catch {
      // ignore
    }
  };

  const clearPosition = () => {
    try {
      window.localStorage.removeItem(POSITION_KEY);
    } catch {
      // ignore
    }
    setResumeTime(null);
    lastSavedRef.current = 0;
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(AUTOPLAY_KEY);
      if (raw === null) return;
      setAutoplayLast(raw === "true");
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(AUTOPLAY_KEY, String(autoplayLast));
    } catch {
      // ignore
    }
  }, [autoplayLast]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.playbackRate = playbackRate;
  }, [playbackRate, track]);

  useEffect(() => {
    if (!audioRef.current || !track) return;
    const audio = audioRef.current;
    if (!(autoplayLast || lastAction === "user")) {
      setAutoplayBlocked(false);
      return;
    }
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise
        .then(() => setAutoplayBlocked(false))
        .catch(() => setAutoplayBlocked(true));
    }
  }, [track, autoplayLast, lastAction]);

  useEffect(() => {
    if (!audioRef.current || !track) return;
    const audio = audioRef.current;
    const handleLoaded = () => {
      let stored: { src?: string; time?: number } | null = null;
      try {
        const raw = window.localStorage.getItem(POSITION_KEY);
        if (raw) stored = JSON.parse(raw);
      } catch {
        stored = null;
      }
      setDuration(audio.duration || 0);
      if (
        stored &&
        stored.src === resolvedSrc &&
        typeof stored.time === "number" &&
        stored.time > 5 &&
        audio.duration &&
        stored.time < audio.duration - 2
      ) {
        audio.currentTime = stored.time;
        setResumeTime(stored.time);
      } else {
        setResumeTime(null);
      }
    };
    audio.addEventListener("loadedmetadata", handleLoaded);
    return () => audio.removeEventListener("loadedmetadata", handleLoaded);
  }, [track]);

  useEffect(() => {
    if (!audioRef.current || !track) return;
    const audio = audioRef.current;
    const handleTimeUpdate = () => {
      if (!audio.duration) return;
      setProgress(audio.currentTime);
      if (audio.currentTime - lastSavedRef.current >= 5) {
        lastSavedRef.current = audio.currentTime;
        savePosition(audio.currentTime);
      }
    };
    const handlePause = () => {
      if (!audio.duration) return;
      savePosition(audio.currentTime);
    };
    const handleDurationChange = () => setDuration(audio.duration || 0);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("durationchange", handleDurationChange);
    audio.addEventListener("pause", handlePause);
    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("durationchange", handleDurationChange);
      audio.removeEventListener("pause", handlePause);
    };
  }, [track]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(SLEEP_KEY);
      if (!raw) return;
      const parsed = Number.parseInt(raw, 10);
      if (Number.isFinite(parsed) && parsed >= 0) {
        setSleepMinutes(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (sleepMinutes <= 0) {
      setSleepEndsAt(null);
      return;
    }
    const endsAt = Date.now() + sleepMinutes * 60 * 1000;
    setSleepEndsAt(endsAt);
    timerRef.current = window.setTimeout(
      () => {
        setTrack(null);
        setSleepMinutes(0);
      },
      sleepMinutes * 60 * 1000,
    );
  }, [sleepMinutes, setTrack]);

  const sleepLabel = sleepEndsAt
    ? new Date(sleepEndsAt).toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  useEffect(() => {
    return () => {
      if (prevTimerRef.current) {
        window.clearTimeout(prevTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(SLEEP_KEY, String(sleepMinutes));
    } catch {
      // ignore
    }
  }, [sleepMinutes]);

  if (!track || !streamInfo) return null;

  const handlePrevClick = () => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 5) {
      audio.currentTime = 0;
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }
      savePosition(0);
      setPrevActionLabel("Restart track");
      if (prevTimerRef.current) window.clearTimeout(prevTimerRef.current);
      prevTimerRef.current = window.setTimeout(
        () => setPrevActionLabel(null),
        2000,
      );
      return;
    }
    prev({ wrap: true });
    setPrevActionLabel("Track sebelumnya");
    if (prevTimerRef.current) window.clearTimeout(prevTimerRef.current);
    prevTimerRef.current = window.setTimeout(
      () => setPrevActionLabel(null),
      2000,
    );
  };

  const handleNextClick = () => {
    if (isShuffle) {
      next({ wrap: true });
      return;
    }
    if (repeatMode === "all") {
      next({ wrap: true });
      return;
    }
    next({ wrap: false });
  };

  const handleQueueClick = () => {
    setShowQueue((prevValue) => !prevValue);
  };

  const handleHistoryClick = () => {
    setShowHistory((prevValue) => !prevValue);
  };

  const handleJump = (index: number) => {
    jumpTo(index);
    setShowQueue(false);
  };

  const handlePlayHistory = (itemIndex: number) => {
    const item = history[itemIndex];
    if (!item) return;
    setQueueByTrack(item);
    setShowHistory(false);
  };

  const resumeLabel =
    resumeTime && resumeTime > 5 ? formatTime(resumeTime) : null;

  const moduleLabels: Record<string, string> = {
    murratal: "Murratal",
    quran: "Quran",
    doa: "Doa",
    matsurat: "Matsurat",
  };

  const moduleEntries = Object.entries(lastByModule ?? {})
    .filter(([, item]) => Boolean(item?.src))
    .map(([key, item]) => ({
      key,
      label: moduleLabels[key] ?? key,
      item,
    }));

  const handleRepeatToggle = () => {
    if (repeatMode === "off") {
      setRepeatMode("all");
    } else if (repeatMode === "all") {
      setRepeatMode("one");
    } else {
      setRepeatMode("off");
    }
  };

  return (
    <div className="safe-bottom fixed bottom-20 left-0 right-0 z-40 mx-auto w-full max-w-4xl px-4 lg:bottom-6">
      <div className="rounded-2xl border border-emerald-100 bg-white/95 p-4 shadow-card backdrop-blur">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-textPrimary">
              {track.title}
            </p>
            {track.subtitle ? (
              <p className="text-xs text-textSecondary">{track.subtitle}</p>
            ) : null}
            {queue.length > 1 ? (
              <p className="mt-1 text-[11px] text-textSecondary">
                Antrian {currentIndex + 1} dari {queue.length}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setTrack(null)}
            className="rounded-full border border-emerald-100 p-1 text-textSecondary"
            aria-label="Tutup audio"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <audio
          ref={audioRef}
          className="mt-3 w-full"
          controls
          autoPlay={autoplayLast || lastAction === "user"}
          preload="none"
          src={resolvedSrc}
          onPlay={() => setAutoplayBlocked(false)}
          onEnded={() => {
            clearPosition();
            if (repeatMode === "one") {
              const audio = audioRef.current;
              if (audio) {
                audio.currentTime = 0;
                const playPromise = audio.play();
                if (playPromise && typeof playPromise.catch === "function") {
                  playPromise.catch(() => {});
                }
              }
              return;
            }
            if (repeatMode === "all") {
              next({ wrap: true });
              return;
            }
            next({ wrap: false });
          }}
        />

        <div className="mt-2">
          <div className="h-1 w-full overflow-hidden rounded-full bg-emerald-100">
            <div
              className="h-1 rounded-full bg-emerald-500"
              style={{
                width: duration > 0 ? `${(progress / duration) * 100}%` : "0%",
              }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-textSecondary">
            <span>{formatTime(progress)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="mt-3 flex flex-nowrap items-center gap-2 overflow-x-auto py-1 text-xs text-textSecondary scrollbar-slim sm:flex-wrap">
          <button
            type="button"
            onClick={handlePrevClick}
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-emerald-200 px-2 py-1 text-emerald-700"
          >
            <SkipBack className="h-3.5 w-3.5" /> Prev
          </button>
          <button
            type="button"
            onClick={handleNextClick}
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-emerald-200 px-2 py-1 text-emerald-700"
          >
            <SkipForward className="h-3.5 w-3.5" /> Next
          </button>
          <button
            type="button"
            onClick={toggleShuffle}
            className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-1 ${
              isShuffle
                ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                : "border-emerald-200 text-emerald-700"
            }`}
          >
            <Shuffle className="h-3.5 w-3.5" />
            {isShuffle ? "Shuffle On" : "Shuffle Off"}
          </button>
          <button
            type="button"
            onClick={handleRepeatToggle}
            className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-1 ${
              repeatMode === "off"
                ? "border-emerald-200 text-emerald-700"
                : repeatMode === "one"
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-emerald-400 bg-emerald-50 text-emerald-700"
            }`}
          >
            <Repeat className="h-3.5 w-3.5" />
            {repeatMode === "one"
              ? "Repeat One"
              : repeatMode === "all"
                ? "Repeat All"
                : "Repeat Off"}
          </button>
          <button
            type="button"
            onClick={handleQueueClick}
            className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-1 ${
              showQueue
                ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                : "border-emerald-200 text-emerald-700"
            }`}
          >
            <ListMusic className="h-3.5 w-3.5" />
            Queue
          </button>
          <button
            type="button"
            onClick={handleHistoryClick}
            className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-1 ${
              showHistory
                ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                : "border-emerald-200 text-emerald-700"
            }`}
          >
            <ListMusic className="h-3.5 w-3.5" />
            History
          </button>
          <button
            type="button"
            onClick={() => setAutoplayLast((prev) => !prev)}
            className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-1 ${
              autoplayLast
                ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                : "border-emerald-200 text-emerald-700"
            }`}
          >
            <PlayCircle className="h-3.5 w-3.5" />
            {autoplayLast ? "Autoplay On" : "Autoplay Off"}
          </button>
          <label className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-emerald-200 px-2 py-1 text-emerald-700">
            <Play className="h-3.5 w-3.5" />
            <select
              value={playbackRate}
              onChange={(event) => setPlaybackRate(Number(event.target.value))}
              className="bg-transparent text-xs outline-none"
            >
              <option value={0.75}>0.75x</option>
              <option value={1}>1.0x</option>
              <option value={1.25}>1.25x</option>
              <option value={1.5}>1.5x</option>
            </select>
          </label>
          <label className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-emerald-200 px-2 py-1 text-emerald-700">
            <Timer className="h-3.5 w-3.5" />
            <select
              value={sleepMinutes}
              onChange={(event) => setSleepMinutes(Number(event.target.value))}
              className="bg-transparent text-xs outline-none"
            >
              <option value={0}>Sleep Off</option>
              <option value={5}>5 menit</option>
              <option value={10}>10 menit</option>
              <option value={15}>15 menit</option>
              <option value={30}>30 menit</option>
            </select>
          </label>
          {sleepLabel ? (
            <span className="text-[11px] text-textSecondary">
              Akan berhenti pukul {sleepLabel}
            </span>
          ) : null}
          {resumeLabel ? (
            <span className="text-[11px] text-textSecondary">
              Resume di {resumeLabel}
            </span>
          ) : null}
          {prevActionLabel ? (
            <span className="text-[11px] text-emerald-700">
              {prevActionLabel}
            </span>
          ) : null}
          {autoplayBlocked ? (
            <span className="text-[11px] text-textSecondary">
              Autoplay diblokir, tekan play.
            </span>
          ) : null}
        </div>

        {moduleEntries.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-textSecondary">
            {moduleEntries.map(({ key, label, item }) => (
              <button
                key={key}
                type="button"
                onClick={() => setQueueByTrack(item)}
                className="rounded-full border border-emerald-200 px-3 py-1 text-emerald-700"
              >
                Lanjutkan {label}
              </button>
            ))}
          </div>
        ) : null}

        {showQueue ? (
          <div className="mt-3 rounded-xl border border-emerald-100 bg-white/70 p-3 text-xs">
            <p className="text-[11px] font-semibold text-textSecondary">
              Antrian Saat Ini
            </p>
            <div className="mt-2 space-y-2">
              {queue.length === 0 ? (
                <p className="text-textSecondary">Antrian kosong.</p>
              ) : (
                queue.map((item, index) => (
                  <button
                    key={`${item.src}-${index}`}
                    type="button"
                    onClick={() => handleJump(index)}
                    className={`w-full rounded-lg border px-3 py-2 text-left ${
                      index === currentIndex
                        ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                        : "border-emerald-100 text-textSecondary"
                    }`}
                  >
                    <p className="font-semibold">{item.title}</p>
                    {item.module ? (
                      <p className="text-[10px] uppercase tracking-wide text-emerald-600">
                        {moduleLabels[item.module] ?? item.module}
                      </p>
                    ) : null}
                    {item.subtitle ? (
                      <p className="text-[11px]">{item.subtitle}</p>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          </div>
        ) : null}

        {showHistory ? (
          <div className="mt-3 rounded-xl border border-emerald-100 bg-white/70 p-3 text-xs">
            <p className="text-[11px] font-semibold text-textSecondary">
              Terakhir Diputar
            </p>
            <div className="mt-2 space-y-2">
              {history.length === 0 ? (
                <p className="text-textSecondary">Belum ada riwayat.</p>
              ) : (
                history.map((item, index) => (
                  <button
                    key={`${item.src}-${index}`}
                    type="button"
                    onClick={() => handlePlayHistory(index)}
                    className="w-full rounded-lg border border-emerald-100 px-3 py-2 text-left text-textSecondary hover:border-emerald-300 hover:text-emerald-700"
                  >
                    <p className="font-semibold">{item.title}</p>
                    {item.module ? (
                      <p className="text-[10px] uppercase tracking-wide text-emerald-600">
                        {moduleLabels[item.module] ?? item.module}
                      </p>
                    ) : null}
                    {item.subtitle ? (
                      <p className="text-[11px]">{item.subtitle}</p>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-textSecondary">
          <div className="flex flex-wrap items-center gap-3">
            <span>Stream: {streamInfo.sourceLabel}</span>
            <span>Format: {streamInfo.format}</span>
            <span>Kualitas: {streamInfo.quality}</span>
          </div>
          <a
            href={resolvedSrc}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-full border border-emerald-200 px-2 py-1 text-emerald-700"
          >
            <Download className="h-3.5 w-3.5" /> Download
          </a>
        </div>
      </div>
    </div>
  );
};

export default GlobalAudioPlayer;
