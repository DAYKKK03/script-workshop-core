#!/bin/sh
set -eu

: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT is required}"
: "${COS_BUCKET:?COS_BUCKET is required}"
: "${COS_REGION:?COS_REGION is required}"
: "${COS_ENDPOINT:?COS_ENDPOINT is required}"
: "${COS_ACCESS_KEY_ID:?COS_ACCESS_KEY_ID is required}"
: "${COS_SECRET_ACCESS_KEY:?COS_SECRET_ACCESS_KEY is required}"

export RCLONE_CONFIG_COS_TYPE=s3
export RCLONE_CONFIG_COS_PROVIDER=TencentCOS
export RCLONE_CONFIG_COS_ACCESS_KEY_ID="$COS_ACCESS_KEY_ID"
export RCLONE_CONFIG_COS_SECRET_ACCESS_KEY="$COS_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_COS_REGION="$COS_REGION"
export RCLONE_CONFIG_COS_ENDPOINT="$COS_ENDPOINT"

plain=""
encrypted=""
cleanup() {
  [ -z "$plain" ] || rm -f "$plain"
  [ -z "$encrypted" ] || rm -f "$encrypted"
}
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT

while true; do
  stamp="$(date +%Y-%m-%d_%H-%M-%S)"
  plain="/tmp/database_${stamp}.dump"
  encrypted="${plain}.age"
  pg_dump --format=custom --no-owner --no-acl --file="$plain"
  age --recipient "$BACKUP_AGE_RECIPIENT" --output "$encrypted" "$plain"
  rclone copyto "$encrypted" "cos:${COS_BUCKET}/daily/$(basename "$encrypted")"
  if [ "$(date +%u)" = "7" ]; then
    rclone copyto "$encrypted" "cos:${COS_BUCKET}/weekly/$(basename "$encrypted")"
  fi
  rclone delete "cos:${COS_BUCKET}/daily" --min-age 7d
  rclone delete "cos:${COS_BUCKET}/weekly" --min-age 28d
  cleanup
  plain=""
  encrypted=""
  sleep 86400
done
