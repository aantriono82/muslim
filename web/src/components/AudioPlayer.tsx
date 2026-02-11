import { Pause, Play, Square, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AudioTrack } from "../lib/audio";

type SegmentConfig = AudioTrack["segment"];

type SilenceGuardConfig = {
  enabled?: boolean;
  minProgressRatio?: number;
  minSilenceMs?: number;
  thresholdDb?: number;
};

type InlineTrack = {
  src: string;
  label?: string;
  segment?: SegmentConfig;
};

const normalizeSegmentTime = (value?: number) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0) return 0;
  return value;
};

const AudioPlayer = ({
  title,
  src,
  segment,
  onClose,
  autoPlayToken,
  playlist,
  silenceGuard,
}: {
  title: string;
  src?: string | null;
  segment?: SegmentConfig;
  onClose?: () => void;
  autoPlayToken?: number;
  playlist?: InlineTrack[];
  silenceGuard?: SilenceGuardConfig;
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const lastAutoPlayRef = useRef<number | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const playRequestRef = useRef(false);
  const segmentHandledRef = useRef(false);
  const prevSrcRef = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analyserDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const silenceStartedAtRef = useRef<number | null>(null);
  const silenceRafRef = useRef<number | null>(null);

  const tracks = useMemo(() => {
    if (playlist && playlist.length > 0) {
      return playlist.filter((item) => item && item.src);
    }
    return src ? [{ src, label: title, segment }] : [];
  }, [playlist, src, title, segment]);

  const tracksKey = useMemo(
    () =>
      tracks
        .map((item, index) => {
          const start = item.segment?.startTime ?? "";
          const end = item.segment?.endTime ?? "";
          const id = item.segment?.id ?? "";
          return `${item.src}:${start}:${end}:${id}:${index}`;
        })
        .join("|"),
    [tracks],
  );

  const activeTrack = tracks[currentIndex] ?? null;
  const activeSrc = activeTrack?.src ?? null;

  const segmentStart = useMemo(
    () => normalizeSegmentTime(activeTrack?.segment?.startTime) ?? 0,
    [activeTrack?.segment?.startTime],
  );

  const segmentEnd = useMemo(() => {
    const value = normalizeSegmentTime(activeTrack?.segment?.endTime);
    if (value === null) return null;
    if (value <= segmentStart) return null;
    return value;
  }, [activeTrack?.segment?.endTime, segmentStart]);

  const activeTrackKey = useMemo(() => {
    if (!activeTrack) return "";
    const start = segmentStart.toFixed(3);
    const end = segmentEnd === null ? "" : segmentEnd.toFixed(3);
    const segmentId = activeTrack.segment?.id ?? "";
    return `${activeTrack.src}::${start}::${end}::${segmentId}::${currentIndex}`;
  }, [activeTrack, currentIndex, segmentStart, segmentEnd]);

  const resumeAudioContext = useCallback(() => {
    const ctx = audioContextRef.current;
    if (!ctx || ctx.state === "running") return;
    ctx.resume().catch(() => undefined);
  }, []);

  const advanceToNextTrack = useCallback(() => {
    if (currentIndex >= tracks.length - 1) return false;
    playRequestRef.current = true;
    setCurrentIndex((prev) => Math.min(prev + 1, tracks.length - 1));
    return true;
  }, [currentIndex, tracks.length]);

  const syncFromAudio = useCallback(
    (audio: HTMLAudioElement) => {
      const rawCurrent = Number.isFinite(audio.currentTime)
        ? audio.currentTime
        : 0;
      const rawDuration =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : 0;
      const effectiveDuration =
        segmentEnd !== null
          ? Math.max(segmentEnd - segmentStart, 0)
          : Math.max(rawDuration - segmentStart, 0);
      const relativeTime = Math.max(rawCurrent - segmentStart, 0);
      const clampedTime =
        effectiveDuration > 0
          ? Math.min(relativeTime, effectiveDuration)
          : relativeTime;

      setProgress(clampedTime);
      setDuration(effectiveDuration);

      if (
        segmentEnd !== null &&
        !segmentHandledRef.current &&
        rawCurrent >= segmentEnd - 0.05
      ) {
        segmentHandledRef.current = true;
        if (!advanceToNextTrack()) {
          audio.pause();
          setIsPlaying(false);
        }
      }
    },
    [advanceToNextTrack, segmentEnd, segmentStart],
  );

  const seekToSegmentStart = useCallback(
    (audio: HTMLAudioElement) => {
      if (segmentStart <= 0) return;
      const maxStart =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? Math.max(audio.duration - 0.05, 0)
          : segmentStart;
      const targetStart = Math.min(segmentStart, maxStart);
      try {
        if (typeof audio.fastSeek === "function") {
          audio.fastSeek(targetStart);
        } else {
          audio.currentTime = targetStart;
        }
      } catch {
        // ignore seek errors when metadata is not ready yet
      }
    },
    [segmentStart],
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTime = () => {
      syncFromAudio(audio);
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      segmentHandledRef.current = true;
      if (!advanceToNextTrack()) {
        setIsPlaying(false);
      }
    };

    audio.addEventListener("timeupdate", handleTime);
    audio.addEventListener("loadedmetadata", handleTime);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTime);
      audio.removeEventListener("loadedmetadata", handleTime);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [activeTrackKey, advanceToNextTrack, syncFromAudio]);

  useEffect(() => {
    return () => {
      if (silenceRafRef.current !== null) {
        cancelAnimationFrame(silenceRafRef.current);
        silenceRafRef.current = null;
      }
      const ctx = audioContextRef.current;
      if (!ctx) return;
      ctx.close().catch(() => undefined);
      audioContextRef.current = null;
      sourceNodeRef.current = null;
      analyserRef.current = null;
      analyserDataRef.current = null;
    };
  }, []);

  useEffect(() => {
    setCurrentIndex(0);
  }, [tracksKey]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const previousSrc = prevSrcRef.current;
    const isSameSource = previousSrc !== null && previousSrc === activeSrc;
    prevSrcRef.current = activeSrc;
    segmentHandledRef.current = false;

    const applySegmentStart = () => {
      seekToSegmentStart(audio);
      syncFromAudio(audio);
    };

    if (isSameSource && activeSrc) {
      applySegmentStart();
      return;
    }

    audio.pause();
    setIsPlaying(false);

    if (audio.readyState >= 1) {
      applySegmentStart();
      return;
    }

    audio.addEventListener("loadedmetadata", applySegmentStart, { once: true });
    return () => {
      audio.removeEventListener("loadedmetadata", applySegmentStart);
    };
  }, [activeSrc, activeTrackKey, seekToSegmentStart, syncFromAudio]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const audio = audioRef.current;
    if (!audio) return;

    const guardEnabled =
      Boolean(silenceGuard?.enabled) &&
      tracks.length === 1 &&
      segmentEnd !== null &&
      isPlaying;

    if (!guardEnabled) {
      if (silenceRafRef.current !== null) {
        cancelAnimationFrame(silenceRafRef.current);
        silenceRafRef.current = null;
      }
      silenceStartedAtRef.current = null;
      return;
    }

    const AudioContextCtor =
      window.AudioContext ||
      (
        window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;
    if (!AudioContextCtor) return;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextCtor();
    }
    const ctx = audioContextRef.current;
    if (!ctx) return;

    if (!sourceNodeRef.current) {
      sourceNodeRef.current = ctx.createMediaElementSource(audio);
    }
    if (!analyserRef.current) {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.12;
      sourceNodeRef.current.connect(analyser);
      analyser.connect(ctx.destination);
      analyserRef.current = analyser;
      analyserDataRef.current = new Uint8Array(analyser.fftSize);
    }
    resumeAudioContext();

    const ratio = Math.min(
      Math.max(silenceGuard?.minProgressRatio ?? 0.82, 0.5),
      0.98,
    );
    const minSilenceMs = Math.max(silenceGuard?.minSilenceMs ?? 500, 250);
    const thresholdDb = silenceGuard?.thresholdDb ?? -40;
    const thresholdLinear = Math.pow(10, thresholdDb / 20);
    const segmentDuration = Math.max(segmentEnd - segmentStart, 0);
    const minProgressTime = Math.max(
      0.5,
      Math.min(segmentDuration * ratio, Math.max(segmentDuration - 0.2, 0)),
    );

    let disposed = false;
    const tick = () => {
      if (disposed) return;
      const media = audioRef.current;
      const analyser = analyserRef.current;
      const data = analyserDataRef.current;
      if (!media || !analyser || !data || media.paused || media.ended) {
        silenceStartedAtRef.current = null;
        silenceRafRef.current = window.requestAnimationFrame(tick);
        return;
      }
      if (segmentHandledRef.current) {
        silenceStartedAtRef.current = null;
        return;
      }

      const played = Math.max(media.currentTime - segmentStart, 0);
      if (played < minProgressTime) {
        silenceStartedAtRef.current = null;
        silenceRafRef.current = window.requestAnimationFrame(tick);
        return;
      }

      analyser.getByteTimeDomainData(data);
      let sumSquares = 0;
      for (let i = 0; i < data.length; i += 1) {
        const sample = (data[i] - 128) / 128;
        sumSquares += sample * sample;
      }
      const rms = Math.sqrt(sumSquares / data.length);
      const now = performance.now();

      if (rms <= thresholdLinear) {
        if (silenceStartedAtRef.current === null) {
          silenceStartedAtRef.current = now;
        }
        if (now - silenceStartedAtRef.current >= minSilenceMs) {
          segmentHandledRef.current = true;
          silenceStartedAtRef.current = null;
          if (!advanceToNextTrack()) {
            media.pause();
            setIsPlaying(false);
          }
          return;
        }
      } else {
        silenceStartedAtRef.current = null;
      }

      silenceRafRef.current = window.requestAnimationFrame(tick);
    };

    silenceRafRef.current = window.requestAnimationFrame(tick);

    return () => {
      disposed = true;
      if (silenceRafRef.current !== null) {
        cancelAnimationFrame(silenceRafRef.current);
        silenceRafRef.current = null;
      }
      silenceStartedAtRef.current = null;
    };
  }, [
    advanceToNextTrack,
    isPlaying,
    resumeAudioContext,
    segmentEnd,
    segmentStart,
    silenceGuard?.enabled,
    silenceGuard?.minProgressRatio,
    silenceGuard?.minSilenceMs,
    silenceGuard?.thresholdDb,
    tracks.length,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const nextTrack = tracks[currentIndex + 1];
    if (!nextTrack?.src) return;

    const preloader = new Audio();
    preloader.preload = "auto";
    preloader.src = nextTrack.src;
    preloader.load();

    return () => {
      preloader.src = "";
    };
  }, [currentIndex, tracks]);

  useEffect(() => {
    if (!activeSrc) return;
    if (!autoPlayToken) return;
    if (lastAutoPlayRef.current === autoPlayToken) return;
    lastAutoPlayRef.current = autoPlayToken;
    playRequestRef.current = true;
    setCurrentIndex(0);
  }, [activeSrc, autoPlayToken]);

  useEffect(() => {
    if (!activeSrc) return;
    if (!playRequestRef.current) return;

    playRequestRef.current = false;
    const audio = audioRef.current;
    if (!audio) return;

    const playNow = () => {
      resumeAudioContext();
      seekToSegmentStart(audio);
      audio.play().catch(() => null);
    };

    if (segmentStart > 0 && audio.readyState < 1) {
      audio.addEventListener("loadedmetadata", playNow, { once: true });
      return () => {
        audio.removeEventListener("loadedmetadata", playNow);
      };
    }

    playNow();
  }, [
    activeTrackKey,
    activeSrc,
    resumeAudioContext,
    seekToSegmentStart,
    segmentStart,
  ]);

  const formatTime = (value: number) => {
    const minutes = Math.floor(value / 60);
    const seconds = Math.floor(value % 60);
    return `${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  };

  const handlePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      resumeAudioContext();
      if (segmentStart > 0 && audio.currentTime < segmentStart) {
        try {
          audio.currentTime = segmentStart;
        } catch {
          // ignore seek errors
        }
      }
      audio.play().catch(() => null);
    } else {
      audio.pause();
    }
  };

  const handleStop = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    const resetAt = segmentStart > 0 ? segmentStart : 0;
    try {
      audio.currentTime = resetAt;
    } catch {
      // ignore seek errors
    }
    setProgress(0);
  };

  const handleClose = () => {
    handleStop();
    onClose?.();
  };

  const handleSeek = (value: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(value)) return;
    const clippedValue = Math.max(0, Math.min(value, duration || value));
    let target = segmentStart + clippedValue;
    if (segmentEnd !== null) {
      target = Math.min(target, segmentEnd);
    }
    try {
      audio.currentTime = target;
    } catch {
      // ignore seek errors
    }
    setProgress(clippedValue);
  };

  if (!activeSrc) {
    return (
      <div className="winamp-shell winamp-shell--mini">
        <div className="winamp-titlebar">
          <span className="winamp-logo">WINAMP</span>
          <span className="winamp-title">AUDIO TIDAK TERSEDIA</span>
          {onClose ? (
            <button
              type="button"
              onClick={handleClose}
              className="winamp-close"
              aria-label="Tutup player"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        <div className="winamp-body">
          <div className="winamp-display">
            <div className="winamp-track">{title}</div>
            <div className="winamp-subtitle">
              Audio belum tersedia untuk konten ini.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="winamp-shell winamp-shell--mini">
      <div className="winamp-titlebar">
        <span className="winamp-logo">WINAMP</span>
        <span className="winamp-title">INLINE PLAYER</span>
        {onClose ? (
          <button
            type="button"
            onClick={handleClose}
            className="winamp-close"
            aria-label="Tutup player"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <audio
        ref={audioRef}
        className="sr-only"
        crossOrigin="anonymous"
        preload="metadata"
        src={activeSrc ?? undefined}
      />

      <div className="winamp-body">
        <div className="winamp-display">
          <div className="winamp-track">{title}</div>
          <div className="winamp-subtitle">Audio lokal</div>
          <div className="winamp-meta">
            <span>MP3</span>
            {tracks.length > 1 ? (
              <span>{activeTrack?.label ?? `Track ${currentIndex + 1}`}</span>
            ) : null}
            <span>{formatTime(progress)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
        <div className="winamp-vu">
          <div className="winamp-vu-bars">
            {Array.from({ length: 8 }, (_, index) => (
              <span
                key={`meter-${index}`}
                className={`winamp-vu-bar ${isPlaying ? "is-playing" : ""}`}
                style={{ animationDelay: `${index * 0.1}s` }}
              />
            ))}
          </div>
          <div className="winamp-vu-labels">
            <span>{isPlaying ? "PLAY" : "STOP"}</span>
            <span>mono</span>
          </div>
        </div>
      </div>

      <div className="winamp-progress">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={1}
          value={duration ? progress : 0}
          onChange={(event) => handleSeek(Number(event.target.value))}
          className="winamp-slider"
          aria-label="Posisi audio"
          disabled={!duration}
        />
        <div className="winamp-time">
          <span>{formatTime(progress)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <div className="winamp-transport">
        <div className="winamp-buttons">
          <button
            type="button"
            onClick={handlePlayPause}
            className="winamp-btn winamp-btn--primary"
            aria-label={isPlaying ? "Jeda" : "Putar"}
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            onClick={handleStop}
            className="winamp-btn"
            aria-label="Stop"
          >
            <Square className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AudioPlayer;
