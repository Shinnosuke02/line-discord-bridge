#!/usr/bin/env bash
set -u

readonly STATE_FILE=/run/line-bridge-health-failures
readonly LOCK_FILE=/run/line-bridge-healthcheck.lock
readonly LOCAL_HEALTH=http://127.0.0.1:3000/health
readonly LOCAL_METRICS=http://127.0.0.1:3000/metrics
readonly PUBLIC_HOST=bot.kimon-tonko.com

log() {
  logger -t line-bridge-healthcheck -- "$*"
}

check_all() {
  systemctl is-active --quiet pm2-ubuntu.service || return 1
  systemctl is-active --quiet nginx.service || return 1
  curl --fail --silent --show-error --max-time 8 "$LOCAL_HEALTH" \
    | grep -Eq '"status"[[:space:]]*:[[:space:]]*"healthy"' || return 1
  curl --fail --silent --show-error --max-time 8 "$LOCAL_METRICS" \
    | grep -Eq '"isInitialized"[[:space:]]*:[[:space:]]*true' || return 1
  curl --fail --silent --show-error --max-time 8 \
    --resolve "${PUBLIC_HOST}:443:127.0.0.1" \
    "https://${PUBLIC_HOST}/health" \
    | grep -Eq '"status"[[:space:]]*:[[:space:]]*"healthy"'
}

exec 9>"$LOCK_FILE"
flock -n 9 || exit 0

if check_all; then
  rm -f "$STATE_FILE"
  exit 0
fi

failures=0
if [[ -r "$STATE_FILE" ]]; then
  read -r failures < "$STATE_FILE" || failures=0
fi
failures=$((failures + 1))
printf '%s\n' "$failures" > "$STATE_FILE"

if (( failures < 2 )); then
  log "Health check failed once; waiting for the next check before restarting PM2"
  exit 1
fi

log "Health check failed twice; restarting pm2-ubuntu.service once"
systemctl restart pm2-ubuntu.service
sleep 15

if check_all; then
  rm -f "$STATE_FILE"
  log "Health check recovered after PM2 restart"
  exit 0
fi

log "Health check remains unhealthy after PM2 restart"
exit 1
