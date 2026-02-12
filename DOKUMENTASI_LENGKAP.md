# Dokumentasi Lengkap MuslimKit

Dokumen ini merangkum fitur, arsitektur, konfigurasi, API, PWA, pengujian, dan operasional aplikasi MuslimKit berdasarkan kode terbaru di repository ini.

## 1. Ringkasan Aplikasi

MuslimKit adalah toolkit Muslim harian berbasis web yang mencakup:

- Jadwal sholat, lokasi, qiblat, dan pengingat adzan.
- Al-Quran (daftar surah, detail ayat, pencarian, navigasi juz/page/manzil/ruku/hizb).
- Murratal Al-Quran (playlist surah/juz + player global).
- Hadis (metadata, eksplorasi, pencarian, random, next/prev, jump ID).
- Doa harian (kategori, pencarian, detail, random, audio dasar).
- Puasa (wajib/sunnah + konversi Hijriah-Masehi).
- Haji (ringkasan manasik, rukun/wajib/larangan + kalender Dzulhijjah).
- Al Matsurat Kubro (baca/dengar penuh, tracking progres, kalibrasi segmen audio).
- Zakat (maal dan fitrah).
- Waris (simulasi faraidh ringkas + visualisasi hasil).
- PWA dasar (installable, service worker, runtime cache, offline fallback).
- Tema terang/gelap.

## 2. Arsitektur Sistem

Repository berisi 3 service utama:

- `web`: frontend React + Vite + Tailwind.
- `apimuslim-proxy`: API proxy Hono (Bun) untuk agregasi sumber data.
- `api`: service CRUD users terpisah (opsional, tidak wajib untuk fitur utama MuslimKit).

Alur utama:

1. Frontend memanggil `/api/*`.
2. Vite proxy meneruskan ke `apimuslim-proxy` (default `http://localhost:3002`).
3. Proxy meneruskan atau menggabungkan data dari upstream:
   - MyQuran.
   - EQuran (Doa Harian).
   - Quran.com (audio/juz/partition).
   - AlQuran.cloud (partition alternatif).
   - Muslim API (Asbabun Nuzul).

Catatan penting:

- Default port proxy di kode adalah `3002` (`apimuslim-proxy/src/index.ts` dan `web/vite.config.ts`).
- Jika ingin pakai port lain, override env `PORT` pada proxy atau `VITE_API_BASE_URL` di frontend.

## 3. Stack Teknologi

- Runtime backend: Bun.
- Backend framework: Hono.
- Database users API: SQLite (`bun:sqlite`).
- Frontend: React 18 + React Router.
- Styling: Tailwind + CSS custom tokens/theme.
- Build tool: Vite.
- PWA: `vite-plugin-pwa` (Workbox).
- Testing:
  - Unit/integration: Bun test (api/proxy), Vitest (web lib).
  - E2E visual + responsive: Playwright.
  - PWA checks: Playwright PWA config.

## 4. Struktur Direktori

```text
.
|- api/
|  |- src/ (index.ts, users.ts, db.ts, tests)
|  |- data.sqlite
|- apimuslim-proxy/
|  |- src/ (index.ts, tests)
|  |- apimuslim.json (OpenAPI)
|- web/
|  |- src/
|  |  |- pages/
|  |  |- components/
|  |  |- lib/
|  |  |- data/
|  |- tests/ (visual, offline, pwa)
|  |- scripts/ (dataset/util audit)
|  |- vite.config.ts
|- audit (orchestrator audit lintas service)
```

## 5. Peta Halaman dan Route

Route utama frontend (`web/src/App.tsx`):

- `/` Home.
- `/sholat` Waktu Sholat & Qiblat.
- `/quran` Al-Quran list + search + navigasi.
- `/quran/:surahId` Detail surah.
- `/quran/:surahId/:ayahId` Detail ayat.
- `/murratal` Murratal Quran.
- `/haji` Modul haji.
- `/puasa` Modul puasa.
- `/hadis` Modul hadis.
- `/doa` Doa harian.
- `/waris` Kalkulator waris.
- `/zakat` Kalkulator zakat.
- `/matsurat` Al Matsurat Kubro.
- `/disclaimer` Disclaimer.
- `*` fallback 404 (PlaceholderPage).

