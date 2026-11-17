#!/usr/bin/env bash
# Puts the newest code of the checked-out branch ("production" = passed every check) live.
# Runs by itself from deploy/auto-deploy.sh, or by hand on the EC2 server:
#   bash ~/chuvachi/app/deploy/deploy.sh
set -euo pipefail

APP_DIR="$HOME/chuvachi/app"
COMPOSE="docker compose --env-file $HOME/chuvachi/.env -f $APP_DIR/deploy/docker-compose.yml"

cd "$APP_DIR"

# Only one deploy at a time (a manual run and the automatic one could meet).
exec 9>/tmp/chuvachi-deploy.lock
if ! flock -n 9; then
  echo "Another deploy is running. Try again in a few minutes."
  exit 1
fi

echo "==> Getting the newest code"
git pull --ff-only

echo "==> Freeing disk space from old builds"
# Build leftovers fill the small server disk over time; anything older than a day is removed.
docker builder prune -f --filter until=24h >/dev/null || true
docker image prune -f >/dev/null || true
df -h / | tail -1

echo "==> Database"
$COMPOSE up -d db

echo "==> Backend: build, update the database tables, start"
$COMPOSE build api
$COMPOSE run --rm api yarn prisma migrate deploy
$COMPOSE up -d api caddy

echo "==> Website: build (takes a few minutes), start"
$COMPOSE build web
$COMPOSE up -d web

echo "==> Cleaning up old images and build leftovers"
docker image prune -f >/dev/null
docker builder prune -f --filter until=24h >/dev/null || true

$COMPOSE ps
echo "Done."
