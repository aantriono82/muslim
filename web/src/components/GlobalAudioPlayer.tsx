import {
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Square,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAudio } from "../lib/audio";
import { hasRecentAudioPrime, primeAudioPlayback } from "../lib/audioUnlock";

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
const NON_CORS_AUDIO_HOSTS = new Set(["cdn.myquran.com"]);

const decodeProxyAudioTarget = (value: string) => {
  if (!value || typeof window === "undefined") return null;
  try {
    const parsed = new URL(value, window.location.origin);
    if (!parsed.pathname.endsWith("/audio")) return null;
    const raw = parsed.searchParams.get("url");
    if (!raw) return null;
    return raw;
  } catch {
    return null;
  }
};

const canUseWebAudioForSrc = (value: string) => {
  if (!value || typeof window === "undefined") return true;
  try {
    const parsed = new URL(value, window.location.origin);
    return !NON_CORS_AUDIO_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return true;
  }
};

const EQ_PRESETS = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  Bass: [5, 4, 3, 2, 1, 0, -1, -2, -2, -1],
  Treble: [-2, -1, 0, 1, 2, 3, 4, 4, 3, 2],
  Vocal: [-1, 0, 2, 3, 3, 2, 1, 0, -1, -2],
};

type EqPreset = keyof typeof EQ_PRESETS | "Custom";

type GlobalAudioPlayerProps = {
  embedded?: boolean;
};

