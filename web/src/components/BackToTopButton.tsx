import { ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAudio } from "../lib/audio";

const SHOW_AFTER_PX = 420;

const readScrollTop = () => {
  if (typeof window === "undefined") return 0;
  return (
    window.scrollY ||
    document.documentElement.scrollTop ||
    document.body.scrollTop ||
    0
  );
};

const BackToTopButton = () => {
  const location = useLocation();
  const { track } = useAudio();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let frame = 0;
    let lastVisible = false;

    const syncVisibility = () => {
      frame = 0;
      const nextVisible = readScrollTop() > SHOW_AFTER_PX;
      if (nextVisible === lastVisible) return;
      lastVisible = nextVisible;
      setIsVisible(nextVisible);
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(syncVisibility);
    };

    syncVisibility();
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
    setIsVisible(readScrollTop() > SHOW_AFTER_PX);
  }, [location.pathname]);

  const handleBackToTop = () => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const bottomOffsetClass = track
    ? "bottom-[calc(env(safe-area-inset-bottom)+8.5rem)]"
    : "bottom-[calc(env(safe-area-inset-bottom)+5rem)]";

  return (
    <button
      type="button"
      onClick={handleBackToTop}
      aria-label="Kembali ke atas"
      title="Kembali ke atas"
      className={`fixed right-4 z-30 inline-flex h-11 w-11 items-center justify-center rounded-full border border-emerald-200 bg-white/95 text-emerald-700 shadow-lg backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 lg:bottom-6 ${
        isVisible
          ? "pointer-events-auto translate-y-0 opacity-100"
          : "pointer-events-none translate-y-3 opacity-0"
      } ${bottomOffsetClass}`}
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
};

export default BackToTopButton;
