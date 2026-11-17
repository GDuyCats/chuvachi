#!/usr/bin/env bash
# Run by cron on the EC2 server every few minutes. When GitHub has moved the "production"
# branch (all checks passed on main), it deploys that commit with deploy.sh.
# Nothing to do = no output, so the log only shows real deploys.
set -euo pipefail

APP_DIR="$HOME/chuvachi/app"
cd "$APP_DIR"

# A deploy already running holds this lock; check again next time.
exec 9>/tmp/chuvachi-deploy.lock
flock -n 9 || exit 0
flock -u 9

git fetch --quiet origin production
current="$(git rev-parse HEAD)"
ready="$(git rev-parse origin/production)"
[ "$current" = "$ready" ] && exit 0

echo "===== $(date '+%Y-%m-%d %H:%M:%S') deploying ${ready:0:7}: $(git log -1 --format=%s "$ready")"
if bash "$APP_DIR/deploy/deploy.sh"; then
  echo "===== deployed ${ready:0:7}"
else
  echo "===== DEPLOY FAILED for ${ready:0:7} (the site keeps running the last version that built)"
fi
