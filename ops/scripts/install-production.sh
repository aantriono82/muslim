#!/usr/bin/env bash
set -euo pipefail

log() {
  printf '[install-production] %s\n' "$*"
}

run() {
  if [[ "$DRY_RUN" == "true" ]]; then
    printf '[dry-run] %s\n' "$*"
    return 0
  fi
  eval "$@"
}

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    log "jalankan script ini sebagai root (sudo)."
    exit 1
  fi
}

usage() {
  cat <<'EOF'
Usage:
  sudo ./ops/scripts/install-production.sh [options]

Options:
  --target-root <path>         Default: /opt/muslimkit
  --env-dir <path>             Default: /etc/muslimkit
  --systemd-dir <path>         Default: /etc/systemd/system
  --backup-dir <path>          Default: /var/backups/muslimkit/api
  --log-dir <path>             Default: /var/log/muslimkit
  --service-user <name>        Default: muslimkit
  --service-group <name>       Default: muslimkit
  --bun-bin <path>             Default: detected from command -v bun
  --install-nginx              Install nginx site config
  --nginx-server-name <name>   Default: muslimkit.example.com
  --nginx-sites-available <p>  Default: /etc/nginx/sites-available
  --nginx-sites-enabled <p>    Default: /etc/nginx/sites-enabled
  --dry-run                    Show actions only
  --help                       Show this help
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

TARGET_ROOT="/opt/muslimkit"
ENV_DIR="/etc/muslimkit"
SYSTEMD_DIR="/etc/systemd/system"
BACKUP_DIR="/var/backups/muslimkit/api"
LOG_DIR="/var/log/muslimkit"
SERVICE_USER="muslimkit"
SERVICE_GROUP="muslimkit"
INSTALL_NGINX="false"
NGINX_SERVER_NAME="muslimkit.example.com"
NGINX_SITES_AVAILABLE="/etc/nginx/sites-available"
NGINX_SITES_ENABLED="/etc/nginx/sites-enabled"
DRY_RUN="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target-root)
      TARGET_ROOT="${2:?missing value}"
      shift 2
      ;;
    --env-dir)
      ENV_DIR="${2:?missing value}"
      shift 2
      ;;
    --systemd-dir)
      SYSTEMD_DIR="${2:?missing value}"
      shift 2
      ;;
    --backup-dir)
      BACKUP_DIR="${2:?missing value}"
      shift 2
      ;;
    --log-dir)
      LOG_DIR="${2:?missing value}"
      shift 2
      ;;
    --service-user)
      SERVICE_USER="${2:?missing value}"
      shift 2
      ;;
    --service-group)
      SERVICE_GROUP="${2:?missing value}"
      shift 2
      ;;
    --bun-bin)
      BUN_BIN="${2:?missing value}"
      shift 2
      ;;
    --install-nginx)
      INSTALL_NGINX="true"
      shift 1
      ;;
    --nginx-server-name)
      NGINX_SERVER_NAME="${2:?missing value}"
      shift 2
      ;;
    --nginx-sites-available)
      NGINX_SITES_AVAILABLE="${2:?missing value}"
      shift 2
      ;;
    --nginx-sites-enabled)
      NGINX_SITES_ENABLED="${2:?missing value}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN="true"
      shift 1
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      log "opsi tidak dikenal: $1"
      usage
      exit 1
      ;;
  esac
done

BUN_BIN="${BUN_BIN:-$(command -v bun || true)}"
if [[ -z "$BUN_BIN" ]]; then
  log "bun tidak ditemukan. install Bun dulu."
  exit 1
fi

NOLOGIN_BIN="/usr/sbin/nologin"
if [[ ! -x "$NOLOGIN_BIN" ]]; then
  NOLOGIN_BIN="/sbin/nologin"
fi

require_root

log "target root: $TARGET_ROOT"
log "systemd dir: $SYSTEMD_DIR"
log "env dir: $ENV_DIR"
log "backup dir: $BACKUP_DIR"
log "bun bin: $BUN_BIN"

if ! getent group "$SERVICE_GROUP" >/dev/null 2>&1; then
  run "groupadd --system '$SERVICE_GROUP'"
