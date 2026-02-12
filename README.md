# MuslimKit

Repository ini berisi aplikasi MuslimKit dengan frontend web dan API proxy ke MyQuran.

## Preview

Lihat Full Tampilan di sini: [https://muslimkit.aantriono.com/](https://muslimkit.aantriono.com/)

### Desktop View

| Mode Terang | Mode Gelap |
| --- | --- |
| ![Preview MuslimKit desktop light](docs/preview/home-desktop-light.png) | ![Preview MuslimKit desktop dark](docs/preview/home-desktop-dark.png) |

### Mobile View

| Mode Terang | Mode Gelap |
| --- | --- |
| ![Preview MuslimKit mobile light](docs/preview/home-mobile-light.png) | ![Preview MuslimKit mobile dark](docs/preview/home-mobile-dark.png) |

## Prasyarat

- Bun terpasang
- Node.js + npm terpasang

## Menjalankan MuslimKit

Jalankan dua service berikut di terminal terpisah.

1. Jalankan API proxy (`apimuslim-proxy`) di port `3000`:

```bash
cd /home/aantriono/Code/muslim/apimuslim-proxy
bun install
bun run dev
```

2. Jalankan frontend (`web`) di port `5173`:

```bash
cd /home/aantriono/Code/muslim/web
npm install
npm run dev
```

3. Buka aplikasi di browser:

```txt
http://localhost:5173
```

## Catatan

- Frontend menggunakan proxy `/api` ke `http://localhost:3000`.
- Folder `api` adalah service CRUD user terpisah dan tidak wajib untuk menjalankan MuslimKit utama.
- Service `api` (users) berjalan di port `4001` secara default untuk menghindari konflik dengan proxy.

## Audit Menyeluruh

Untuk menjalankan audit penuh lintas service (API, proxy, dan web termasuk visual test):

```bash
./audit
```

Command ini juga dipakai oleh GitHub Actions pada workflow `Audit CI` untuk setiap Pull Request.
