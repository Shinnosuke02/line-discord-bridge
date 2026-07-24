#!/usr/bin/env bash
set -euo pipefail

if (( EUID != 0 )); then
  exec sudo -- "$0" "$@"
fi

readonly SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly APP_DIR=/home/ubuntu/line-discord-bridge
readonly ECOSYSTEM_SOURCE="${1:-}"
readonly BACKUP_ROOT=/var/backups/line-discord-bridge-maintenance
readonly BACKUP_DIR="${BACKUP_ROOT}/$(date -u +%Y%m%dT%H%M%SZ)"

install -d -m 0700 "$BACKUP_DIR"

backup_if_present() {
  local source="$1"
  if [[ -e "$source" ]]; then
    cp -a --parents "$source" "$BACKUP_DIR"
  fi
}

backup_if_present /etc/fstab
backup_if_present /etc/apt/apt.conf.d/20auto-upgrades
backup_if_present /etc/apt/apt.conf.d/50unattended-upgrades
backup_if_present /etc/apt/apt.conf.d/52-line-bridge-unattended-upgrades
backup_if_present /etc/systemd/journald.conf
backup_if_present /etc/systemd/journald.conf.d/99-line-bridge.conf
backup_if_present /etc/systemd/system/pm2-ubuntu.service
backup_if_present /etc/systemd/system/pm2-ubuntu.service.d/override.conf
backup_if_present /etc/sysctl.d/99-line-bridge-memory.conf
backup_if_present "$APP_DIR/.env"
backup_if_present "$APP_DIR/ecosystem.config.js"

if [[ -n "$ECOSYSTEM_SOURCE" ]]; then
  install -m 0644 "$ECOSYSTEM_SOURCE" "$APP_DIR/ecosystem.config.js"
  chown ubuntu:ubuntu "$APP_DIR/ecosystem.config.js"
fi

if ! swapon --show=NAME --noheadings | grep -qx '/swapfile'; then
  if [[ ! -e /swapfile ]]; then
    fallocate -l 1G /swapfile
    chmod 0600 /swapfile
    mkswap /swapfile >/dev/null
  fi
  swapon /swapfile
fi

if ! grep -qE '^/swapfile[[:space:]]' /etc/fstab; then
  printf '/swapfile none swap sw 0 0\n' >> /etc/fstab
fi

install -D -m 0644 "$SOURCE_DIR/99-line-bridge-memory.conf" \
  /etc/sysctl.d/99-line-bridge-memory.conf
sysctl --system >/dev/null

install -D -m 0644 "$SOURCE_DIR/52-line-bridge-unattended-upgrades" \
  /etc/apt/apt.conf.d/52-line-bridge-unattended-upgrades
install -D -m 0644 "$SOURCE_DIR/99-line-bridge-journald.conf" \
  /etc/systemd/journald.conf.d/99-line-bridge.conf
install -D -m 0644 "$SOURCE_DIR/pm2-ubuntu-override.conf" \
  /etc/systemd/system/pm2-ubuntu.service.d/override.conf

install -m 0755 "$SOURCE_DIR/line-bridge-healthcheck.sh" \
  /usr/local/sbin/line-bridge-healthcheck
install -m 0755 "$SOURCE_DIR/line-bridge-maintenance-reboot.sh" \
  /usr/local/sbin/line-bridge-maintenance-reboot

for unit in \
  line-bridge-healthcheck.service \
  line-bridge-healthcheck.timer \
  line-bridge-security-reboot.service \
  line-bridge-security-reboot.timer \
  line-bridge-refresh-reboot.service \
  line-bridge-refresh-reboot.timer; do
  install -m 0644 "$SOURCE_DIR/$unit" "/etc/systemd/system/$unit"
done

if grep -qE '^LOG_LEVEL=' "$APP_DIR/.env"; then
  sed -i -E 's/^LOG_LEVEL=.*/LOG_LEVEL=info/' "$APP_DIR/.env"
else
  printf '\nLOG_LEVEL=info\n' >> "$APP_DIR/.env"
fi

systemctl daemon-reload
systemctl restart systemd-journald.service
journalctl --rotate
journalctl --vacuum-time=14d --vacuum-size=256M >/dev/null

systemctl enable --now \
  line-bridge-healthcheck.timer \
  line-bridge-security-reboot.timer \
  line-bridge-refresh-reboot.timer

sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 \
  /usr/bin/pm2 startOrReload "$APP_DIR/ecosystem.config.js" --env production
sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 /usr/bin/pm2 save

sleep 3
/usr/local/sbin/line-bridge-healthcheck

printf 'Backup: %s\n' "$BACKUP_DIR"
printf 'Maintenance installation completed successfully.\n'
