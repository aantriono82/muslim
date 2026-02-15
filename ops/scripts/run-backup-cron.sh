#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-}"
ROOT_DIR="/home/aantriono/Documents/Code/muslim"
API_DIR="$ROOT_DIR/api"
LOG_FILE="$ROOT_DIR/backups/backup.log"
ENV_FILE="${MUSLIM_BACKUP_ENV_FILE:-/home/aantriono/.config/muslimkit/backup.env}"
BUN_BIN="${BUN_BIN:-/home/aantriono/.bun/bin/bun}"
VERIFY_LIMIT="${VERIFY_LIMIT:-5}"

mkdir -p "$(dirname "$LOG_FILE")"
touch "$LOG_FILE"

if [[ ! -x "$BUN_BIN" ]]; then
  BUN_BIN="$(command -v bun || true)"
fi
if [[ -z "$BUN_BIN" ]]; then
  echo "bun tidak ditemukan di PATH."
  exit 1
fi

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck source=/dev/null
  set -a
  . "$ENV_FILE"
  set +a
fi

cd "$API_DIR"

case "$ACTION" in
  backup)
    : "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE belum di-set di $ENV_FILE}"
    exec "$BUN_BIN" run backup
    ;;
  verify)
    : "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE belum di-set di $ENV_FILE}"
    exec "$BUN_BIN" run backup:verify -- --limit "$VERIFY_LIMIT"
    ;;
  prune)
    exec "$BUN_BIN" run backup:prune
    ;;
  *)
    echo "Usage: $0 {backup|verify|prune}"
    exit 1
    ;;
esac
