#!/usr/bin/env bash
set -euo pipefail

# Sync encrypted backup artifacts (.enc, .sha256, .json) to offsite storage.
# Supported backends:
# - rclone (recommended for many providers)
# - aws s3 (requires aws cli)
#
# Required environment variables:
# - BACKUP_SOURCE_DIR
# - OFFSITE_MODE: rclone | aws-s3
#
# rclone mode:
# - RCLONE_DESTINATION (example: remote:muslimkit-backups/api)
#
# aws-s3 mode:
# - AWS_S3_BUCKET
# - AWS_S3_PREFIX (optional, default: muslimkit/api)
# - AWS_ENDPOINT_URL (optional, useful for S3-compatible such as Cloudflare R2)
# - AWS_S3_STORAGE_CLASS (optional)
#
# Optional:
# - DRY_RUN=true (default false)

log() {
  printf '[offsite-sync] %s\n' "$*"
}

BACKUP_SOURCE_DIR="${BACKUP_SOURCE_DIR:-/var/backups/muslimkit/api}"
OFFSITE_MODE="${OFFSITE_MODE:-rclone}"
DRY_RUN="${DRY_RUN:-false}"

if [[ ! -d "$BACKUP_SOURCE_DIR" ]]; then
  log "backup source dir not found: $BACKUP_SOURCE_DIR"
  exit 1
fi

if [[ "$OFFSITE_MODE" == "rclone" ]]; then
  : "${RCLONE_DESTINATION:?RCLONE_DESTINATION wajib diisi untuk mode rclone}"
  CMD=(rclone sync "$BACKUP_SOURCE_DIR" "$RCLONE_DESTINATION" --include "*.enc" --include "*.sha256" --include "*.json" --checkers 8 --transfers 4)
  if [[ "$DRY_RUN" == "true" ]]; then
    CMD+=(--dry-run)
  fi
  log "running rclone sync to $RCLONE_DESTINATION"
  "${CMD[@]}"
  log "rclone sync done"
  exit 0
fi

if [[ "$OFFSITE_MODE" == "aws-s3" ]]; then
  : "${AWS_S3_BUCKET:?AWS_S3_BUCKET wajib diisi untuk mode aws-s3}"
  AWS_S3_PREFIX="${AWS_S3_PREFIX:-muslimkit/api}"
  AWS_S3_STORAGE_CLASS="${AWS_S3_STORAGE_CLASS:-}"
  AWS_ENDPOINT_URL="${AWS_ENDPOINT_URL:-}"
  DESTINATION="s3://${AWS_S3_BUCKET}/${AWS_S3_PREFIX}/"
  CMD=(aws s3 sync "$BACKUP_SOURCE_DIR/" "$DESTINATION" --exclude "*" --include "*.enc" --include "*.sha256" --include "*.json" --only-show-errors)
  if [[ -n "$AWS_S3_STORAGE_CLASS" ]]; then
    CMD+=(--storage-class "$AWS_S3_STORAGE_CLASS")
  fi
  if [[ -n "$AWS_ENDPOINT_URL" ]]; then
    CMD+=(--endpoint-url "$AWS_ENDPOINT_URL")
  fi
  if [[ "$DRY_RUN" == "true" ]]; then
    CMD+=(--dryrun)
  fi
  log "running aws s3 sync to $DESTINATION"
  "${CMD[@]}"
  log "aws s3 sync done"
  exit 0
fi

log "OFFSITE_MODE tidak didukung: $OFFSITE_MODE"
exit 1
