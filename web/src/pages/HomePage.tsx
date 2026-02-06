import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen,
  CalendarDays,
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
    title: "Kalender Hijriah",
    desc: "Konversi cepat CE ↔ Hijriah sesuai metode pilihan.",
    icon: CalendarDays,
    path: "/kalender",
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
    icon: BookOpen,
    path: "/matsurat",
  },
  {
    title: "Zakat & Waris",
    desc: "Kalkulator zakat maal/fitrah dan simulasi waris.",
    icon: Sparkles,
    path: "/zakat",
  },
];

const HomePage = () => {
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
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
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
            </div>
            <div className="stagger-fade mt-8 grid gap-4 sm:grid-cols-2">
              <div
                className="stagger-item"
                style={{ "--stagger-index": 1 } as CSSProperties}
              >
                <Card className="hover-float border border-emerald-100">
                  <p className="text-xs font-semibold uppercase text-emerald-600">
                    Status API
                  </p>
                  <p className="mt-2 text-sm text-textSecondary">
                    Terhubung ke API MyQuran via proxy.
                  </p>
                </Card>
              </div>
              <div
                className="stagger-item"
                style={{ "--stagger-index": 2 } as CSSProperties}
              >
                <Card className="hover-float border border-emerald-100">
                  <p className="text-xs font-semibold uppercase text-emerald-600">
                    Lokasi Favorit
                  </p>
                  <p className="mt-2 text-sm text-textSecondary">
                    Simpan lokasi sholat agar cepat diakses.
                  </p>
                </Card>
              </div>
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
