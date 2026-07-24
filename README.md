# LINE-Discord Bridge

[![Version](https://img.shields.io/badge/version-3.1.4-stable-green.svg)](https://github.com/Shinnosuke02/line-discord-bridge)
[![Node.js](https://img.shields.io/badge/node.js-%3E%3D18.0.0-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

LINE と Discord を双方向に接続するブリッジアプリケーションです。テキスト、メディア、ファイル、スタンプ、位置情報、返信コンテキストを扱い、Discord 側では LINE ユーザー名/アイコンを Webhook 表示できます。

> 重要: LINE に画像/動画などの外部 URL を渡す場合、`PUBLIC_BASE_URL` は公開 HTTPS URL を指定してください。未指定時はローカル URL へフォールバックしますが、LINE API からは通常アクセスできません。

## 主な機能

- LINE ⇄ Discord の双方向メッセージ転送
- Discord Webhook による LINE ユーザー名/アイコン表示
- LINE `quotedMessageId` と Discord reply reference の返信連携
- Discord → LINE 返信時の `replyToken` 優先送信と `quoteToken`/Push fallback
- 画像、動画、音声、ファイル、スタンプ、位置情報の処理
- HEIC/HEIF、APNG/WebP、画像圧縮/変換、プレビュー生成
- LINE ファイルメッセージのオリジナルファイル名維持
- LINE Webhook 署名検証
- ログ秘匿情報 redaction
- チャンネル/メッセージマッピングの JSON 永続化
- LINE Push 通数カウントの再起動耐性
- `/temp` 静的配信の運用ガード
- LINE個人/グループ別のDiscordカテゴリ自動割り当て
- Jest/ESLint による検証

## 前提条件

- Node.js 18.0.0 以上
- npm 8.0.0 以上
- LINE Messaging API チャンネル
- Discord Bot Token
- Discord Bot 権限: `Send Messages`, `Manage Webhooks`, `Manage Channels`, `Read Message History`

## セットアップ

```bash
git clone https://github.com/Shinnosuke02/line-discord-bridge.git
cd line-discord-bridge
npm install
cp env.example .env
```

`.env` に LINE / Discord の認証情報と公開 URL を設定します。

```env
LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token
LINE_CHANNEL_SECRET=your_line_channel_secret
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_GUILD_ID=your_discord_guild_id
DISCORD_CLIENT_ID=your_discord_client_id
# Discordカテゴリ設定（オプション）
DISCORD_CATEGORY_FRIENDS=your_friends_category_id
DISCORD_CATEGORY_GROUPS=your_groups_category_id
PUBLIC_BASE_URL=https://your-domain.example
NODE_ENV=production
PORT=3000
```

LINE Developers Console の Webhook URL は次のように設定します。

```text
https://your-domain.example/webhook
```

`LINE_WEBHOOK_PATH` を変更した場合は、そのパスに合わせてください。

## 起動

```bash
npm run dev      # 開発
npm start        # 本番相当
npm run pm2:start
```

## 環境変数

主要な設定は `env.example` を参照してください。特に運用上重要なものは以下です。

| 変数 | 既定値 | 説明 |
| --- | --- | --- |
| `LINE_CHANNEL_ACCESS_TOKEN` | なし | LINEチャネルアクセストークン |
| `LINE_CHANNEL_SECRET` | なし | LINE署名検証に使うチャネルシークレット |
| `LINE_WEBHOOK_PATH` | `/webhook` | LINE Webhook受信パス |
| `DISCORD_BOT_TOKEN` | なし | Discord Bot Token |
| `DISCORD_GUILD_ID` | なし | チャンネル作成先Guild |
| `DISCORD_CLIENT_ID` | なし | Discord Application Client ID |
| `DISCORD_CATEGORY_FRIENDS` | なし | LINE個人ユーザー用Discordカテゴリ |
| `DISCORD_CATEGORY_GROUPS` | なし | LINEグループ用Discordカテゴリ |
| `PUBLIC_BASE_URL` | 空 | LINEからアクセス可能な公開HTTPS URL |
| `WEBHOOK_ENABLED` | `false`相当 | Discord Webhook表示を使う場合は `true` |
| `BRIDGE_REPLY_ENABLED` | `true` | 返信ブリッジ有効/無効 |
| `LINE_TO_DISCORD_REPLY_MODE` | `webhook` | `webhook` または `bot-reply` |
| `BRIDGE_REACTION_ENABLED` | `false` | 反応ブリッジ。LINE側制約により既定無効 |
| `LINE_SIGNATURE_VALIDATION_ENABLED` | `true` | LINE署名検証。緊急回避時のみ `false` |
| `TEMP_STATIC_ENABLED` | `true` | `/temp` 静的配信。止める場合は `false` |
| `TEMP_PATH` | `./temp` | 自己ホスト用一時ファイル保存先 |
| `UPLOAD_PATH` | `./uploads` | アップロード保存先 |
| `LINE_ADMIN_USER_IDS` | 空 | LINE使用量アラート送信先 |
| `MESSAGE_BATCH_TIMEOUT` | `120000` | Discord→LINEバッチ送信待機時間 |
| `MESSAGE_BATCH_MAX_SIZE` | `10` | バッチ最大件数 |

## プロジェクト構造

```text
src/
├── app.js
├── config/index.js
├── features/
│   ├── BridgeFeatureManager.js
│   ├── ReplyBridgeFeature.js
│   └── ReactionBridgeFeature.js
├── middleware/
│   ├── lineLimitHandler.js
│   ├── lineSignature.js
│   ├── requestLogger.js
│   └── security.js
├── services/
│   ├── ChannelManager.js
│   ├── DiscordService.js
│   ├── LineSendSession.js
│   ├── LineService.js
│   ├── LineUsageMonitor.js
│   ├── MediaService.js
│   ├── MessageBridge.js
│   ├── MessageMappingManager.js
│   ├── ReplyTokenPolicy.js
│   └── WebhookManager.js
└── utils/
    ├── jsonFileStore.js
    ├── logger.js
    ├── logRedaction.js
    └── messageBatcher.js

data/
├── channel-mappings.json
├── message-mappings.json
└── line-usage.json
```

`data/*.json`, `temp/`, `uploads/`, `logs/` は runtime data です。既存運用データを削除せず、バックアップ対象として扱ってください。

## 返信ブリッジ

### LINE → Discord

LINE の返信イベントに `quotedMessageId` がある場合、保存済みマッピングから Discord メッセージIDを解決し、Discord 側の返信として送信します。

`LINE_TO_DISCORD_REPLY_MODE` で送信方式を選べます。

- `webhook`: LINEユーザー名/アイコン表示を優先
- `bot-reply`: Discord Bot のネイティブ reply 表示を優先

### Discord → LINE

Discordで LINE由来メッセージに標準返信した場合、保存済み LINE コンテキストを使います。

優先順:

1. `replyToken` が未使用かつ期限内なら `replyMessage`
2. `replyToken` が使えない場合は `quoteToken` 付き `pushMessage`
3. どちらもない場合は通常の `pushMessage`

`replyToken` は LINE の制約で短時間かつ1回のみ有効です。失敗時も既存運用を止めないため Push fallback を維持しています。

## メディアとファイル名

- LINE `file` メッセージは Webhook payload の `fileName` を Discord 添付名にも維持します。
- 日本語などの Unicode ファイル名は保持します。
- パス区切り、制御文字、Discord添付名として危険な文字のみ置換/除去します。
- LINE の `image` / `video` / `audio` メッセージには元ファイル名が含まれないため、`image_<messageId>.ext` などの生成名になります。
- HEIC/HEIF は JPEG へ変換します。
- LINEへ画像/動画を送る際、必要に応じて `TEMP_PATH` に一時ファイルを置き、`PUBLIC_BASE_URL/temp/...` として参照させます。

## セキュリティ

- LINE Webhook署名検証を既定で有効化
- Helmet によるセキュリティヘッダー
- レート制限/CORS設定
- ログ出力時のトークン・シークレット・raw body redaction
- `/temp` 配信は `dotfiles: deny`, `index: false`, `redirect: false`, `nosniff`, 短時間キャッシュを設定
- 緊急時は `LINE_SIGNATURE_VALIDATION_ENABLED=false` または `TEMP_STATIC_ENABLED=false` で個別に切り戻し可能

## 永続化

現在はファイルベースのJSON永続化です。

- `data/channel-mappings.json`: LINE source ID と Discord channel ID の対応
- `data/message-mappings.json`: LINE/DiscordメッセージID、replyToken/quoteToken の対応
- `data/line-usage.json`: LINE Push 通数カウント

JSON保存は一時ファイルへの書き込み後に rename する atomic 保存を使います。

## 監視

```bash
curl http://localhost:3000/health
curl http://localhost:3000/metrics
```

ログ:

- `logs/application-YYYY-MM-DD.log`
- `logs/error-YYYY-MM-DD.log`
- `logs/warn-YYYY-MM-DD.log`

## 開発

```bash
npm test
npm run test:watch
npm run lint
npm run lint:fix
```

現在の主要テスト対象:

- App / Webhook署名検証
- MessageBridge / replyToken送信
- ReplyBridgeFeature / ReplyTokenPolicy
- MessageMappingManager / ChannelManager
- MediaService / LINEファイル名維持 / スタンプ / 形式変換
- LineLimitHandler / LINE通数永続化
- logRedaction / jsonFileStore

## 運用メモ

- `PUBLIC_BASE_URL` は本番で必ず HTTPS の外部到達可能URLにしてください。
- `LINE_SIGNATURE_VALIDATION_ENABLED=false` は緊急回避用です。恒久運用では有効化してください。
- `TEMP_STATIC_ENABLED=false` にすると、自己ホストURL経由のLINEメディア送信が失敗する可能性があります。
- LINE管理画面や別システムから送ったPush通数は、このアプリの `data/line-usage.json` には自動反映されません。
- `npm audit --omit=dev` には breaking change が必要な残存警告があります。`npm audit fix --force` は Discord/LINE SDK 互換に影響し得るため、別検証単位で扱ってください。

## 既知の制限

- LINE `image` / `video` / `audio` の元ファイル名はLINE webhookに含まれないため復元できません。
- Discord → LINE のネイティブ返信は `replyToken` の期限内のみ成立します。期限切れ時は `quoteToken` または通常Pushへフォールバックします。
- リアクション相互通信は LINE Messaging API 側の制約が大きいため既定では無効です。
- Discord/LINE API のレート制限や月間Push制限は外部要因として残ります。

## トラブルシューティング

### Webhookが401になる

- `LINE_CHANNEL_SECRET` がLINE Developers Consoleの値と一致しているか確認
- リバースプロキシでbodyが改変されていないか確認
- 緊急回避は `LINE_SIGNATURE_VALIDATION_ENABLED=false`

### LINEへの画像/動画送信が失敗する

- `PUBLIC_BASE_URL` が公開HTTPS URLか確認
- `/temp/...` に外部からアクセスできるか確認
- `TEMP_STATIC_ENABLED=true` か確認

### DiscordでLINEファイル名が維持されない

- LINEで「ファイル」として送られているか確認
- 画像/動画/音声として送られた場合、LINE payloadに元ファイル名がないため生成名になります

### LINE通数カウントが実際の管理画面とずれる

- このアプリ経由のPush送信のみを `data/line-usage.json` に記録します
- LINE管理画面や別プロセスからの送信は別途確認してください

## ライセンス

MIT