Legacy redirect:

- `/kalender` -> `/murratal`.

## 6. Detail Fitur per Modul

### 6.1 Home

- Hero section + kartu fitur utama.
- Tombol cepat ke Sholat/Quran.
- Tombol "Lihat Tanggal Hari Ini" menampilkan popover:
  - Tanggal Hijriyah.
  - Tanggal Masehi.
  - Jam perangkat realtime (update per detik).

### 6.2 Sholat & Qiblat

- Cari lokasi kab/kota via endpoint pencarian.
- Simpan lokasi terpilih ke localStorage.
- Jadwal mode:
  - Hari ini.
  - Mingguan.
  - Bulanan.
- Perhitungan arah kiblat:
  - Lokasi terpilih (geocode).
  - Geolocation perangkat.
  - Input koordinat manual.
- UI kompas qiblat (normal + dialog besar).
- Pengingat adzan:
  - Mode `silent`, `notify`, `sound`.
  - Notifikasi browser jika izin diberikan.
  - Audio adzan lokal (`/audio/adzan.mp3` atau `/audio/adzan.wav`).
  - Durasi suara dapat diatur.
  - Guard agar tidak trigger berulang untuk waktu sholat yang sama.

### 6.3 Quran

- Mode list:
  - Surah.
  - Juz (quick select 1-30).
- Filter/sort/cari surah.
- Pencarian ayat (minimal 3 karakter).
- Navigasi ayat berdasarkan:
  - Juz.
  - Page.
  - Manzil.
  - Ruku.
  - Hizb.
- Hasil navigasi mendukung pagination client-side (10/20/30/50 per halaman).
- Link cepat ke detail ayat.

### 6.4 Detail Surah

- Mushaf-style layout.
- Navigasi surah sebelumnya/berikutnya.
- Mendukung query rentang ayat `?start=x&end=y`.
- "Muat lebih banyak ayat" untuk paging.
- Integrasi Asbabun Nuzul per ayat (modal).

### 6.5 Detail Ayat

- Menampilkan teks arab, terjemah, tafsir singkat (jika ada).
- Asbabun Nuzul via panel + modal.

### 6.6 Murratal Quran

- Cari/filter/sort surah.
- Putar acak.
- Grup per juz (dengan range awal-akhir ayat).
- Aksi:
  - Putar Juz (audio Quran.com per ayat).
  - Buka Surah.
  - Play per item.
- Auto-append juz berikutnya ketika antrean hampir habis.
- Sidebar "Now Playing" dengan `GlobalAudioPlayer`.

### 6.7 Hadis

- Metadata ensiklopedia hadis.
- Daftar eksplorasi paginasi.
- Pencarian (minimal 4 karakter).
- Random hadis.
- Jump ke ID tertentu.
- Detail hadis + next/prev.

### 6.8 Doa Harian

- Daftar kategori.
- Daftar doa per kategori.
- Pencarian doa (minimal 3 karakter).
- Filter tag.
- Filter hanya yang punya audio.
- Detail doa + audio player.
- Random doa.

### 6.9 Puasa

- Daftar puasa wajib dan sunnah.
- Konversi tanggal Hijriah <-> Masehi menggunakan API kalender.
- Filter kategori (`Semua`, `Wajib`, `Sunnah`) disinkronkan ke query param URL.
- Menampilkan daftar tanggal mingguan untuk pola Senin-Kamis dan Daud.

### 6.10 Haji

- Ringkasan rukun, wajib, larangan ihram, jenis haji.
- Kalender Dzulhijjah (8-13) dengan mapping Hijriah ke Masehi.
- Manasik ringkas per hari.
- Pilihan metode kalender dan adjustment hari.

