import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getApiSource, getApiStatus, subscribeApiStatus } from "../lib/api";

const ApiStatusBanner = () => {
  const status = useSyncExternalStore(
    subscribeApiStatus,
    getApiStatus,
    getApiStatus,
  );
  const source = useSyncExternalStore(
    subscribeApiStatus,
    getApiSource,
    getApiSource,
  );

  const lastStatusRef = useRef(status);
  const [showRecovery, setShowRecovery] = useState(false);

  useEffect(() => {
    const prev = lastStatusRef.current;
    lastStatusRef.current = status;
    if (status === "ok" && prev === "fallback") {
      setShowRecovery(true);
      const timer = window.setTimeout(() => {
        setShowRecovery(false);
      }, 3000);
      return () => window.clearTimeout(timer);
    }
    if (status === "fallback") {
      setShowRecovery(false);
    }
  }, [status]);

  if (status !== "fallback" && !showRecovery) return null;

  const sourceLabel =
    source === "myquran"
      ? "MyQuran"
      : source === "equran"
        ? "EQuran"
        : "sumber langsung";

  if (showRecovery && status === "ok") {
    return (
      <div
        className="bg-emerald-50 py-2 text-center text-xs text-emerald-800"
        role="status"
        aria-live="polite"
      >
        Proxy API aktif kembali.
      </div>
    );
  }

  return (
    <div
      className="bg-red-50 py-2 text-center text-xs text-red-800"
      role="status"
      aria-live="polite"
    >
      <span>
        Proxy API tidak aktif, memakai {sourceLabel}. Beberapa fitur mungkin
        terbatas.
      </span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="ml-2 inline-flex items-center rounded-full border border-red-200 bg-red-100 px-3 py-1 text-[11px] font-semibold text-red-900"
      >
        Coba Sambung Kembali
      </button>
    </div>
  );
};

export default ApiStatusBanner;