fi
if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  run "useradd --system --home '$TARGET_ROOT' --shell '$NOLOGIN_BIN' --gid '$SERVICE_GROUP' '$SERVICE_USER'"
fi

run "mkdir -p '$TARGET_ROOT' '$ENV_DIR' '$BACKUP_DIR' '$LOG_DIR'"
run "chown -R '$SERVICE_USER:$SERVICE_GROUP' '$TARGET_ROOT' '$BACKUP_DIR' '$LOG_DIR'"
run "chmod 750 '$TARGET_ROOT' '$BACKUP_DIR' '$LOG_DIR'"

run "mkdir -p '$TARGET_ROOT/ops/scripts'"
run "install -m 0750 '$REPO_ROOT/ops/scripts/offsite-sync-backups.sh' '$TARGET_ROOT/ops/scripts/offsite-sync-backups.sh'"

install_env_if_missing() {
  local src="$1"
  local dest="$2"
  if [[ -f "$dest" ]]; then
    log "skip existing env: $dest"
    return 0
  fi
  run "install -m 0640 '$src' '$dest'"
  run "chown root:$SERVICE_GROUP '$dest'"
}

install_env_if_missing "$REPO_ROOT/ops/systemd/apimuslim-proxy.env.example" "$ENV_DIR/apimuslim-proxy.env"
install_env_if_missing "$REPO_ROOT/ops/systemd/muslim-users-api.env.example" "$ENV_DIR/muslim-users-api.env"
install_env_if_missing "$REPO_ROOT/ops/systemd/backup-offsite.env.example" "$ENV_DIR/backup-offsite.env"

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

install_unit() {
  local src="$1"
  local dst="$2"
  local rendered="$tmpdir/$(basename "$src")"
  sed \
    -e "s|/opt/muslimkit|$TARGET_ROOT|g" \
    -e "s|/usr/bin/bun|$BUN_BIN|g" \
    -e "s|/etc/muslimkit|$ENV_DIR|g" \
    -e "s|/var/backups/muslimkit/api|$BACKUP_DIR|g" \
    -e "s|/var/log/muslimkit|$LOG_DIR|g" \
    "$src" >"$rendered"
  run "install -m 0644 '$rendered' '$dst'"
}

for file in "$REPO_ROOT"/ops/systemd/*.service "$REPO_ROOT"/ops/systemd/*.timer; do
  install_unit "$file" "$SYSTEMD_DIR/$(basename "$file")"
done

if command -v systemctl >/dev/null 2>&1; then
  run "systemctl daemon-reload"
  run "systemctl enable --now apimuslim-proxy.service"
  run "systemctl enable --now muslim-users-api.service"
  run "systemctl enable --now muslim-backup.timer"
  run "systemctl enable --now muslim-backup-verify.timer"
  run "systemctl enable --now muslim-backup-prune.timer"
  run "systemctl enable --now muslim-backup-offsite-sync.timer"
else
  log "systemctl tidak ditemukan, lewati enable service/timer."
fi

if [[ "$INSTALL_NGINX" == "true" ]]; then
  if ! command -v nginx >/dev/null 2>&1; then
    log "nginx tidak ditemukan, lewati instalasi nginx config."
  else
    run "mkdir -p '$NGINX_SITES_AVAILABLE' '$NGINX_SITES_ENABLED'"
    rendered_nginx="$tmpdir/muslimkit.conf"
    sed \
      -e "s|muslimkit.example.com|$NGINX_SERVER_NAME|g" \
      -e "s|/var/www/muslimkit/web|$TARGET_ROOT/web|g" \
      "$REPO_ROOT/ops/nginx/muslimkit.conf.example" >"$rendered_nginx"
    run "install -m 0644 '$rendered_nginx' '$NGINX_SITES_AVAILABLE/muslimkit.conf'"
    if [[ ! -e "$NGINX_SITES_ENABLED/muslimkit.conf" ]]; then
      run "ln -s '$NGINX_SITES_AVAILABLE/muslimkit.conf' '$NGINX_SITES_ENABLED/muslimkit.conf'"
    fi
    run "nginx -t"
    if command -v systemctl >/dev/null 2>&1; then
      run "systemctl reload nginx"
    fi
  fi
fi

log "selesai. edit file env di $ENV_DIR sebelum production traffic."
