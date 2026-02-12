import { ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAudio } from "../lib/audio";

const SHOW_AFTER_PX = 150;
const RING_RADIUS = 19;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const readScrollMetrics = () => {
  if (typeof window === "undefined") return { top: 0, progress: 0 };
  const top =
    window.scrollY ||
    document.documentElement.scrollTop ||
    document.body.scrollTop ||
    0;
  const doc = document.documentElement;
  const scrollMax = Math.max(doc.scrollHeight - doc.clientHeight, 0);
  const progress =
    scrollMax > 0 ? Math.min(Math.max(top / scrollMax, 0), 1) : 0;
  return { top, progress };
};

const BackToTopButton = () => {
  const location = useLocation();
  const { track } = useAudio();
  const [isVisible, setIsVisible] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let frame = 0;
    let lastVisible = false;
    let lastProgress = -1;

    const syncMetrics = () => {
      frame = 0;
      const metrics = readScrollMetrics();
      const nextVisible = metrics.top > SHOW_AFTER_PX;
      if (nextVisible !== lastVisible) {
        lastVisible = nextVisible;
        setIsVisible(nextVisible);
      }
      if (Math.abs(metrics.progress - lastProgress) > 0.002) {
        lastProgress = metrics.progress;
        setScrollProgress(metrics.progress);
      }
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(syncMetrics);
    };

    syncMetrics();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, []);

  useEffect(() => {
    const metrics = readScrollMetrics();
    setIsVisible(metrics.top > SHOW_AFTER_PX);
    setScrollProgress(metrics.progress);
  }, [location.pathname]);

  const handleBackToTop = () => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const bottomOffsetClass = track
    ? "bottom-[calc(env(safe-area-inset-bottom)+8.5rem)]"
    : "bottom-[calc(env(safe-area-inset-bottom)+5rem)]";
  const dashOffset = RING_CIRCUMFERENCE * (1 - scrollProgress);

  return (
    <button
      type="button"
      onClick={handleBackToTop}
      aria-label="Kembali ke atas"
      title="Kembali ke atas"
      className={`back-to-top-btn fixed right-4 z-30 inline-flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline-none lg:bottom-6 overflow-hidden ${
        isVisible
          ? "pointer-events-auto translate-y-0 opacity-100"
          : "pointer-events-none translate-y-3 opacity-0"
      } ${bottomOffsetClass}`}
    >
      <span className="relative inline-flex h-full w-full items-center justify-center">
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 48 48"
          aria-hidden="true"
        >
          <circle
            cx="24"
            cy="24"
            r={RING_RADIUS}
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.25"
            strokeWidth="3"
          />
          <circle
            cx="24"
            cy="24"
            r={RING_RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 24 24)"
            style={{ transition: "stroke-dashoffset 120ms linear" }}
          />
        </svg>
        <ArrowUp className="relative z-[1] h-5 w-5" />
      </span>
    </button>
  );
};

export default BackToTopButton;
