import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, Compass, MapPin, Navigation2, Search } from "lucide-react";
import Container from "../components/Container";
import SectionHeader from "../components/SectionHeader";
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
} from "../components/State";
import { fetchJson } from "../lib/api";
import {
  formatMonthId,
  formatDateId,
  getWeekRange,
  isDateBetween,
} from "../lib/date";
import { useDebouncedValue } from "../lib/hooks";
import { readStorage, writeStorage } from "../lib/storage";
import type {
  LocationItem,
  SholatScheduleData,
  SholatScheduleEntry,
} from "../lib/types";

const STORAGE_KEY = "ibadahmu:location";
const ADZAN_STORAGE_KEY = "ibadahmu:adzan-settings";
const ADZAN_LAST_FIRED_KEY = "ibadahmu:adzan-last-fired";

type AdzanMode = "silent" | "notify" | "sound";
type AdzanSettings = {
  mode: AdzanMode;
  consentAt: string | null;
  durationSec: number;
};
type AdzanLastFired = {
  dateId: string;
  fired: string[];
};

type Period = "today" | "week" | "month";
type QiblaData = {
  latitude: number;
  longitude: number;
  direction: number;
};

const parseCoordinate = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const cleaned = value.trim().replace(",", ".");
    if (!cleaned) return null;
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizeQibla = (payload: unknown): QiblaData | null => {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const latitude = parseCoordinate(record.latitude);
  const longitude = parseCoordinate(record.longitude);
  const direction = parseCoordinate(record.direction);
  if (latitude == null || longitude == null || direction == null) return null;
  return { latitude, longitude, direction };
};