### 6.11 Al Matsurat Kubro

- Filter pagi/sore/semua.
- Mode:
  - Baca.
  - Dengar penuh.
- Sumber audio:
  - Kubro Pagi.
  - Kubro Petang.
- Progress harian dengan reset.
- Detail dzikir + numbering ayat inline (jika match surah tersedia).
- Segment mapping untuk audio per item.
- Mode kalibrasi segmen via query:
  - `/matsurat?matsuratCalibrate=1`
- Segment override tersimpan di localStorage.

### 6.12 Zakat

- Kalkulator zakat maal:
  - Harta, hutang, harga emas.
  - Nisab 85 gram emas.
- Kalkulator zakat fitrah:
  - Jumlah orang.
  - Harga beras.
  - Takaran kg per orang.

### 6.13 Waris

- Input total harta, hutang, biaya pemakaman, wasiat.
- Input ahli waris dinamis + validasi batas tertentu.
- Template kasus cepat.
- Hasil:
  - Besaran bagian.
  - Nilai per orang.
  - Catatan awl/radd/blocking/sisa.
- Visualisasi pie + bar.
- Ekspor JSON hasil simulasi.
- Engine waris disederhanakan (bukan fatwa final).

## 7. API dan Sumber Data

### 7.1 Frontend API client (`web/src/lib/api.ts`)

- Base default: `VITE_API_BASE_URL` atau `/api`.
- Timeout default: 12000 ms.
- Retry default: 2 percobaan.
- In-memory + localStorage cache (`ibadahmu:cache:*`).
- API status tracking:
  - `unknown`, `ok`, `fallback`.
- Source tracking:
  - `proxy`, `myquran`, `equran`.

Fallback penting:

- Jika proxy `/api` bermasalah, endpoint berikut bisa fallback ke MyQuran langsung:
  - Prefix `/sholat`, `/hadis`, `/cal`.
- Endpoint `/doa/harian*` punya fallback langsung ke EQuran.
- Endpoint non-fallback akan mengembalikan pesan bahwa fitur butuh proxy.

### 7.2 Proxy API (`apimuslim-proxy`)

Endpoint utama:

- `GET /` status proxy.
- `GET /openapi.json`.
- `GET /docs` Swagger UI.

Doa:

- `GET /api/doa/harian`.
- `GET /api/doa/harian/kategori/:id`.
- `POST /api/doa/harian/cari`.
- `GET /api/doa/harian/random`.
- `GET /api/doa/harian/:id`.

Quran partition:

- `GET /api/quran/{juz|page|manzil|ruku|hizb}/:number?source=alquran|myquran|qurancom`.

Audio:

- `GET /api/audio?url=...` (proxy stream + host allow-list).
- `GET /api/quran/juz/:number/audio`.
- `GET /api/quran/audio/*`.

Pass-through:

- `/api/*` -> MyQuran `/v3`.
- `/api/muslim/*` -> Muslim API.

Prefix kompatibilitas:

- Prefix aktif default: `/api` dan `/v3`.

### 7.3 Users API (`api`)

Base path: `/api`.

- `GET /api/` health.
- `GET /api/users`.
- `GET /api/users/:id`.
- `POST /api/users`.
- `PUT /api/users/:id`.
- `PATCH /api/users/:id`.
- `DELETE /api/users/:id`.

## 8. PWA

Konfigurasi PWA di `web/vite.config.ts`:

- Manifest:
  - `name`/`short_name`: MuslimKit.
  - `display`: standalone.
  - `start_url`: `/`.
  - `theme_color`: `#2e7d32`.
- Runtime cache:
  - `/api` -> `StaleWhileRevalidate`.
  - Google Fonts -> `StaleWhileRevalidate`.
- `navigateFallback`: `/index.html`.

Registrasi SW:

- Dilakukan di production (`web/src/main.tsx`) via `registerSW({ immediate: true })`.

