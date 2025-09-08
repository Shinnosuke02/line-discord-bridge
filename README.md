# LINE-Discord Bridge

[![Version](https://img.shields.io/badge/version-3.0.0-blue.svg)](https://github.com/Shinnosuke02/line-discord-bridge)
[![Node.js](https://img.shields.io/badge/node.js-%3E%3D18.0.0-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

高度なLINE-Discordブリッジアプリケーション。双方向メッセージング、返信機能、メディア処理、Webhook表示をサポートします。

## ✨ 特徴

- 🔄 **双方向メッセージング**: LINEとDiscord間の完全な双方向通信
- 💬 **返信機能**: DiscordとLINE間での返信機能サポート
- 📎 **メディア処理**: 画像、動画、音声、ファイル、ステッカーの自動処理
- 🎭 **Webhook対応**: Discord Webhookを使用した自然な表示（LINEユーザー名・アイコン）
- 📊 **メッセージマッピング**: 自動的なメッセージID管理
- 🏷️ **チャンネル管理**: 自動チャンネル作成・名前生成（日本語対応）
- 🔗 **既存チャンネル連携**: LINEノートからDiscordチャンネルIDを読み取り
- 🛡️ **セキュリティ**: 堅牢なエラーハンドリングとセキュリティ機能
- 📈 **監視**: 詳細なログとメトリクス
- ⚡ **高性能**: 非同期処理とバッチ処理

## 🚀 クイックスタート

### 前提条件

- Node.js 18.0.0以上
- npm 8.0.0以上
- LINE Bot API v7対応のチャンネル
- Discord Bot Token
- Discord Bot権限: `Send Messages`, `Manage Webhooks`, `Manage Channels`

### インストール

```bash
# リポジトリをクローン
git clone https://github.com/Shinnosuke02/line-discord-bridge.git
cd line-discord-bridge

# 依存関係をインストール
npm install

# 環境変数を設定
cp env.example .env
# .envファイルを編集して必要な値を設定
```

### 設定

`.env`ファイルで以下の環境変数を設定してください：

```env
# LINE Bot設定
LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token
LINE_CHANNEL_SECRET=your_line_channel_secret

# Discord Bot設定
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_GUILD_ID=your_discord_guild_id
DISCORD_CLIENT_ID=your_discord_client_id

# Webhook設定
WEBHOOK_ENABLED=true
WEBHOOK_NAME=LINE Bridge

# その他の設定
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
```

### 起動

```bash
# 開発モード
npm run dev

# 本番モード
npm start

# PM2で管理
npm run pm2:start
```

## 📁 プロジェクト構造

```
src/
├── app.js                 # メインアプリケーション
├── config/
│   ├── index.js          # メイン設定
│   └── fileProcessing.js # ファイル処理設定
├── services/
│   ├── MessageBridge.js  # メッセージブリッジ
│   ├── LineService.js    # LINE APIサービス
│   ├── DiscordService.js # Discord APIサービス
│   ├── MediaService.js   # メディア処理サービス
│   ├── ChannelManager.js # チャンネル管理
│   ├── WebhookManager.js # Webhook管理
│   ├── MessageMappingManager.js # メッセージマッピング
│   └── ReplyService.js   # 返信機能
├── middleware/
│   ├── errorHandler.js   # エラーハンドリング
│   ├── requestLogger.js  # リクエストログ
│   └── security.js       # セキュリティ
├── utils/
│   ├── logger.js         # ログ設定
│   └── fileUtils.js      # ファイルユーティリティ
└── routes/               # APIルート（将来の拡張用）

data/                     # データファイル
├── channel-mappings.json # チャンネルマッピング
├── message-mappings.json # メッセージマッピング
└── reply-mappings.json  # 返信マッピング

logs/                     # ログファイル
uploads/                  # アップロードファイル
temp/                     # 一時ファイル
```

## 🔧 機能詳細

### メッセージ転送

- **LINE → Discord**: テキスト、画像、動画、音声、ファイル、ステッカー、位置情報
- **Discord → LINE**: テキスト、画像、動画、音声、ファイル、ステッカー（画像として送信）

### Webhook表示機能

- **LINEユーザー名表示**: DiscordでLINEユーザーの表示名を表示
- **LINEアイコン表示**: DiscordでLINEプロフィール画像をアバターとして使用
- **グループ対応**: グループチャットではグループ名・アイコンを表示
- **自動フォールバック**: Webhook失敗時はBot送信に自動切り替え

### チャンネル管理

- **自動チャンネル作成**: LINEユーザー・グループごとにDiscordチャンネルを自動作成
- **日本語チャンネル名**: 日本語のユーザー名・グループ名に対応
- **動的チャンネル名更新**: グループ名変更時の自動更新
- **既存チャンネル連携**: LINEノートからDiscordチャンネルIDを読み取り

### 既存チャンネル連携

LINEアプリでユーザーのノート欄に以下の形式でDiscordチャンネルIDを記載すると、既存のDiscordチャンネルにメッセージが送信されます：

```
DISCORD:1408407519055052891
DC:1408407519055052891
Discord Channel: 1408407519055052891
```

### 返信機能

- **Discord返信**: Discordでメッセージに返信すると、LINE側に「↩️ 返信: [元メッセージ]」として送信
- **メッセージマッピング**: 自動的なメッセージID管理で返信関係を追跡

### メディア処理

- **自動MIME判定**: ファイル内容から正確なMIMEタイプを判定
- **サイズ制限**: 設定可能なファイルサイズ制限（デフォルト: 10MB）
- **画像圧縮**: Sharpを使用した画像の自動圧縮
- **ステッカー処理**: DiscordステッカーをLINE画像として送信
- **外部URL**: LINE Bot API v7の外部URL機能を活用

### ステッカー処理

- **LINE → Discord**: ステッカー画像のみ表示（ID表示なし）
- **Discord → LINE**: Discordステッカーを画像として送信

## 📊 監視とログ

### ヘルスチェック

```bash
curl http://localhost:3000/health
```

### メトリクス

```bash
curl http://localhost:3000/metrics
```

### ログレベル

環境変数`LOG_LEVEL`で設定可能：
- `error`: エラーのみ
- `warn`: 警告以上
- `info`: 情報以上（デフォルト）
- `debug`: デバッグ情報含む

### ログファイル

- `logs/application-YYYY-MM-DD.log`: アプリケーションログ
- `logs/error-YYYY-MM-DD.log`: エラーログ
- `logs/warn-YYYY-MM-DD.log`: 警告ログ

## 🛠️ 開発

### スクリプト

```bash
# 開発サーバー起動
npm run dev

# テスト実行
npm test
npm run test:watch

# リント
npm run lint
npm run lint:fix

# フォーマット
npm run format

# PM2管理
npm run pm2:start
npm run pm2:stop
npm run pm2:restart
npm run pm2:logs
npm run pm2:status
```

### テスト

```bash
# 全テスト実行
npm test

# ウォッチモード
npm run test:watch

# カバレッジ付き
npm test -- --coverage
```

## 🚀 デプロイ

### PM2を使用

```bash
# アプリケーション開始
npm run pm2:start

# 設定保存
pm2 save

# 自動起動設定
pm2 startup

# 再起動（環境変数更新）
pm2 restart line-discord-bridge --update-env
```

### 環境変数

本番環境では以下の環境変数を設定してください：

```env
NODE_ENV=production
LOG_LEVEL=info
WEBHOOK_ENABLED=true
```

## 🔒 セキュリティ

- **API認証**: ファイルアップロード用のAPIキー認証
- **レート制限**: 設定可能なレート制限
- **セキュリティヘッダー**: XSS、CSRF対策（Helmet使用）
- **入力検証**: ファイルタイプとサイズの検証
- **エラーハンドリング**: 詳細なエラー情報の制御
- **User-Agentフィルタ**: ボット攻撃の防止

## 📈 パフォーマンス

- **非同期処理**: 全処理が非同期で実行
- **バッチ処理**: メッセージのバッチ処理
- **メモリ管理**: 効率的なメモリ使用
- **エラー回復**: 自動リトライ機能
- **ファイル処理**: Sharpを使用した効率的な画像処理

## 🔧 トラブルシューティング

### よくある問題

1. **Webhookが動作しない**
   - `WEBHOOK_ENABLED=true`に設定されているか確認
   - Discord Botに`Manage Webhooks`権限があるか確認

2. **チャンネル名が日本語で表示されない**
   - `LOG_LEVEL=debug`に設定してログを確認
   - LINEユーザープロフィールが正しく取得できているか確認

3. **画像送信が失敗する**
   - ファイルサイズが制限内か確認（デフォルト: 10MB）
   - サポートされている形式か確認

4. **既存チャンネル連携が動作しない**
   - LINEノートの形式が正しいか確認
   - DiscordチャンネルIDが正しいか確認

### ログ確認

```bash
# リアルタイムログ
pm2 logs line-discord-bridge

# エラーログ確認
tail -f logs/error-$(date +%Y-%m-%d).log

# アプリケーションログ確認
tail -f logs/application-$(date +%Y-%m-%d).log
```

## 🤝 貢献

1. フォークしてください
2. フィーチャーブランチを作成してください (`git checkout -b feature/amazing-feature`)
3. 変更をコミットしてください (`git commit -m 'Add some amazing feature'`)
4. ブランチにプッシュしてください (`git push origin feature/amazing-feature`)
5. プルリクエストを作成してください

## 📝 ライセンス

このプロジェクトはMITライセンスの下で公開されています。詳細は[LICENSE](LICENSE)ファイルを参照してください。

## 🆘 サポート

問題が発生した場合：

1. [Issues](https://github.com/Shinnosuke02/line-discord-bridge/issues)で既存の問題を確認
2. 新しいIssueを作成
3. ログファイルを確認 (`logs/`ディレクトリ)

## 📚 技術仕様

### 使用技術

- **Node.js**: v18.0.0以上
- **Discord.js**: v14.14.1
- **LINE Bot SDK**: v7.5.2
- **Express**: v4.18.2
- **Sharp**: v0.33.0（画像処理）
- **Winston**: v3.11.0（ログ管理）
- **PM2**: プロセス管理

### API対応

- **LINE Bot API**: v7（最新）
- **Discord API**: v10（Discord.js v14経由）
- **Node.js**: v18+（最新LTS）

---

**注意**: このアプリケーションはLINE Bot API v7とDiscord.js v14を使用しています。古いバージョンとの互換性は保証されません。