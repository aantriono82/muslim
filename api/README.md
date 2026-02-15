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
- `bun run backup` : buat backup SQLite terenkripsi
- `bun run backup:verify` : verifikasi checksum backup (dan dekripsi jika passphrase tersedia)
- `bun run backup:prune` : hapus backup lama sesuai retensi
- `bun run restore -- --file <path-backup.enc>` : restore dari backup terenkripsi
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
- `READ_ONLY_MODE` (default `false`): set `true/1` untuk mematikan semua endpoint write `/api/users`
- `API_WRITE_TOKEN` (opsional): jika diisi, endpoint write `/api/users` wajib `Authorization: Bearer <token>`
- `MAX_BODY_BYTES` (default `262144`): batas body request untuk `POST/PUT/PATCH/DELETE`
- `WRITE_RATE_LIMIT_WINDOW_SECONDS` (default `60`): jendela rate limit write
- `WRITE_RATE_LIMIT_MAX` (default `120`): maksimum request write per IP per window
- `BACKUP_PASSPHRASE` (wajib untuk backup/restore): passphrase enkripsi OpenSSL
- `BACKUP_DIR` (opsional): direktori output backup, default `../backups/api`
- `DB_PATH` (opsional): lokasi file SQLite, default `api/data.sqlite`
- `BACKUP_RETENTION_DAYS` (default `30`): retensi umur file backup untuk prune
- `BACKUP_KEEP_MIN` (default `10`): jumlah minimum backup terbaru yang selalu dipertahankan

Database SQLite tersimpan di:
- `api/data.sqlite`

## Backup & Restore (Ransomware Readiness)

Contoh backup terenkripsi:

```bash
cd /home/aantriono/Code/muslim/api
BACKUP_PASSPHRASE='ganti-dengan-passphrase-kuat' bun run backup
```

Contoh restore:

```bash
cd /home/aantriono/Code/muslim/api
BACKUP_PASSPHRASE='ganti-dengan-passphrase-kuat' bun run restore -- --file ../backups/api/users-YYYY-MM-DDTHH-MM-SS-sssZ.sqlite.enc
```

Contoh verifikasi berkala (paling baru 20 file):

```bash
cd /home/aantriono/Code/muslim/api
BACKUP_PASSPHRASE='ganti-dengan-passphrase-kuat' bun run backup:verify -- --limit 20
```

Contoh prune backup lama:

```bash
cd /home/aantriono/Code/muslim/api
BACKUP_RETENTION_DAYS=30 BACKUP_KEEP_MIN=10 bun run backup:prune
```

Catatan operasional:
- Simpan passphrase di secret manager, jangan di repo.
- Jadwalkan backup berkala (harian/jam) dan salin ke storage terpisah.
- Uji restore secara periodik di environment non-produksi.
- Saat ada indikasi insiden, aktifkan `READ_ONLY_MODE=true` lalu lakukan backup forensik sebelum pemulihan.

## Cron Aman (Tanpa Passphrase di Crontab)

Gunakan helper script:
- `../ops/scripts/run-backup-cron.sh`

Simpan passphrase di file private:

```bash
mkdir -p ~/.config/muslimkit
cat > ~/.config/muslimkit/backup.env <<'EOF'
BACKUP_PASSPHRASE='ganti-passphrase-kuat'
VERIFY_LIMIT=5
EOF
chmod 600 ~/.config/muslimkit/backup.env
```

Contoh cron:

```cron
0 2 * * * /home/aantriono/Documents/Code/muslim/ops/scripts/run-backup-cron.sh backup >> /home/aantriono/Documents/Code/muslim/backups/backup.log 2>&1
20 2 * * * /home/aantriono/Documents/Code/muslim/ops/scripts/run-backup-cron.sh verify >> /home/aantriono/Documents/Code/muslim/backups/backup.log 2>&1
35 2 * * 0 BACKUP_RETENTION_DAYS=30 BACKUP_KEEP_MIN=10 /home/aantriono/Documents/Code/muslim/ops/scripts/run-backup-cron.sh prune >> /home/aantriono/Documents/Code/muslim/backups/backup.log 2>&1
```

## Referensi

Lihat dokumentasi menyeluruh di:
- [`../DOKUMENTASI_LENGKAP.md`](../DOKUMENTASI_LENGKAP.md)
