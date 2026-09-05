# Oracle VPS deployment notes

This project is intended to run as a long-lived Node.js process on an Oracle VPS.

## SQLite deployment model

SQLite is embedded through the Node.js dependency `better-sqlite3`. A separate SQLite server is not required.

Recommended production database path:

```bash
DB_FILE=/var/lib/line-discord-bridge/bridge.sqlite3
```

Keep the database outside the Git checkout so normal source updates do not replace or delete persistent data.

Example layout:

```text
/opt/line-discord-bridge/               # Git checkout
/var/lib/line-discord-bridge/           # Persistent runtime data
  bridge.sqlite3
  bridge.sqlite3-wal
  bridge.sqlite3-shm
```

## First deployment with SQLite

From the repository directory:

```bash
git pull
npm install
npm run migrate:json
npm test -- --runInBand
pm2 restart line-discord-bridge
```

`npm install` installs the embedded SQLite Node.js dependency. No separate SQLite daemon is required.

The migration command imports existing `data/channel-mappings.json` records into the SQLite `conversations` table. It does not delete or rewrite the JSON source file, so rollback remains possible during the migration period.

## Normal updates after migration

```bash
git pull
npm install
npm test -- --runInBand
pm2 restart line-discord-bridge
```

The SQLite file remains outside the Git checkout and survives `git pull`.

## Directory permissions

The user running the Node.js / PM2 process must be able to create and modify files under the database directory.

Example:

```bash
sudo mkdir -p /var/lib/line-discord-bridge
sudo chown <app-user>:<app-group> /var/lib/line-discord-bridge
```

Replace `<app-user>` and `<app-group>` with the account that runs PM2.

## Backup

For the initial migration phase, retain the existing JSON mapping files as a rollback source. Do not commit SQLite database, WAL, or SHM files to Git.

Before a significant deployment, a simple filesystem copy can be made while the application is stopped. For online backups, use SQLite's backup API in a later operations phase rather than copying only the main `.sqlite3` file while WAL is active.

## Rollback during migration

The current migration is intentionally dual-track:

- existing channel JSON mappings continue to be used by `ChannelManager`;
- successful LINE conversations are mirrored into SQLite;
- `npm run migrate:json` can pre-populate SQLite from the existing JSON mapping file;
- the JSON file is not deleted by migration.

This allows the application to be rolled back to the previous release without losing the pre-existing channel mappings.
