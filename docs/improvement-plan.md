# LINE–Discord Bridge 改善計画

対象リポジトリ: `Shinnosuke02/line-discord-bridge`  
目的: LINE ⇄ Discord ブリッジの配送信頼性、永続性、保守性、セキュリティ、メディア処理品質を段階的に改善する。

## 評価指標

| 指標 | 値 | 定義 |
|---|---:|---|
| 優先度 | P0 | 最優先。後続実装の前提となる |
|  | P1 | 実運用品質のために重要 |
|  | P2 | 保守性・UX・効率改善 |
|  | P3 | 将来拡張 |
| 緊急度 | 5 | 重複配送・障害・情報漏えいに直結 |
|  | 4 | 高確率で障害化しうる |
|  | 3 | 中期的に対応が必要 |
|  | 2 | 余裕のある改善 |
|  | 1 | 将来対応 |
| 重要度 | 5 | コア配送・セキュリティに直結 |
|  | 4 | 実運用品質に大きく影響 |
|  | 3 | 保守性・UXに影響 |
|  | 2 | 補助的改善 |
|  | 1 | 任意 |
| 状態 | 未着手 | 未実装 |
|  | 実装中 | コード変更中 |
|  | 検証中 | テスト・実運用確認中 |
|  | 完了 | 受入条件を満たした |
|  | 保留 | 意図的に後回し |

## 改善バックログ

| ID | 改善項目 | 優先度 | 緊急度 | 重要度 | 状態 | 実装結果 / 備考 |
|---|---|---:|---:|---:|---|---|
| REL-001 | LINE WebhookをFast ACK化し、永続化後すぐ200を返す | P0 | 5 | 5 | 検証中 | 署名検証後、SQLiteへ同期保存してからACKする処理を実装。外部API送信はリクエスト外へ移動 |
| REL-002 | `webhookEventId` を用いた冪等性保証 | P0 | 5 | 5 | 検証中 | `webhook_events.webhook_event_id` をPRIMARY KEY化し `ON CONFLICT DO NOTHING` で重複排除 |
| REL-003 | LINE会話単位の逐次処理・順序保証 | P0 | 5 | 5 | 検証中 | source ID単位のPromise queueを実装し、同一会話を直列処理 |
| REL-004 | チャンネル作成の競合防止 | P0 | 5 | 5 | 検証中 | LINE受信経路はconversation queueにより同一sourceの初回処理を直列化。DB一意制約も追加済み、実通信確認待ち |
| REL-005 | JSON永続化をSQLiteへ段階移行 | P0 | 4 | 5 | 実装中 | durable inboxはSQLite化。既存ChannelManager JSONは当面維持し、SQLiteへミラーする安全な段階移行方式 |
| REL-006 | LINE source ID と Discord channel ID にDB一意制約を付与 | P0 | 4 | 5 | 検証中 | `conversations.line_source_id UNIQUE` / `discord_channel_id UNIQUE` を実装 |
| REL-007 | Discord message → LINE message の1:Nマッピング対応 | P1 | 3 | 4 | 未着手 | Phase 2 |
| REL-008 | 再起動・再送・同時到着の競合テスト追加 | P0 | 5 | 5 | 実装中 | webhook dedupe / retry / restart recovery / ACK経路の回帰テストを追加。実運用試験待ち |
| MSG-001 | MessageBatcherを原則廃止 | P0 | 4 | 4 | 未着手 | Phase 2 |
| MSG-002 | MessageQueueとLineServiceのretry責務を整理 | P1 | 3 | 4 | 未着手 | Phase 2 |
| DB-001 | `conversations` テーブル作成 | P0 | 4 | 5 | 検証中 | 作成済み。既存JSONからのmigration + 成功会話のdual-writeを実装 |
| DB-002 | `webhook_events` テーブル作成 | P0 | 5 | 5 | 検証中 | 作成済み。pending / processing / retry / completed を管理 |
| DB-003 | `message_links` テーブル作成 | P0 | 4 | 5 | 実装中 | スキーマ作成済み。既存MessageMappingManagerからの切替はPhase 2 |
| DB-004 | SQLite WALモード有効化 | P0 | 4 | 4 | 検証中 | `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000` を実装 |
| DB-005 | JSON→SQLite移行スクリプト作成 | P0 | 3 | 4 | 検証中 | `npm run migrate:json` を追加。JSON元ファイルは削除しない |
| SEC-001 | 自動生成チャンネルの`@everyone`権限付与を廃止 | P0 | 5 | 5 | 未着手 | ChannelManager変更時に実施 |
| SEC-002 | Discord category権限の継承方式へ変更 | P0 | 4 | 5 | 未着手 | ChannelManager変更時に実施 |
| SEC-003 | チャンネルトピックへのLINE source ID直書きを廃止 | P1 | 3 | 4 | 未着手 | Phase 4 |
| SEC-004 | LINE Webhookをアプリ全体rate limit対象から除外 | P0 | 5 | 5 | 検証中 | `config.line.webhookPath` を使ったskipと回帰テストを実装 |
| CFG-001 | `VIDEO_COMPRESSION_ENABLED` 判定ロジック修正 | P0 | 4 | 4 | 検証中 | `'true'` の時のみ有効になるよう修正 |
| CFG-002 | `DISCORD_GUILD_ID` を起動時必須検証へ追加 | P0 | 4 | 5 | 検証中 | 既存の環境変数名を変更せず起動時検証を追加 |
| CFG-003 | `PUBLIC_BASE_URL` のHTTPS必須チェック追加 | P1 | 3 | 4 | 未着手 | 既存運用を壊さない条件設計後に実施 |
| ARCH-003 | Repository層を導入しSQLiteアクセスを集約 | P0 | 4 | 5 | 実装中 | `WebhookEventRepository` / `ConversationRepository` を追加 |
| ARCH-005 | conversation単位のqueue実装 | P0 | 4 | 5 | 検証中 | `ConversationQueue` をdurable processorから利用 |
| TEST-001 | 同一Webhookイベント同時2回送信テスト | P0 | 5 | 5 | 実装中 | repository重複排除テスト追加、並列HTTP統合試験は継続 |
| TEST-002 | 同一groupId初回メッセージ同時2件テスト | P0 | 5 | 5 | 未着手 | 実Discord mockを含む回帰試験を追加予定 |
| TEST-003 | Discordチャンネル削除後の再生成テスト | P0 | 4 | 5 | 未着手 | |
| TEST-004 | 再起動後のmapping / event復元テスト | P0 | 4 | 5 | 実装中 | processing→retry recoveryを実装・unit test追加。VPS再起動試験待ち |
| TEST-005 | LINE Webhook再送時の重複排除テスト | P0 | 5 | 5 | 実装中 | WebhookEventRepositoryおよびACK経路のテスト追加 |

