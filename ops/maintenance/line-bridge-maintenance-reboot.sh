#!/usr/bin/env bash
set -euo pipefail

readonly MODE="${1:-conditional}"
readonly LOCK_FILE=/run/line-bridge-maintenance.lock
readonly PM2_HOME=/home/ubuntu/.pm2

log() {
  logger -t line-bridge-maintenance -- "$*"
}

exec 9>"$LOCK_FILE"
flock -n 9 || exit 0

if who | grep -qE '[[:space:]]pts/'; then
  log "Skipping scheduled reboot because an interactive user is logged in"
  exit 0
fi

if fuser /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock \
  /var/lib/apt/lists/lock /var/cache/apt/archives/lock >/dev/null 2>&1; then
  log "Skipping scheduled reboot because apt or dpkg is active"
  exit 0
fi

case "$MODE" in
  conditional)
    if [[ ! -e /var/run/reboot-required ]]; then
      log "No reboot is required"
      exit 0
    fi
    ;;
  refresh)
    uptime_seconds=$(cut -d. -f1 /proc/uptime)
    if (( uptime_seconds < 3600 )); then
      log "Skipping monthly refresh because the VM rebooted less than one hour ago"
      exit 0
    fi
    ;;
  *)
    log "Unknown maintenance mode: $MODE"
    exit 2
    ;;
esac

if ! systemctl is-active --quiet pm2-ubuntu.service \
  || ! systemctl is-active --quiet nginx.service; then
  log "Skipping scheduled reboot because a required service is already unhealthy"
  exit 1
fi

sudo -u ubuntu env PM2_HOME="$PM2_HOME" /usr/bin/pm2 save >/dev/null
sync
log "Starting a controlled $MODE reboot"
systemctl reboot
