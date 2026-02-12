import { useEffect, useRef } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Header from "./components/Header";
import MobileNav from "./components/MobileNav";
import Footer from "./components/Footer";
import OfflineBanner from "./components/OfflineBanner";
import ApiStatusBanner from "./components/ApiStatusBanner";
import HomePage from "./pages/HomePage";
import SholatPage from "./pages/SholatPage";
import QuranPage from "./pages/QuranPage";
import SurahDetailPage from "./pages/SurahDetailPage";
import AyahDetailPage from "./pages/AyahDetailPage";
import PlaceholderPage from "./pages/PlaceholderPage";
import HadisPage from "./pages/HadisPage";
import DoaPage from "./pages/DoaPage";
import DisclaimerPage from "./pages/DisclaimerPage";
import ZakatPage from "./pages/ZakatPage";
import MatsuratPage from "./pages/MatsuratPage";
import WarisPage from "./pages/WarisPage";
import MurratalPage from "./pages/MurratalPage";
import PuasaPage from "./pages/PuasaPage";
import HajiPage from "./pages/HajiPage";
import { fetchJsonCached } from "./lib/api";
import { formatDateId, formatMonthId } from "./lib/date";

const PREFETCH_STAMP_KEY = "ibadahmu:prefetch:v1:date";
const LOCATION_STORAGE_KEY = "ibadahmu:location";

const getStoredLocationId = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: string | number };
    if (parsed?.id === undefined || parsed?.id === null) return null;
    const id = String(parsed.id).trim();
    return id || null;
  } catch {
    return null;
  }
};

const scheduleIdleTask = (task: () => void) => {
  if (
    typeof window !== "undefined" &&
    "requestIdleCallback" in window &&
    typeof window.requestIdleCallback === "function"
  ) {
    const idleId = window.requestIdleCallback(() => task(), { timeout: 2000 });
    return () => window.cancelIdleCallback(idleId);
  }
  const timeoutId = window.setTimeout(task, 600);
  return () => window.clearTimeout(timeoutId);
};

const App = () => {
  const location = useLocation();
  const prefetchRunningRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;
    let cancelIdle: (() => void) | null = null;

    const runPrefetch = () => {
      if (cancelled) return;
      if (!navigator.onLine) return;
      if (prefetchRunningRef.current) return;

      const now = new Date();
      const todayId = formatDateId(now);
      const stamp = window.localStorage.getItem(PREFETCH_STAMP_KEY);
      if (stamp === todayId) return;

      prefetchRunningRef.current = true;
      window.localStorage.setItem(PREFETCH_STAMP_KEY, todayId);

      cancelIdle = scheduleIdleTask(async () => {
        if (cancelled) {
          prefetchRunningRef.current = false;
          return;
        }

        const monthId = formatMonthId(now);
        const locationId = getStoredLocationId();
        const tasks: Array<Promise<unknown>> = [
          fetchJsonCached("/quran", {
            ttl: 12 * 60 * 60,
            key: "quran-list",
            staleIfError: true,
          }),
          fetchJsonCached("/doa/harian", {
            ttl: 6 * 60 * 60,
            key: "doa-categories",
            staleIfError: true,
          }),
          fetchJsonCached("/hadis/enc", {
            ttl: 24 * 60 * 60,
            key: "hadis-meta",
            staleIfError: true,
          }),
          fetchJsonCached("/hadis/enc/explore?page=1&limit=5", {
            ttl: 5 * 60,
            key: "hadis-initial-page-1",
            staleIfError: true,
          }),
        ];

        if (locationId) {
          tasks.push(
            fetchJsonCached(`/sholat/jadwal/${locationId}/today`, {
              ttl: 30 * 60,
              key: `sholat-jadwal-${locationId}-today-${todayId}`,
              staleIfError: true,
            }),
          );
          tasks.push(
            fetchJsonCached(`/sholat/jadwal/${locationId}/${monthId}`, {
              ttl: 6 * 60 * 60,
              key: `sholat-jadwal-${locationId}-month-${monthId}`,
              staleIfError: true,
            }),
          );
        }

        await Promise.allSettled(tasks);
        prefetchRunningRef.current = false;
      });
    };

    runPrefetch();
    const handleOnline = () => runPrefetch();
    window.addEventListener("online", handleOnline);

    return () => {
      cancelled = true;
      if (cancelIdle) cancelIdle();
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <OfflineBanner />
      <ApiStatusBanner />
      <main className="content-shell flex-1 pb-24 lg:pb-12">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route
            path="/kalender"
            element={<Navigate to="/murratal" replace />}
          />
          <Route path="/sholat" element={<SholatPage />} />
          <Route path="/quran" element={<QuranPage />} />
          <Route path="/quran/:surahId" element={<SurahDetailPage />} />
          <Route path="/quran/:surahId/:ayahId" element={<AyahDetailPage />} />
          <Route path="/murratal" element={<MurratalPage />} />
          <Route path="/haji" element={<HajiPage />} />
          <Route path="/puasa" element={<PuasaPage />} />
          <Route path="/hadis" element={<HadisPage />} />
          <Route path="/doa" element={<DoaPage />} />
          <Route path="/waris" element={<WarisPage />} />
          <Route path="/zakat" element={<ZakatPage />} />
          <Route path="/matsurat" element={<MatsuratPage />} />
          <Route path="/disclaimer" element={<DisclaimerPage />} />
          <Route
            path="*"
            element={<PlaceholderPage title="Halaman Tidak Ditemukan" />}
          />
        </Routes>
      </main>
      <Footer />
      <MobileNav />
    </div>
  );
};

export default App;
