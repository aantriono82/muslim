import { useEffect, useMemo, useState } from "react";
import { Flag, MapPin, MoonStar, Sun, Sunrise, Waypoints } from "lucide-react";
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

const hajiDates = [
  {
    id: "tarwiyah",
    day: 8,
    label: "8 Dzulhijjah (Tarwiyah)",
    note: "Persiapan menuju Mina.",
  },
  {
    id: "arafah",
    day: 9,
    label: "9 Dzulhijjah (Arafah)",
    note: "Wukuf di Arafah.",
  },
  {
    id: "nahr",
    day: 10,
    label: "10 Dzulhijjah (Nahr/Idul Adha)",
    note: "Lempar jumrah Aqabah, kurban, tahallul awal.",
  },
  {
    id: "tasyriq-1",
    day: 11,
    label: "11 Dzulhijjah (Tasyriq 1)",
    note: "Lempar tiga jumrah.",
  },
  {
    id: "tasyriq-2",
    day: 12,
    label: "12 Dzulhijjah (Tasyriq 2)",
    note: "Lempar tiga jumrah.",
  },
  {
    id: "tasyriq-3",
    day: 13,
    label: "13 Dzulhijjah (Tasyriq 3)",
    note: "Lempar tiga jumrah.",
  },
];

const rukunList = [
  "Ihram (niat haji dari miqat).",
  "Wukuf di Arafah.",
  "Tawaf Ifadah.",
  "Sa'i antara Shafa dan Marwah.",
  "Tahallul.",
  "Tertib.",
];

const wajibList = [
  "Ihram dari miqat.",
  "Mabit di Muzdalifah.",
  "Mabit di Mina pada hari Tasyriq.",
  "Melempar jumrah.",
  "Tawaf Wada' (bagi yang akan meninggalkan Makkah).",
  "Menjauhi larangan ihram.",
];

const laranganList = [
  "Memotong rambut atau kuku (saat ihram).",
  "Memakai wewangian.",
  "Bersetubuh atau pendahuluannya.",
  "Berburu atau membunuh hewan buruan.",
  "Bagi laki-laki: menutup kepala & memakai pakaian berjahit.",
  "Bagi perempuan: menutup wajah (niqab) atau memakai sarung tangan.",
];

const jenisList = [
  {
    title: "Ifrad",
    desc: "Haji saja, tanpa umrah.",
  },
  {
    title: "Qiran",
    desc: "Haji dan umrah sekaligus dalam satu ihram.",
  },
  {
    title: "Tamattu",
    desc: "Umrah dulu, tahallul, lalu haji pada musim haji.",
  },
];

const manasikSteps = [
  {
    day: "8 Dzulhijjah",
    title: "Tarwiyah",
    detail:
      "Ihram (bagi yang belum), berangkat ke Mina, perbanyak dzikir dan persiapan.",
    icon: Sunrise,
  },
  {
    day: "9 Dzulhijjah",
    title: "Arafah",
    detail: "Wukuf di Arafah hingga terbenam matahari.",
    icon: Sun,
  },
  {
    day: "Malam 10 Dzulhijjah",
    title: "Muzdalifah",
    detail: "Mabit di Muzdalifah, kumpulkan kerikil jumrah.",
    icon: MoonStar,
  },
  {
    day: "10 Dzulhijjah",
    title: "Nahr",
    detail: "Lempar jumrah Aqabah, kurban, tahallul awal, tawaf ifadah.",
    icon: Waypoints,
  },
  {
    day: "11–13 Dzulhijjah",
    title: "Tasyriq",
    detail: "Mabit di Mina dan lempar tiga jumrah setiap hari.",
    icon: MapPin,
  },
  {
    day: "Sebelum pulang",
    title: "Wada'",
    detail: "Tawaf Wada' bagi yang meninggalkan Makkah.",
    icon: Flag,
  },
];

const pad = (value: number) => String(value).padStart(2, "0");

const buildHijriDate = (year: number, month: number, day: number) =>
  `${year}-${pad(month)}-${pad(day)}`;

