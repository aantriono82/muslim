import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Container from "../components/Container";
import SectionHeader from "../components/SectionHeader";
import { Card, ErrorState, LoadingState } from "../components/State";
import { fetchJsonCached } from "../lib/api";
import type { CalendarData, CalendarInfo } from "../lib/types";

const methods = [
  { value: "standar", label: "Standar" },
  { value: "islamic-umalqura", label: "Umm Al-Qura" },
  { value: "islamic-civil", label: "Islamic Civil" },
];

const hijriMonths = [
  "Muharram",
  "Safar",
  "Rabiul Awal",
  "Rabiul Akhir",
  "Jumadil Awal",
  "Jumadil Akhir",
  "Rajab",
  "Syaban",
  "Ramadan",
  "Syawal",
  "Dzulqa'dah",
  "Dzulhijjah",
];

type Schedule =
  | { type: "range"; month: number; start: number; end: number }
  | { type: "single"; month: number; day: number }
  | { type: "monthly"; days: number[] }
  | { type: "weekly"; weekdays: number[]; count: number }
  | { type: "alternate"; count: number }
  | { type: "flexible" };

type FastingItem = {
  id: string;
  title: string;
  category: "Wajib" | "Sunnah";
  schedule: Schedule;
  note?: string;
  intention?: string;
};

const wajibItems: FastingItem[] = [
  {
    id: "ramadhan",
    title: "Ramadhan",
    category: "Wajib",
    schedule: { type: "range", month: 9, start: 1, end: 30 },
    note: "Jumlah hari bisa 29/30 tergantung penetapan.",
    intention: "Niat: Berpuasa Ramadhan karena Allah Ta'ala.",
  },
  {
    id: "qadha",
    title: "Qadha",
    category: "Wajib",
    schedule: { type: "flexible" },
    note: "Mengganti puasa Ramadhan di hari lain (di luar hari terlarang).",
    intention: "Niat: Mengganti puasa Ramadhan karena Allah Ta'ala.",
  },
  {
    id: "nazar",
    title: "Nazar",
    category: "Wajib",
    schedule: { type: "flexible" },
    note: "Dilaksanakan sesuai nazar yang diucapkan.",
    intention: "Niat: Menunaikan puasa nazar karena Allah Ta'ala.",
  },
];

const sunnahItems: FastingItem[] = [
  {
    id: "syawal",
    title: "Syawal 6",
    category: "Sunnah",
    schedule: { type: "range", month: 10, start: 2, end: 7 },
    note: "Enam hari setelah Idul Fitri (2–7 Syawal).",
    intention: "Niat: Puasa sunnah Syawal karena Allah Ta'ala.",
  },
  {
    id: "arafah",
    title: "Arafah",
    category: "Sunnah",
    schedule: { type: "single", month: 12, day: 9 },
    note: "Disunnahkan bagi yang tidak berhaji.",
    intention: "Niat: Puasa Arafah karena Allah Ta'ala.",
  },
  {
    id: "muharram",
    title: "Muharram (Tasu'a)",
    category: "Sunnah",
    schedule: { type: "single", month: 1, day: 9 },
    note: "Disunnahkan berpuasa bersama Asyura.",
    intention: "Niat: Puasa Muharram (Tasu'a) karena Allah Ta'ala.",
  },
  {
    id: "asyura",
    title: "Asyura",
    category: "Sunnah",
    schedule: { type: "single", month: 1, day: 10 },
    intention: "Niat: Puasa Asyura karena Allah Ta'ala.",
  },
  {
    id: "senin-kamis",
    title: "Senin–Kamis",
    category: "Sunnah",
    schedule: { type: "weekly", weekdays: [1, 4], count: 10 },
    note: "Menampilkan 10 tanggal terdekat.",
    intention: "Niat: Puasa sunnah Senin/Kamis karena Allah Ta'ala.",
  },
  {
    id: "ayyamul-bidh",
    title: "Ayyamul Bidh",
    category: "Sunnah",
    schedule: { type: "monthly", days: [13, 14, 15] },
    note: "Tanggal 13–15 tiap bulan Hijriah (bulan ini & berikutnya).",
    intention: "Niat: Puasa Ayyamul Bidh karena Allah Ta'ala.",
  },
  {
    id: "daud",
    title: "Daud",
    category: "Sunnah",
    schedule: { type: "alternate", count: 10 },
    note: "Pola selang-seling, contoh 10 tanggal terdekat.",
    intention: "Niat: Puasa sunnah Daud karena Allah Ta'ala.",
  },
];

