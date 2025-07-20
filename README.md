# LINE-Discord Bridge

LINEとDiscord間でメッセージを転送するブリッジアプリケーションです。

## 機能

- LINEからDiscordへのメッセージ転送
- DiscordからLINEへのメッセージ転送
- **画像、動画、音声、ファイルの双方向転送**
- **URL埋め込み画像・動画の自動検出と転送**
- 自動的なDiscordチャンネル作成
- **永続的なチャンネルマッピング管理（再起動後も維持）**
- グループチャットとプライベートメッセージのサポート
- 詳細なログ機能
- エラーハンドリングとリトライ機能

## サポートするメディアタイプ

### LINE → Discord
- ✅ テキストメッセージ
- ✅ 画像（JPEG, PNG, GIF, WebP）
- ✅ 動画（MP4, MOV等）
- ✅ 音声メッセージ
- ✅ ファイル添付
- ✅ 位置情報
- ✅ スタンプ

### Discord → LINE
- ✅ テキストメッセージ
- ✅ 画像添付
- ✅ 動画添付
- ✅ 音声ファイル
- ✅ その他のファイル（URLとして送信）
- ✅ URL埋め込み画像・動画の自動検出

## アーキテクチャ

```
├── config.js              # アプリケーション設定
├── app.js                 # メインアプリケーション
├── index.js               # エントリーポイント
├── utils/
│   └── logger.js          # ログユーティリティ
├── services/
│   ├── channelManager.js  # Discordチャンネル管理
│   ├── lineService.js     # LINE API操作
│   ├── mediaService.js    # メディアファイル処理
│   └── messageBridge.js   # メッセージブリッジ
├── middleware/
│   └── lineWebhook.js     # LINE Webhookミドルウェア
└── routes/
    └── webhook.js         # Webhookルート
```

## セットアップ

### 前提条件

- Node.js 16.0.0以上
- LINE Bot API アカウント
- Discord Bot アカウント

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env`ファイルを作成し、以下の環境変数を設定してください：

```env
# LINE設定
LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token
LINE_CHANNEL_SECRET=your_line_channel_secret

# Discord設定
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_GUILD_ID=your_discord_guild_id

# サーバー設定
PORT=3000
NODE_ENV=development

# Render設定（無料プランでのスリープ対策）
RENDER_EXTERNAL_URL=https://your-app-name.onrender.com

# ログ設定（オプション）
LOG_LEVEL=info
```

### Render無料プランでのスリープ対策

Renderの無料プランでは、一定時間リクエストがないとサービスがスリープ状態になります。この対策として：

1. **Discord → LINE送信時の自動ウェイクアップ**
   - Discordでメッセージが送信されると、自動的にサーバーのヘルスチェックを実行
   - スリープ状態の場合は自動的にウェイクアップ（最大3回リトライ）
   - その後、LINEへのメッセージ送信を実行

2. **LINE → Discord送信時**
   - LINEのWebhookは失敗時に自動リトライされるため、2回目以降で成功することが多い

3. **推奨設定**
   - `RENDER_EXTERNAL_URL`環境変数を設定して、正確なURLでウェイクアップを実行
   - 重要な運用の場合は有料プランの利用を推奨

### 3. LINE Bot設定

1. [LINE Developers Console](https://developers.line.biz/)でボットを作成
2. Webhook URLを設定: `https://your-domain.com/webhook`
3. チャンネルアクセストークンとチャンネルシークレットを取得
4. **メディアメッセージの受信を有効化**

### 4. Discord Bot設定

1. [Discord Developer Portal](https://discord.com/developers/applications)でアプリケーションを作成
2. Botを作成し、必要な権限を付与：
   - Send Messages
   - Manage Channels
   - Read Message History
   - **Attach Files**（メディア送信用）
   - **Embed Links**（URL埋め込み用）
3. ボットトークンを取得
4. サーバーにボットを招待

### 5. アプリケーションの起動

```bash
# 本番環境
npm start

# 開発環境（ファイル変更時に自動再起動）
npm run dev
```

## API エンドポイント

### ヘルスチェック

```
GET /health
```

レスポンス例：
```json
{
  "status": "ok",
  "timestamp": "2023-12-01T12:00:00.000Z",
  "discord": "connected"
}
```

### チャンネルマッピング管理

```
GET /api/mappings
```

すべてのチャンネルマッピングと統計情報を取得します。

```
GET /api/mappings/stats
```

マッピング統計情報のみを取得します。

レスポンス例：
```json
{
  "mappings": [
    {
      "id": "mapping_1234567890_abc123",
      "lineChannelId": "U1234567890abcdef",
      "discordChannelId": "1234567890123456789",
      "name": "ユーザー名",
      "type": "user",
      "createdAt": "2025-07-20T18:00:00.000Z",
      "lastUsed": "2025-07-20T18:30:00.000Z"
    }
  ],
  "stats": {
    "total": 1,
    "userMappings": 1,
    "groupMappings": 0,
    "lastUpdated": "2025-07-20T18:30:00.000Z"
  }
}
```

### LINE Webhook

```
POST /webhook
```

LINEからのWebhookイベントを受信し、Discordに転送します。

## メディアファイル処理

### ファイルサイズ制限
- **LINE**: 10MB以下
- **Discord**: 25MB以下（無料プラン）、100MB以下（Nitro）

### サポート形式
- **画像**: JPEG, PNG, GIF, WebP, BMP
- **動画**: MP4, MOV, AVI, WMV, FLV, WebM
- **音声**: MP3, WAV, OGG, M4A
- **その他**: PDF, その他のファイル

### URL埋め込み機能
Discordで送信されたメッセージに含まれる画像・動画URLを自動検出し、LINEに画像・動画として送信します。

## ログレベル

- `error`: エラーログ
- `warn`: 警告ログ
- `info`: 情報ログ
- `debug`: デバッグログ

環境変数`LOG_LEVEL`で設定可能です。

## 開発

### コードスタイル

```bash
# リンター実行
npm run lint

# 自動修正
npm run lint:fix
```

### ディレクトリ構造

- `config.js`: アプリケーション設定と環境変数検証
- `services/`: ビジネスロジックを含むサービスクラス
- `middleware/`: Expressミドルウェア
- `routes/`: APIルート定義
- `utils/`: ユーティリティ関数

## トラブルシューティング

### よくある問題

1. **Discordボットが接続できない**
   - ボットトークンが正しいか確認
   - 必要な権限が付与されているか確認

2. **LINE Webhookが受信されない**
   - Webhook URLが正しく設定されているか確認
   - チャンネルシークレットが正しいか確認

3. **チャンネルが作成されない**
   - Discordボットにチャンネル管理権限があるか確認
   - ギルドIDが正しいか確認

4. **メディアファイルが転送されない**
   - ファイルサイズが制限内か確認
   - ファイル形式がサポートされているか確認
   - ネットワーク接続を確認

### ログの確認

アプリケーションログを確認して、エラーの詳細を把握してください：

```bash
# ログレベルをdebugに設定
LOG_LEVEL=debug npm start
```

## ライセンス

ISC License 