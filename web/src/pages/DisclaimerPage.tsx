import { Link } from "react-router-dom";
import Container from "../components/Container";
import SectionHeader from "../components/SectionHeader";
import { Card } from "../components/State";

const DisclaimerPage = () => {
  return (
    <div className="py-10">
      <Container>
        <SectionHeader
          title="Disclaimer"
          subtitle="Informasi disajikan sebagai referensi dan tidak menggantikan rujukan resmi."
          action={
            <Link
              to="/"
              className="rounded-full border border-emerald-200 px-4 py-2 text-xs font-semibold text-emerald-700"
            >
              Kembali
            </Link>
          }
        />

        <div className="mt-6 space-y-4">
          <Card>
            <h3 className="text-sm font-semibold text-textPrimary">
              Ketepatan Informasi
            </h3>
            <p className="mt-2 text-sm text-textSecondary">
              Jadwal sholat, kalender hijriah, serta referensi ibadah lainnya
              dihitung berdasarkan metode yang dipilih dan data sumber yang
              tersedia. Hasil dapat berbeda dengan ketetapan resmi daerah
              setempat.
            </p>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-textPrimary">
              Kalkulator & Simulasi
            </h3>
            <p className="mt-2 text-sm text-textSecondary">
              Fitur kalkulator (zakat, waris, dan sejenisnya) bersifat estimasi.
              Keputusan akhir sebaiknya dikonsultasikan dengan ahli atau lembaga
              resmi.
            </p>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-textPrimary">
              Tanggung Jawab Pengguna
            </h3>
            <p className="mt-2 text-sm text-textSecondary">
              Pengguna bertanggung jawab memverifikasi informasi dengan sumber
              terpercaya dan mengikuti keputusan resmi pemerintah/ulama di
              wilayah masing-masing.
            </p>
            <p className="mt-3 text-sm text-textSecondary">
              Pengguna diimbau untuk memeriksa kembali doa-doa yang tercantum.
              Bacaan Al-Ma'tsurat yang disusun oleh Imam Hasan al-Banna sebagian
              besar bersumber dari ayat Al-Qur'an dan hadis-hadis sahih. Namun,
              tidak semua dalil dalam Al-Ma'tsurat berderajat sahih. Terdapat
              beberapa hadis yang dinilai lemah (daif), bahkan ada yang perlu
              diteliti lebih lanjut kesahihannya menurut pandangan sebagian
              ulama. Hal ini dikembalikan lagi kepada pengguna untuk
              pengamalannya.
            </p>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-textPrimary">
              Notifikasi & Audio
            </h3>
            <p className="mt-2 text-sm text-textSecondary">
              Notifikasi dan audio adzan bergantung pada izin perangkat serta
              kondisi browser. Di web, pengingat hanya aktif ketika halaman
              terbuka dan izin notifikasi diberikan.
            </p>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-textPrimary">
              Data Lokasi
            </h3>
            <p className="mt-2 text-sm text-textSecondary">
              Penggunaan lokasi dipakai untuk menentukan jadwal sholat dan arah
              kiblat. Jika izin lokasi tidak diberikan, pengguna dapat memilih
              lokasi secara manual.
            </p>
          </Card>
        </div>
      </Container>
    </div>
  );
};

export default DisclaimerPage;
