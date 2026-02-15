# Deployment Hardening (Anti-Ransomware)

Dokumen ini fokus pada hardening operasional Linux untuk meminimalkan dampak serangan ransomware:

- prinsip least privilege di service runtime,
- backup terenkripsi yang tervalidasi,
- sinkronisasi offsite,
- mode darurat read-only,
- prosedur recovery cepat.

## 1. Struktur File Template

- Service utama:
  - `ops/systemd/apimuslim-proxy.service`
  - `ops/systemd/muslim-users-api.service`
- Backup automation:
  - `ops/systemd/muslim-backup.service`
  - `ops/systemd/muslim-backup.timer`
  - `ops/systemd/muslim-backup-verify.service`
  - `ops/systemd/muslim-backup-verify.timer`
  - `ops/systemd/muslim-backup-prune.service`
  - `ops/systemd/muslim-backup-prune.timer`
  - `ops/systemd/muslim-backup-offsite-sync.service`
  - `ops/systemd/muslim-backup-offsite-sync.timer`
- Environment template:
  - `ops/systemd/apimuslim-proxy.env.example`
  - `ops/systemd/muslim-users-api.env.example`
  - `ops/systemd/backup-offsite.env.example`
- Reverse proxy template:
  - `ops/nginx/muslimkit.conf.example`
- Script sinkronisasi offsite:
  - `ops/scripts/offsite-sync-backups.sh`
  - `ops/scripts/install-production.sh`
  - `ops/scripts/run-backup-cron.sh` (fallback lokal non-systemd)

## 2. Instalasi Otomatis (Direkomendasikan)

Jalankan sekali:

```bash
sudo ./ops/scripts/install-production.sh --target-root /opt/muslimkit --install-nginx --nginx-server-name muslimkit.example.com
```

Mode simulasi:

```bash
sudo ./ops/scripts/install-production.sh --dry-run
```

Script akan:
- membuat user/group service,
- menyalin unit `systemd` + timer,
- menyalin template env (jika belum ada),
- mengaktifkan service/timer,
- opsional memasang config nginx.

## 3. Setup Manual (Jika Tidak Pakai Script)

```bash
sudo useradd --system --home /opt/muslimkit --shell /usr/sbin/nologin muslimkit
sudo mkdir -p /opt/muslimkit /etc/muslimkit /var/backups/muslimkit/api /var/log/muslimkit
sudo chown -R muslimkit:muslimkit /opt/muslimkit /var/backups/muslimkit /var/log/muslimkit
sudo chmod 750 /opt/muslimkit /var/backups/muslimkit /var/log/muslimkit
```

## 4. Konfigurasi Environment

1. Salin file contoh:

```bash
sudo cp ops/systemd/apimuslim-proxy.env.example /etc/muslimkit/apimuslim-proxy.env
sudo cp ops/systemd/muslim-users-api.env.example /etc/muslimkit/muslim-users-api.env
sudo cp ops/systemd/backup-offsite.env.example /etc/muslimkit/backup-offsite.env
```

2. Edit nilai sensitif:
- `API_WRITE_TOKEN`
- `BACKUP_PASSPHRASE`
- credential offsite (`RCLONE_DESTINATION` atau kredensial AWS IAM role)

3. Kunci permission:

```bash
sudo chown root:muslimkit /etc/muslimkit/*.env
sudo chmod 640 /etc/muslimkit/*.env
```

## 5. Install dan Aktifkan Systemd

```bash
sudo cp ops/systemd/*.service /etc/systemd/system/
sudo cp ops/systemd/*.timer /etc/systemd/system/
sudo systemctl daemon-reload

sudo systemctl enable --now apimuslim-proxy.service
sudo systemctl enable --now muslim-users-api.service
sudo systemctl enable --now muslim-backup.timer
sudo systemctl enable --now muslim-backup-verify.timer
sudo systemctl enable --now muslim-backup-prune.timer
sudo systemctl enable --now muslim-backup-offsite-sync.timer
```

