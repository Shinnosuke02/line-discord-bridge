# LINE-Discord Bridge

[![Version](https://img.shields.io/badge/version-3.1.0-stable-green.svg)](https://github.com/Shinnosuke02/line-discord-bridge)
[![Node.js](https://img.shields.io/badge/node.js-%3E%3D18.0.0-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-stable-brightgreen.svg)](https://github.com/Shinnosuke02/line-discord-bridge)

**Version 3.1.0** - 本格運用対応のLINE-Discordブリッジアプリケーション。双方向メッセージング、メディア処理、Webhook表示、位置情報共有をサポートします。

## ✨ 特徴

- 🔄 **双方向メッセージング**: LINEとDiscord間の完全な双方向通信
- 📎 **メディア処理**: 画像、動画、音声、ファイル、ステッカーの自動処理
- 🎭 **Webhook対応**: Discord Webhookを使用した自然な表示（LINEユーザー名・アイコン）
- 📍 **位置情報共有**: Googleマップリンク付きの位置情報共有
- 📊 **メッセージマッピング**: 自動的なメッセージID管理
- 🏷️ **チャンネル管理**: 自動チャンネル作成・名前生成（日本語対応）
- 😊 **絵文字処理**: UTF-8エンコーディング問題の解決
- 🛡️ **セキュリティ**: 堅牢なエラーハンドリングとセキュリティ機能
- 📈 **監視**: 詳細なログとメトリクス
- ⚡ **高性能**: 非同期処理とバッチ処理
- 🧹 **自動クリンナップ**: 一時ファイルの自動削除機能
- 🧪 **包括的テスト**: 主要機能のテストスイート完備

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
- **Discord → LINE**: テキスト、画像、動画、音声、ファイル、ステッカー（画像として送信）、位置情報（Googleマップリンク検出）

### Webhook表示機能

- **LINEユーザー名表示**: DiscordでLINEユーザーの表示名を表示
- **LINEアイコン表示**: DiscordでLINEプロフィール画像をアバターとして使用
- **グループ対応**: グループチャットではグループ名・アイコンを表示
- **自動フォールバック**: Webhook失敗時はBot送信に自動切り替え

### チャンネル管理

- **自動チャンネル作成**: LINEユーザー・グループごとにDiscordチャンネルを自動作成
- **日本語チャンネル名**: 日本語のユーザー名・グループ名に対応
- **動的チャンネル名更新**: グループ名変更時の自動更新

### 位置情報共有機能

- **LINE → Discord**: 位置情報をGoogleマップリンク付きで表示
- **Discord → LINE**: Googleマップリンクや座標をLINE位置情報として送信
- **自動検出**: 座標パターン（35.6895, 139.6917）やGoogleマップURLを自動検出
- **詳細表示**: 住所、座標、Googleマップリンクを包括的に表示


### メディア処理

- **自動MIME判定**: ファイル内容から正確なMIMEタイプを判定
- **LINE側制限対応**: LINE側のファイルサイズ制限を考慮した処理
- **大容量ファイル対応**: Discord CDN URLを活用した大容量ファイル送信
- **画像圧縮**: Sharpを使用した画像の自動圧縮
- **ステッカー処理**: DiscordステッカーをLINE画像として送信
- **外部URL**: LINE Bot API v7の外部URL機能を活用
- **フォールバック機能**: 処理失敗時の自動的な代替処理

### ステッカー処理

- **LINE → Discord**: ステッカー画像のみ表示（ID表示なし）
- **Discord → LINE**: Discordステッカーを画像として送信
- **LOTTIE対応**: LOTTIEスタンプはテキストとして送信
- **APNG変換**: アニメーションスタンプは静止画に変換
- **自動クリンナップ**: 変換した一時ファイルを自動削除

### 絵文字処理（v3.1.0新機能）

- **UTF-8正規化**: Unicode正規化により文字エンコーディング問題を解決
- **絵文字検出**: 有効な絵文字の検証機能
- **自動修復**: 絵文字化け「(emoji)」を適切な絵文字に自動変換
- **プラットフォーム対応**: LINEとDiscord間での絵文字互換性を確保
- **ゼロ幅文字除去**: 絵文字表示を妨げる文字の自動除去

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

**テストカバレッジ**:
- MessageBridge: 初期化、エラーハンドリング、メトリクス
- LineService: API呼び出し、エラーハンドリング
- DiscordService: メッセージ送信、チャンネル検索
- App: ミドルウェア、ルート、ヘルスチェック
- emojiHandler: 絵文字正規化、検出、変換

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

## ⚠️ 既知の問題と制限事項

### 現在の不具合・制限

1. **返信機能（実験的実装）**
   - **状態**: 動作未確認
   - **問題**: DiscordとLINE間の返信機能が正常に動作しない場合がある
   - **回避策**: 通常のメッセージ送信を使用

2. **LOTTIEスタンプ**
   - **状態**: 制限あり
   - **問題**: DiscordのLOTTIEスタンプは画像として送信できない
   - **回避策**: テキストメッセージとして送信（`🎭 スタンプ: [名前] (LOTTIE)`）

3. **グループアイコン表示**
   - **状態**: 未実装
   - **問題**: Discord WebhookでLINEグループのアイコンが表示されない
   - **回避策**: デフォルトアイコンまたはユーザーアイコンを使用

4. **Discord API制限**
   - **状態**: 外部制限
   - **問題**: Discordのレート制限により大量メッセージ送信時に制限される場合がある
   - **回避策**: メッセージ送信間隔の調整

5. **LINE API制限**
   - **状態**: 外部制限
   - **問題**: LINE Bot APIの制限により大量メッセージ送信時に制限される場合がある
   - **回避策**: メッセージ送信間隔の調整

### 最新の改善点（v3.1.0）

- ✅ **絵文字処理の改善**: UTF-8エンコーディング問題を完全解決
- ✅ **LINE側制限対応**: LINE側のファイルサイズ制限を考慮した処理を実装
- ✅ **大容量ファイル対応**: Discord CDN URLを活用した大容量ファイル送信機能
- ✅ **システムの簡素化**: 複雑すぎるリプライ機能を削除して安定性を向上
- ✅ **コード品質向上**: 不要なコードの削除と保守性の改善

### 以前の改善点（v3.0.0）

- ✅ **テストスイートの追加**: 主要機能のテストケースを実装
- ✅ **セキュリティ更新**: axiosを最新版（v1.7.7）に更新
- ✅ **ログシステムの統一**: Winstonを使用した統一的なログ管理
- ✅ **コード品質向上**: レガシーファイルの削除とグレースフルシャットダウンの修正

### 技術的制限

- **ファイルサイズ**: 10MB制限（設定可能）
- **サポート形式**: 画像（JPEG, PNG, GIF, WebP）、動画（MP4）、音声（MP3, AAC）
- **ステッカー**: Discordステッカーは画像として送信（アニメーションは静止画に変換）
- **位置情報**: 住所情報はLINE側でのみ利用可能

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


4. **位置情報が表示されない**
   - LINEで位置情報を正しく送信しているか確認
   - DiscordでGoogleマップリンクの形式が正しいか確認

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

## 🎯 Version 3.1.0 - Enhanced Features

### 新機能・改善点

- **絵文字処理の改善**: UTF-8エンコーディング問題を完全解決
- **LINE側制限対応**: LINE側のファイルサイズ制限を考慮した処理を実装
- **大容量ファイル対応**: Discord CDN URLを活用した大容量ファイル送信機能
- **システムの簡素化**: 複雑すぎるリプライ機能を削除して安定性を向上
- **コード品質向上**: 不要なコードの削除と保守性の改善
- **安定性の向上**: シンプルで信頼性の高いシステム

### 安定性

- **本格運用対応**: 本番環境での使用に適した安定性
- **エラーハンドリング**: 包括的なエラー処理と回復機能
- **ログ管理**: 詳細なログとモニタリング機能
- **セキュリティ**: 堅牢なセキュリティ機能
- **安全性**: 新機能の失敗が既存機能に影響しない設計

### 主要機能

- ✅ **双方向メッセージング**: 完全に動作
- ✅ **メディア処理**: 画像、動画、音声、ファイル、ステッカー
- ✅ **Webhook表示**: LINEユーザー名・アイコン表示
- ✅ **位置情報共有**: Googleマップリンク付き
- ✅ **チャンネル管理**: 自動作成・日本語対応
- ✅ **自動クリンナップ**: 一時ファイル自動削除
- ✅ **絵文字処理**: UTF-8エンコーディング問題解決
- ✅ **包括的テスト**: 主要機能のテストスイート完備

### 推奨用途

- **個人利用**: 個人のLINEとDiscordの連携
- **小規模チーム**: 10人以下のチームでの利用
- **コミュニティ**: 小規模コミュニティでの利用
- **本格運用**: 本番環境での安定運用
- **開発・テスト**: 開発環境でのテスト利用


---

**注意**: このアプリケーションはLINE Bot API v7とDiscord.js v14を使用しています。古いバージョンとの互換性は保証されません。