## Phase 1 — 配送信頼性

対象: REL-001〜006, REL-008, DB-001〜005, ARCH-003, ARCH-005, SEC-004, CFG-001〜002, TEST-001〜005

完了条件:
- 同じLINE Webhookを同時に2回受信してもDiscord投稿は1回だけ。
- 同じLINE会話から同時に2通到着してもDiscordチャンネルは1つだけ。
- アプリ再起動後もLINE source ↔ Discord channel対応が維持される。
- LINE Webhookへの200応答がDiscord/LINE外部API処理時間に依存しない。
- DBの一意制約が重複処理の最終防衛線として機能する。

### Phase 1 実装方針

Oracle VPS常設運用を前提とし、SQLite DBはGit checkout外へ配置できる。

推奨:

```bash
DB_FILE=/var/lib/line-discord-bridge/bridge.sqlite3
```

更新時は通常の `git pull` と `npm install` でNode依存を更新し、SQLiteサーバー等の別サービスは導入しない。既存JSONからの切替期間はJSONを削除せず、SQLiteへのmigration / mirrorを行う。

## Phase 2 — メッセージング
MessageBatcher整理、retry責務整理、1:N message mapping、LINE SDK移行、返信同期。

## Phase 3 — メディア
画像・ファイル・スタンプ・動画・音声の信頼性改善、streaming化、MediaService分割。

## Phase 4 — セキュリティ / 運用
Discord権限、管理エンドポイント、ログredaction、バックアップ、health強化、自動cleanup方針を整理。

## Phase 5 — UX / 構造改善
MessageBridge・MediaServiceの責務分離、アダプタ層、表示名・アイコン・チャンネル名ルールを整理。

## 実装記録テンプレート

### `[ID] タスク名`

**実装日:**  
**対象バージョン:**  
**Commit / PR:**  
**状態:** 未着手 / 実装中 / 検証中 / 完了 / 保留

**変更内容**
- 

**変更ファイル**
- 

**依存ライブラリ変更**
- なし / あり:

**環境変数変更**
- なし / あり:
- 追加:
- 削除:
- 変更:

**テスト**
- [ ] Unit test
- [ ] Integration test
- [ ] LINE実通信
- [ ] Discord実通信
- [ ] 再送試験
- [ ] 再起動試験

**実装結果**
- 

**既知の問題**
- 

**ロールバック方法**
- 

## リリース判定 — v3.2.0 Reliability

- [x] Webhook durable Fast ACK 実装
- [x] webhookEventId冪等化 実装
- [x] SQLite基盤 / WAL 実装
- [x] conversation queue 実装
- [x] LINE Webhook rate-limit除外 実装
- [x] `DISCORD_GUILD_ID` 起動時検証 実装
- [x] `VIDEO_COMPRESSION_ENABLED` 判定修正 実装
- [x] JSON→SQLite migrationコマンド 実装
- [x] Oracle VPS配置 / rollback手順 文書化
- [ ] GitHub Actions全テスト合格
- [ ] 同一groupId同時初回メッセージ試験合格
- [ ] チャンネル削除→再生成試験合格
- [ ] Oracle VPS再起動試験合格
- [ ] 既存JSON migration実データ確認

`[x]` はコード実装済みを示す。実通信・デプロイ検証が完了するまでは関連バックログの状態を「検証中」とする。
