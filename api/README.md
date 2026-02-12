# API Users (Opsional)

Service CRUD users berbasis Bun + Hono + SQLite.

Catatan:
- Service ini terpisah dari fitur utama MuslimKit.
- Cocok untuk kebutuhan contoh backend CRUD / pengujian.

## Menjalankan

```bash
cd /home/aantriono/Code/muslim/api
bun install
bun run dev
```

Default URL:
- `http://localhost:4001/api`

## Script

- `bun run dev` : jalankan mode watch
- `bun run start` : jalankan sekali
- `bun run typecheck` : TypeScript check
- `bun test` : unit/integration test

## Endpoint Inti

- `GET /api/`
- `GET /api/users`
- `GET /api/users/:id`
- `POST /api/users`
- `PUT /api/users/:id`
- `PATCH /api/users/:id`
- `DELETE /api/users/:id`

## Konfigurasi

- `PORT` (default `4001`)

Database SQLite tersimpan di:
- `api/data.sqlite`

## Referensi

Lihat dokumentasi menyeluruh di:
- [`../DOKUMENTASI_LENGKAP.md`](../DOKUMENTASI_LENGKAP.md)
