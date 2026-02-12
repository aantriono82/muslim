# MuslimKit Web

Frontend MuslimKit berbasis React + Vite + Tailwind + PWA.

## Menjalankan Lokal

1. Pastikan API proxy aktif di `http://localhost:3002`.
2. Jalankan web:

```bash
cd /home/aantriono/Code/muslim/web
npm install
npm run dev
```

Buka:
- `http://localhost:5173`

Alternatif dengan Bun:

```bash
bun install
bun run dev
```

## Script Penting

- `npm run dev`
- `npm run build`
- `npm run preview`
- `npm run test` (Vitest)
- `npm run test:visual` (Playwright visual)
- `npm run test:pwa` (Playwright PWA)
- `npm run test:visual:update` (update snapshot visual)

## Konfigurasi Environment

- `VITE_API_BASE_URL` (default `/api`)
- `VITE_API_TIMEOUT_MS` (default `12000`)
- `VITE_API_MAX_ATTEMPTS` (default `2`)
- `VITE_MUSLIM_API_BASE_URL` (default `/api/muslim`)

## Deploy ke Cloudflare Pages

```bash
cd /home/aantriono/Code/muslim/web
export CF_PAGES_PROJECT="nama-project-pages"
npm run deploy:cloudflare
```

Jika build Cloudflare gagal dengan pesan `bun install --frozen-lockfile`:

```bash
cd /home/aantriono/Code/muslim/web
bun install
cd /home/aantriono/Code/muslim
git add web/bun.lockb
git commit -m "chore(web): sync bun lockfile"
git push
```

## Referensi

Lihat dokumentasi menyeluruh di:
- [`../DOKUMENTASI_LENGKAP.md`](../DOKUMENTASI_LENGKAP.md)
