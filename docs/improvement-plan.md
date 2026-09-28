# LINE–Discord Bridge 改善計画

対象: `Shinnosuke02/line-discord-bridge`

最終更新: 2026-09-28

現在の本番ベースライン: `v3.2.0` / Node.js `24.21.0` / npm `11.19.0` / PM2 `6.0.8`。`main` のmerge後CI Run #75は全step green。Oracle VPSで `/health=healthy`、`/ready=ready`、SQLite `quick_check=ok` を確認済み。

## Phase 1 — Reliability

状態: **完了**

実装・実機確認済み:

- [x] LINE Webhook Fast ACK
- [x] `webhookEventId` 冪等化
- [x] SQLite durable inbox / WAL
- [x] conversation queue
- [x] source単位channel creation lock
- [x] SQLite channel mapping + JSON rollback mirror
- [x] `@everyone` 独自権限付与廃止
- [x] channel topicからLINE source ID除去
- [x] LINE Webhookを汎用rate limitから除外
- [x] `DISCORD_GUILD_ID` 起動時検証
- [x] JSON→SQLite migration
- [x] SQLite status / backup
- [x] Oracle VPSで既存32 mapping移行
- [x] PM2再起動後mapping復元
- [x] LINE / Discord双方向導通
- [x] Discord channel削除→自動再生成
- [x] LINE Webhook実再送時の重複排除

## Phase 2 — Messaging / Platform modernization

状態: **Oracle VPS本番稼働中・残りのlive acceptance確認中**

### Platform

- [x] package version 3.2.0
- [x] Node.js 24.17+ baseline
- [x] GitHub Actions Node 24
- [x] discord.js 14.27
- [x] Discord `Events.ClientReady`
- [x] 不要reaction intents削除
- [x] LINE SDK 11.2 / `LineBotClient`

### LINE delivery correctness

- [x] pushに `X-Line-Retry-Key`
- [x] network / 5xx / 429 retry責務整理
- [x] reply messageの曖昧なnetwork retry抑止
- [x] outbound `type:file` 廃止
- [x] 一般ファイルはURL text fallback
- [x] video preview条件を厳格化
- [x] audio duration固定60秒を廃止
- [x] group / room / user source helper統一
- [x] optional mark-as-read

### Message lifecycle

- [x] SQLite `message_links` 拡張
- [x] JSON message mapping → SQLite migration
- [x] SQLiteをmessage mapping authoritative store化
- [x] 1 Discord → N LINE mapping
- [x] LINEグループトークの `messageEdited` → Discord edit（timestampでout-of-order editを抑止）
- [x] LINE `unsend` → Discord delete
- [x] Webhook message edit/delete
- [x] Discord mention suppression

### Reliability / operation

- [x] webhook retry backoff
- [x] dead-letter state
- [x] due-event index
- [x] MessageBatcherを配送経路から廃止
- [x] `/upload` endpoint削除
- [x] `/health` package version修正
- [x] `/ready` endpoint
- [x] durable queue statusをmetricsへ追加

### Phase 2 acceptance

Oracle VPSで v3.2.0 / Node 24.21.0 を起動し、`/health` healthy、`/ready` ready、SQLite `quick_check=ok` を確認済み。起動時点で durable queue は空。Node 24更新直後は旧Node ABI向け `node_modules` のためPM2がrestart loopしたが、`build-essential` 導入後に `npm ci` でnative moduleを再構築して解消。既存 `dead_letter` 24件は内容確認後に個別判断し、一括retryは行わない。


- [x] GitHub Actions test / lint / SQLite smoke / production high-severity audit green
- [x] Oracle VPS Node 24.21.0更新
- [x] Oracle VPS `npm ci`（Node 24 native modules再構築。minimal Ubuntuで `build-essential` / `make` が必要だったため運用手順へ反映）
- [x] SQLite migration後 `db:status` green（WAL / quick_check=ok）
- [ ] LINE→Discord通常message live test
- [ ] Discord→LINE text/image/file-link live test
- [ ] LINE edit live test（グループトークで実施。1対1 / 複数人トークではLINE API仕様上 `messageEdited` が送信されない）
- [x] LINE unsend live test（Discord側メッセージ削除を確認）
- [ ] PM2再起動後mapping復元

## Phase 2.1 — LINE emoji fidelity

状態: **`main` 統合・CI完了、Oracle VPS live test待ち**

- [x] LINE Webhook `message.emojis` の `index` / `length` を使った代替テキスト範囲の認識
- [x] `productId` / `emojiId` の完全一致mappingだけをUnicode近似変換に使用
- [x] fallback label単独の推測変換を廃止（同じ「ありがとう」等を持つ別絵文字を同一Unicodeへ潰さない）
- [x] 未知のLINE絵文字は代替テキストを保持し、`productId` / `emojiId` / fallback textをdebug logへ記録
- [x] UTF-16 index（先行サロゲートペアを含む文章）をテスト
- [x] ZWJ / variation selectorを保持し、通常Unicode絵文字の複合表示を壊さない
- [x] 通常message / messageEditedの両方でemoji metadataを利用
- [x] GitHub Actions green（PRおよびmerge後 `main` Run #75）
- [ ] Oracle VPS live test（LINE独自絵文字 → Discord Unicode近似）

設計判断: fallback/ALT文字列は絵文字の一意な識別子ではないため、それだけを根拠にUnicodeへ推測変換しない。`productId + emojiId` の完全一致を確認できたものだけ対応表へ追加する。LINE絵文字画像をDiscord custom emojiとして自動登録する方式は、追加権限・Guild絵文字枠・非API画像配布URLへの依存が大きいため採用しない。

## Documentation status

- [x] READMEをv3.2 / Phase 2.1 / 現在の本番ベースラインへ更新
- [x] Oracle VPS手順へNode 24 major upgrade / `build-essential` / native module再構築の実機知見を反映
- [x] CI手順をdependency audit / runtime smoke / Jest / ESLint / SQLite smokeの現行構成へ更新
- [x] 2026-07時点のreview文書にhistorical/superseded注記を追加し、現行仕様との混同を防止

## Phase 3 — Media

- MediaService streaming化
- large mediaのtemp-file pipeline
- ffmpeg/ffprobeを使うvideo preview / audio metadata取得
- MediaService責務分割

## Phase 4 — Operations / Security

- dead-letter管理CLI / Discord command
- LINE usage APIとの照合
- 管理用Discord slash commands
- metrics / observability強化
- dependency security update継続

## Phase 5 — UX / Architecture

- service adapter境界整理
- channel naming / icon policy
- admin UX