Uji PWA (`web/tests/pwa.spec.ts`):

- Validasi metadata manifest + icon.
- Validasi SW terpasang dan mengontrol halaman.
- Validasi offline navigation fallback.

## 9. Responsif dan Tema

### 9.1 Responsif

- Shell layout desktop + tablet + mobile.
- Mobile bottom nav fixed dengan safe area.
- Sheet menu "Lainnya" dengan focus trap.
- Uji overflow horizontal lintas route:
  - `web/tests/visual.spec.ts` test `no-horizontal-overflow-core-routes`.

### 9.2 Dark/Light Mode

- Theme mode: `light` / `dark`.
- Persistensi: `ibadahmu:theme-mode`.
- Diterapkan dengan attribute `data-theme` di root html.
- CSS override dark mode di `web/src/index.css`:
  - Surface/background.
  - Border/text contrast.
  - Form control.
  - Pattern, mushaf shell, skeleton, dll.

## 10. Preload, Cache, dan Offline UX

- Prefetch harian saat idle (`web/src/App.tsx`):
  - List Quran.
  - Kategori doa.
  - Metadata hadis + halaman awal.
  - Jadwal sholat (jika lokasi tersimpan).
- Stamp prefetch per hari: `ibadahmu:prefetch:v1:date`.
- Banner offline tampil saat `navigator.onLine === false`.
- Banner status API tampil saat fallback/recovery proxy.

## 11. Global Audio System

Global audio context (`web/src/lib/audio.tsx`) + player (`web/src/components/GlobalAudioPlayer.tsx`) mendukung:

- Queue, next/prev, jump track.
- Shuffle + repeat (`off|one|all`).
- Playback rate.
- Resume posisi track.
- Sleep timer.
- Autoplay preference.
- History track + last track per module.
- Segment playback (start/end time) untuk Matsurat.
- Equalizer 10 band + preset + auto EQ + limiter.

## 12. LocalStorage Keys Utama

- Prefetch/app:
  - `ibadahmu:prefetch:v1:date`
  - `ibadahmu:location`
- Sholat:
  - `ibadahmu:adzan-settings`
  - `ibadahmu:adzan-last-fired`
- Cache API:
  - `ibadahmu:cache:*`
- Muslim API:
  - `ibadahmu:muslim:*`
- Tema:
  - `ibadahmu:theme-mode`
- Audio:
  - `ibadahmu:audio:queue`
  - `ibadahmu:audio:index`
  - `ibadahmu:audio:shuffle`
  - `ibadahmu:audio:rate`
  - `ibadahmu:audio:repeat`
  - `ibadahmu:audio:history`
  - `ibadahmu:audio:last-module`
  - `ibadahmu:audio:position`
  - `ibadahmu:audio:sleep`
  - `ibadahmu:audio:autoplay`
- Matsurat:
  - `ibadahmu:matsurat-progress`
  - `ibadahmu:matsurat-segment-overrides-v3`

## 13. Konfigurasi Environment

### 13.1 Web

- `VITE_API_BASE_URL` (default `/api`).
- `VITE_API_TIMEOUT_MS` (default `12000`).
- `VITE_API_MAX_ATTEMPTS` (default `2`).
- `VITE_MUSLIM_API_BASE_URL` (default `/api/muslim`).

### 13.2 Proxy (`apimuslim-proxy`)

Core:

- `PORT` (default `3002`).
- `TARGET_ORIGIN` (default `https://api.myquran.com`).
- `PROXY_PREFIX` (default `/api`).
- `ALT_PREFIX` (default `/v3` saat primary `/api`).
- `UPSTREAM_PREFIX` (default `/v3`).
- `PUBLIC_BASE_URL` (opsional untuk `openapi.json` servers).

Doa:

- `DOA_ORIGIN` (default `https://equran.id`).
- `DOA_BASE` (default `/api/doa`).
- `DOA_TTL` (default `3600` detik).
- `MAX_DOA_KEYWORD_LENGTH` (default `100`).

