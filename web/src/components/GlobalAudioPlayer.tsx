import {
  Download,
  Pause,
  Play,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  Square,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAudio } from "../lib/audio";

const EQ_LABELS = [
  "60",
  "170",
  "310",
  "600",
  "1K",
  "3K",
  "6K",
  "12K",
  "14K",
  "16K",
];

const EQ_FREQUENCIES = [
  60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000,
];

const dbToGain = (db: number) => Math.pow(10, db / 20);
const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);
const normalizeSegmentTime = (value?: number) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0) return 0;
  return value;
};

const EQ_PRESETS = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  Bass: [5, 4, 3, 2, 1, 0, -1, -2, -2, -1],
  Treble: [-2, -1, 0, 1, 2, 3, 4, 4, 3, 2],
  Vocal: [-1, 0, 2, 3, 3, 2, 1, 0, -1, -2],
};

type EqPreset = keyof typeof EQ_PRESETS | "Custom";

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
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const eqFiltersRef = useRef<BiquadFilterNode[]>([]);
  const eqGainRef = useRef<GainNode | null>(null);
  const bypassGainRef = useRef<GainNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analyserDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const timeDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const spectrumCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const spectrumAnimRef = useRef<number | null>(null);
  const rmsBarRef = useRef<HTMLSpanElement | null>(null);
  const peakBarRef = useRef<HTMLSpanElement | null>(null);
  const limiterRef = useRef<DynamicsCompressorNode | null>(null);
  const limiterGainRef = useRef<GainNode | null>(null);
  const limiterBypassRef = useRef<GainNode | null>(null);
  const [sleepMinutes, setSleepMinutes] = useState(0);
  const [sleepEndsAt, setSleepEndsAt] = useState<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const [resumeTime, setResumeTime] = useState<number | null>(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [eqEnabled, setEqEnabled] = useState(true);
  const [eqAuto, setEqAuto] = useState(false);
  const [eqPreset, setEqPreset] = useState<EqPreset>("Flat");
  const [eqBands, setEqBands] = useState<number[]>(() => EQ_PRESETS.Flat);
  const eqBandsRef = useRef(eqBands);
  const eqEnabledRef = useRef(eqEnabled);
  const eqAutoRef = useRef(eqAuto);
  const [preamp, setPreamp] = useState(0);
  const [limiterEnabled, setLimiterEnabled] = useState(true);
  const limiterEnabledRef = useRef(limiterEnabled);
  const [prevActionLabel, setPrevActionLabel] = useState<string | null>(null);
  const [autoplayLast, setAutoplayLast] = useState(false);
  const lastSavedRef = useRef(0);
  const segmentHandledRef = useRef(false);
  const prevTimerRef = useRef<number | null>(null);
  const POSITION_KEY = "ibadahmu:audio:position";
  const SLEEP_KEY = "ibadahmu:audio:sleep";
  const AUTOPLAY_KEY = "ibadahmu:audio:autoplay";
  const [showQueue, setShowQueue] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const resolvedSrc = typeof track?.src === "string" ? track.src : "";
  const prefetchSrc = useMemo(() => {
    if (!queue.length) return "";
    const nextIndex = currentIndex + 1;
    if (nextIndex < queue.length) {
      return queue[nextIndex]?.src ?? "";
    }
    if (repeatMode === "all") {
      return queue[0]?.src ?? "";
    }
    return "";
  }, [currentIndex, queue, repeatMode]);
  const segmentStart = useMemo(
    () => normalizeSegmentTime(track?.segment?.startTime) ?? 0,
    [track?.segment?.startTime],
  );
  const segmentEnd = useMemo(() => {
    const value = normalizeSegmentTime(track?.segment?.endTime);
    if (value === null) return null;
    if (value <= segmentStart) return null;
    return value;
  }, [track?.segment?.endTime, segmentStart]);

  const resumeAudioContext = useCallback(() => {
    const ctx = audioContextRef.current;
    if (!ctx || ctx.state === "running") return;
    ctx.resume().catch(() => undefined);
  }, []);

  const playAudioSafely = useCallback(
    (audio: HTMLAudioElement, options?: { onBlocked?: () => void }) => {
      resumeAudioContext();
      const playPromise = audio.play();
      if (!playPromise || typeof playPromise.catch !== "function") return;
      playPromise
        .then(() => setAutoplayBlocked(false))
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") {
            return;
          }
          options?.onBlocked?.();
        });
    },
    [resumeAudioContext],
  );

  const streamInfo = useMemo(() => {
    if (!track || !resolvedSrc) return null;
    const safeSrc = resolvedSrc;
    const formatSource = safeSrc.split("#")[0] ?? safeSrc;
    const format =
      track.format ??
      formatSource.split("?")[0].split(".").pop()?.toUpperCase() ??
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
    eqBandsRef.current = eqBands;
  }, [eqBands]);

  useEffect(() => {
    eqEnabledRef.current = eqEnabled;
  }, [eqEnabled]);

  useEffect(() => {
    eqAutoRef.current = eqAuto;
  }, [eqAuto]);

  useEffect(() => {
    limiterEnabledRef.current = limiterEnabled;
  }, [limiterEnabled]);

  useEffect(() => {
    if (!track) return;
    if (typeof window === "undefined") return;
    const audio = audioRef.current;
    if (!audio) return;
    if (audioContextRef.current && sourceRef.current) return;
    const ctx = new AudioContext();
    audioContextRef.current = ctx;
    const source = ctx.createMediaElementSource(audio);
    sourceRef.current = source;
    const bypassGain = ctx.createGain();
    const eqGain = ctx.createGain();
    const masterGain = ctx.createGain();
    const analyser = ctx.createAnalyser();
    const limiter = ctx.createDynamicsCompressor();
    const limiterGain = ctx.createGain();
    const limiterBypass = ctx.createGain();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.85;
    const enabled = eqEnabledRef.current;
    bypassGain.gain.value = enabled ? 0 : 1;
    eqGain.gain.value = enabled ? 1 : 0;
    masterGain.gain.value = dbToGain(preamp);
    limiter.threshold.value = -3;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.1;
    const limiterOn = limiterEnabledRef.current;
    limiterGain.gain.value = limiterOn ? 1 : 0;
    limiterBypass.gain.value = limiterOn ? 0 : 1;
    const bands = eqBandsRef.current;
    const filters = EQ_FREQUENCIES.map((freq, index) => {
      const filter = ctx.createBiquadFilter();
      filter.type = "peaking";
      filter.frequency.value = freq;
      filter.Q.value = 1;
      filter.gain.value = bands[index] ?? 0;
      return filter;
    });
    source.connect(bypassGain);
    if (filters.length > 0) {
      source.connect(filters[0]);
      for (let i = 0; i < filters.length - 1; i += 1) {
        filters[i].connect(filters[i + 1]);
      }
      filters[filters.length - 1].connect(eqGain);
    } else {
      source.connect(eqGain);
    }
    eqGain.connect(masterGain);
    bypassGain.connect(masterGain);
    masterGain.connect(limiter);
    limiter.connect(limiterGain);
    masterGain.connect(limiterBypass);
    limiterGain.connect(analyser);
    limiterBypass.connect(analyser);
    analyser.connect(ctx.destination);
    eqFiltersRef.current = filters;
    eqGainRef.current = eqGain;
    bypassGainRef.current = bypassGain;
    masterGainRef.current = masterGain;
    analyserRef.current = analyser;
    analyserDataRef.current = new Uint8Array(analyser.frequencyBinCount);
    timeDataRef.current = new Uint8Array(analyser.fftSize);
    limiterRef.current = limiter;
    limiterGainRef.current = limiterGain;
    limiterBypassRef.current = limiterBypass;
  }, [track, preamp]);

  useEffect(() => {
    if (track) return;
    const ctx = audioContextRef.current;
    if (!ctx) return;
    ctx.close().catch(() => undefined);
    audioContextRef.current = null;
    sourceRef.current = null;
    eqFiltersRef.current = [];
    eqGainRef.current = null;
    bypassGainRef.current = null;
    masterGainRef.current = null;
    analyserRef.current = null;
    analyserDataRef.current = null;
    timeDataRef.current = null;
    limiterRef.current = null;
    limiterGainRef.current = null;
    limiterBypassRef.current = null;
  }, [track]);

  useEffect(() => {
    if (!track) return;
    if (typeof window === "undefined") return;
    const audio = audioRef.current;
    if (!audio) return;
    if (audioContextRef.current && sourceRef.current) return;
    const ctx = new AudioContext();
    audioContextRef.current = ctx;
    const source = ctx.createMediaElementSource(audio);
    sourceRef.current = source;
    const bypassGain = ctx.createGain();
    const eqGain = ctx.createGain();
    const enabled = eqEnabledRef.current;
    bypassGain.gain.value = enabled ? 0 : 1;
    eqGain.gain.value = enabled ? 1 : 0;
    const bands = eqBandsRef.current;
    const filters = EQ_FREQUENCIES.map((freq, index) => {
      const filter = ctx.createBiquadFilter();
      filter.type = "peaking";
      filter.frequency.value = freq;
      filter.Q.value = 1;
      filter.gain.value = bands[index] ?? 0;
      return filter;
    });
    source.connect(bypassGain);
    bypassGain.connect(ctx.destination);
    if (filters.length > 0) {
      source.connect(filters[0]);
      for (let i = 0; i < filters.length - 1; i += 1) {
        filters[i].connect(filters[i + 1]);
      }
      filters[filters.length - 1].connect(eqGain);
    } else {
      source.connect(eqGain);
    }
    eqGain.connect(ctx.destination);
    eqFiltersRef.current = filters;
    eqGainRef.current = eqGain;
    bypassGainRef.current = bypassGain;
    return () => {
      ctx.close().catch(() => undefined);
      audioContextRef.current = null;
      sourceRef.current = null;
      eqFiltersRef.current = [];
      eqGainRef.current = null;
      bypassGainRef.current = null;
    };
  }, [track]);

  useEffect(() => {
    const eqGain = eqGainRef.current;
    const bypass = bypassGainRef.current;
    if (!eqGain || !bypass) return;
    eqGain.gain.value = eqEnabled ? 1 : 0;
    bypass.gain.value = eqEnabled ? 0 : 1;
  }, [eqEnabled]);

  useEffect(() => {
    const limiterGain = limiterGainRef.current;
    const limiterBypass = limiterBypassRef.current;
    if (!limiterGain || !limiterBypass) return;
    limiterGain.gain.value = limiterEnabled ? 1 : 0;
    limiterBypass.gain.value = limiterEnabled ? 0 : 1;
  }, [limiterEnabled]);

  useEffect(() => {
    const filters = eqFiltersRef.current;
    if (!filters.length) return;
    if (eqAutoRef.current) return;
    filters.forEach((filter, index) => {
      filter.gain.value = eqBands[index] ?? 0;
    });
  }, [eqBands]);

  useEffect(() => {
    const master = masterGainRef.current;
    if (!master) return;
    master.gain.value = dbToGain(preamp);
  }, [preamp]);

  useEffect(() => {
    if (eqAuto) return;
    const filters = eqFiltersRef.current;
    if (!filters.length) return;
    filters.forEach((filter, index) => {
      filter.gain.value = eqBandsRef.current[index] ?? 0;
    });
  }, [eqAuto]);

  useEffect(() => {
    if (!track) return;
    const analyser = analyserRef.current;
    const data = analyserDataRef.current;
    const timeData = timeDataRef.current;
    const canvas = spectrumCanvasRef.current;
    if (!analyser || !data || !timeData || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const autoState = { low: 0, mid: 0, high: 0 };

    const draw = () => {
      analyser.getByteFrequencyData(data);
      analyser.getByteTimeDomainData(timeData);
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.floor(rect.width * ratio));
      const height = Math.max(1, Math.floor(rect.height * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.clearRect(0, 0, width, height);
      const bars = 32;
      const step = Math.floor(data.length / bars) || 1;
      const barWidth = width / bars;
      for (let i = 0; i < bars; i += 1) {
        const value = data[i * step] ?? 0;
        const barHeight = Math.max(2, (value / 255) * height);
        const x = i * barWidth;
        const y = height - barHeight;
        ctx.fillStyle = value > 180 ? "#f7ff6f" : "#7dffb2";
        ctx.fillRect(x + 1, y, Math.max(2, barWidth - 2), barHeight);
      }

      if (eqAutoRef.current && eqEnabledRef.current) {
        let low = 0;
        let mid = 0;
        let high = 0;
        for (let i = 0; i < data.length; i += 1) {
          const value = data[i];
          if (i < 15) low += value;
          else if (i < 50) mid += value;
          else high += value;
        }
        const total = low + mid + high || 1;
        const lowNorm = low / total;
        const midNorm = mid / total;
        const highNorm = high / total;
        const target = 1 / 3;
        const lowAdjust = clamp((target - lowNorm) * 16, -4, 4);
        const midAdjust = clamp((target - midNorm) * 12, -3, 3);
        const highAdjust = clamp((target - highNorm) * 16, -4, 4);
        autoState.low += (lowAdjust - autoState.low) * 0.07;
        autoState.mid += (midAdjust - autoState.mid) * 0.07;
        autoState.high += (highAdjust - autoState.high) * 0.07;
        const filters = eqFiltersRef.current;
        if (filters.length) {
          filters.forEach((filter, index) => {
            const freq = EQ_FREQUENCIES[index] ?? 0;
            const base = eqBandsRef.current[index] ?? 0;
            let autoBoost = autoState.mid;
            if (freq <= 310) autoBoost = autoState.low;
            else if (freq >= 3000) autoBoost = autoState.high;
            filter.gain.value = clamp(base + autoBoost, -12, 12);
          });
        }
      }

      let sumSquares = 0;
      let peak = 0;
      for (let i = 0; i < timeData.length; i += 1) {
        const sample = (timeData[i] - 128) / 128;
        const abs = Math.abs(sample);
        if (abs > peak) peak = abs;
        sumSquares += sample * sample;
      }
      const rms = Math.sqrt(sumSquares / timeData.length);
      const rmsPct = `${Math.min(rms * 100, 100)}%`;
      const peakPct = `${Math.min(peak * 100, 100)}%`;
      if (rmsBarRef.current) {
        rmsBarRef.current.style.height = rmsPct;
      }
      if (peakBarRef.current) {
        peakBarRef.current.style.height = peakPct;
      }

      spectrumAnimRef.current = window.requestAnimationFrame(draw);
    };

    spectrumAnimRef.current = window.requestAnimationFrame(draw);
    return () => {
      if (spectrumAnimRef.current) {
        window.cancelAnimationFrame(spectrumAnimRef.current);
        spectrumAnimRef.current = null;
      }
    };
  }, [track]);

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
    if (segmentStart > 0 && audio.currentTime < segmentStart) {
      try {
        audio.currentTime = segmentStart;
      } catch {
        // ignore seek errors
      }
    }
    playAudioSafely(audio, { onBlocked: () => setAutoplayBlocked(true) });
  }, [track, autoplayLast, lastAction, segmentStart]);

  useEffect(() => {
    if (!audioRef.current || !track) return;
    const audio = audioRef.current;
    segmentHandledRef.current = false;
    setProgress(0);
    setDuration(0);
    lastSavedRef.current = 0;
    const handleLoaded = () => {
      let stored: { src?: string; time?: number } | null = null;
      try {
        const raw = window.localStorage.getItem(POSITION_KEY);
        if (raw) stored = JSON.parse(raw);
      } catch {
        stored = null;
      }
      const rawDuration = audio.duration || 0;
      const maxAllowedTime =
        segmentEnd !== null ? Math.min(segmentEnd, rawDuration) : rawDuration;
      const displayDuration =
        segmentEnd !== null
          ? Math.max(maxAllowedTime - segmentStart, 0)
          : Math.max(rawDuration - segmentStart, 0);
      setDuration(displayDuration);
      if (
        stored &&
        stored.src === resolvedSrc &&
        typeof stored.time === "number" &&
        stored.time > segmentStart + 5 &&
        rawDuration &&
        stored.time < maxAllowedTime - 2
      ) {
        audio.currentTime = stored.time;
        setResumeTime(Math.max(stored.time - segmentStart, 0));
      } else {
        if (segmentStart > 0 && rawDuration > 0) {
          const safeStart = Math.min(
            segmentStart,
            Math.max(rawDuration - 0.05, 0),
          );
          audio.currentTime = safeStart;
        }
        setResumeTime(null);
      }
      setProgress(Math.max(audio.currentTime - segmentStart, 0));
    };
    if (audio.readyState >= 1) {
      handleLoaded();
      return;
    }
    audio.addEventListener("loadedmetadata", handleLoaded, { once: true });
    return () => audio.removeEventListener("loadedmetadata", handleLoaded);
  }, [track, resolvedSrc, segmentEnd, segmentStart]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!prefetchSrc || prefetchSrc === resolvedSrc) return;

    const preloader = new Audio();
    preloader.preload = "auto";
    preloader.src = prefetchSrc;
    preloader.load();

    return () => {
      preloader.src = "";
    };
  }, [prefetchSrc, resolvedSrc]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [track]);

  useEffect(() => {
    if (!audioRef.current || !track) return;
    const audio = audioRef.current;
    const getDisplayDuration = () => {
      if (segmentEnd !== null) {
        return Math.max(segmentEnd - segmentStart, 0);
      }
      if (!audio.duration || !Number.isFinite(audio.duration)) return 0;
      return Math.max(audio.duration - segmentStart, 0);
    };
    const handleTimeUpdate = () => {
      if (!audio.duration) return;
      const displayDuration = getDisplayDuration();
      const relativeTime = Math.max(audio.currentTime - segmentStart, 0);
      setProgress(
        displayDuration > 0
          ? Math.min(relativeTime, displayDuration)
          : relativeTime,
      );
      setDuration(displayDuration);

      if (
        segmentEnd !== null &&
        !segmentHandledRef.current &&
        audio.currentTime >= segmentEnd - 0.05
      ) {
        segmentHandledRef.current = true;
        clearPosition();
        if (repeatMode === "one") {
          const restartAt = Math.min(
            segmentStart,
            Math.max(audio.duration - 0.05, 0),
          );
          audio.currentTime = restartAt;
          playAudioSafely(audio);
          return;
        }
        if (repeatMode === "all") {
          next({ wrap: true });
          return;
        }
        next({ wrap: false });
        return;
      }

      if (audio.currentTime - lastSavedRef.current >= 5) {
        lastSavedRef.current = audio.currentTime;
        savePosition(audio.currentTime);
      }
    };
    const handlePause = () => {
      if (!audio.duration) return;
      savePosition(audio.currentTime);
    };
    const handleDurationChange = () => {
      setDuration(getDisplayDuration());
    };
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("durationchange", handleDurationChange);
    audio.addEventListener("pause", handlePause);
    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("durationchange", handleDurationChange);
      audio.removeEventListener("pause", handlePause);
    };
  }, [next, playAudioSafely, repeatMode, segmentEnd, segmentStart, track]);

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
    if (audio && audio.currentTime > segmentStart + 5) {
      audio.currentTime = segmentStart;
      playAudioSafely(audio);
      savePosition(segmentStart);
      setProgress(0);
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

  const handlePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      if (segmentStart > 0 && audio.currentTime < segmentStart) {
        audio.currentTime = segmentStart;
      }
      resumeAudioContext();
      playAudioSafely(audio, { onBlocked: () => setAutoplayBlocked(true) });
    } else {
      audio.pause();
    }
  };

  const handleStop = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = segmentStart;
    setProgress(0);
    savePosition(segmentStart);
  };

  const handleSeek = (value: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(value)) return;
    const clipped = Math.max(0, Math.min(value, duration || value));
    let target = segmentStart + clipped;
    if (segmentEnd !== null) {
      target = Math.min(target, segmentEnd);
    }
    audio.currentTime = target;
    setProgress(clipped);
  };

  const applyPreset = (preset: keyof typeof EQ_PRESETS) => {
    setEqPreset(preset);
    setEqBands(EQ_PRESETS[preset]);
  };

  const handleBandChange = (index: number, value: number) => {
    setEqBands((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
    setEqPreset("Custom");
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
    "murratal-juz": "Murratal Juz",
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
      <div className="winamp-shell">
        <div className="winamp-titlebar">
          <span className="winamp-logo">WINAMP</span>
          <span className="winamp-title">MURRATAL PLAYER</span>
          <button
            type="button"
            onClick={() => setTrack(null)}
            className="winamp-close"
            aria-label="Tutup audio"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <audio
          ref={audioRef}
          className="sr-only"
          preload="auto"
          src={resolvedSrc}
          crossOrigin="anonymous"
          onPlay={() => {
            resumeAudioContext();
            setAutoplayBlocked(false);
          }}
          onEnded={() => {
            clearPosition();
            segmentHandledRef.current = true;
            if (repeatMode === "one") {
              const audio = audioRef.current;
              if (audio) {
                audio.currentTime = segmentStart;
                playAudioSafely(audio);
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

        <div className="winamp-body">
          <div className="winamp-display">
            <div className="winamp-track">{track.title}</div>
            {track.subtitle ? (
              <div className="winamp-subtitle">{track.subtitle}</div>
            ) : (
              <div className="winamp-subtitle">—</div>
            )}
            <div className="winamp-meta">
              {track.module ? (
                <span>{moduleLabels[track.module] ?? track.module}</span>
              ) : null}
              {queue.length > 1 ? (
                <span>
                  Track {currentIndex + 1}/{queue.length}
                </span>
              ) : null}
              <span>{streamInfo.format}</span>
              <span>{streamInfo.quality}</span>
            </div>
          </div>
          <div className="winamp-vu">
            <div className="winamp-vu-bars">
              {Array.from({ length: 12 }, (_, index) => (
                <span
                  key={`meter-${index}`}
                  className={`winamp-vu-bar ${isPlaying ? "is-playing" : ""}`}
                  style={{ animationDelay: `${index * 0.08}s` }}
                />
              ))}
            </div>
            <div className="winamp-vu-labels">
              <span>{streamInfo.sourceLabel}</span>
              <span>{autoplayBlocked ? "Autoplay Off" : "Stereo"}</span>
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
              onClick={handlePrevClick}
              className="winamp-btn"
              aria-label="Track sebelumnya"
            >
              <SkipBack className="h-4 w-4" />
            </button>
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
            <button
              type="button"
              onClick={handleNextClick}
              className="winamp-btn"
              aria-label="Track berikutnya"
            >
              <SkipForward className="h-4 w-4" />
            </button>
          </div>
          <div className="winamp-toggles">
            <button
              type="button"
              onClick={toggleShuffle}
              className={`winamp-toggle ${isShuffle ? "is-on" : ""}`}
              aria-pressed={isShuffle}
            >
              SHUF
            </button>
            <button
              type="button"
              onClick={handleRepeatToggle}
              className={`winamp-toggle ${repeatMode !== "off" ? "is-on" : ""}`}
              aria-pressed={repeatMode !== "off"}
            >
              {repeatMode === "one"
                ? "REP1"
                : repeatMode === "all"
                  ? "REPA"
                  : "REPO"}
            </button>
            <button
              type="button"
              onClick={handleQueueClick}
              className={`winamp-toggle ${showQueue ? "is-on" : ""}`}
              aria-pressed={showQueue}
            >
              PL
            </button>
            <button
              type="button"
              onClick={handleHistoryClick}
              className={`winamp-toggle ${showHistory ? "is-on" : ""}`}
              aria-pressed={showHistory}
            >
              HIS
            </button>
            <button
              type="button"
              onClick={() => setAutoplayLast((prev) => !prev)}
              className={`winamp-toggle ${autoplayLast ? "is-on" : ""}`}
              aria-pressed={autoplayLast}
            >
              AUTO
            </button>
          </div>
        </div>

        <div className="winamp-footer">
          <div className="winamp-options">
            <label className="winamp-select">
              SPD
              <select
                value={playbackRate}
                onChange={(event) =>
                  setPlaybackRate(Number(event.target.value))
                }
              >
                <option value={0.75}>0.75x</option>
                <option value={1}>1.0x</option>
                <option value={1.25}>1.25x</option>
                <option value={1.5}>1.5x</option>
              </select>
            </label>
            <label className="winamp-select">
              SLP
              <select
                value={sleepMinutes}
                onChange={(event) =>
                  setSleepMinutes(Number(event.target.value))
                }
              >
                <option value={0}>Off</option>
                <option value={5}>5m</option>
                <option value={10}>10m</option>
                <option value={15}>15m</option>
                <option value={30}>30m</option>
              </select>
            </label>
            {sleepLabel ? (
              <span className="winamp-status">Sleep {sleepLabel}</span>
            ) : null}
            {resumeLabel ? (
              <span className="winamp-status">Resume {resumeLabel}</span>
            ) : null}
            {prevActionLabel ? (
              <span className="winamp-status">{prevActionLabel}</span>
            ) : null}
            {autoplayBlocked ? (
              <span className="winamp-status">Autoplay diblokir</span>
            ) : null}
          </div>
          <a
            href={resolvedSrc}
            target="_blank"
            rel="noreferrer"
            className="winamp-btn winamp-btn--link"
          >
            <Download className="h-4 w-4" />
            DL
          </a>
        </div>

        <div className="winamp-eq">
          <div className="winamp-eq-header">
            <div className="winamp-eq-controls">
              <button
                type="button"
                onClick={() => setEqEnabled((prev) => !prev)}
                className={`winamp-toggle ${eqEnabled ? "is-on" : ""}`}
                aria-pressed={eqEnabled}
              >
                EQ
              </button>
              <button
                type="button"
                onClick={() => setEqAuto((prev) => !prev)}
                className={`winamp-toggle ${eqAuto ? "is-on" : ""}`}
                aria-pressed={eqAuto}
              >
                AUTO
              </button>
              <button
                type="button"
                onClick={() => setLimiterEnabled((prev) => !prev)}
                className={`winamp-toggle ${limiterEnabled ? "is-on" : ""}`}
                aria-pressed={limiterEnabled}
              >
                LIM
              </button>
              <button
                type="button"
                onClick={() => applyPreset("Flat")}
                className="winamp-toggle"
              >
                RESET
              </button>
            </div>
            <div className="winamp-eq-presets">
              {Object.keys(EQ_PRESETS).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => applyPreset(preset as keyof typeof EQ_PRESETS)}
                  className={`winamp-chip ${
                    eqPreset === preset ? "is-active" : ""
                  }`}
                >
                  {preset}
                </button>
              ))}
              {eqPreset === "Custom" ? (
                <span className="winamp-eq-custom">Custom</span>
              ) : null}
            </div>
          </div>
          <div className={`winamp-eq-bands ${eqEnabled ? "" : "is-disabled"}`}>
            <label className="winamp-eq-band winamp-eq-preamp">
              <input
                type="range"
                min={-12}
                max={12}
                step={1}
                value={preamp}
                onChange={(event) => setPreamp(Number(event.target.value))}
                aria-label="Preamp"
              />
              <span>PRE</span>
            </label>
            {EQ_LABELS.map((label, index) => (
              <label key={label} className="winamp-eq-band">
                <input
                  type="range"
                  min={-12}
                  max={12}
                  step={1}
                  value={eqBands[index] ?? 0}
                  onChange={(event) =>
                    handleBandChange(index, Number(event.target.value))
                  }
                  disabled={!eqEnabled}
                  aria-label={`EQ ${label}`}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <div className="winamp-spectrum-wrap">
            <canvas
              ref={spectrumCanvasRef}
              className="winamp-spectrum"
              aria-hidden="true"
            />
            <div className="winamp-meters">
              <div className="winamp-meter">
                <span ref={rmsBarRef} />
                <label>RMS</label>
              </div>
              <div className="winamp-meter">
                <span ref={peakBarRef} />
                <label>PEAK</label>
              </div>
            </div>
          </div>
        </div>

        {moduleEntries.length > 0 ? (
          <div className="winamp-jump">
            {moduleEntries.map(({ key, label, item }) => (
              <button
                key={key}
                type="button"
                onClick={() => setQueueByTrack(item)}
                className="winamp-chip"
              >
                Lanjut {label}
              </button>
            ))}
          </div>
        ) : null}

        {showQueue ? (
          <div className="winamp-panel">
            <p className="winamp-panel-title">Antrian Saat Ini</p>
            <div className="winamp-panel-list">
              {queue.length === 0 ? (
                <p className="winamp-panel-empty">Antrian kosong.</p>
              ) : (
                queue.map((item, index) => (
                  <button
                    key={`${item.src}-${index}`}
                    type="button"
                    onClick={() => handleJump(index)}
                    className={`winamp-panel-item ${
                      index === currentIndex ? "is-active" : ""
                    }`}
                  >
                    <p className="winamp-panel-main">{item.title}</p>
                    {item.module ? (
                      <p className="winamp-panel-meta">
                        {moduleLabels[item.module] ?? item.module}
                      </p>
                    ) : null}
                    {item.subtitle ? (
                      <p className="winamp-panel-sub">{item.subtitle}</p>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          </div>
        ) : null}

        {showHistory ? (
          <div className="winamp-panel">
            <p className="winamp-panel-title">Terakhir Diputar</p>
            <div className="winamp-panel-list">
              {history.length === 0 ? (
                <p className="winamp-panel-empty">Belum ada riwayat.</p>
              ) : (
                history.map((item, index) => (
                  <button
                    key={`${item.src}-${index}`}
                    type="button"
                    onClick={() => handlePlayHistory(index)}
                    className="winamp-panel-item"
                  >
                    <p className="winamp-panel-main">{item.title}</p>
                    {item.module ? (
                      <p className="winamp-panel-meta">
                        {moduleLabels[item.module] ?? item.module}
                      </p>
                    ) : null}
                    {item.subtitle ? (
                      <p className="winamp-panel-sub">{item.subtitle}</p>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default GlobalAudioPlayer;
