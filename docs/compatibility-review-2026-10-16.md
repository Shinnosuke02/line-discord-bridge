# LINE–Discord Bridge 互換性・本番保全レビュー
最終レビュー: 2026-10-16（JST）

対象リポジトリ: `Shinnosuke02/line-discord-bridge`  
レビュー対象ベース: `main@7baa5b00b813b5828637d5d9d2ba58e39a68508c`  
レビュー範囲: コード、依存関係ロック、GitHub Actions、運用マニュアル、Oracle VMメンテナンス設定、LINE/Discord公開API仕様。  
**注意:** 2026-10-16のOracle VPS・Discord/LINE実通信を直接確認したものではない。本書の「実機」は2026-09-28までに記録された確認結果を指す。

## 結論・変更ポリシー

**既存構成の維持が最優先。Node major、Discord SDK major、DBスキーマ置換、チャンネル再構築、PM2プロセス数変更、ユーザー/運用者の資格情報変更は行わない。**

安全対策として、LINE独自絵文字の画像キャッシュ総量を16MiBに制限し、CDN画像取得だけを止められる任意の環境変数 `LINE_EMOJI_IMAGE_ENABLED=false` を追加する。**未設定の場合の機能は変更しない（画像優先）。** データベース移行や既存設定変更は伴わない。回帰テストを追加し、CI合格後にのみ `main` へ取り込む。VPSへの自動デプロイはしない。

## 本番で壊してはいけない契約

| 分野 | 変更しない条件 |
| --- | --- |
| 実行基盤 | Oracle Ubuntu VPS、Node 24 LTS、PM2単一インスタンス、nginx/HTTPS |
| 環境変数 | `LINE_CHANNEL_SECRET`、`LINE_CHANNEL_ACCESS_TOKEN`、`DISCORD_BOT_TOKEN`、**`DISCORD_GUILD_ID`** 等の既存名と値 |
| 永続化 | `DB_FILE=/var/lib/line-discord-bridge/bridge.sqlite3`（現行運用例）、SQLite WAL、既存 `conversations` / `webhook_events` / `message_links`、JSON rollback mirror |
| チャンネル | LINE source ID とDiscord channelの既存1対1マッピング、表示名、既存ユーザー/Webhook ID |
| 機能 | LINE↔Discord本文、返信、画像・動画・音声・ファイルの既存fallback、スタンプ、グループ/room、送信取消、利用者アイコン |
| 信頼性 | LINE署名のraw-body HMAC検証、durable inbox、重複排除、再試行/dead-letter |
| 制限 | 約200件/日規模、1GiB VM上のメモリ余裕、Discord mention抑止 |

**既存データを再作成・削除・一括リプレイしない。** 再デプロイで新規LINE/Discordチャンネルを作り直さない。

## 依存関係・2026-10公開仕様との照合

ロックファイルで確定している現在の実パッケージ:

- `@line/bot-sdk 11.2.0`（`package.json` は `^11.2.0`）
- `discord.js 14.27.0`（`^14.27.0`）
- `better-sqlite3 13.0.3`
- `sharp 0.35.5`
- `express 4.22.3`

公式情報（2026-10-16取得）:

1. LINE SDK 11.3が公開済み。ただし現行11.2の `LineBotClient` はすでにv11方式。**機能要件のないSDK更新を本番で先行しない。** https://github.com/line/line-bot-sdk-nodejs/releases
2. discord.js v15はプレリリース段階で、公式移行ガイドが本番での無検証アップグレードを推奨していない。**14系維持。** https://discordjs.guide/v15
3. Node 24は現行LTS。Node 26 Currentへのmajor移行は不要。 https://nodejs.org/en/about/previous-releases
4. DiscordのPrivileged Intent審査は2026-06-10以降「100サーバー」ではなく**アプリがアクセス可能な10,000ユーザー**基準。10,000ユーザー以上では審査・年次再申請が必要。現在のBotの実際の対象ユーザー数とPortalのMessage Content Intent有効状態は運用側で要確認。 https://support-dev.discord.com/hc/en-us/articles/40281523410967-Changes-to-Privileged-Intent-Access-for-Discord-Apps
5. LINE署名は元のraw bodyと `x-line-signature` で検証する現行方式を維持。 https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/
6. LINE Webhookは非同期処理が推奨される。現行の署名検証→SQLite保存→ACK→非同期配送は維持。 https://developers.line.biz/en/docs/messaging-api/receiving-messages/
7. LINEの `messageEdited` は公式アカウントを含むグループトーク向け。1対1に同じeditイベントの到達を期待しない。 https://developers.line.biz/en/reference/messaging-api/
8. LINE Messaging APIは受信スタンプIDから画像そのものを返す公式取得APIを提供していない。sticker/sticon CDN画像利用は**非公式・best-effort**であり、CDN障害時はfallbackに戻す。 https://developers.line.biz/en/reference/messaging-api/