const SholatPage = () => {
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 300);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<LocationItem[]>([]);
  const [selected, setSelected] = useState<LocationItem | null>(null);
  const [period, setPeriod] = useState<Period>("today");
  const [schedule, setSchedule] = useState<SholatScheduleData | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [qibla, setQibla] = useState<QiblaData | null>(null);
  const [qiblaLoading, setQiblaLoading] = useState(false);
  const [qiblaError, setQiblaError] = useState<string | null>(null);
  const [qiblaLabel, setQiblaLabel] = useState<string | null>(null);
  const [qiblaAccuracy, setQiblaAccuracy] = useState<number | null>(null);
  const [showCompass, setShowCompass] = useState(false);
  const [qiblaNotice, setQiblaNotice] = useState<string | null>(null);
  const [latInput, setLatInput] = useState("");
  const [lonInput, setLonInput] = useState("");
  const [adzanSettings, setAdzanSettings] = useState<AdzanSettings>(() =>
    readStorage(ADZAN_STORAGE_KEY, {
      mode: "silent",
      consentAt: null,
      durationSec: 45,
    }),
  );
  const [adzanNotice, setAdzanNotice] = useState<string | null>(null);
  const [adzanError, setAdzanError] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");
  const [audioReady, setAudioReady] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioStopTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const saved = readStorage<LocationItem | null>(STORAGE_KEY, null);
    if (saved) setSelected(saved);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }
    setNotificationPermission(Notification.permission);
  }, []);

  useEffect(() => {
    if (!debounced || debounced.length < 2) {
      setResults([]);
      setSearchError(null);
      return;
    }

    let active = true;
    setSearchLoading(true);
    setSearchError(null);

    fetchJson<LocationItem[]>(
      `/sholat/kabkota/cari/${encodeURIComponent(debounced)}`,
    )
      .then((res) => {
        if (!active) return;
        setResults(res.data ?? []);
      })
      .catch((err: Error) => {
        if (!active) return;
        setSearchError(err.message);
      })
      .finally(() => {
        if (!active) return;
        setSearchLoading(false);
      });

    return () => {
      active = false;
    };
  }, [debounced]);

  const loadSchedule = (loc: LocationItem, mode: Period) => {
    setScheduleLoading(true);
    setScheduleError(null);

    const today = new Date();
    const endpoint =
      mode === "today"
        ? `/sholat/jadwal/${loc.id}/today`
        : `/sholat/jadwal/${loc.id}/${formatMonthId(today)}`;

    fetchJson<SholatScheduleData>(endpoint)
      .then((res) => {
        setSchedule(res.data ?? null);
      })
      .catch((err: Error) => {
        setScheduleError(err.message);
      })
      .finally(() => {
        setScheduleLoading(false);
      });
  };

  useEffect(() => {
    if (selected) {
      loadSchedule(selected, period);
    }
  }, [selected, period]);

  useEffect(() => {
    writeStorage(ADZAN_STORAGE_KEY, adzanSettings);
  }, [adzanSettings]);

  const handleSelect = (item: LocationItem) => {
    setSelected(item);
    writeStorage(STORAGE_KEY, item);
  };

  const fetchGeocode = async (queryText: string) => {
    setQiblaLoading(true);
    setQiblaError(null);
    setQiblaNotice(null);
    try {
      const enhancedQuery = queryText.toLowerCase().includes("indonesia")
        ? queryText
        : `${queryText}, Indonesia`;
      const res = await fetchJson<unknown>("/tools/geocode", {
        method: "POST",
        body: JSON.stringify({ query: enhancedQuery }),
      });
      const payload = res.data;
      const entry = Array.isArray(payload) ? payload[0] : payload;
      const latRaw = (entry as { lat?: string | number })?.lat;
      const lonRaw = (entry as { lon?: string | number })?.lon;
      const labelRaw =
        (entry as { display_name?: string; name?: string })?.display_name ??
        (entry as { name?: string })?.name ??
        queryText;
      if (latRaw == null || lonRaw == null) {
        setQiblaError("Koordinat lokasi tidak ditemukan.");
        return;
      }
      const lat = parseCoordinate(latRaw);
      const lon = parseCoordinate(lonRaw);
      if (lat == null || lon == null) {
        setQiblaError("Koordinat lokasi tidak valid.");
        return;
      }
      setQiblaLabel(labelRaw);
      setLatInput(lat.toFixed(6));
      setLonInput(lon.toFixed(6));
      setQiblaNotice(`Menggunakan lokasi terpilih: ${labelRaw}`);
      await fetchQibla(lat, lon, { skipLoading: true });
    } catch (err) {
      setQiblaError((err as Error).message);
    } finally {
      setQiblaLoading(false);
    }
  };

  useEffect(() => {
    if (!selected) return;
    fetchGeocode(selected.lokasi);
  }, [selected]);

  const fetchQibla = async (
    lat: number,
    lon: number,
    options?: { skipLoading?: boolean },
  ) => {
    if (!options?.skipLoading) {
      setQiblaLoading(true);
      setQiblaError(null);
    }
    try {
      const res = await fetchJson<unknown>(`/qibla/${lat},${lon}`);
      const normalized = normalizeQibla(res.data);
      if (!normalized) {
        setQibla(null);
        setQiblaError("Data arah kiblat tidak valid.");
        return;
      }
      setQibla(normalized);
    } catch (err) {
      setQiblaError((err as Error).message);
    } finally {
      if (!options?.skipLoading) {
        setQiblaLoading(false);
      }
    }
  };

  const handleUseLocation = () => {
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      setQiblaError(
        "Lokasi hanya bisa diakses via HTTPS atau localhost. Gunakan input manual atau lokasi terpilih.",
      );
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setQiblaError("Geolocation tidak tersedia di perangkat ini.");
      return;
    }
    setQiblaLoading(true);
    setQiblaError(null);
    setQiblaNotice(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        setQiblaAccuracy(position.coords.accuracy ?? null);
        setQiblaLabel("Lokasi saat ini");
        setLatInput(lat.toFixed(6));
        setLonInput(lon.toFixed(6));
        setQiblaNotice("Menggunakan lokasi perangkat.");
        fetchQibla(lat, lon);
      },
      (err) => {
        if ((err.code === 2 || err.code === 3) && selected) {
          fetchGeocode(selected.lokasi);
          return;
        }
        setQiblaLoading(false);
        const message =
          err.code === 1
            ? "Izin lokasi ditolak. Aktifkan izin lokasi di browser Anda atau gunakan lokasi terpilih."
            : err.code === 2
              ? "Lokasi tidak tersedia. Coba lagi atau gunakan lokasi terpilih."
              : err.code === 3
                ? "Permintaan lokasi timeout. Coba lagi atau gunakan lokasi terpilih."
                : err.message ||
                  "Gagal mengambil lokasi. Coba input manual atau lokasi terpilih.";
        setQiblaError(message);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const handleManualQibla = () => {
    const lat = parseCoordinate(latInput);
    const lon = parseCoordinate(lonInput);
    if (lat == null || lon == null) {
      setQiblaError("Masukkan latitude dan longitude yang valid.");
      return;
    }
    setQiblaAccuracy(null);
    setQiblaLabel("Koordinat manual");
    setQiblaNotice("Menggunakan koordinat manual.");
    fetchQibla(lat, lon);
  };

  const copyCoordinates = async () => {
    if (!qibla) return;
    const value = `${qibla.latitude.toFixed(6)}, ${qibla.longitude.toFixed(6)}`;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // ignore
    }
  };

  const scheduleList = useMemo(() => {
    if (!schedule) return [] as Array<[string, SholatScheduleEntry]>;
    const entries = Object.entries(schedule.jadwal ?? {});
    if (period === "week") {
      const now = new Date();
      const { start, end } = getWeekRange(now);
      return entries.filter(([date]) =>
        isDateBetween(new Date(date), start, end),
      );
    }
    if (period === "today") {
      const todayId = formatDateId(new Date());
      return entries.filter(([date]) => date === todayId);
    }
    return entries;
  }, [schedule, period]);

  const todaysSchedule = useMemo(() => {
    if (!schedule?.jadwal) return null;
    const todayId = formatDateId(new Date());
    return schedule.jadwal[todayId] ?? null;
  }, [schedule]);

  const [lastFired, setLastFired] = useState<AdzanLastFired>(() => {
    const todayId = formatDateId(new Date());
    return readStorage(ADZAN_LAST_FIRED_KEY, {
      dateId: todayId,
      fired: [],
    });
  });

  useEffect(() => {
    writeStorage(ADZAN_LAST_FIRED_KEY, lastFired);
  }, [lastFired]);

  const requestNotificationPermission = async () => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      setAdzanError("Notifikasi tidak didukung di browser ini.");
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission !== "granted") {
      setAdzanNotice(
        "Izin notifikasi ditolak. Aktifkan dari pengaturan browser jika ingin notifikasi.",
      );
    }
  };

  const handleAdzanModeChange = async (mode: AdzanMode) => {
    setAdzanNotice(null);
    setAdzanError(null);

    if (mode !== "silent" && !adzanSettings.consentAt) {
      const confirmed = window.confirm(
        "Aktifkan pengingat adzan? Anda akan menerima notifikasi ketika waktu sholat tiba.",
      );
      if (!confirmed) return;
      setAdzanSettings((prev) => ({
        ...prev,
        consentAt: new Date().toISOString(),
      }));
    }

    if (mode !== "silent" && notificationPermission === "default") {
      await requestNotificationPermission();
    }

    setAdzanSettings((prev) => ({ ...prev, mode }));
  };

  const handleTestSound = async () => {
    setAdzanError(null);
    try {
      const audio = audioRef.current;
      if (!audio) throw new Error("Audio belum siap.");
      if (audioStopTimeoutRef.current) {
        window.clearTimeout(audioStopTimeoutRef.current);
      }
      await audio.play();
      audioStopTimeoutRef.current = window.setTimeout(() => {
        audio.pause();
        audio.currentTime = 0;
      }, adzanSettings.durationSec * 1000);
    } catch (err) {
      setAdzanError(
        (err as Error).message ||
          "Gagal memutar audio. Pastikan file adzan tersedia.",
      );
    }
  };

  useEffect(() => {
    if (!todaysSchedule) return;
    if (adzanSettings.mode === "silent") return;

    const entries: Array<[keyof SholatScheduleEntry, string]> = [
      ["subuh", "Subuh"],
      ["dzuhur", "Dzuhur"],
      ["ashar", "Ashar"],
      ["maghrib", "Maghrib"],
      ["isya", "Isya"],
    ];

    const checkAndFire = () => {
      const now = new Date();
      const todayId = formatDateId(now);
      const activeLastFired =
        lastFired.dateId === todayId
          ? lastFired
          : { dateId: todayId, fired: [] };
      if (activeLastFired !== lastFired) {
        setLastFired(activeLastFired);
      }

      entries.forEach(([key, label]) => {
        const time = todaysSchedule[key];
        if (!time) return;
        const [hourRaw, minuteRaw] = time.split(":").map(Number);
        if (!Number.isFinite(hourRaw) || !Number.isFinite(minuteRaw)) return;
        const target = new Date(now);
        target.setHours(hourRaw, minuteRaw, 0, 0);
        const diff = now.getTime() - target.getTime();
        if (diff < 0 || diff > 120000) return;
        const firedKey = `${todayId}:${String(key)}`;
        if (activeLastFired.fired.includes(firedKey)) return;

        if (
          typeof window !== "undefined" &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          new Notification(`Waktu ${label}`, {
            body: `Saatnya sholat ${label}.`,
            icon: "/icon-192.png",
          });
        }

        if (adzanSettings.mode === "sound") {
          const audio = audioRef.current;
          if (audio) {
            if (audioStopTimeoutRef.current) {
              window.clearTimeout(audioStopTimeoutRef.current);
            }
            audio.play().catch(() => {
              setAdzanError(
                "Gagal memutar audio. Pastikan file adzan tersedia.",
              );
            });
            audioStopTimeoutRef.current = window.setTimeout(() => {
              audio.pause();
              audio.currentTime = 0;
            }, adzanSettings.durationSec * 1000);
          }
        }

        setLastFired((prev) => ({
          dateId: todayId,
          fired: [...prev.fired, firedKey],
        }));
      });
    };

    const scheduleNext = () => {
      const now = new Date();
      const upcoming = entries
        .map(([key, label]) => {
          const time = todaysSchedule[key];
          if (!time) return null;
          const [hourRaw, minuteRaw] = time.split(":").map(Number);
          if (!Number.isFinite(hourRaw) || !Number.isFinite(minuteRaw))
            return null;
          const target = new Date(now);
          target.setHours(hourRaw, minuteRaw, 0, 0);
          if (target.getTime() <= now.getTime()) return null;
          return { target, label };
        })
        .filter(Boolean)
        .sort((a, b) => a!.target.getTime() - b!.target.getTime());

      const next = upcoming[0];
      const delay = next
        ? Math.max(1000, next.target.getTime() - now.getTime() - 500)
        : 300000;

      timeoutId = window.setTimeout(() => {
        checkAndFire();
        scheduleNext();
      }, delay);
    };

    let timeoutId = window.setTimeout(() => {});
    const intervalId = window.setInterval(checkAndFire, 300000);
    checkAndFire();
    scheduleNext();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        checkAndFire();
      }
    };
    const handleFocus = () => checkAndFire();

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
    };
  }, [
    adzanSettings.mode,
    adzanSettings.durationSec,
    lastFired,
    todaysSchedule,
  ]);

  return (
    <div className="py-10">
      <Container>
        <SectionHeader
          title="Waktu Sholat & Qiblat"
          subtitle="Cari lokasi, simpan favorit, dan cek jadwal harian."
        />

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <div className="flex items-center gap-3 rounded-full border border-emerald-100 bg-white px-4 py-2">
              <Search className="h-4 w-4 text-emerald-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari kab/kota (contoh: Bandung)"
                className="w-full text-sm outline-none"
              />
            </div>

            <div className="mt-4 space-y-3">
              {searchLoading ? (
                <LoadingState message="Mencari lokasi..." />
              ) : null}
              {searchError ? <ErrorState message={searchError} /> : null}
              {!searchLoading &&
              !searchError &&
              results.length === 0 &&
              debounced.length >= 2 ? (
                <EmptyState message="Lokasi tidak ditemukan. Coba kata kunci lain." />
              ) : null}
              {results.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item)}
                  className="flex w-full items-center justify-between rounded-xl border border-emerald-100 px-4 py-3 text-left text-sm hover:bg-emerald-50"
                >
                  <span>{item.lokasi}</span>
                  <MapPin className="h-4 w-4 text-emerald-600" />
                </button>
              ))}
            </div>
          </Card>

          <div className="space-y-6">
            <Card>
              <div className="flex flex-wrap items-center gap-3">
                {(["today", "week", "month"] as Period[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setPeriod(mode)}
                    className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                      period === mode
                        ? "bg-emerald-600 text-white"
                        : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {mode === "today"
                      ? "Hari Ini"
                      : mode === "week"
                        ? "Minggu Ini"
                        : "Bulan Ini"}
                  </button>
                ))}
              </div>

              <div className="mt-4">
                {!selected ? (
                  <EmptyState message="Pilih lokasi untuk melihat jadwal sholat." />
                ) : null}
                {scheduleLoading ? (
                  <LoadingState message="Mengambil jadwal..." />
                ) : null}
                {scheduleError ? <ErrorState message={scheduleError} /> : null}

                {selected && schedule && !scheduleLoading ? (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                      <p className="text-xs text-emerald-700">
                        Lokasi terpilih
                      </p>
                      <p className="text-sm font-semibold text-textPrimary">
                        {schedule.kabko} · {schedule.prov}
                      </p>
                    </div>

                    {scheduleList.length === 0 ? (
                      <EmptyState message="Jadwal tidak tersedia untuk periode ini." />
                    ) : (
                      scheduleList.map(([dateKey, item]) => (
                        <div
                          key={dateKey}
                          className="rounded-xl border border-emerald-100 bg-white px-4 py-3"
                        >
                          <p className="text-xs text-textSecondary">
                            {item.tanggal}
                          </p>
                          <div className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                            <span>Imsak: {item.imsak}</span>
                            <span>Subuh: {item.subuh}</span>
                            <span>Terbit: {item.terbit}</span>
                            <span>Dhuha: {item.dhuha}</span>
                            <span>Dzuhur: {item.dzuhur}</span>
                            <span>Ashar: {item.ashar}</span>
                            <span>Maghrib: {item.maghrib}</span>
                            <span>Isya: {item.isya}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            </Card>

            <Card>
              <div className="flex items-center gap-2 text-emerald-700">
                <Bell className="h-5 w-5" />
                <h3 className="text-sm font-semibold text-textPrimary">
                  Pengingat Adzan
                </h3>
              </div>
              <p className="mt-2 text-xs text-textSecondary">
                Aktifkan pengingat adzan untuk waktu sholat hari ini. Notifikasi
                dan suara hanya bekerja saat halaman ini terbuka.
              </p>

              <div className="mt-4 grid gap-2">
                {(
                  [
                    { value: "silent", label: "Hening semua" },
                    { value: "notify", label: "Notifikasi saja" },
                    { value: "sound", label: "Suara + Notifikasi" },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleAdzanModeChange(option.value)}
                    className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition ${
                      adzanSettings.mode === option.value
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-emerald-100 bg-white hover:bg-emerald-50"
                    }`}
                  >
                    <span>{option.label}</span>
                    <span
                      className={`text-[11px] font-semibold ${
                        adzanSettings.mode === option.value
                          ? "text-emerald-700"
                          : "text-textSecondary"
                      }`}
                    >
                      {adzanSettings.mode === option.value ? "Aktif" : "Pilih"}
                    </span>
                  </button>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={requestNotificationPermission}
                  className="w-full rounded-full border border-emerald-200 px-4 py-2 text-xs font-semibold text-emerald-700 sm:w-auto"
                >
                  Minta Izin Notifikasi
                </button>
                <button
                  type="button"
                  onClick={handleTestSound}
                  className="w-full rounded-full border border-emerald-200 px-4 py-2 text-xs font-semibold text-emerald-700 sm:w-auto"
                >
                  Uji Suara
                </button>
              </div>

              <label className="mt-4 block text-xs text-textSecondary">
                Durasi suara adzan
                <select
                  value={adzanSettings.durationSec}
                  onChange={(event) =>
                    setAdzanSettings((prev) => ({
                      ...prev,
                      durationSec: Number(event.target.value),
                    }))
                  }
                  className="mt-2 w-full rounded-xl border border-emerald-100 bg-white px-3 py-2 text-sm"
                >
                  {[30, 45, 60].map((seconds) => (
                    <option key={seconds} value={seconds}>
                      {seconds} detik
                    </option>
                  ))}
                </select>
              </label>

              <div className="mt-3 space-y-2 text-xs text-textSecondary">
                <p>
                  Status notifikasi:{" "}
                  <span
                    className={`font-semibold ${
                      notificationPermission === "granted"
                        ? "text-emerald-700"
                        : notificationPermission === "denied"
                          ? "text-rose-600"
                          : "text-amber-600"
                    }`}
                  >
                    {notificationPermission === "unsupported"
                      ? "Tidak didukung"
                      : notificationPermission}
                  </span>
                </p>
                <p>
                  Status audio:{" "}
                  <span
                    className={
                      audioReady
                        ? "font-semibold text-emerald-700"
                        : "font-semibold text-rose-600"
                    }
                  >
                    {audioReady ? "Siap" : "Belum siap"}
                  </span>
                </p>
                {!audioReady ? (
                  <p>
                    Audio adzan belum tersedia. Tambahkan file
                    <span className="font-semibold"> adzan.mp3 </span>
                    atau gunakan placeholder
                    <span className="font-semibold"> adzan.wav </span>
                    di folder
                    <span className="font-semibold"> web/public/audio</span>.
                  </p>
                ) : null}
              </div>

              {adzanNotice ? (
                <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
                  {adzanNotice}
                </div>
              ) : null}
              {adzanError ? <ErrorState message={adzanError} /> : null}

              <audio
                ref={audioRef}
                preload="auto"
                onCanPlay={() => setAudioReady(true)}
                onError={() => setAudioReady(false)}
              >
                <source src="/audio/adzan.mp3" type="audio/mpeg" />
                <source src="/audio/adzan.wav" type="audio/wav" />
              </audio>
            </Card>

            <Card>
              <div className="flex items-center gap-2 text-emerald-700">
                <Compass className="h-5 w-5" />
                <h3 className="text-sm font-semibold text-textPrimary">
                  Arah Kiblat
                </h3>
              </div>
              <p className="mt-2 text-xs text-textSecondary">
                Gunakan lokasi saat ini atau masukkan koordinat secara manual.
              </p>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-textSecondary">
                  Latitude
                  <input
                    value={latInput}
                    onChange={(event) => setLatInput(event.target.value)}
                    placeholder="-6.200000"
                    inputMode="decimal"
                    className="mt-1 w-full rounded-lg border border-emerald-100 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-xs text-textSecondary">
                  Longitude
                  <input
                    value={lonInput}
                    onChange={(event) => setLonInput(event.target.value)}
                    placeholder="106.816666"
                    inputMode="decimal"
                    className="mt-1 w-full rounded-lg border border-emerald-100 px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleUseLocation}
                  className="w-full rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white sm:w-auto"
                >
                  Gunakan Lokasi Saat Ini
                </button>
                <button
                  type="button"
                  onClick={handleManualQibla}
                  className="w-full rounded-full border border-emerald-200 px-4 py-2 text-xs font-semibold text-emerald-700 sm:w-auto"
                >
                  Hitung Arah
                </button>
                {selected ? (
                  <button
                    type="button"
                    onClick={() => fetchGeocode(selected.lokasi)}
                    className="w-full rounded-full border border-emerald-200 px-4 py-2 text-xs font-semibold text-emerald-700 sm:w-auto"
                  >
                    Gunakan Lokasi Terpilih
                  </button>
                ) : null}
              </div>

              <div className="mt-4">
                {qiblaLoading ? (
                  <LoadingState message="Menghitung arah kiblat..." />
                ) : null}
                {qiblaNotice ? (
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
                    {qiblaNotice}
                  </div>
                ) : null}
                {!qibla && qiblaError ? (
                  <ErrorState message={qiblaError} />
                ) : null}

                {qibla && !qiblaLoading ? (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-textSecondary">
                      {qiblaLabel ? (
                        <p className="text-xs text-emerald-700">
                          Lokasi: {qiblaLabel}
                        </p>
                      ) : null}
                      {qiblaAccuracy ? (
                        <p className="mt-1 text-xs text-emerald-700">
                          Akurasi lokasi: ±{Math.round(qiblaAccuracy)} m
                        </p>
                      ) : null}
                      <p>
                        <span className="font-semibold text-textPrimary">
                          Arah Kiblat:
                        </span>{" "}
                        {qibla.direction.toFixed(2)}° dari utara (searah jarum
                        jam)
                      </p>
                      <p className="mt-1 text-xs">
                        Koordinat: {qibla.latitude.toFixed(6)},{" "}
                        {qibla.longitude.toFixed(6)}
                      </p>
                    </div>

                    <div className="flex items-center justify-center">
                      <div className="relative h-32 w-32 rounded-full border border-emerald-100 bg-white shadow-sm">
                        <div className="absolute left-1/2 top-1/2 h-12 w-0.5 -translate-x-1/2 -translate-y-full rounded-full bg-emerald-200" />
                        <div className="absolute left-1/2 top-1/2 h-12 w-0.5 -translate-x-1/2 -translate-y-full rounded-full bg-emerald-200 rotate-90" />
                        <Navigation2
                          className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-emerald-600"
                          style={
                            {
                              "--tw-rotate": `${qibla.direction}deg`,
                            } as CSSProperties
                          }
                        />
                        <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-textSecondary">
                          N
                        </span>
                        <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-textSecondary">
                          S
                        </span>
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 text-[10px] text-textSecondary">
                          W
                        </span>
                        <span className="absolute right-0 top-1/2 -translate-y-1/2 text-[10px] text-textSecondary">
                          E
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2">
                      <button
                        type="button"
                        onClick={copyCoordinates}
                        className="rounded-full border border-emerald-200 px-4 py-2 text-xs font-semibold text-emerald-700"
                      >
                        Salin Koordinat
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCompass(true)}
                        className="rounded-full border border-emerald-200 px-4 py-2 text-xs font-semibold text-emerald-700 lg:hidden"
                      >
                        Kompas Besar
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </Card>
          </div>
        </div>
      </Container>
      {showCompass && qibla ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
          onClick={() => setShowCompass(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-textPrimary">
                  Kompas Kiblat
                </p>
                {qiblaLabel ? (
                  <p className="text-xs text-textSecondary">{qiblaLabel}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setShowCompass(false)}
                className="text-xs text-textSecondary"
              >
                Tutup
              </button>
            </div>
            <div className="mt-6 flex items-center justify-center">
              <div className="relative h-56 w-56 rounded-full border border-emerald-100 bg-white shadow-sm">
                <div className="absolute left-1/2 top-1/2 h-20 w-0.5 -translate-x-1/2 -translate-y-full rounded-full bg-emerald-200" />
                <div className="absolute left-1/2 top-1/2 h-20 w-0.5 -translate-x-1/2 -translate-y-full rounded-full bg-emerald-200 rotate-90" />
                <Navigation2
                  className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 text-emerald-600"
                  style={
                    {
                      "--tw-rotate": `${qibla.direction}deg`,
                    } as CSSProperties
                  }
                />
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-xs font-semibold text-textSecondary">
                  N
                </span>
                <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-xs text-textSecondary">
                  S
                </span>
                <span className="absolute left-0 top-1/2 -translate-y-1/2 text-xs text-textSecondary">
                  W
                </span>
                <span className="absolute right-0 top-1/2 -translate-y-1/2 text-xs text-textSecondary">
                  E
                </span>
              </div>
            </div>
            <p className="mt-4 text-center text-sm text-textSecondary">
              {qibla.direction.toFixed(2)}° dari utara (searah jarum jam)
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default SholatPage;
