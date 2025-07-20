# LINE-Discord Bridge (Modern Version 2.0.0)

LINE Bot API v7対応の近代化されたLINE-Discordブリッジアプリケーションです。

## 🚀 新機能

### LINE Bot API v7対応
- `uploadContent`の削除に対応
- 外部URLを使用したメディア送信
- より堅牢なエラーハンドリング

### 正確なファイル処理
- バイナリヘッダーによる正確なMIMEタイプ判定
- 動画・音声ファイルの適切な拡張子設定
- ファイルシグネチャ（マジックナンバー）による判定

### 近代化されたアーキテクチャ
- マイクロサービス指向の設計
- 単一責任原則に基づくサービス分離
- レート制限対策とメッセージキュー
- グレースフルシャットダウン

### 強化されたログ機能
- 構造化ログ（JSON形式）
- ログローテーション
- 詳細なデバッグ情報

## 📋 要件

- Node.js 18.0.0以上
- npm 8.0.0以上
- LINE Bot API v7対応のチャンネル
- Discord Bot Token

## 🛠️ セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 設定ファイルの作成

`config.js`を作成し、以下の内容を設定してください：

```javascript
module.exports = {
  line: {
    channelId: 'YOUR_LINE_CHANNEL_ID',
    channelSecret: 'YOUR_LINE_CHANNEL_SECRET',
    channelAccessToken: 'YOUR_LINE_CHANNEL_ACCESS_TOKEN'
  },
  discord: {
    token: 'YOUR_DISCORD_BOT_TOKEN'
  },
  port: process.env.PORT || 3000
};
```

### 3. マッピングファイルの設定

`mapping.json`を作成し、LINEユーザーIDとDiscordチャンネルIDのマッピングを設定：

```json
[
  {
    "lineUserId": "U1234567890abcdef",
    "discordChannelId": "1234567890123456789"
  }
]
```

### 4. 環境変数の設定（オプション）

```bash
export PORT=3000
export NODE_ENV=production
```

## 🚀 起動方法

### 開発環境

```bash
npm run dev
```

### 本番環境

```bash
# 直接起動
npm start

# PM2を使用
npm run pm2:start
```

### PM2コマンド

```bash
# ステータス確認
npm run pm2:status

# ログ確認
npm run pm2:logs

# 再起動
npm run pm2:restart

# 停止
npm run pm2:stop
```

## 📁 ファイル構成

```
├── modernApp.js              # メインアプリケーション
├── services/
│   ├── modernLineService.js  # LINE Bot API v7対応サービス
│   ├── modernMediaService.js # メディア処理サービス
│   ├── modernFileProcessor.js # ファイル処理サービス
│   └── modernMessageBridge.js # メッセージブリッジ
├── utils/
│   └── logger.js             # ログユーティリティ
├── config.js                 # 設定ファイル
├── mapping.json              # チャンネルマッピング
└── package.json
```

## 🔧 機能詳細

### LINE→Discord転送

- **テキストメッセージ**: そのまま転送
- **画像**: 適切な拡張子で保存・転送
- **動画**: MP4形式で保存・転送
- **音声**: M4A形式で保存・転送
- **ファイル**: 元の形式を保持して転送
- **スタンプ**: PNG画像として転送
- **位置情報**: テキストとして転送

### Discord→LINE転送

- **テキストメッセージ**: そのまま転送
- **画像**: 外部URLを使用して転送
- **動画**: 外部URLを使用して転送
- **音声**: 外部URLを使用して転送
- **ファイル**: URLとして転送
- **スタンプ**: テキストとして転送

### ファイル処理の改善

- **正確なMIME判定**: バイナリヘッダーによる判定
- **適切な拡張子**: ファイル内容に基づく拡張子設定
- **サイズ制限**: 10MB制限の適用
- **エラーハンドリング**: 堅牢なエラー処理

## 📊 ログ

### ログレベル

- `ERROR`: エラー情報
- `WARN`: 警告情報
- `INFO`: 一般情報
- `DEBUG`: デバッグ情報

### ログ形式

```json
{
  "timestamp": "2025-01-20T10:30:00.000Z",
  "level": "INFO",
  "message": "Message forwarded from LINE to Discord",
  "metadata": {
    "sourceId": "U1234567890abcdef",
    "senderId": "U1234567890abcdef",
    "displayName": "ユーザー名",
    "channelId": "1234567890123456789",
    "messageType": "image"
  }
}
```

## 🔍 トラブルシューティング

### よくある問題

1. **LINE Bot API v7エラー**
   - `uploadContent is not a function`エラーが発生した場合、新しいバージョンを使用してください

2. **ファイル拡張子が.binになる**
   - 新しいFileProcessorが正しい拡張子を設定します

3. **Discord→LINEの画像送信エラー**
   - 外部URLを使用するため、DiscordのURLが公開されている必要があります

### デバッグ方法

```bash
# 詳細ログを有効化
export LOG_LEVEL=debug
npm start

# PM2ログの確認
npm run pm2:logs
```

## 🔄 アップグレード

### 1.xから2.xへの移行

1. 新しい依存関係をインストール
2. 設定ファイルを更新
3. 新しいアプリケーションファイルを使用
4. データベースの移行（必要に応じて）

## 📝 ライセンス

MIT License

## 🤝 コントリビューション

1. フォークを作成
2. フィーチャーブランチを作成
3. 変更をコミット
4. プルリクエストを作成

## 📞 サポート

問題が発生した場合は、以下の情報を含めて報告してください：

- Node.jsバージョン
- エラーログ
- 設定ファイル（機密情報は除く）
- 再現手順 