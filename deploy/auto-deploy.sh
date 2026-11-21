#!/usr/bin/env bash
# Run by cron on the EC2 server every few minutes. When GitHub has moved the "production"
# branch (all checks passed on main), it deploys that commit with deploy.sh.
# Nothing to do = no output, so the log only shows real deploys.
#
# What is live is remembered in ~/chuvachi/deployed-commit, written only after a deploy
# succeeds. (Comparing with the checked-out code is not enough: deploy.sh pulls the code
# first, so a build that failed would look "done" and never be tried again.)
# Without that file yet, the newest commit is deployed once to be sure.
# A commit that failed is tried once more on the next run (a passing hiccup such as a slow
# download), then left alone until a newer commit arrives or someone runs deploy.sh by hand.
set -euo pipefail

APP_DIR="$HOME/chuvachi/app"
DEPLOYED_FILE="$HOME/chuvachi/deployed-commit"
FAILED_FILE="$HOME/chuvachi/failed-commit" # "<commit> <attempts>"
cd "$APP_DIR"

# A deploy already running holds this lock; check again next time.
exec 9>/tmp/chuvachi-deploy.lock
flock -n 9 || exit 0
flock -u 9

git fetch --quiet origin production
ready="$(git rev-parse origin/production)"
live="$(cat "$DEPLOYED_FILE" 2>/dev/null || true)"
[ "$live" = "$ready" ] && exit 0

attempts=0
if [ -f "$FAILED_FILE" ] && [ "$(cut -d' ' -f1 "$FAILED_FILE")" = "$ready" ]; then
  attempts="$(cut -d' ' -f2 "$FAILED_FILE")"
fi
[ "$attempts" -ge 2 ] && exit 0

echo "===== $(date '+%Y-%m-%d %H:%M:%S') deploying ${ready:0:7}: $(git log -1 --format=%s "$ready")"
if bash "$APP_DIR/deploy/deploy.sh"; then
  echo "$ready" >"$DEPLOYED_FILE"
  rm -f "$FAILED_FILE"
  echo "===== deployed ${ready:0:7}"
else
  echo "$ready $((attempts + 1))" >"$FAILED_FILE"
  echo "===== DEPLOY FAILED for ${ready:0:7}, attempt $((attempts + 1)) of 2 (the site keeps running the last version that built)"
fi
