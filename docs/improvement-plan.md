# LINE–Discord Bridge 改善計画

対象: `Shinnosuke02/line-discord-bridge`

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

状態: **実装・CI検証中**

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
- [x] LINE `messageEdited` → Discord edit
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

- [ ] GitHub Actions test / lint / SQLite smoke green
- [ ] Oracle VPS Node 24更新
- [ ] Oracle VPS `npm ci`
- [ ] SQLite migration後 `db:status` green
- [ ] LINE→Discord通常message live test
- [ ] Discord→LINE text/image/file-link live test
- [ ] LINE edit live test
- [ ] LINE unsend live test
- [ ] PM2再起動後mapping復元

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
