let lastAudioPrimeAt = 0;

// Tiny silent WAV to "prime" media playback during a user gesture.
const SILENT_WAV_DATA_URL =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";

let unlockAudioEl: HTMLAudioElement | null = null;

const primeWithSilentAudio = () => {
  if (typeof window === "undefined") return;
  try {
    if (!unlockAudioEl) {
      unlockAudioEl = new Audio(SILENT_WAV_DATA_URL);
      unlockAudioEl.preload = "auto";
      unlockAudioEl.muted = true;
      unlockAudioEl.volume = 0;
      unlockAudioEl.setAttribute("playsinline", "true");
      unlockAudioEl.setAttribute("webkit-playsinline", "true");
    }
    unlockAudioEl.currentTime = 0;
    const playPromise = unlockAudioEl.play();
    if (playPromise && typeof playPromise.then === "function") {
      playPromise
        .then(() => {
          if (!unlockAudioEl) return;
          unlockAudioEl.pause();
          unlockAudioEl.currentTime = 0;
        })
        .catch(() => undefined);
    }
  } catch {
    // Ignore - this is best-effort priming.
  }
};

const primeWithWebAudio = () => {
  if (typeof window === "undefined") return;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (
        window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.00001;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.02);
    void ctx
      .resume()
      .catch(() => undefined)
      .finally(() => {
        window.setTimeout(() => {
          void ctx.close().catch(() => undefined);
        }, 50);
      });
  } catch {
    // Ignore - this is best-effort priming.
  }
};

export const primeAudioPlayback = () => {
  lastAudioPrimeAt = Date.now();
  primeWithSilentAudio();
  primeWithWebAudio();
};

export const hasRecentAudioPrime = (windowMs = 12000) => {
  return Date.now() - lastAudioPrimeAt <= windowMs;
};
