# API Muslim Proxy (Bun + Hono)

Project ini menggunakan `apimuslim.json` sebagai dokumentasi OpenAPI dan seluruh backend diproxy ke `https://api.myquran.com/v3/`.
Tambahan: modul Doa Harian diproxy ke EQuran (`https://equran.id/api/doa`) agar tetap bisa digunakan.

## Fitur
- Proxy seluruh request ke API MyQuran
- Dokumentasi Swagger UI (`/docs`)
- OpenAPI JSON (`/openapi.json`)

## Prasyarat
- Bun terpasang

## Instalasi
```bash
cd /home/aantriono/Code/muslim/apimuslim-proxy
bun install
```

## Menjalankan Server
```bash
bun run dev
```

Default server di `http://localhost:3000`.

## Cara Pakai Proxy
Semua request ke path `/api` akan diteruskan ke `https://api.myquran.com/v3` (prefix `/v3` tetap didukung).

Contoh:
```bash
curl -s "http://localhost:3000/api/health"
```

### Doa Harian (EQuran)
Endpoint berikut diproxy ke EQuran dan dibentuk ulang agar konsisten:
```bash
GET  /api/doa/harian
GET  /api/doa/harian/kategori/{id}
GET  /api/doa/harian/{id}
GET  /api/doa/harian/random
POST /api/doa/harian/cari
```

## Dokumentasi
- Swagger UI: `http://localhost:3000/docs`
- OpenAPI JSON: `http://localhost:3000/openapi.json`

## Konfigurasi Environment
- `PORT` (default: 3000)
- `TARGET_ORIGIN` (default: `https://api.myquran.com`)
- `PROXY_PREFIX` (default: `/api`)
- `ALT_PREFIX` (default: `/v3`, untuk kompatibilitas)
- `UPSTREAM_PREFIX` (default: `/v3`)
- `PUBLIC_BASE_URL` (opsional) untuk mengganti `servers` di `openapi.json`
- `DOA_ORIGIN` (default: `https://equran.id`)
- `DOA_BASE` (default: `/api/doa`)
- `DOA_TTL` (default: `3600`) cache daftar doa (detik)

Contoh override base URL untuk docs:
```bash
PUBLIC_BASE_URL="http://localhost:3000" bun run dev
```
