# LINE-Discord Bridge

[![Version](https://img.shields.io/badge/version-3.2.0-blue.svg)](https://github.com/Shinnosuke02/line-discord-bridge)
[![Node.js](https://img.shields.io/badge/node.js-%3E%3D24.17.0-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

LINE Messaging API と Discord を双方向に接続する常駐ブリッジです。Oracle VPS + PM2 + SQLite を本番構成とし、LINEの1:1トーク・グループ・ルームをDiscordチャンネルへ永続的に対応付けます。

## v3.2 Phase 2

v3.2ではPhase 1のdurable delivery基盤を維持しつつ、2026年時点のLINE / Discord APIへ追従しています。

- Node.js 24.17+ / discord.js 14.27
- `@line/bot-sdk` 11.2 `LineBotClient`
- LINE push送信の `X-Line-Retry-Key` 対応
- SQLite `message_links` をメッセージ対応のauthoritative storeへ移行
- 1 Discord message → N LINE messages のmapping
- LINEグループトークの `messageEdited` → Discordメッセージ編集
- LINE `unsend` → Discordメッセージ削除
- group / room / user のLINE source ID統一
- Webhook/Bot投稿のDiscord mention抑止
- Webhook retryのbackoff / dead-letter
- `/health` と `/ready` の分離
- オプションのLINE mark-as-read
- Discord→LINEの一般ファイルを、無効な `file` messageではなくURLテキストとして送信
- MessageBatcherを配送経路から廃止

## 動作モデル

LINE → Discord:

```text
LINE Webhook
  ↓
署名検証
  ↓
SQLite webhook_eventsへ永続化
  ↓
HTTP 200 Fast ACK
  ↓
conversation queue
  ↓
MessageBridge
  ↓
Discord Webhook / Bot
```

同じ `webhookEventId` はSQLite PRIMARY KEYで重複排除します。一時失敗はbackoffして再試行し、上限到達後は `dead_letter` になります。

Discord → LINE:

```text
Discord message
  ↓
text / attachment / stickerを個別処理
  ↓
LINE reply または push
  ↓
message_linksへ全child messageを1:N記録
```

## 対応内容

### LINE → Discord

- text
- image / video / audio / file
- sticker
- location
- LINE表示名・アイコンをDiscord Webhookへ反映
- LINE絵文字はWebhookの `message.emojis` metadataを使って、既知の意味を近いUnicode絵文字へ変換（未知の絵文字は代替テキストを保持）
- reply
- `messageEdited`（LINE公式アカウントを含むグループトークのみ）
- `unsend`（1対1 / グループ / 複数人トーク）
- 削除済みDiscordチャンネルの自動再生成

### Discord → LINE

- text
- image
- 条件を満たすvideo / audio
- location
- sticker
- 一般ファイルはダウンロードURLとして送信
- replyToken → quoteToken push →通常push のfallback

LINE Messaging APIはBotから任意の一般ファイルを `type: file` として送信できないため、PDF / Word / ZIP等はURLメッセージに変換します。

## 前提条件

- Node.js 24.17.0以上
- npm 10以上
- LINE Messaging API channel
- Discord Bot
- Discord Guild ID
- Discord Developer PortalでMESSAGE CONTENT INTENTを有効化

Discord Botには少なくとも以下の権限が必要です。

- View Channels
- Send Messages
- Manage Channels
- Read Message History
- Manage Webhooks
- Attach Files
- Embed Links

## セットアップ

```bash
git clone https://github.com/Shinnosuke02/line-discord-bridge.git
cd line-discord-bridge
npm ci
cp .env.example .env
```

最低限:

```env
LINE_CHANNEL_SECRET=...
LINE_CHANNEL_ACCESS_TOKEN=...
DISCORD_BOT_TOKEN=...
DISCORD_GUILD_ID=...
WEBHOOK_ENABLED=true
```

LINE Developers ConsoleのWebhook URL:

```text
https://your-domain.example/webhook
```

## Oracle VPS本番設定

SQLiteファイルはGit checkout外へ置きます。

```env
NODE_ENV=production
DB_TYPE=sqlite
DB_FILE=/var/lib/line-discord-bridge/bridge.sqlite3
DB_BACKUP_PATH=/var/lib/line-discord-bridge/backups
```

現在の実運用checkout例:

```text
/home/ubuntu/line-discord-bridge
```

永続DB:

```text
/var/lib/line-discord-bridge/bridge.sqlite3
```

詳細は [docs/oracle-vps-deployment.md](docs/oracle-vps-deployment.md) を参照してください。

## JSON → SQLite

初回移行:

```bash
npm run migrate:json
npm run db:status
npm run db:backup
```

既存JSONは削除しません。channel mappingはrollback mirrorを継続します。Phase 2では既存 `data/message-mappings.json` も、SQLiteの `message_links` が空の場合に自動移行されます。

## 起動 / 再起動

開発:

```bash
npm run dev
```

本番:

```bash
npm run pm2:start
```

環境変数変更後:

```bash
pm2 restart line-discord-bridge --update-env
```

本番PM2プロセスがある環境では `npm restart` を使用しません。

## 更新手順

```bash
npm run db:backup
git pull origin main
npm ci
npm test -- --runInBand
npm run lint
npm run db:status
pm2 restart line-discord-bridge --update-env
```

その後:

```bash
pm2 status
curl -fsS http://127.0.0.1:3000/health
curl -fsS http://127.0.0.1:3000/ready
```

## Health / Readiness

`/health` はNodeプロセスの生存確認です。

```bash
curl -fsS http://127.0.0.1:3000/health
```

`/ready` は以下を確認します。

- SQLite `PRAGMA quick_check`
- Discord / MessageBridge初期化
- durable queue status

```bash
curl -fsS http://127.0.0.1:3000/ready
```

## SQLite

主要テーブル:

- `conversations`: LINE source ↔ Discord channel
- `webhook_events`: durable LINE webhook inbox
- `message_links`: LINE ↔ Discord message lifecycle / 1:N mapping

```bash
npm run db:status
npm run db:backup
```

WALモードで稼働します。ライブDBを `cp bridge.sqlite3` だけでバックアップしないでください。

## Retry / Dead letter

Webhook処理失敗時は概ね以下のbackoffを使用します。

```text
1s → 5s → 30s → 2m → 10m → dead_letter
```

LINE pushは最初の送信から同じretry keyを使用し、timeout / 5xx再送時の二重送信を抑制します。reply messageはretry key対象ではないため、曖昧なネットワーク失敗を自動再送しません。

## Reply / Edit / Unsend

LINE → Discord返信は保存済みmappingから返信先Discord messageを解決します。

Discord → LINE:

1. 有効なreplyTokenがあればreply
2. quoteTokenがあればquote付きpush
3. 通常push

LINEのtext message editは、LINE公式アカウントを含むグループトークでのみWebhookが届くため、その範囲で対応するDiscord messageを編集します。1対1トークと複数人トークでは `messageEdited` イベント自体が送られません。LINE unsendは1対1 / グループ / 複数人トークで対応するDiscord messageを削除します。

## Mark as read

Discordへの配送成功後にLINEを既読化する場合のみ有効化します。

```env
LINE_MARK_AS_READ_ON_DISCORD_DELIVERY=true
```

既定は `false` です。

## LINE絵文字

LINE独自絵文字はDiscordではネイティブ表示できません。受信Webhookの `message.emojis` に含まれるUTF-16位置情報と `productId` / `emojiId` を使い、既知の絵文字は意味が近いUnicode絵文字へ置換します。たとえばLINE側の代替テキスト `（ありがとう）` / `(thank you)` は `🙏` としてDiscordへ転送します。未知の絵文字は意味を失わないようLINEの代替テキストをそのまま残します。通常のUnicode絵文字についてはZWJ・variation selectorを保持して複合絵文字を壊さないようにしています。

完全なLINE絵文字画像の再現は行いません。LINE独自画像をDiscordのカスタム絵文字として動的登録する方式は、追加権限・絵文字枠・画像配布URLへの依存が必要になるため採用していません。

## メディア

- JPEG / PNGはLINE imageとして送信可能
- videoは有効なHTTPS preview imageがある場合のみnative video送信
- audioは正確なdurationを取得できる場合のみnative audio送信
- PDF / Word / ZIP等はURLテキスト
- LINEから受けたfile messageはDiscord添付として扱い、元ファイル名がある場合は維持
- HEIC/HEIF等は既存変換処理を利用

## セキュリティ

- LINE署名検証
- Helmet
- token / secret / raw bodyのlog redaction
- LINE Webhookを汎用rate limiterから除外
- Discord Webhook/Bot投稿で `allowedMentions.parse=[]`
- 自動生成チャンネルはcategory/server権限を継承
- channel topicにLINE source IDを保存しない
- `/upload` endpointはPhase 2で削除

## CI

GitHub ActionsではNode 24.17で以下を実行します。

- `npm ci`
- Jest
- ESLint
- SQLite status / backup smoke test

```bash
npm test -- --runInBand
npm run lint
```

## ログ

本番ではWinstonのファイルログを確認します。

- `logs/application-YYYY-MM-DD.log`
- `logs/error-YYYY-MM-DD.log`
- `logs/warn-YYYY-MM-DD.log`

```bash
tail -n 100 logs/application-$(date +%F).log
```

## Rollback

channel mappingだけlegacy JSONへ戻す場合:

```env
DB_TYPE=file
```

```bash
pm2 restart line-discord-bridge --update-env
```

durable webhook inboxはSQLiteを使用し続けます。DBやJSONを削除しないでください。

## 今後

Phase 3以降:

- MediaServiceのstreaming化 / 分割
- 大容量メディア処理のメモリ削減
- 管理用Discord slash commands
- dead-letterの管理UI/CLI強化
- LINE usage APIとの照合
- より詳細なobservability

改善計画は [docs/improvement-plan.md](docs/improvement-plan.md) を参照してください。

## License

MIT
