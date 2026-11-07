#!/usr/bin/env bash
# Puts the newest code from GitHub live. Run on the EC2 server:
#   ~/chuvachi/app/deploy/deploy.sh
set -euo pipefail

APP_DIR="$HOME/chuvachi/app"
COMPOSE="docker compose --env-file $HOME/chuvachi/.env -f $APP_DIR/deploy/docker-compose.yml"

cd "$APP_DIR"
echo "==> Getting the newest code"
git pull --ff-only

echo "==> Database"
$COMPOSE up -d db

echo "==> Backend: build, update the database tables, start"
$COMPOSE build api
$COMPOSE run --rm api yarn prisma migrate deploy
$COMPOSE up -d api caddy

echo "==> Website: build (takes a few minutes), start"
$COMPOSE build web
$COMPOSE up -d web

echo "==> Cleaning up old images"
docker image prune -f >/dev/null

$COMPOSE ps
echo "Done."
