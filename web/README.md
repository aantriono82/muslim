# Ibadahmu Web

Frontend web app responsif untuk layanan keislaman berbasis API MyQuran (via proxy).

## Fitur MVP (Phase 1)
- Waktu Sholat: pencarian lokasi, jadwal hari ini/minggu/bulan, simpan lokasi terakhir.
- Kalender Hijriah: info hari ini + konversi CE ↔ Hijriah.
- Al-Qur'an: daftar surah, detail surah + ayat, pencarian ayat, audio per ayat.
- Layout responsif (mobile & desktop) dengan navigasi utama.

## Fitur Phase 2
- Hadis: eksplorasi, detail, pencarian, random.
- Perawi: ringkasan data, browse, detail perawi.
- Doa Harian: kategori, pencarian, detail doa + audio basic (diproxy dari EQuran).
- Global audio player sederhana untuk memutar audio ayat/doa.
- Murratal Quran: daftar surah + antrian otomatis, shuffle, kontrol speed, sleep timer, dan info stream/download.
- Preferensi audio (shuffle, speed, repeat, sleep timer, autoplay terakhir) tersimpan otomatis, antrian dipulihkan, ada progress bar, riwayat per modul, dan resume posisi terakhir.

## Fitur Phase 3
- Zakat maal & fitrah calculator.
- Al Matsurat Kubro: list, detail, filter pagi/sore, progress tracking.
- Caching ringan untuk endpoint statis + banner offline.
- PWA basic (manifest + service worker runtime cache).

## Sumber Al Matsurat
Dataset Al Matsurat Kubro diambil dari teks publik Al Ma'tsurat Online, dan audio berasal dari arsip publik.
Referensi:
```txt
https://almatsurat.net/kubro/
https://archive.org/details/al-matsurat-kubro-shugro-pagi-dan-petang
```

Kalibrasi segmen audio manual (opsional):
```txt
/matsurat?matsuratCalibrate=1
```
Override tersimpan di localStorage key `ibadahmu:matsurat-segment-overrides`.

## Fitur Phase 4
- Waris calculator (faraidh ringkas) mencakup pasangan, orang tua, anak, kakek/nenek, dan saudara kandung.
- Template kasus cepat, visualisasi pie + bar, dan export JSON.

## Prasyarat
- Node.js 18+ atau Bun
- Proxy API berjalan (lihat `apimuslim-proxy`)

## Menjalankan
```bash
cd /home/aantriono/Code/muslim/web
npm install
npm run dev
```

Atau dengan Bun:
```bash
bun install
bun run dev
```

## Deploy Cloudflare Pages
Set nama project Pages di environment, lalu jalankan deploy dari folder `web`.
```bash
cd /home/aantriono/Code/muslim/web
export CF_PAGES_PROJECT="nama-project-pages"
npm run deploy:cloudflare
```

## Konfigurasi API
Secara default frontend akan memanggil:
```
/api
```
Jika ingin mengganti base URL, set env berikut:
```
VITE_API_BASE_URL=https://api.myquran.com/v3
```

## Struktur Folder
- `src/pages` halaman utama
- `src/components` komponen UI
- `src/lib` helper API, storage, dan util

## Catatan
Kalkulator waris ini menyederhanakan sebagian aturan faraidh. Gunakan sebagai simulasi awal dan lakukan verifikasi untuk kasus kompleks.
