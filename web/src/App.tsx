import { Route, Routes } from "react-router-dom";
import Header from "./components/Header";
import MobileNav from "./components/MobileNav";
import Footer from "./components/Footer";
import OfflineBanner from "./components/OfflineBanner";
import ApiStatusBanner from "./components/ApiStatusBanner";
import HomePage from "./pages/HomePage";
import SholatPage from "./pages/SholatPage";
import KalenderPage from "./pages/KalenderPage";
import QuranPage from "./pages/QuranPage";
import SurahDetailPage from "./pages/SurahDetailPage";
import AyahDetailPage from "./pages/AyahDetailPage";
import PlaceholderPage from "./pages/PlaceholderPage";
import HadisPage from "./pages/HadisPage";
import DoaPage from "./pages/DoaPage";
import GlobalAudioPlayer from "./components/GlobalAudioPlayer";
import DisclaimerPage from "./pages/DisclaimerPage";
import ZakatPage from "./pages/ZakatPage";
import MatsuratPage from "./pages/MatsuratPage";
import WarisPage from "./pages/WarisPage";
import MurratalPage from "./pages/MurratalPage";
import PuasaPage from "./pages/PuasaPage";
import HajiPage from "./pages/HajiPage";

const App = () => {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <OfflineBanner />
      <ApiStatusBanner />
      <main className="content-shell flex-1 pb-24 lg:pb-12">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/sholat" element={<SholatPage />} />
          <Route path="/kalender" element={<KalenderPage />} />
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
      <GlobalAudioPlayer />
      <MobileNav />
    </div>
  );
};

export default App;
