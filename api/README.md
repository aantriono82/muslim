# API Pengguna (Bun + Hono + SQLite)

API sederhana untuk data pengguna dengan fitur CRUD dan list. Semua endpoint berada di bawah prefix `/api`.

## Fitur
- CRUD pengguna
- List dengan pagination dan pencarian
- SQLite otomatis dibuat saat aplikasi pertama kali dijalankan

## Prasyarat
- Bun terpasang di mesin Anda

## Instalasi
```bash
cd /home/aantriono/Code/muslim/api
bun install
```

## Menjalankan Server
```bash
bun run dev
```

Secara default server berjalan di `http://localhost:4001/api`.

## Struktur Data Pengguna
Field yang disimpan:
- `id` (integer)
- `name` (string)
- `email` (string, unique)
- `created_at` (string timestamp)
- `updated_at` (string timestamp)

## Endpoint

### List pengguna
`GET /api/users`
Query opsional:
- `page` (default 1)
- `limit` (default 20, max 100)
- `q` (pencarian nama/email)

```bash
curl -s "http://localhost:4001/api/users?page=1&limit=10&q=andi"
```

### Detail pengguna
`GET /api/users/:id`

```bash
curl -s "http://localhost:4001/api/users/1"
```

### Tambah pengguna
`POST /api/users`
Body JSON:
- `name` (wajib)
- `email` (wajib)

```bash
curl -s -X POST "http://localhost:4001/api/users" \
  -H "Content-Type: application/json" \
  -d '{"name":"Andi","email":"andi@example.com"}'
```

### Update pengguna (full)
`PUT /api/users/:id`
Body JSON:
- `name` (wajib)
- `email` (wajib)

```bash
curl -s -X PUT "http://localhost:4001/api/users/1" \
  -H "Content-Type: application/json" \
  -d '{"name":"Andi Update","email":"andi@example.com"}'
```

### Update pengguna (partial)
`PATCH /api/users/:id`
Body JSON (opsional):
- `name`
- `email`

```bash
curl -s -X PATCH "http://localhost:4001/api/users/1" \
  -H "Content-Type: application/json" \
  -d '{"name":"Andi Baru"}'
```

### Hapus pengguna
`DELETE /api/users/:id`

```bash
curl -s -X DELETE "http://localhost:4001/api/users/1"
```

## Catatan Database
File database akan dibuat otomatis di `api/data.sqlite`.
