# VM maintenance automation

This directory contains the production maintenance controls used by the
LINE-Discord bridge VM.

- Ubuntu security updates run daily through `unattended-upgrades`.
- Required reboots run in the Sunday 04:30 JST maintenance window.
- A monthly refresh reboot runs on the first Sunday at 04:45 JST.
- Interactive SSH sessions and active apt/dpkg operations postpone reboots.
- Local application, bridge readiness and nginx HTTPS checks run every five
  minutes. PM2 is restarted only after two consecutive failures.
- PM2 and systemd memory limits protect the 1 GB VM, with a 1 GB swap file as
  an emergency buffer.
- journald is capped at 256 MB and 14 days.

Install from the repository checkout on the VM:

```bash
sudo ./ops/maintenance/install.sh
```

Review schedules with:

```bash
systemctl list-timers 'line-bridge-*'
```

The installer writes timestamped backups under
`/var/backups/line-discord-bridge-maintenance/` before changing the system.