Quran/audio:

- `ALQURAN_ORIGIN`, `ALQURAN_BASE`, `ALQURAN_AR_EDITION`, `ALQURAN_ID_EDITION`.
- `QURANCOM_ORIGIN`, `QURANCOM_TRANSLATION_ID`, `QURANCOM_AUDIO_RECITER`.
- `QURAN_AUDIO_ORIGIN`.
- `AUDIO_ALLOWED_HOSTS`.
- `QURANCOM_PER_PAGE`, `MYQURAN_LIMIT`, `MAX_PROXY_PAGES`.

Timeout/upstream:

- `UPSTREAM_TIMEOUT_MS` (default `15000`).

Muslim API:

- `MUSLIM_ORIGIN`.
- `MUSLIM_PREFIX` (default `/v1`).

### 13.3 Users API (`api`)

- `PORT` (default `4001`).

## 14. Cara Menjalankan Lokal

Prasyarat:

- Bun terpasang.
- Node.js + npm terpasang (untuk frontend).

Langkah cepat:

1. Jalankan proxy:

```bash
cd apimuslim-proxy
bun install
bun run dev
```

2. Jalankan web:

```bash
cd web
npm install
npm run dev
```

3. Buka:

```text
http://localhost:5173
```

Opsional users API:

```bash
cd api
bun install
bun run dev
```

## 15. Pengujian dan Audit

Audit penuh lintas service:

```bash
./audit
```

Isi audit:

- API users: typecheck + test.
- API proxy: typecheck + test.
- Web: unit test, typecheck, build, visual test, PWA test.

Testing terpisah:

```bash
cd web
npm run test
npm run test:visual
npm run test:pwa
```

## 16. CI/CD

Workflow GitHub Actions: `.github/workflows/web-ci.yml`

- Install dependencies.
- Install Playwright Chromium.
- Jalankan `./audit`.

Deploy Cloudflare Pages (frontend):

```bash
cd web
export CF_PAGES_PROJECT="nama-project"
npm run deploy:cloudflare
```

## 17. Script Data dan Utility

Di `web/scripts/`:

- `generate-matsurat-surah-ayahs.mjs`:
  - Generate mapping ayat Matsurat dari proxy Quran.
- `audit-quran-partitions.mjs`:
  - Audit konsistensi partition Quran app vs referensi.
- `download-qurancom-verses.mjs`:
  - Unduh metadata verse Quran.com ke file lokal.

## 18. Keamanan dan Guardrail

- Proxy audio membatasi host melalui allow-list.
- URL audio dengan kredensial ditolak.
- Input invalid ditangani dengan response 400/403/404 sesuai konteks.
- Timeout upstream diproteksi.
- CORS di proxy diset eksplisit.
- Endpoint doa/search punya limit panjang keyword.

## 19. Batasan yang Perlu Diketahui

- Kalkulator waris menyederhanakan sebagian aturan faraidh.
- Jadwal/kalender dapat berbeda dari penetapan resmi lokal.
- Notifikasi web bergantung izin browser + halaman aktif.
- Beberapa fitur advanced tetap membutuhkan proxy aktif (tidak fallback langsung).

## 20. Referensi File Kunci

- Frontend app routes: `web/src/App.tsx`
- API client + fallback: `web/src/lib/api.ts`
- Muslim API client: `web/src/lib/muslimApi.ts`
- Theme system: `web/src/lib/theme.ts`
- Global audio context: `web/src/lib/audio.tsx`
- Global audio player: `web/src/components/GlobalAudioPlayer.tsx`
- PWA config: `web/vite.config.ts`
- Visual tests: `web/tests/visual.spec.ts`
- PWA tests: `web/tests/pwa.spec.ts`
- Proxy server: `apimuslim-proxy/src/index.ts`
- Users API: `api/src/index.ts`, `api/src/users.ts`
- Full audit script: `audit`

