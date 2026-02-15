# API Muslim Proxy

Proxy backend MuslimKit berbasis Bun + Hono.

Fungsi utama:
- Proxy request `/api/*` ke MyQuran (`/v3`).
- Menyediakan endpoint Doa Harian (EQuran) yang sudah dinormalisasi.
- Proxy audio Quran (termasuk guard host allow-list).
- Dokumentasi OpenAPI dan Swagger UI.

## Menjalankan

```bash
cd /home/aantriono/Code/muslim/apimuslim-proxy
bun install
bun run dev
```

Default URL:
- `http://localhost:3002`

## Script

- `bun run dev` : jalankan mode watch
- `bun run start` : jalankan sekali
- `bun run typecheck` : TypeScript check
- `bun test` : unit/integration test

## Endpoint Penting

- `GET /` status proxy
- `GET /openapi.json`
- `GET /docs`
- `GET /api/doa/harian`
- `GET /api/doa/harian/kategori/:id`
- `POST /api/doa/harian/cari`
- `GET /api/doa/harian/random`
- `GET /api/doa/harian/:id`
- `GET /api/quran/juz/:number/audio`
- `GET /api/audio?url=...`

Kompatibilitas prefix:
- `/api/*` dan `/v3/*` aktif secara default.

## Konfigurasi Utama

- `PORT` (default `3002`)
- `TARGET_ORIGIN` (default `https://api.myquran.com`)
- `PROXY_PREFIX` (default `/api`)
- `ALT_PREFIX` (default `/v3`)
- `UPSTREAM_PREFIX` (default `/v3`)
- `MUSLIM_ORIGIN` (default `https://muslim-api-three.vercel.app`)
- `DOA_ORIGIN` (default `https://equran.id`)
- `DOA_BASE` (default `/api/doa`)
- `UPSTREAM_TIMEOUT_MS` (default `15000`)
- `AUDIO_ALLOWED_HOSTS` (allow-list host audio)
- `READ_ONLY_MODE` (default `false`) set `true/1` untuk mematikan endpoint write
- `MAX_BODY_BYTES` (default `262144`) batas body request method write
- `WRITE_RATE_LIMIT_WINDOW_SECONDS` (default `60`) window rate limit write
- `WRITE_RATE_LIMIT_MAX` (default `180`) maksimum request write per IP per window

## Referensi

Lihat dokumentasi menyeluruh di:
- [`../DOKUMENTASI_LENGKAP.md`](../DOKUMENTASI_LENGKAP.md)
