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
|  | 検証中 | 自動テスト済み、実運用確認前を含む |
|  | 完了 | 受入条件を満たした |
|  | 保留 | 意図的に後回し |

## 改善バックログ

| ID | 改善項目 | 優先度 | 緊急度 | 重要度 | 状態 | 実装結果 / 備考 |
|---|---|---:|---:|---:|---|---|
| REL-001 | LINE WebhookをFast ACK化し、永続化後すぐ200を返す | P0 | 5 | 5 | 検証中 | 署名検証後、SQLiteへ同期保存してからACK。Discord/LINE外部API送信はHTTPリクエスト外へ移動 |
| REL-002 | `webhookEventId` を用いた冪等性保証 | P0 | 5 | 5 | 検証中 | `webhook_events.webhook_event_id` をPRIMARY KEY化し `ON CONFLICT DO NOTHING` で重複排除 |
| REL-003 | LINE会話単位の逐次処理・順序保証 | P0 | 5 | 5 | 検証中 | source ID単位のPromise queueを実装し、同一会話を直列処理 |
| REL-004 | チャンネル作成の競合防止 | P0 | 5 | 5 | 検証中 | conversation queue + `PersistentChannelManager` のsource単位lock + DB一意制約。並行unit test合格 |
| REL-005 | JSON永続化をSQLiteへ段階移行 | P0 | 4 | 5 | 完了 | 実データ32件をJSONからSQLiteへ移行し、PM2再起動後も既存channel mappingで導通確認。JSON rollback mirrorを継続 |
| REL-006 | LINE source ID と Discord channel ID にDB一意制約を付与 | P0 | 4 | 5 | 検証中 | `conversations.line_source_id UNIQUE` / `discord_channel_id UNIQUE` を実装 |
| REL-007 | Discord message → LINE message の1:Nマッピング対応 | P1 | 3 | 4 | 未着手 | Phase 2 |
| REL-008 | 再起動・再送・同時到着の競合テスト追加 | P0 | 5 | 5 | 検証中 | webhook dedupe / retry / restart recovery / channel race / ACK経路の回帰テストを追加。VPS再起動・通常導通・実チャンネル削除後の再生成を確認済み。実再送試験のみ継続 |
| MSG-001 | MessageBatcherを原則廃止 | P0 | 4 | 4 | 未着手 | Phase 2 |
| MSG-002 | MessageQueueとLineServiceのretry責務を整理 | P1 | 3 | 4 | 未着手 | Phase 2 |
| DB-001 | `conversations` テーブル作成 | P0 | 4 | 5 | 完了 | 実データ32件のmigration、SQLite restore、JSON rollback mirrorをVPSで確認 |
| DB-002 | `webhook_events` テーブル作成 | P0 | 5 | 5 | 検証中 | 作成済み。pending / processing / retry / completed を管理 |
| DB-003 | `message_links` テーブル作成 | P0 | 4 | 5 | 実装中 | スキーマ作成済み。既存MessageMappingManagerからの切替はPhase 2 |
| DB-004 | SQLite WALモード有効化 | P0 | 4 | 4 | 完了 | VPS実機で `journal_mode=WAL` / `quickCheck=ok` を確認 |
| DB-005 | JSON→SQLite移行スクリプト作成 | P0 | 3 | 4 | 完了 | `npm run migrate:json` で既存channel mapping 32件を実データ移行。JSON元ファイルは保持 |
| OPS-001 | SQLite状態確認コマンド | P1 | 3 | 4 | 完了 | VPS実機で `npm run db:status` を実行し quick_check / WAL / row countを確認 |
| OPS-002 | WAL-safe SQLiteバックアップ | P1 | 4 | 5 | 完了 | VPS実機で `npm run db:backup` により `/var/lib/line-discord-bridge/backups` へのバックアップ生成を確認 |
| SEC-001 | 自動生成チャンネルの`@everyone`権限付与を廃止 | P0 | 5 | 5 | 検証中 | `PersistentChannelManager` では明示的permission overwriteを付けずcategory/server権限を継承 |
| SEC-002 | Discord category権限の継承方式へ変更 | P0 | 4 | 5 | 検証中 | category parentのみ設定し、チャンネル権限は継承 |
| SEC-003 | チャンネルトピックへのLINE source ID直書きを廃止 | P1 | 3 | 4 | 検証中 | topicを固定文字列 `LINE Bridge Channel` に変更 |
| SEC-004 | LINE Webhookをアプリ全体rate limit対象から除外 | P0 | 5 | 5 | 検証中 | `config.line.webhookPath` を使ったskipと回帰テストを実装 |
| CFG-001 | `VIDEO_COMPRESSION_ENABLED` 判定ロジック修正 | P0 | 4 | 4 | 検証中 | `'true'` の時のみ有効になるよう修正 |
| CFG-002 | `DISCORD_GUILD_ID` を起動時必須検証へ追加 | P0 | 4 | 5 | 検証中 | 既存の環境変数名を変更せず起動時検証を追加 |
| CFG-003 | `PUBLIC_BASE_URL` のHTTPS必須チェック追加 | P1 | 3 | 4 | 未着手 | 既存運用を壊さない条件設計後に実施 |
| ARCH-003 | Repository層を導入しSQLiteアクセスを集約 | P0 | 4 | 5 | 検証中 | `WebhookEventRepository` / `ConversationRepository` を追加 |
| ARCH-005 | conversation単位のqueue実装 | P0 | 4 | 5 | 検証中 | `ConversationQueue` をdurable processorから利用 |
| TEST-001 | 同一Webhookイベント重複受信テスト | P0 | 5 | 5 | 検証中 | repository重複排除とHTTP ACK経路の回帰テスト合格 |
| TEST-002 | 同一groupId初回メッセージ同時2件テスト | P0 | 5 | 5 | 検証中 | source単位lockの並行unit test合格。Discord実通信確認待ち |
| TEST-003 | Discordチャンネル削除後の再生成テスト | P0 | 4 | 5 | 完了 | stale mapping replacementのunit testに加え、VPS本番でDiscordチャンネル削除→LINE送信→同名チャンネル1件再生成・配送を確認 |
| TEST-004 | 再起動後のmapping / event復元テスト | P0 | 4 | 5 | 完了 | processing→retry recoveryとSQLite mapping restoreをunit test済み。VPSでPM2再起動後も既存LINE/Discord導通を確認 |
| TEST-005 | LINE Webhook再送時の重複排除テスト | P0 | 5 | 5 | 検証中 | WebhookEventRepositoryおよびACK経路のテスト合格。実再送試験は継続 |

