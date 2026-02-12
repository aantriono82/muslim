# MuslimKit

Repository ini berisi aplikasi MuslimKit dengan frontend web dan API proxy ke MyQuran.

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