const GlobalAudioPlayer = ({ embedded = false }: GlobalAudioPlayerProps) => {
  const {
    track,
    queue,
    currentIndex,
    isShuffle,
    playbackRate,
    repeatMode,
    lastAction,
    setTrack,
    next,
    prev,
    toggleShuffle,
    setPlaybackRate,
    setRepeatMode,
    jumpTo,
    progress,
    duration,
    setProgress,
    setDuration,
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
  const [volume, setVolume] = useState(100);
  const [balance, setBalance] = useState(0);
  const [showEq, setShowEq] = useState(true);
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
  const pannerRef = useRef<StereoPannerNode | null>(null);
  const [prevActionLabel, setPrevActionLabel] = useState<string | null>(null);
  const [autoplayLast, setAutoplayLast] = useState(false);
  const lastSavedRef = useRef(0);
  const segmentHandledRef = useRef(false);
  const prevTimerRef = useRef<number | null>(null);
  const POSITION_KEY = "ibadahmu:audio:position";
  const SLEEP_KEY = "ibadahmu:audio:sleep";
  const AUTOPLAY_KEY = "ibadahmu:audio:autoplay";
  const [showQueue, setShowQueue] = useState(false);
  const [fallbackSrc, setFallbackSrc] = useState<string | null>(null);

  const resolvedSrc = typeof track?.src === "string" ? track.src : "";
  const activeSrc = fallbackSrc ?? resolvedSrc;
  const canUseWebAudio = useMemo(
    () => canUseWebAudioForSrc(activeSrc),
    [activeSrc],
  );
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

  useEffect(() => {
    setFallbackSrc(null);
  }, [resolvedSrc]);

  const initAudioContext = useCallback(() => {
    if (typeof window === "undefined") return null;
    if (!canUseWebAudio) return null;
    if (audioContextRef.current && sourceRef.current)
      return audioContextRef.current;
    const audio = audioRef.current;
    if (!audio) return null;

    try {
      const AudioContextClass =
        window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
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
      const panner = ctx.createStereoPanner();
      pannerRef.current = panner;

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
      masterGain.connect(panner);
      panner.connect(limiter);
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
      return ctx;
    } catch (err) {
      console.error("AudioContext initialization failed:", err);
      return null;
    }
  }, [canUseWebAudio, preamp]);

  const resumeAudioContext = useCallback(() => {
    let ctx = audioContextRef.current;
    if (!ctx) {
      ctx = initAudioContext();
    }
    if (!ctx) return;
    if (ctx.state === "suspended") {
      try {
        const resumePromise = ctx.resume();
        if (resumePromise && typeof resumePromise.catch === "function") {
          resumePromise.catch((err) => {
            console.warn("Failed to resume AudioContext:", err);
          });
        }
        return resumePromise;
      } catch (err) {
        console.warn("Failed to resume AudioContext:", err);
      }
    }
  }, [initAudioContext]);

  const playAudioSafely = useCallback(
    (
      audio: HTMLAudioElement,
      options?: {
        onBlocked?: () => void;
        skipPrimeRetry?: boolean;
      },
    ) => {
      resumeAudioContext();
      const handlePlayError = (err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        const isAutoplayPolicyError =
          err instanceof DOMException &&
          (err.name === "NotAllowedError" || err.name === "SecurityError");
        if (isAutoplayPolicyError) {
          if (!options?.skipPrimeRetry && hasRecentAudioPrime()) {
            window.setTimeout(() => {
              playAudioSafely(audio, { ...options, skipPrimeRetry: true });
            }, 80);
            return;
          }
          console.warn("Audio playback blocked by browser policy:", err);
          options?.onBlocked?.();
          return;
        }
        console.error("Audio playback failed:", err);
      };
      try {
        const playPromise = audio.play();
        if (!playPromise || typeof playPromise.catch !== "function") {
          setAutoplayBlocked(false);
          return;
        }
        playPromise
          .then(() => setAutoplayBlocked(false))
          .catch(handlePlayError);
      } catch (err) {
        handlePlayError(err);
      }
    },
    [resumeAudioContext],
  );

  useEffect(() => {
    if (track) {
      initAudioContext();
    }
  }, [track, initAudioContext]);

  useEffect(() => {
    if (canUseWebAudio) return;
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
  }, [canUseWebAudio]);

  const streamInfo = useMemo(() => {
    if (!track || !activeSrc)
      return { format: "Unknown", sourceLabel: "Unknown", quality: "Default" };
    const safeSrc = activeSrc;
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
  }, [activeSrc, track]);

  useEffect(() => {
    if (track && !activeSrc) {
      setTrack(null);
    }
  }, [activeSrc, track, setTrack]);

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
    return () => {
      const ctx = audioContextRef.current;
      if (ctx) {
        ctx.close().catch(() => undefined);
      }
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
    };
  }, []);

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
    if (!track || !activeSrc) return;
    try {
      window.localStorage.setItem(
        POSITION_KEY,
        JSON.stringify({ src: activeSrc, time, updatedAt: Date.now() }),
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
    playAudioSafely(audio, {
      onBlocked: () => {
        if (lastAction === "restore") {
          // Session restore may hit browser autoplay policy; keep paused
          // silently and wait for next user interaction.
          setAutoplayBlocked(false);
          return;
        }
        setAutoplayBlocked(true);
      },
    });
  }, [track, autoplayLast, lastAction, segmentStart]);

  useEffect(() => {
    if (!autoplayBlocked || !track) return;

    const resumeAfterGesture = () => {
      primeAudioPlayback();
      const audio = audioRef.current;
      if (!audio) return;
      if (segmentStart > 0 && audio.currentTime < segmentStart) {
        try {
          audio.currentTime = segmentStart;
        } catch {
          // ignore seek errors
        }
      }
      playAudioSafely(audio, { onBlocked: () => setAutoplayBlocked(true) });
    };

    window.addEventListener("pointerdown", resumeAfterGesture, {
      once: true,
      capture: true,
    });
    window.addEventListener("touchstart", resumeAfterGesture, {
      once: true,
      capture: true,
    });
    window.addEventListener("click", resumeAfterGesture, {
      once: true,
      capture: true,
    });
    window.addEventListener("keydown", resumeAfterGesture, {
      once: true,
      capture: true,
    });

    return () => {
      window.removeEventListener("pointerdown", resumeAfterGesture, true);
      window.removeEventListener("touchstart", resumeAfterGesture, true);
      window.removeEventListener("click", resumeAfterGesture, true);
      window.removeEventListener("keydown", resumeAfterGesture, true);
    };
  }, [autoplayBlocked, playAudioSafely, segmentStart, track]);

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
        stored.src === activeSrc &&
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
  }, [activeSrc, segmentEnd, segmentStart, track]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!prefetchSrc || prefetchSrc === activeSrc) return;

    const preloader = new Audio();
    preloader.preload = "auto";
    preloader.src = prefetchSrc;
    preloader.load();

    return () => {
      preloader.src = "";
    };
  }, [activeSrc, prefetchSrc]);

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
        timerRef.current = null;
        setTrack(null);
        setSleepMinutes(0);
      },
      sleepMinutes * 60 * 1000,
    );
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
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
      primeAudioPlayback();
      if (segmentStart > 0 && audio.currentTime < segmentStart) {
        audio.currentTime = segmentStart;
      }
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

  const handleCyclePreset = () => {
    const presets = Object.keys(EQ_PRESETS) as Array<keyof typeof EQ_PRESETS>;
    const currentIndex =
      eqPreset === "Custom"
        ? -1
        : presets.indexOf(eqPreset as keyof typeof EQ_PRESETS);
    const nextIndex = (currentIndex + 1) % presets.length;
    applyPreset(presets[nextIndex]);
  };

  const handleJump = (index: number) => {
    jumpTo(index);
    setShowQueue(false);
  };

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
    <div className="relative w-full">
      <audio
        ref={audioRef}
        className="sr-only"
        preload="auto"
        src={activeSrc}
        crossOrigin={canUseWebAudio ? "anonymous" : undefined}
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
        onError={(e) => {
          const target = e.target as HTMLAudioElement;
          console.error("Audio element error:", target.error);
          if (fallbackSrc) return;
          const directSrc = decodeProxyAudioTarget(resolvedSrc);
          if (!directSrc || directSrc === resolvedSrc) return;
          setFallbackSrc(directSrc);
          window.setTimeout(() => {
            const audio = audioRef.current;
            if (!audio) return;
            if (segmentStart > 0 && audio.currentTime < segmentStart) {
              audio.currentTime = segmentStart;
            }
            playAudioSafely(audio, {
              onBlocked: () => setAutoplayBlocked(true),
            });
          }, 50);
        }}
      />

      {track && streamInfo ? (
        <div
          className={`winamp95-stage ${embedded ? "winamp95-stage-embedded" : ""}`}
        >
          <div className="winamp95-column">
            <div className="winamp-shell winamp95-main">
              <div className="winamp-titlebar winamp95-titlebar">
                <span className="winamp95-title-rail" />
                <span className="winamp95-title-text">WINAMP</span>
                <span className="winamp95-title-rail" />
                <div className="winamp95-window-controls">
                  <button
                    type="button"
                    onClick={() => setTrack(null)}
                    className="winamp95-window-btn"
                    aria-label="Tutup player"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                  <span className="winamp95-window-dot" />
                  <span className="winamp95-window-dot" />
                </div>
              </div>

              <div className="winamp95-main-body">
                <div className="winamp95-upper-strip">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="winamp95-display">
                  <div className="winamp95-display-left">
                    <div className="winamp95-led-row">
                      <span className={isPlaying ? "is-active" : ""}>▶</span>
                      <span className={!isPlaying ? "is-active" : ""}>■</span>
                    </div>
                    <div className="winamp95-time">{formatTime(progress)}</div>
                    <div className="winamp95-analyser">
                      {Array.from({ length: 14 }).map((_, i) => (
                        <span
                          key={i}
                          className={isPlaying ? "is-playing" : ""}
                          style={{ animationDelay: `${i * 0.05}s` }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="winamp95-display-right">
                    <div className="winamp95-trackline">1. {track.title}</div>
                    {track.subtitle ? (
                      <div className="winamp95-subtrack">{track.subtitle}</div>
                    ) : null}
                    <div className="winamp95-meta-row">
                      <span>
                        {streamInfo.quality === "High" ? "128" : "64"} kbps
                      </span>
                      <span>44 kHz</span>
                      <span>{streamInfo.format}</span>
                      <span className="is-source">
                        {streamInfo.sourceLabel}
                      </span>
                    </div>
                    <div className="winamp95-mode-row">
                      <span className="is-off">mono</span>
                      <span className="is-on">stereo</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={duration || 0}
                      step={1}
                      value={duration ? progress : 0}
                      onChange={(e) => handleSeek(Number(e.target.value))}
                      className="winamp95-seek"
                      disabled={!duration}
                    />
                    <div className="winamp95-time-row">
                      <span>{formatTime(progress)}</span>
                      <span>{formatTime(duration)}</span>
                    </div>
                  </div>
                </div>

                <div className="winamp95-control-row">
                  <div className="winamp95-transport">
                    <button
                      onClick={handlePrevClick}
                      title="Previous"
                      className="winamp-btn winamp95-btn"
                    >
                      <SkipBack className="h-3 w-3" />
                    </button>
                    <button
                      onClick={handlePlayPause}
                      title={isPlaying ? "Pause" : "Play"}
                      className="winamp-btn winamp95-btn"
                    >
                      {isPlaying ? (
                        <Pause className="h-3.5 w-3.5 fill-current" />
                      ) : (
                        <Play className="h-3.5 w-3.5 fill-current" />
                      )}
                    </button>
                    <button
                      onClick={handleStop}
                      title="Stop"
                      className="winamp-btn winamp95-btn"
                    >
                      <Square className="h-3 w-3 fill-current" />
                    </button>
                    <button
                      onClick={handleNextClick}
                      title="Next"
                      className="winamp-btn winamp95-btn"
                    >
                      <SkipForward className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      title="Eject"
                      className="winamp-btn winamp95-btn winamp95-eject"
                    >
                      ▲
                    </button>
                  </div>
                  <div className="winamp95-toggle-row">
                    <button
                      type="button"
                      onClick={() => setShowEq(!showEq)}
                      className={`winamp-toggle winamp95-toggle ${showEq ? "is-on" : ""}`}
                    >
                      EQ
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowQueue(!showQueue)}
                      className={`winamp-toggle winamp95-toggle ${showQueue ? "is-on" : ""}`}
                    >
                      PL
                    </button>
                    <button
                      onClick={toggleShuffle}
                      className={`winamp-toggle winamp95-toggle ${isShuffle ? "is-on" : ""}`}
                    >
                      SHF
                    </button>
                    <button
                      onClick={handleRepeatToggle}
                      className={`winamp-toggle winamp95-toggle ${repeatMode !== "off" ? "is-on" : ""}`}
                    >
                      {repeatMode === "one" ? "R1" : "REP"}
                    </button>
                  </div>
                  <div className="winamp95-power">
                    <Zap className="h-3 w-3" />
                  </div>
                </div>

                <div className="winamp95-mix-row">
                  <label className="winamp95-mix-control">
                    <span>VOL</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={volume}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setVolume(val);
                        if (masterGainRef.current) {
                          masterGainRef.current.gain.value =
                            (val / 100) * dbToGain(preamp);
                        }
                      }}
                      className="winamp-vol-slider"
                    />
                  </label>
                  <label className="winamp95-mix-control">
                    <span>BAL</span>
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      value={balance}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setBalance(val);
                        if (pannerRef.current) {
                          pannerRef.current.pan.value = val / 100;
                        }
                      }}
                      className="winamp-bal-slider"
                    />
                  </label>
                </div>
              </div>
            </div>

            {showEq && (
              <div className="winamp-shell winamp95-eq">
                <div className="winamp-titlebar winamp95-titlebar">
                  <span className="winamp95-title-rail" />
                  <span className="winamp95-title-text">WINAMP EQUALIZER</span>
                  <span className="winamp95-title-rail" />
                  <span className="winamp95-title-spacer" />
                </div>
                <div className="winamp95-eq-body">
                  <div className="winamp95-eq-top">
                    <div className="winamp95-eq-switches">
                      <button
                        type="button"
                        onClick={() => setEqEnabled((prev) => !prev)}
                        className={`winamp-toggle winamp95-toggle ${eqEnabled ? "is-on" : ""}`}
                      >
                        ON
                      </button>
                      <button
                        type="button"
                        onClick={() => setEqAuto((prev) => !prev)}
                        className={`winamp-toggle winamp95-toggle ${eqAuto ? "is-on" : ""}`}
                      >
                        AUTO
                      </button>
                    </div>
                    <div className="winamp95-eq-presets">
                      <button
                        type="button"
                        onClick={handleCyclePreset}
                        className="winamp-toggle winamp95-toggle winamp95-presets-btn"
                      >
                        PRESETS
                      </button>
                      <span className="winamp95-preset-label">{eqPreset}</span>
                    </div>
                  </div>

                  <div className="winamp95-eq-sliders-wrap">
                    <div className="winamp95-eq-db-scale">
                      <span>+12</span>
                      <span>0</span>
                      <span>-12</span>
                    </div>
                    <div className="winamp95-eq-sliders">
                      <div className="winamp95-eq-band">
                        <div className="winamp95-eq-rail">
                          <input
                            type="range"
                            min="-20"
                            max="20"
                            step="0.5"
                            value={preamp}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setPreamp(val);
                              if (masterGainRef.current) {
                                masterGainRef.current.gain.value =
                                  (volume / 100) * dbToGain(val);
                              }
                            }}
                            className="winamp-eq-slider-classic"
                          />
                        </div>
                        <span>PRE</span>
                      </div>

                      {eqBands.map((val, idx) => (
                        <div key={idx} className="winamp95-eq-band">
                          <div className="winamp95-eq-rail">
                            <input
                              type="range"
                              min="-12"
                              max="12"
                              step="0.5"
                              value={val}
                              disabled={!eqEnabled}
                              onChange={(e) =>
                                handleBandChange(
                                  idx,
                                  parseFloat(e.target.value),
                                )
                              }
                              className="winamp-eq-slider-classic"
                            />
                          </div>
                          <span>{EQ_LABELS[idx]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {showQueue && (
            <div className="winamp-shell winamp95-playlist">
              <div className="winamp-titlebar winamp95-titlebar">
                <span className="winamp95-title-rail" />
                <span className="winamp95-title-text">WINAMP PLAYLIST</span>
                <span className="winamp95-title-rail" />
                <span className="winamp95-title-spacer" />
              </div>
              <div className="winamp95-playlist-body">
                {queue.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleJump(idx)}
                    className={`winamp95-playlist-item ${idx === currentIndex ? "is-active" : ""}`}
                  >
                    <span>{idx + 1}.</span> {item.title}
                  </button>
                ))}
              </div>
              <div className="winamp95-playlist-footer">
                <button className="winamp-toggle winamp95-toggle">ADD</button>
                <button className="winamp-toggle winamp95-toggle">REM</button>
                <button className="winamp-toggle winamp95-toggle">SEL</button>
                <div className="winamp95-playlist-time">
                  {formatTime(progress)} / {formatTime(duration)}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {autoplayBlocked && track ? (
        <div className="px-3 pb-2">
          <button
            onClick={handlePlayPause}
            className="mx-auto block bg-emerald-600 px-6 py-1 text-[10px] font-bold text-white shadow-lg animate-pulse"
          >
            AUTOPLAY DIBLOKIR BROWSER - KLIK UNTUK PUTAR
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default GlobalAudioPlayer;