const pad = (value: number) => String(value).padStart(2, "0");

const formatHijriLabel = (year: number, month: number, day: number) =>
  `${day} ${hijriMonths[month - 1] ?? ""} ${year} H`;

const formatHijriRangeLabel = (
  year: number,
  month: number,
  start: number,
  end: number,
) => `${start}–${end} ${hijriMonths[month - 1] ?? ""} ${year} H`;

const buildHijriDate = (year: number, month: number, day: number) =>
  `${year}-${pad(month)}-${pad(day)}`;

const formatDateISO = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const formatCeDisplay = (date: Date) =>
  date.toLocaleDateString("id-ID", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

const parseCategoryParam = (
  value: string | null,
): "Semua" | FastingItem["category"] => {
  if (!value) return "Semua";
  const normalized = value.trim().toLowerCase();
  if (normalized === "wajib") return "Wajib";
  if (normalized === "sunnah" || normalized === "sunah") return "Sunnah";
  return "Semua";
};

const getNextWeekdayDates = (
  baseDate: Date,
  weekdays: number[],
  count: number,
) => {
  const results: Date[] = [];
  const cursor = new Date(baseDate.getTime());
  cursor.setDate(cursor.getDate() + 1);
  cursor.setHours(0, 0, 0, 0);
  while (results.length < count) {
    if (weekdays.includes(cursor.getDay())) {
      results.push(new Date(cursor.getTime()));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return results;
};

const getAlternateDates = (baseDate: Date, count: number) => {
  const results: Date[] = [];
  const cursor = new Date(baseDate.getTime());
  cursor.setDate(cursor.getDate() + 1);
  cursor.setHours(0, 0, 0, 0);
  while (results.length < count) {
    results.push(new Date(cursor.getTime()));
    cursor.setDate(cursor.getDate() + 2);
  }
  return results;
};

const PuasaPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [today, setToday] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState("standar");
  const [adjustment, setAdjustment] = useState("0");
  const [categoryFilter, setCategoryFilter] = useState<
    "Semua" | FastingItem["category"]
  >(() => parseCategoryParam(searchParams.get("kategori")));
  const [hijriToCe, setHijriToCe] = useState<
    Record<string, CalendarInfo | null>
  >({});
  const [ceToHijri, setCeToHijri] = useState<
    Record<string, CalendarInfo | null>
  >({});

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (method) params.set("method", method);
    if (adjustment && adjustment !== "0") params.set("adj", adjustment);
    params.set("tz", "Asia/Jakarta");
    return params.toString();
  }, [method, adjustment]);

  const todayPath = useMemo(
    () => (query ? `/cal/today?${query}` : "/cal/today"),
    [query],
  );

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchJsonCached<CalendarData>(todayPath, {
      ttl: 60 * 60,
      key: `puasa-today-${method}-${adjustment}`,
      staleIfError: true,
    })
      .then((res) => setToday(res.data ?? null))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [adjustment, method, todayPath]);

  useEffect(() => {
    const fromParams = parseCategoryParam(searchParams.get("kategori"));
    setCategoryFilter((prev) => (prev === fromParams ? prev : fromParams));
  }, [searchParams]);

  const monthPairs = useMemo(() => {
    if (!today) return [];
    const current = { year: today.hijr.year, month: today.hijr.month };
    const nextMonth = today.hijr.month === 12 ? 1 : today.hijr.month + 1;
    const nextYear =
      today.hijr.month === 12 ? today.hijr.year + 1 : today.hijr.year;
    return [current, { year: nextYear, month: nextMonth }];
  }, [today]);

  const fixedHijriDates = useMemo(() => {
    if (!today) return [];
    const year = today.hijr.year;
    const dates = new Set<string>();

    const pushDate = (y: number, m: number, d: number) => {
      dates.add(buildHijriDate(y, m, d));
    };

    [...wajibItems, ...sunnahItems].forEach((item) => {
      const schedule = item.schedule;
      if (schedule.type === "range") {
        pushDate(year, schedule.month, schedule.start);
        pushDate(year, schedule.month, schedule.end);
      }
      if (schedule.type === "single") {
        pushDate(year, schedule.month, schedule.day);
      }
      if (schedule.type === "monthly") {
        monthPairs.forEach((pair) => {
          schedule.days.forEach((day) => pushDate(pair.year, pair.month, day));
        });
      }
    });

    return Array.from(dates);
  }, [monthPairs, today]);

  const baseDate = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }, []);

  const seninKamisDates = useMemo(
    () => getNextWeekdayDates(baseDate, [1, 4], 10),
    [baseDate],
  );

  const daudDates = useMemo(() => getAlternateDates(baseDate, 10), [baseDate]);

  const ceDates = useMemo(() => {
    const dates = new Set<string>();
    seninKamisDates.forEach((date) => dates.add(formatDateISO(date)));
    daudDates.forEach((date) => dates.add(formatDateISO(date)));
    return Array.from(dates);
  }, [daudDates, seninKamisDates]);

  useEffect(() => {
    if (fixedHijriDates.length === 0) return;
    let active = true;
    fixedHijriDates.forEach((date) => {
      const cacheKey = `${date}|${method}|${adjustment}`;
      if (hijriToCe[cacheKey] !== undefined) return;
      fetchJsonCached<CalendarData>(`/cal/ce/${date}?${query}`, {
        ttl: 12 * 60 * 60,
        key: `puasa-hijr-${cacheKey}`,
        staleIfError: true,
      })
        .then((res) => {
          if (!active) return;
          setHijriToCe((prev) => ({
            ...prev,
            [cacheKey]: res.data?.ce ?? null,
          }));
        })
        .catch(() => {
          if (!active) return;
          setHijriToCe((prev) => ({ ...prev, [cacheKey]: null }));
        });
    });
    return () => {
      active = false;
    };
  }, [adjustment, fixedHijriDates, hijriToCe, method, query]);

  useEffect(() => {
    if (ceDates.length === 0) return;
    let active = true;
    ceDates.forEach((date) => {
      const cacheKey = `${date}|${method}|${adjustment}`;
      if (ceToHijri[cacheKey] !== undefined) return;
      fetchJsonCached<CalendarData>(`/cal/hijr/${date}?${query}`, {
        ttl: 12 * 60 * 60,
        key: `puasa-ce-${cacheKey}`,
        staleIfError: true,
      })
        .then((res) => {
          if (!active) return;
          setCeToHijri((prev) => ({
            ...prev,
            [cacheKey]: res.data?.hijr ?? null,
          }));
        })
        .catch(() => {
          if (!active) return;
          setCeToHijri((prev) => ({ ...prev, [cacheKey]: null }));
        });
    });
    return () => {
      active = false;
    };
  }, [adjustment, ceDates, ceToHijri, method, query]);

  const resolveCe = (date: string) =>
    hijriToCe[`${date}|${method}|${adjustment}`];

  const resolveHijr = (date: string) =>
    ceToHijri[`${date}|${method}|${adjustment}`];

  const renderHijriSchedule = (item: FastingItem) => {
    if (!today) return "Memuat...";
    const year = today.hijr.year;
    const schedule = item.schedule;
    if (schedule.type === "flexible") return "Fleksibel";
    if (schedule.type === "range") {
      return formatHijriRangeLabel(
        year,
        schedule.month,
        schedule.start,
        schedule.end,
      );
    }
    if (schedule.type === "single") {
      return formatHijriLabel(year, schedule.month, schedule.day);
    }
    if (schedule.type === "monthly") {
      return monthPairs
        .map(
          (pair) =>
            `${schedule.days[0]}–${schedule.days[schedule.days.length - 1]} ${
              hijriMonths[pair.month - 1]
            } ${pair.year} H`,
        )
        .join(" · ");
    }
    return "Mengikuti pola mingguan";
  };

  const renderCeSchedule = (item: FastingItem) => {
    if (!today) return "Memuat...";
    const year = today.hijr.year;
    const schedule = item.schedule;
    if (schedule.type === "flexible") return "Fleksibel";
    if (schedule.type === "range") {
      const start = buildHijriDate(year, schedule.month, schedule.start);
      const end = buildHijriDate(year, schedule.month, schedule.end);
      const startInfo = resolveCe(start);
      const endInfo = resolveCe(end);
      if (startInfo === null || endInfo === null) return "Tidak tersedia";
      if (!startInfo || !endInfo) return "Memuat...";
      return `${startInfo.today} – ${endInfo.today}`;
    }
    if (schedule.type === "single") {
      const date = buildHijriDate(year, schedule.month, schedule.day);
      const info = resolveCe(date);
      if (info === null) return "Tidak tersedia";
      if (!info) return "Memuat...";
      return info.today;
    }
    if (schedule.type === "monthly") {
      return monthPairs
        .map((pair) => {
          const ceDatesList = schedule.days.map((day) => {
            const date = buildHijriDate(pair.year, pair.month, day);
            const info = resolveCe(date);
            if (info === null) return "-";
            if (!info) return "Memuat...";
            return info.today;
          });
          return ceDatesList.join(" • ");
        })
        .join(" | ");
    }
    return "Lihat daftar tanggal";
  };

  const renderWeeklyList = (
    dates: Date[],
    category: FastingItem["category"],
  ) => {
    const rowBorder =
      category === "Wajib" ? "border-emerald-100" : "border-sky-100";
    if (dates.length === 0) {
      return (
        <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Belum ada tanggal yang bisa ditampilkan.
        </div>
      );
    }

    const entries = dates.map((date) => {
      const iso = formatDateISO(date);
      return { date, iso, hijr: resolveHijr(iso) };
    });

    if (entries.every((entry) => entry.hijr === undefined)) {
      return (
        <div className="mt-3 grid gap-2">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className={`skeleton h-9 rounded-lg border ${rowBorder}`}
            />
          ))}
        </div>
      );
    }

    if (entries.every((entry) => entry.hijr === null)) {
      return (
        <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Data Hijriah belum tersedia untuk daftar ini.
        </div>
      );
    }

    return (
      <div className="mt-3 grid gap-2 text-xs text-textSecondary">
        {entries.map((entry) => (
          <div
            key={entry.iso}
            className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 ${rowBorder}`}
          >
            <span className="text-textPrimary">
              {formatCeDisplay(entry.date)}
            </span>
            <span>
              {entry.hijr === null
                ? "-"
                : entry.hijr
                  ? `${entry.hijr.day} ${entry.hijr.monthName} ${entry.hijr.year} H`
                  : "Memuat..."}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const categoryBadgeStyles: Record<FastingItem["category"], string> = {
    Wajib: "border-emerald-600 bg-emerald-600 text-white",
    Sunnah: "border-sky-200 bg-sky-50 text-sky-700",
  };
  const categoryLabelStyles: Record<FastingItem["category"], string> = {
    Wajib: "text-emerald-700",
    Sunnah: "text-sky-700",
  };
  const categoryCardBorderStyles: Record<FastingItem["category"], string> = {
    Wajib: "border-emerald-100",
    Sunnah: "border-sky-100",
  };
  const filterOptions: Array<"Semua" | FastingItem["category"]> = [
    "Semua",
    "Wajib",
    "Sunnah",
  ];
  const filterBaseStyles =
    "rounded-full border px-4 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60";
  const filterStyles: Record<
    "Semua" | FastingItem["category"],
    { active: string; idle: string }
  > = {
    Semua: {
      active: "border-slate-700 bg-slate-700 text-white",
      idle: "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300",
    },
    Wajib: {
      active: "border-emerald-600 bg-emerald-600 text-white",
      idle: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300",
    },
    Sunnah: {
      active: "border-sky-600 bg-sky-600 text-white",
      idle: "border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-300",
    },
  };
  const handleFilterChange = (value: "Semua" | FastingItem["category"]) => {
    setCategoryFilter(value);
    const nextParams = new URLSearchParams(searchParams);
    if (value === "Semua") {
      nextParams.delete("kategori");
    } else {
      nextParams.set("kategori", value.toLowerCase());
    }
    setSearchParams(nextParams);
  };

  const renderItemCard = (item: FastingItem) => {
    const schedule = item.schedule;
    return (
      <Card
        key={item.id}
        className={`border ${categoryCardBorderStyles[item.category]}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-textPrimary">
              {item.title}
            </p>
            <p
              className={`mt-1 text-xs font-medium ${categoryLabelStyles[item.category]}`}
            >
              {item.category}
            </p>
          </div>
          <span
            className={`inline-flex items-center rounded-full border px-3 py-2 text-[11px] font-semibold ${categoryBadgeStyles[item.category]}`}
          >
            {item.category}
          </span>
        </div>
        <div className="mt-3 space-y-2 text-sm text-textSecondary">
          <p>
            <span className="font-semibold text-textPrimary">Hijriah:</span>{" "}
            {renderHijriSchedule(item)}
          </p>
          <p>
            <span className="font-semibold text-textPrimary">Masehi:</span>{" "}
            {renderCeSchedule(item)}
          </p>
          {item.note ? <p className="text-xs">{item.note}</p> : null}
          {item.intention ? (
            <p className="text-xs text-textSecondary">{item.intention}</p>
          ) : null}
        </div>

        {schedule.type === "weekly"
          ? renderWeeklyList(seninKamisDates, item.category)
          : null}
        {schedule.type === "alternate"
          ? renderWeeklyList(daudDates, item.category)
          : null}
      </Card>
    );
  };

  const allItems = [...wajibItems, ...sunnahItems];
  const categoryCounts = allItems.reduce(
    (acc, item) => {
      acc[item.category] += 1;
      return acc;
    },
    { Wajib: 0, Sunnah: 0 } as Record<FastingItem["category"], number>,
  );
  const filteredItems =
    categoryFilter === "Semua"
      ? allItems
      : allItems.filter((item) => item.category === categoryFilter);

  return (
    <div className="py-10">
      <Container>
        <SectionHeader
          title="Puasa"
          subtitle="Daftar puasa wajib & sunnah lengkap dengan tanggal Masehi dan Hijriah."
        />

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
          <Card>
            <h3 className="text-sm font-semibold text-textPrimary">
              Pengaturan Kalender
            </h3>
            <p className="mt-2 text-xs text-textSecondary">
              Tanggal mengikuti metode kalender yang dipilih.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-textSecondary">
                Metode
                <select
                  value={method}
                  onChange={(event) => setMethod(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-emerald-100 px-3 py-2 text-sm"
                >
                  {methods.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-textSecondary">
                Penyesuaian (hari)
                <input
                  value={adjustment}
                  onChange={(event) => setAdjustment(event.target.value)}
                  type="number"
                  className="mt-1 w-full rounded-lg border border-emerald-100 px-3 py-2 text-sm"
                />
              </label>
            </div>

            <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-textSecondary">
              {loading ? <LoadingState message="Mengambil tanggal..." /> : null}
              {error ? <ErrorState message={error} /> : null}
              {today ? (
                <div className="space-y-2">
                  <p>
                    <span className="font-semibold text-textPrimary">CE:</span>{" "}
                    {today.ce.today}
                  </p>
                  <p>
                    <span className="font-semibold text-textPrimary">
                      Hijriah:
                    </span>{" "}
                    {today.hijr.today}
                  </p>
                  <p className="text-xs">Metode: {today.method}</p>
                </div>
              ) : null}
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-textPrimary">Catatan</h3>
            <div className="mt-3 space-y-2 text-sm text-textSecondary">
              <p>
                Tanggal puasa bisa berbeda tergantung metode kalender dan
                penetapan resmi setempat.
              </p>
              <p>
                Daftar ini membantu perencanaan; pastikan konfirmasi dengan
                sumber lokal.
              </p>
            </div>
          </Card>
        </div>

        <div className="mt-6">
          <h3 className="text-sm font-semibold text-textPrimary">
            Daftar Puasa
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-textSecondary">
            <span>Kategori:</span>
            <span
              className={`inline-flex items-center rounded-full border px-3 py-2 text-[11px] font-semibold ${categoryBadgeStyles.Wajib}`}
            >
              Wajib
            </span>
            <span
              className={`inline-flex items-center rounded-full border px-3 py-2 text-[11px] font-semibold ${categoryBadgeStyles.Sunnah}`}
            >
              Sunnah
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {filterOptions.map((option) => {
              const isActive = categoryFilter === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleFilterChange(option)}
                  className={`${filterBaseStyles} ${
                    isActive
                      ? filterStyles[option].active
                      : filterStyles[option].idle
                  }`}
                >
                  {option}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-textSecondary">
            Menampilkan {filteredItems.length} dari {allItems.length} puasa.
          </p>
          {filteredItems.length === 0 ? (
            <Card className="mt-4 border border-amber-100 bg-amber-50">
              <p className="text-sm font-semibold text-amber-800">
                Tidak ada puasa ditemukan
              </p>
              <p className="mt-1 text-xs text-amber-800">
                Coba pilih kategori lain untuk melihat daftar puasa.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleFilterChange("Semua")}
                  className={`${filterBaseStyles} ${filterStyles.Semua.active}`}
                >
                  Reset ke Semua
                </button>
                {(["Wajib", "Sunnah"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => handleFilterChange(option)}
                    disabled={categoryCounts[option] === 0}
                    className={`${filterBaseStyles} ${filterStyles[option].idle}`}
                  >
                    {option} ({categoryCounts[option]})
                  </button>
                ))}
              </div>
            </Card>
          ) : (
            <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_1fr]">
              <div className="space-y-4">
                {filteredItems
                  .filter((_, index) => index % 2 === 0)
                  .map(renderItemCard)}
              </div>
              <div className="space-y-4">
                {filteredItems
                  .filter((_, index) => index % 2 === 1)
                  .map(renderItemCard)}
              </div>
            </div>
          )}
        </div>
      </Container>
    </div>
  );
};

export default PuasaPage;
