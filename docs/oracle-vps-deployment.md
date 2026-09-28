# Oracle VPS deployment

本番はOracle VPS上のNode.js + PM2 + embedded SQLiteで稼働します。Render前提ではありません。

## Requirements

v3.2:

```text
Node.js >= 24.17.0
npm >= 10
PM2
```

更新前に必ず確認してください。

```bash
node --version
npm --version
pm2 status
```

Node 20系のままv3.2を起動しないでください。Node 24 LTSへ更新してから `npm ci` を実行します。

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
git pull origin main
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
curl -fsS http://127.0.0.1:3000/ready
npm run db:status
```

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

```bash
pm2 status
pm2 save
```