const HajiPage = () => {
  const [today, setToday] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState("standar");
  const [adjustment, setAdjustment] = useState("0");
  const [hijriToCe, setHijriToCe] = useState<
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
      key: `haji-today-${method}-${adjustment}`,
      staleIfError: true,
    })
      .then((res) => setToday(res.data ?? null))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [adjustment, method, todayPath]);

  const hijriYear = today?.hijr.year ?? null;

  useEffect(() => {
    if (!hijriYear) return;
    let active = true;
    hajiDates.forEach((date) => {
      const hijriDate = buildHijriDate(hijriYear, 12, date.day);
      const cacheKey = `${hijriDate}|${method}|${adjustment}`;
      if (hijriToCe[cacheKey] !== undefined) return;
      fetchJsonCached<CalendarData>(`/cal/ce/${hijriDate}?${query}`, {
        ttl: 12 * 60 * 60,
        key: `haji-hijr-${cacheKey}`,
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
  }, [adjustment, hijriYear, hijriToCe, method, query]);

  const resolveCe = (date: string) =>
    hijriToCe[`${date}|${method}|${adjustment}`];

  return (
    <div className="py-10">
      <Container>
        <SectionHeader
          title="Haji"
          subtitle="Ringkasan manasik, rukun, wajib, dan kalender Dzulhijjah."
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
            <h3 className="text-sm font-semibold text-textPrimary">
              Kalender Dzulhijjah
            </h3>
            <p className="mt-2 text-xs text-textSecondary">
              Jadwal inti Dzulhijjah untuk manasik haji.
            </p>
            <div className="mt-4 space-y-3 text-sm text-textSecondary">
              {hajiDates.map((item) => {
                const hijriDate = hijriYear
                  ? buildHijriDate(hijriYear, 12, item.day)
                  : "";
                const ceInfo = hijriDate ? resolveCe(hijriDate) : null;
                return (
                  <div
                    key={item.id}
                    className="rounded-xl border border-emerald-100 px-4 py-3"
                  >
                    <p className="font-semibold text-textPrimary">
                      {item.label}
                    </p>
                    <p className="mt-1 text-xs text-textSecondary">
                      {item.note}
                    </p>
                    <p className="mt-2 text-xs">
                      <span className="font-semibold text-textPrimary">
                        Hijriah:
                      </span>{" "}
                      {hijriYear
                        ? `${item.day} ${hijriMonths[11]} ${hijriYear} H`
                        : "Memuat..."}
                    </p>
                    <p className="text-xs">
                      <span className="font-semibold text-textPrimary">
                        Masehi:
                      </span>{" "}
                      {ceInfo === null
                        ? "Tidak tersedia"
                        : ceInfo
                          ? ceInfo.today
                          : "Memuat..."}
                    </p>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
          <Card>
            <h3 className="text-sm font-semibold text-textPrimary">
              Rukun Haji
            </h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-textSecondary">
              {rukunList.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Card>
          <Card>
            <h3 className="text-sm font-semibold text-textPrimary">
              Wajib Haji
            </h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-textSecondary">
              {wajibList.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
          <Card>
            <h3 className="text-sm font-semibold text-textPrimary">
              Larangan Ihram
            </h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-textSecondary">
              {laranganList.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Card>
          <Card>
            <h3 className="text-sm font-semibold text-textPrimary">
              Jenis Haji
            </h3>
            <div className="mt-3 space-y-3 text-sm text-textSecondary">
              {jenisList.map((item) => (
                <div key={item.title}>
                  <p className="font-semibold text-textPrimary">{item.title}</p>
                  <p className="mt-1">{item.desc}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="mt-6">
          <Card>
            <h3 className="text-sm font-semibold text-textPrimary">
              Referensi
            </h3>
            <p className="mt-2 text-sm text-textSecondary">
              Ringkasan ini merujuk pada panduan resmi Kementerian Agama RI dan
              fatwa/ketetapan Majelis Ulama Indonesia. Pastikan mengikuti arahan
              pembimbing/manasik setempat.
            </p>
          </Card>
        </div>

        <div className="mt-6">
          <Card>
            <h3 className="text-sm font-semibold text-textPrimary">
              Manasik Ringkas per Hari
            </h3>
            <div className="mt-3 space-y-3 text-sm text-textSecondary">
              {manasikSteps.map((step) => {
                const Icon = step.icon;
                return (
                  <div
                    key={step.day}
                    className="flex items-start gap-3 rounded-xl border border-emerald-100 px-4 py-3"
                  >
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs text-emerald-700">{step.day}</p>
                      <p className="mt-1 font-semibold text-textPrimary">
                        {step.title}
                      </p>
                      <p className="mt-1">{step.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </Container>
    </div>
  );
};

export default HajiPage;
