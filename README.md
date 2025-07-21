# LINE-Discord Bridge (Modern Version 2.0.0)

LINEを使いたくなさ過ぎて、LINEユーザーとDiscordでやりとり出来るアプリ作りました。
ただ、LINEを最初の「公式アカウント」作成のために、一度は使わないとならない…。

---
必要なもの
- LINE公式アカウント（LINE Messaging API利用のために必要）

---

## 🖥️ 動作確認済みサーバ環境

- サーバ: Oracle Cloud Free Tier
- OS: Ubuntu 24.04.2 LTS (Noble Numbat)
- カーネル: 6.8.0-1028-oracle
- CPU: AMD EPYC 7551 32-Core Processor
- メモリ: 約1GB
- Node.js: v20.19.4
- npm: 10.8.2
- pm2: 6.0.8

---

## 🛠️ Ubuntu系サーバへのインストールガイド

### 1. 必要パッケージのインストール

```bash
sudo apt update
sudo apt install -y nodejs npm nginx certbot python3-certbot-nginx git
sudo npm install -g pm2
```

### 2. リポジトリのクローンとセットアップ

```bash
git clone <YOUR_REPO_URL>
cd line-discord-bridge
npm install
```

### 3. 環境変数ファイル（.env）の作成

**重要：APIキーやシークレットなどの値は`.env`ファイルで管理してください。`config.js`に直接記載しないでください。**

`.env`ファイル例：

```env
LINE_CHANNEL_ACCESS_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
LINE_CHANNEL_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
DISCORD_BOT_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
DISCORD_GUILD_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PORT=3000
WEBHOOK_ENABLED=true
WEBHOOK_NAME=LINE Bridge
LOG_LEVEL=info
```

- `.env`ファイルはリポジトリには含めず、各サーバで個別に作成してください。
- `.env`の内容は`config.js`経由で自動的に読み込まれます。

### 4. 設定ファイルの確認

`config.js`は環境変数を参照する形になっています。値を直接書かず、必ず`.env`で管理してください。

### 5. マッピングファイルの作成

`mapping.json`を作成し、LINEユーザーIDとDiscordチャンネルIDのマッピングを設定：

```json
[
  {
    "lineUserId": "U1234567890abcdef",
    "discordChannelId": "1234567890123456789"
  }
]
```

### 6. ファイアウォール（iptables）設定例

```bash
# 80, 443, 22（SSH）を許可
sudo iptables -A INPUT -p tcp --dport 22 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT
# 既存の許可ルールを確認
sudo iptables -L
# 設定を保存（Ubuntu 24.04例）
sudo apt install -y iptables-persistent
sudo netfilter-persistent save
```

### 7. Nginxリバースプロキシ設定

- `/etc/nginx/sites-available/line-discord-bridge` を作成し、下記を記載

```nginx
server {
    listen 80;
    server_name example.com;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name example.com;

    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

- 有効化・再起動

```bash
sudo ln -s /etc/nginx/sites-available/line-discord-bridge /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 8. Let's EncryptでSSL証明書取得

```bash
sudo certbot --nginx -d example.com
```

### 9. アプリ起動

```bash
pm2 start ecosystem.config.js
pm2 save
```

---

## 🚀 新機能・特徴

- LINE Bot API v7対応
- 外部URLを使用したメディア送信
- 正確なファイル処理（MIME判定・拡張子）
- マイクロサービス指向設計
- 構造化ログ・詳細なデバッグ
- レート制限対策とメッセージキュー
- グレースフルシャットダウン

---

## 📋 アプリ要件

- Node.js 18.0.0以上
- npm 8.0.0以上
- LINE Bot API v7対応のチャンネル
- Discord Bot Token
- Nginx/Let's Encrypt必須

---

## 🔧 機能詳細

- **LINE→Discord転送**: テキスト・画像・動画・音声・ファイル・スタンプ・位置情報
- **Discord→LINE転送**: テキスト・画像・動画・音声・ファイル・スタンプ
- **ファイル処理**: MIME判定・拡張子・10MB制限・堅牢なエラー処理

---

## 📁 ディレクトリ構成

```
├── app.js                  # メインアプリケーション
├── services/
│   ├── modernLineService.js
│   ├── modernMediaService.js
│   ├── modernFileProcessor.js
│   └── modernMessageBridge.js
├── utils/
│   └── logger.js
├── config.js
├── mapping.json
└── package.json
```

---

## 🚦 注意点・セキュリティ

- Node.jsアプリのポート（例: 3000）は外部公開しない（Nginx経由のみアクセス）
- iptablesやUFWで不要なポートは閉じる
- Let's Encrypt証明書は自動更新設定を推奨
- `.env`ファイルは必ず`.gitignore`に含め、公開しないこと

---

## 📊 ログ・トラブルシューティング

- 詳細ログ: `export LOG_LEVEL=debug` で有効化
- PM2ログ: `npm run pm2:logs`
- よくある問題・デバッグ方法も記載

---
