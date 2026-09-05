# Oracle VPS deployment notes

This project is intended to run as a long-lived Node.js process on an Oracle VPS.

## SQLite deployment model

SQLite is embedded through the Node.js dependency `better-sqlite3`. A separate SQLite server or daemon is not required.

Recommended production settings:

```bash
DB_TYPE=sqlite
DB_FILE=/var/lib/line-discord-bridge/bridge.sqlite3
DB_BACKUP_PATH=/var/lib/line-discord-bridge/backups
```

Keep the database outside the Git checkout so normal source updates do not replace or delete persistent data.

Example layout:

```text
/opt/line-discord-bridge/               # Git checkout
/var/lib/line-discord-bridge/           # Persistent runtime data
  bridge.sqlite3
  bridge.sqlite3-wal
  bridge.sqlite3-shm
  backups/
```

## One-time directory preparation

The user running Node.js / PM2 must be able to create and modify files under the persistent directory.

```bash
sudo mkdir -p /var/lib/line-discord-bridge/backups
sudo chown -R <app-user>:<app-group> /var/lib/line-discord-bridge
```

Replace `<app-user>` and `<app-group>` with the account that runs PM2.

## First deployment with SQLite

Before changing `DB_TYPE`, retain a copy of the existing `data/*.json` files. Then set the production environment variables shown above and run from the repository directory:

```bash
git pull
npm ci
npm run migrate:json
npm run db:status
npm test -- --runInBand
npm run db:backup
pm2 restart line-discord-bridge --update-env
```

`npm ci` installs `better-sqlite3` from `package-lock.json`; no separate SQLite service is required.

`npm run migrate:json` imports existing `data/channel-mappings.json` records into the SQLite `conversations` table. It is idempotent because the repository upserts by LINE source ID. It does not delete or rewrite the source JSON file.

When `DB_TYPE=sqlite`, `PersistentChannelManager` loads channel mappings from SQLite on restart and continues writing the JSON mapping file as a rollback mirror during the migration period.

## Normal updates after migration

```bash
npm run db:backup
git pull
npm ci
npm test -- --runInBand
npm run db:status
pm2 restart line-discord-bridge --update-env
```

The SQLite file remains outside the Git checkout and survives `git pull`, `npm ci`, and PM2 restarts.

## Health and logs after restart

Check PM2 and the application health endpoint after every deployment:

```bash
pm2 status
pm2 logs line-discord-bridge --lines 100
curl -fsS http://127.0.0.1:3000/health
```

Adjust the local port if `PORT` is not 3000.

## Backup

`npm run db:backup` uses SQLite's backup API through `better-sqlite3`, so it is safe while WAL mode is active. It creates a timestamped `.sqlite3` file under `DB_BACKUP_PATH` (or a `backups` directory beside the database when that variable is omitted).

`npm run db:status` performs `PRAGMA quick_check`, reports WAL mode, and prints row counts for the core SQLite tables. Both commands fail rather than silently creating a new database when `DB_FILE` is missing.

Do not make a live backup by copying only `bridge.sqlite3` while WAL mode is active.

## Rollback during migration

The migration deliberately keeps the old JSON channel mapping file available. To return temporarily to the legacy mapping backend:

```bash
# set in the PM2/environment configuration
DB_TYPE=file
pm2 restart line-discord-bridge --update-env
```

The durable webhook inbox continues to use the embedded SQLite file, while the channel mapping backend can use the retained JSON file. Do not delete the JSON files until the SQLite deployment has been observed in production and a backup/recovery test has succeeded.