**運用要点:** `npm ci` は `package-lock.json` の解決バージョンを使用する。`npm update` / `npm install` による本番依存の暗黙更新はしない。

## レビュー検出事項

| 重要度 | 現状とリスク | 処置 |
| --- | --- | --- |
| **高** | LINE emoji画像キャッシュは「128件×最大2MiB」で合計最大256MiB相当になり得る。1GiB VMの400MiB PM2 restart閾値に対して大きい | **対応:** 件数上限は維持しつつ総量16MiBで古い画像から退避。小画像の既存動作維持 |
| **高** | 非公式LINE sticon CDNの到達性次第でLINE独自絵文字がALT文字列へ戻る | **対応:** 画像取得だけを停止するopt-outスイッチを追加。デフォルト有効、既存ユーザーへの変更なし |
| 中 | LINE画像・動画・音声受信は全体をBufferに集めるため、大容量や同時受信時はメモリ使用量が大きい | 変更はPhase 3 streaming設計・負荷テスト後に限定。今回既存メディア処理を変更しない |
| 中 | `/metrics` はアプリ内に認証がない。インターネットへの露出の有無はnginx/firewall設定で決まる | VPS側read-only確認が必要。経路変更は利用者のアクセス要件確認後 |
| 中 | `/temp` 静的配信は既存URLベースメディアに関連し得る | 無条件にOFFにしない。公開範囲・保存期限・URL用途を確認してから改善 |
| 中 | Discord Message Content Intentは引き続き必須。審査条件が2026-06に変更 | Developer Portalの設定・対象ユーザー数確認。既存Intentは維持 |
| 中 | 以前の本番記録に `dead_letter=24` があったが、2026-10-16の現在値は未確認 | read-onlyで原因確認。手動一括retry禁止（重複配送防止） |
| 低 | 現行 `main` CI Run #82は成功だが、Discord/LINEの**実ネットワーク連携**やOracle VMの状態はCIでは保証できない | デプロイ前後に別途実機シナリオ確認 |

## CI・回帰テストの合格条件

- `npm ci`（ロックファイル互換）
- `npm audit --omit=dev --audit-level=high`
- LINE SDK `LineBotClient` / Discord `Events.ClientReady` / native modules runtime smoke
- Jest全件、ESLint
- SQLite作成・status・オンラインbackup smoke
- LINE独自絵文字: 画像取得、同一ALT異なるID、CDN障害fallback、小画像キャッシュ、16MiB上限、CDN opt-out
- 既存署名・返信・取消・Durable Inbox・チャンネルマッピング・グループ/roomの回帰テスト
- **PR上とmerge後mainの両方でgreen**

CI通過でも本番受送信までは保証しない。LINE/Discordの実通信を必要とする検査は保守時間中に行う。

## デプロイ前read-only確認

