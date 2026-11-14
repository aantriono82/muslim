# MuslimKit Web

Frontend MuslimKit berbasis React + Vite + Tailwind + PWA.

## Menjalankan Lokal

1. Pastikan API proxy aktif di `http://localhost:3002`.
2. Jalankan web:

```bash
cd web
npm install
npm run dev
```

Buka:
- `http://localhost:5173`

Alternatif dengan Bun (lockfile Bun tidak di-commit, lihat catatan deploy):

```bash
bun install
bun run dev
```

## Script Penting

- `npm run dev`
- `npm run build`
- `npm run preview`
- `npm run test` (Vitest)
- `npm run audit:mushaf-pages` (audit jumlah ayat kartu mushaf vs kartu penjelasan)
- `npm run test:visual` (Playwright visual)
- `npm run test:pwa` (Playwright PWA)
- `npm run test:visual:update` (update snapshot visual)

## Konfigurasi Environment

- `VITE_API_BASE_URL` (default `/api`)
- `VITE_API_TIMEOUT_MS` (default `12000`)
- `VITE_API_MAX_ATTEMPTS` (default `2`)
- `VITE_MUSLIM_API_BASE_URL` (default `/api/muslim`)

## Deploy ke Cloudflare Pages

Konfigurasi yang dipakai agar build stabil:

- Root directory: `web`
- Build command: `npm run build`
- Build output directory: `dist`
- Production branch: `main`
- Environment variable (opsional, jika ingin pakai install manual):
  - `SKIP_DEPENDENCY_INSTALL=1`
  - Build command jadi: `npm ci && npm run build`

Catatan:

- `web` hanya memakai `package-lock.json` (npm). File `bun.lock`/`bun.lockb`
  sengaja di-ignore, karena jika ada, Cloudflare bisa memilih
  `bun install --frozen-lockfile` dan gagal pada image Bun lama. Setelah
  menambah dependency, selalu jalankan `npm install` agar `package-lock.json`
  ikut terbarui.

```bash
cd web
export CF_PAGES_PROJECT="nama-project-pages"
npm run deploy:cloudflare
```

## Referensi

Lihat dokumentasi menyeluruh di:
- [`../DOKUMENTASI_LENGKAP.md`](../DOKUMENTASI_LENGKAP.md)