Cek status:

```bash
systemctl status apimuslim-proxy.service muslim-users-api.service
systemctl list-timers --all | grep muslim-backup
```

## 6. Nginx Hardening

Gunakan template `ops/nginx/muslimkit.conf.example`, sesuaikan domain dan path sertifikat TLS.

Lalu:

```bash
sudo cp ops/nginx/muslimkit.conf.example /etc/nginx/sites-available/muslimkit.conf
sudo ln -s /etc/nginx/sites-available/muslimkit.conf /etc/nginx/sites-enabled/muslimkit.conf
sudo nginx -t
sudo systemctl reload nginx
```

## 7. Offsite Backup (Immutable-Ready)

Rekomendasi:
- Bucket/object storage terpisah akun.
- Aktifkan Object Lock / immutability policy (WORM) di sisi storage.
- Batasi kredensial sinkronisasi: write-only jika memungkinkan.

Script sinkronisasi:
- `ops/scripts/offsite-sync-backups.sh`
- Mode:
  - `OFFSITE_MODE=rclone`
  - `OFFSITE_MODE=aws-s3`

Template env siap pakai:
- Umum: `ops/systemd/backup-offsite.env.example`
- Cloudflare R2: `ops/systemd/backup-offsite-r2.env.example`
- AWS S3: `ops/systemd/backup-offsite-aws-s3.env.example`

Uji manual:

```bash
sudo -u muslimkit BACKUP_SOURCE_DIR=/var/backups/muslimkit/api OFFSITE_MODE=rclone RCLONE_DESTINATION=remote:muslimkit-backups/api DRY_RUN=true /opt/muslimkit/ops/scripts/offsite-sync-backups.sh
```

## 8. Emergency Response (Ransomware)

Jika ada indikasi compromise:

1. Aktifkan `READ_ONLY_MODE=true` pada:
- `/etc/muslimkit/apimuslim-proxy.env`
- `/etc/muslimkit/muslim-users-api.env`

2. Reload service:

```bash
sudo systemctl restart apimuslim-proxy.service muslim-users-api.service
```

3. Ambil snapshot forensik:
- salin `data.sqlite`, `data.sqlite-wal`, log systemd, dan backup terbaru.

4. Verifikasi backup sebelum restore:

```bash
sudo -u muslimkit bash -lc 'cd /opt/muslimkit/api && bun run backup:verify -- --dir /var/backups/muslimkit/api --limit 24'
```

5. Restore ke host bersih, bukan langsung overwrite host terduga compromise.

## 9. Checklist Berkala

- Harian:
  - pastikan timer backup sukses (`journalctl -u muslim-backup.service -n 50`).
- Mingguan:
  - verifikasi backup + simulasi restore di environment terpisah.
- Bulanan:
  - rotasi token/passphrase dan review IAM/offsite policy.
- Per release:
  - jalankan `bun audit` dan patch dependency jika ada CVE.

## 10. Fallback Lokal (Jika Belum Pakai Systemd)

Jika Anda belum men-deploy via `systemd`, gunakan cron user biasa + helper:
- simpan passphrase di `~/.config/muslimkit/backup.env` (permission `600`)
- jadwalkan `ops/scripts/run-backup-cron.sh` untuk `backup`, `verify`, dan `prune`

Contoh:

```cron
0 2 * * * /home/aantriono/Documents/Code/muslim/ops/scripts/run-backup-cron.sh backup >> /home/aantriono/Documents/Code/muslim/backups/backup.log 2>&1
20 2 * * * /home/aantriono/Documents/Code/muslim/ops/scripts/run-backup-cron.sh verify >> /home/aantriono/Documents/Code/muslim/backups/backup.log 2>&1
35 2 * * 0 BACKUP_RETENTION_DAYS=30 BACKUP_KEEP_MIN=10 /home/aantriono/Documents/Code/muslim/ops/scripts/run-backup-cron.sh prune >> /home/aantriono/Documents/Code/muslim/backups/backup.log 2>&1
```