1. `cd /home/ubuntu/line-discord-bridge && git status --short && git rev-parse HEAD`。ローカル未コミット変更があれば作業を止める。
2. `node --version && npm --version && pm2 status`（PM2単一インスタンスを確認）。
3. `curl -fsS http://127.0.0.1:3000/health` と `curl -fsS http://127.0.0.1:3000/ready`。
4. `npm run db:status` の `journalMode=wal`・`quickCheck=ok` とテーブル件数を記録。
5. `systemctl list-timers 'line-bridge-*'` で保守再起動スケジュールとの重複を避ける。
6. `test -f .env && test -f /var/lib/line-discord-bridge/bridge.sqlite3`。**秘密値を画面・チャットへ貼らない。**
7. Discord Developer PortalのMessage Content Intent、nginx・/metricsの公開範囲を確認。

## 本番更新・ロールバック

**自動デプロイしない。** 手元でCI合格を確認し、保守タイミングに下記を実行。バックアップはSQLiteのオンラインbackup API利用（WAL下でDBを `cp` しない）。

```bash
cd /home/ubuntu/line-discord-bridge
git status --short
git rev-parse HEAD
npm run db:backup
git fetch origin
git pull --ff-only origin main
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

上記コマンドは**前段が失敗したら後段へ進まない**運用とする。貼付実行する場合はステップごとに実行するか `set -e` を使う。上記の `pm2 restart` がVPS反映点で、GitHub mergeだけでは動作中のVPSは変わらない。

### 機能限定ロールバック

LINE独自絵文字画像取得が不安定な場合だけ、`.env` に `LINE_EMOJI_IMAGE_ENABLED=false` を設定してPM2を再起動。テキスト・チャンネル・DBなどは変更せず、絵文字画像取得のみ抑止する。**未設定時は従来どおりtrue。**

### コードロールバック

更新前のコミットSHAを控えておき、必要時は（作業ツリーがcleanであることを確認後）そのSHAへ切り替える。実行中プロセスは依存関係再導入とPM2再起動まで変更しない。

```bash
cd /home/ubuntu/line-discord-bridge
git status --short
git switch --detach <BEFORE_DEPLOY_SHA>
npm ci
npm test -- --runInBand
npm run lint
pm2 restart line-discord-bridge --update-env
curl -fsS http://127.0.0.1:3000/ready
pm2 save
```

`<BEFORE_DEPLOY_SHA>` は実際に更新前に記録したコミットを使う。データ互換があることが前提なので**DBを巻き戻さない**。失敗時はログとDB整合性を確認し、無理に一括再送しない。復帰後は `git switch main` で追跡ブランチに戻せる。

## 実機で確認するユーザー受入シナリオ

- LINE（1対1）→Discord: 文章・日本語表示・投稿者アイコン
- Discord→LINE: 文章、画像、PDF/ファイルのURL fallback
- LINEグループ→Discord: メンバー識別、返信、グループチャンネル
- LINEの独自絵文字: 同じALTの別IDで異なる画像。CDN失敗時は該当ALTのみ残る
- LINEスタンプ: `stickerId` による画像化、静止/アニメfallback
- LINE送信取消→Discord削除（1対1/グループ）
- LINEメッセージ編集→Discord編集（公式アカウントを含むグループのみ）
- Discordチャンネル削除後の自動再生成、既存マッピングの再利用
- PM2再起動後 `/ready=ready`、SQLiteデータ件数が減少しない
- duplicate webhook受付時に二重配送しない（既存CI + 本番read-onlyログ確認）

## 判定境界

| 判定 | 説明 |
| --- | --- |
| GitHubソース互換 | コード・設定を比較して判断できる |
| CI自動検証 | fake API / native module / SQLiteの範囲で機械的に確認 |
| 外部API準拠 | LINE/Discord公式資料で確認。アカウント固有権限・通信環境は別 |
| 本番稼働互換 | **VPSの実機検証完了まで未判定**。CI成功のみで本番成功と呼ばない |

### 更新を見送るもの

- discord.js v15（プレリリース・breaking changes）
- Node 26 major移行
- LINE SDKの目的なきupgrade、`npm update` によるlockfile全更新
- DBスキーマ置換、SQLite→外部DB移行
- PM2複数インスタンス化、環境変数の改名
- Nginx URL/認証の無確認変更
- スタンプ・sticon CDNに依存した画像取得を保証サービスとして扱う変更
- bulk dead-letter replay
