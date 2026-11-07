#!/usr/bin/env bash
# Daily database backup: dumps the shop database, compresses it, and uploads it to a private
# Cloudflare R2 bucket. Keeps the last 7 days on the server too.
#
# Settings: ~/chuvachi/backup.env (see backup.env.example). Runs every night from cron.
# Manual run:  bash ~/chuvachi/app/deploy/backup.sh
set -euo pipefail

set -a
# shellcheck disable=SC1091
source "$HOME/chuvachi/backup.env"
set +a

BACKUP_DIR="$HOME/chuvachi/backups"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

STAMP="$(date -u +%Y-%m-%d_%H%M)"
NAME="chuvachi_prod_${STAMP}.sql.gz"

echo "$(date -u) Dumping database to $NAME"
docker exec chuvachi-db pg_dump -U chuvachi_admin -d chuvachi_prod --no-owner | gzip > "$BACKUP_DIR/$NAME"
chmod 600 "$BACKUP_DIR/$NAME"

echo "$(date -u) Uploading to R2 bucket $BACKUP_BUCKET"
docker run --rm \
  -v "$BACKUP_DIR:/backups:ro" \
  -e AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  -e AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  -e AWS_DEFAULT_REGION=auto \
  amazon/aws-cli s3 cp "/backups/$NAME" "s3://$BACKUP_BUCKET/$NAME" \
  --endpoint-url "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com" --only-show-errors

# Local copies older than 7 days are removed; R2 keeps 30 days (lifecycle rule on the bucket).
find "$BACKUP_DIR" -name 'chuvachi_prod_*.sql.gz' -mtime +7 -delete

echo "$(date -u) Backup finished"
