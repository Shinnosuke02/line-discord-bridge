# Oracle VPS deployment

本番はOracle VPS上のNode.js + PM2 + embedded SQLiteで稼働します。Render前提ではありません。

## Verified production baseline

2026-09-28の実機確認値:

```text
application 3.2.0
Node.js     24.21.0
npm         11.19.0
PM2         6.0.8
SQLite      WAL / quick_check=ok
```

`/health` は `healthy`、`/ready` は `ready`（SQLite / Discord ready、durable queue 0）を確認済みです。

## Requirements

v3.2:

```text
Node.js >= 24.17.0
npm >= 10
PM2
build-essential (make / g++)
Python 3 (node-gyp用)
```

更新前に必ず確認してください。

```bash
node --version
npm --version
pm2 status
```

Node 20系のままv3.2を起動しないでください。Node 24 LTSへ更新してから `npm ci` を実行します。

Oracleのminimal Ubuntuでは `better-sqlite3` のprebuilt binaryが使われず `node-gyp rebuild` に入る場合があります。`npm ci` が `Error: not found: make` で失敗した場合は、先に次を入れてください。

```bash
sudo apt-get update
sudo apt-get install -y build-essential
```

Node major update直後は、PM2が古いNode ABI向けの `node_modules` を使って既存プロセスを復帰させようとし、restart loopになることがあります。Node更新後は必ず `npm ci` でnative moduleを再構築してから本番起動します。

## Layout

実運用checkout:

```text
/home/ubuntu/line-discord-bridge
```

永続データ:

```text
/var/lib/line-discord-bridge/
  bridge.sqlite3
  bridge.sqlite3-wal
  bridge.sqlite3-shm
  backups/
```

SQLiteは `better-sqlite3` によるembedded DBで、別daemonは不要です。

## Environment

```env
NODE_ENV=production
DB_TYPE=sqlite
DB_FILE=/var/lib/line-discord-bridge/bridge.sqlite3
DB_BACKUP_PATH=/var/lib/line-discord-bridge/backups
```

必要に応じて:

```env
LINE_MARK_AS_READ_ON_DISCORD_DELIVERY=false
```

## Safe Node major upgrade

Node 20 → 24のようなmajor updateでは、通常のアプリ更新より慎重に進めます。

```bash
cd /home/ubuntu/line-discord-bridge
npm run db:backup
pm2 stop line-discord-bridge

sudo apt-get update
sudo apt-get install -y build-essential
# NodeSource等でNode 24 LTSへ更新

node --version
npm --version
npm ci
npm test -- --runInBand
npm run lint
npm run db:status

pm2 restart line-discord-bridge --update-env
sleep 5
pm2 status
curl -fsS http://127.0.0.1:3000/health
echo
curl -fsS http://127.0.0.1:3000/ready
echo
pm2 save
```

`npm ci` / test / lint / `db:status` のいずれかが失敗した場合はPM2を再開せず、その原因を解消してから進めます。

## Persistent directory

```bash
sudo mkdir -p /var/lib/line-discord-bridge/backups
sudo chown -R ubuntu:ubuntu /var/lib/line-discord-bridge
```

PM2を別ユーザーで動かす場合は所有者を合わせてください。

## First SQLite migration

```bash
cd /home/ubuntu/line-discord-bridge
npm ci
npm run migrate:json
npm run db:status
npm test -- --runInBand
npm run db:backup
pm2 restart line-discord-bridge --update-env
```

channel mappingの元JSONは削除しません。

Phase 2では `message_links` schemaが起動時に安全に拡張され、SQLite側にmessage linkがまだ無ければ既存 `data/message-mappings.json` が自動移行されます。

## v3.2 upgrade

本番反映前:

```bash
cd /home/ubuntu/line-discord-bridge
npm run db:backup
git pull --ff-only origin main
node --version
npm ci
npm test -- --runInBand
npm run lint
npm run db:status
pm2 restart line-discord-bridge --update-env
```

`node --version` が24.17.0未満なら、先にNode 24 LTSへ更新してください。

## Verify

```bash
pm2 status
curl -fsS http://127.0.0.1:3000/health
echo
curl -fsS http://127.0.0.1:3000/ready
echo
npm run db:status
pm2 save
```

期待する最低条件:

- PM2: `online` / app version `3.2.0`
- `/health`: `status=healthy` / `version=3.2.0`
- `/ready`: `status=ready` / `sqlite=ok` / `discord=ready`
- `db:status`: `ok=true` / `journalMode=wal` / `quickCheck=ok`

既存の `dead_letter` はreadiness failureではありません。一括retryは重複配送を起こしうるため、内容を確認せずに再投入しないでください。

本番詳細ログ:

```bash
tail -n 100 logs/application-$(date +%F).log
tail -n 100 logs/error-$(date +%F).log
```

## Backup

```bash
npm run db:backup
```

SQLite backup APIを使用するためWAL稼働中でも整合したbackupを作成できます。ライブ状態で `bridge.sqlite3` だけを直接コピーしないでください。

## Rollback

ソースを以前のcommitへ戻す前にもDB backupを取得します。

channel mappingをlegacy JSONへ切り戻す場合のみ:

```env
DB_TYPE=file
```

その後:

```bash
pm2 restart line-discord-bridge --update-env
```

注意: Phase 2でSQLite schemaは追加列を持ちます。追加列は旧コードから無視されるため、DBファイルを削除・ダウングレードする必要はありません。

## PM2

1 instanceを維持してください。SQLite / Discord Gatewayの現在設計は複数PM2 instance前提ではありません。

Node major updateやOS package更新でPM2のsystemd unitが自動再起動される場合があります。更新後は `pm2 status` と `/ready` を必ず確認してください。restart counterが増えていても、旧バージョンの過去restartが残っている場合があります。現在の安定性はstatus / uptime / health / ready / logで判断します。

```bash
pm2 status
pm2 save
```
