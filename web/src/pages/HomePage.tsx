import {
  type CSSProperties,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import {
  BookHeart,
  BookOpen,
  CalendarDays,
  Headphones,
  Heart,
  MapPin,
  MoonStar,
  ScrollText,
  Sparkles,
  Timer,
} from "lucide-react";
import Container from "../components/Container";
import Badge from "../components/Badge";
import { Card } from "../components/State";

const features = [
  {
    title: "Waktu Sholat & Qiblat",
    desc: "Temukan jadwal sholat harian dan simpan lokasi favorit.",
    icon: Timer,
    path: "/sholat",
  },
  {
    title: "Al-Qur'an & Audio",
    desc: "Daftar surah, ayat, terjemah, hingga audio per ayat.",
    icon: BookOpen,
    path: "/quran",
  },
  {
    title: "Murratal Al-Qur'an",
    desc: "Dengarkan murattal ayat Al-Qur'an dengan pemutar yang nyaman.",
    icon: Headphones,
    path: "/murratal",
  },
  {
    title: "Haji",
    desc: "Rukun, wajib, larangan, dan kalender Dzulhijjah.",
    icon: MapPin,
    path: "/haji",
  },
  {
    title: "Puasa",
    desc: "Daftar puasa wajib & sunnah dengan tanggal Masehi/Hijriah.",
    icon: MoonStar,
    path: "/puasa",
  },
  {
    title: "Hadis",
    desc: "Eksplorasi ensiklopedia hadis dan navigasi ayat terkait.",
    icon: ScrollText,
    path: "/hadis",
  },
  {
    title: "Doa Harian",
    desc: "Koleksi doa Hisnul Muslim dengan transliterasi.",
    icon: Heart,
    path: "/doa",
  },
  {
    title: "Al Matsurat",
    desc: "Dzikir pagi dan sore dengan progress tracking harian.",
    icon: BookHeart,
    path: "/matsurat",
  },
  {
    title: "Zakat & Waris",
    desc: "Kalkulator zakat maal/fitrah dan simulasi waris.",
    icon: Sparkles,
    path: "/zakat",
  },
];

const hijriDateTimeFormatter = new Intl.DateTimeFormat("id-ID-u-ca-islamic", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const gregorianDateTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const formatClock = (date: Date) => {
  const parts = timeFormatter.formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  const second = parts.find((part) => part.type === "second")?.value ?? "00";
  return `${hour}:${minute}:${second}`;
};

const HomePage = () => {
  const [now, setNow] = useState(() => new Date());
  const [showDateInfo, setShowDateInfo] = useState(false);
  const dateInfoId = useId();
  const dateInfoButtonRef = useRef<HTMLButtonElement | null>(null);
  const dateInfoPopoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, []);

  useEffect(() => {
    if (!showDateInfo) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (dateInfoPopoverRef.current?.contains(target)) return;
      if (dateInfoButtonRef.current?.contains(target)) return;
      setShowDateInfo(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowDateInfo(false);
        dateInfoButtonRef.current?.focus();
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("touchstart", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("touchstart", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [showDateInfo]);

  const hijriDateTimeText = useMemo(
    () => hijriDateTimeFormatter.format(now),
    [now],
  );

  const gregorianDateTimeText = useMemo(
    () => gregorianDateTimeFormatter.format(now),
    [now],
  );
  const currentTimeText = useMemo(() => formatClock(now), [now]);

  const renderFeatureCards = (items: typeof features) =>
    items.map((item, index) => {
      const Icon = item.icon;
      const style = { "--stagger-index": index + 1 } as CSSProperties;
      return (
        <Link
          key={item.title}
          to={item.path}
          style={style}
          className="stagger-item hover-float flex min-h-[124px] items-start gap-4 rounded-card border border-emerald-100 bg-white/90 p-4 shadow-card"
        >
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-textPrimary">
              {item.title}
            </h3>
            <p className="mt-1 min-h-[40px] text-sm leading-relaxed text-textSecondary">
              {item.desc}
            </p>
          </div>
        </Link>
      );
    });

  return (
    <div className="pattern pb-16 pt-10">
      <Container>
        <div className="grid gap-10">
          <div>
            <Badge>Platform Keislaman Terpadu</Badge>
            <h1 className="mt-4 text-3xl font-semibold text-textPrimary sm:text-4xl">
              Semua kebutuhan ibadah harian dalam satu aplikasi.
            </h1>
            <p className="mt-3 text-base text-textSecondary">
              MuslimKit hadir untuk membantu umat Muslim Indonesia menjalankan
              ibadah dengan lebih tenang, mulai dari jadwal sholat, Al-Qur'an,
              hingga kalkulator zakat.
            </p>
            <div className="mt-6 sm:relative">
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/sholat"
                  className="w-full rounded-full bg-emerald-600 px-5 py-2 text-center text-sm font-semibold text-white shadow sm:w-auto"
                >
                  Mulai dari Sholat
                </Link>
                <Link
                  to="/quran"
                  className="w-full rounded-full border border-emerald-200 px-5 py-2 text-center text-sm font-semibold text-emerald-700 sm:w-auto"
                >
                  Baca Al-Qur'an
                </Link>
                <button
                  ref={dateInfoButtonRef}
                  type="button"
                  onClick={() => setShowDateInfo((prev) => !prev)}
                  aria-expanded={showDateInfo}
                  aria-controls={dateInfoId}
                  aria-haspopup="dialog"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2 text-center text-sm font-semibold text-slate-700 sm:w-auto"
                >
                  <CalendarDays className="h-4 w-4" />
                  {showDateInfo
                    ? "Sembunyikan Tanggal"
                    : "Lihat Tanggal Hari Ini"}
                </button>
              </div>
              {showDateInfo ? (
                <div
                  ref={dateInfoPopoverRef}
                  id={dateInfoId}
                  role="dialog"
                  aria-label="Tanggal hari ini"
                  className="mt-2 w-full sm:absolute sm:left-0 sm:top-full sm:z-20 sm:max-w-[calc(100vw-2rem)] md:w-[560px]"
                >
                  <Card className="border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-sky-50 shadow-card">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-emerald-100 bg-white/80 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                          Tanggal Hijriyah
                        </p>
                        <p className="mt-2 whitespace-nowrap text-sm font-semibold text-emerald-900">
                          {hijriDateTimeText}
                        </p>
                      </div>
                      <div className="rounded-xl border border-sky-100 bg-white/80 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                          Tanggal Masehi
                        </p>
                        <p className="mt-2 whitespace-nowrap text-sm font-semibold text-sky-900">
                          {gregorianDateTimeText}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 rounded-xl border border-slate-200 bg-white/80 px-4 py-3">
                      <p className="text-center text-xs font-semibold uppercase tracking-wide text-slate-700">
                        Jam Perangkat
                      </p>
                      <p className="mt-2 text-center text-sm font-semibold leading-relaxed text-slate-900">
                        {currentTimeText}
                      </p>
                    </div>
                  </Card>
                </div>
              ) : null}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Fitur Utama
            </p>
            <div className="stagger-fade mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {renderFeatureCards(features)}
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
};

export default HomePage;