## Phase 1 — 配送信頼性

対象: REL-001〜006, REL-008, DB-001〜005, ARCH-003, ARCH-005, SEC-001〜004, CFG-001〜002, TEST-001〜005

完了条件:
- 同じLINE Webhookを同時に2回受信してもDiscord投稿は1回だけ。
- 同じLINE会話から同時に2通到着してもDiscordチャンネルは1つだけ。
- アプリ再起動後もLINE source ↔ Discord channel対応が維持される。
- LINE Webhookへの200応答がDiscord/LINE外部API処理時間に依存しない。
- DBの一意制約が重複処理の最終防衛線として機能する。

### Phase 1 実装方針

Oracle VPS常設運用を前提とし、SQLite DBはGit checkout外へ配置する。

推奨:

```bash
DB_TYPE=sqlite
DB_FILE=/var/lib/line-discord-bridge/bridge.sqlite3
DB_BACKUP_PATH=/var/lib/line-discord-bridge/backups
```

更新は `git pull` + `npm ci` を基本とし、SQLiteサーバー等の別サービスは導入しない。既存JSONは削除せず、migrationとrollback mirrorを維持する。詳細は `docs/oracle-vps-deployment.md` を参照。

## Phase 2 — メッセージング
MessageBatcher整理、retry責務整理、1:N message mapping、LINE SDK移行、返信同期。

## Phase 3 — メディア
画像・ファイル・スタンプ・動画・音声の信頼性改善、streaming化、MediaService分割。

## Phase 4 — セキュリティ / 運用
管理エンドポイント、依存パッケージ更新、health強化、自動cleanup方針を整理。

## Phase 5 — UX / 構造改善
MessageBridge・MediaServiceの責務分離、アダプタ層、表示名・アイコン・チャンネル名ルールを整理。

## リリース判定 — v3.2.0 Reliability

- [x] Webhook durable Fast ACK 実装
- [x] webhookEventId冪等化 実装
- [x] SQLite基盤 / WAL 実装
- [x] conversation queue 実装
- [x] source単位channel creation lock 実装
- [x] SQLite channel mapping restore + JSON rollback mirror 実装
- [x] `@everyone`明示権限付与を廃止
- [x] channel topicからLINE source IDを除去
- [x] LINE Webhook rate-limit除外 実装
- [x] `DISCORD_GUILD_ID` 起動時検証 実装
- [x] `VIDEO_COMPRESSION_ENABLED` 判定修正 実装
- [x] JSON→SQLite migrationコマンド 実装
- [x] SQLite status / backupコマンド 実装
- [x] Oracle VPS配置 / rollback手順 文書化
- [x] GitHub Actions: `npm ci` / 24 suites / lint / SQLite smoke test 合格
- [x] 同一source同時初回チャンネル生成の自動テスト合格
- [x] チャンネル削除→再生成の自動テスト合格
- [x] Oracle VPS再起動後の既存mapping復元・導通確認
- [x] 既存JSON migration実データ32件確認
- [x] LINE / Discord双方向実通信確認
- [ ] LINE Webhook実再送時の重複排除確認
- [x] Discordチャンネル削除→再生成の実通信確認

`[x]` はコード実装・自動検証・またはOracle VPS実機確認済みを示す。残るPhase 1の実運用確認は、LINE Webhook実再送時の重複排除のみである。
