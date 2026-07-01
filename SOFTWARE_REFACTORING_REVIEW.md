# ソフトウェア全体リファクタリングレビュー

作成日: 2026-07-01

## 概要

`line-discord-bridge` 全体を対象に、アーキテクチャ、送受信フロー、メディア処理、運用/セキュリティ、永続化、テスト/CIの観点でチームレビューした。

結論として、最優先は次の4つ。

1. LINE Webhook入口の署名検証とログ秘匿を入れる
2. `MessageBridge` に集中している送信計画/送信実行/replyToken/通数制御を分離する
3. `MediaService` を変換専用に近づけ、LINE API送信を単一オーケストレーターへ集約する
4. JSON永続化、通数カウント、依存関係、lint/CIを運用可能な状態に整える

## レビュー体制

- アーキテクチャ/モジュール境界レビュー
- メディア処理/LINE・Discord送信フローレビュー
- 運用/セキュリティ/設定/テストレビュー

## P0: すぐ直すべきもの

### 1. LINE Webhook署名検証がない

`src/app.js` のWebhook入口は通常の `express.json()` 後に `events` を処理しているが、`x-line-signature` の検証が見当たらない。

影響:

- 任意POSTでDiscord転送やチャンネル作成を誘発できる
- 本番公開時の入口防御として不足

推奨:

- LINE Webhook専用にraw bodyを保持するmiddlewareを入れる
- `channelSecret` で `x-line-signature` を検証してからJSON parseする
- 署名失敗時は本文をログに出さず401/403で止める

関連:

- `src/app.js:65`（`express.json({ limit: '10mb' })`）
- `src/app.js:104`（Webhookルートハンドラ本体。`req.body.events` を直接処理）

補足（再検証）: `src/` 全体で `x-line-signature` / `validateSignature` / HMAC 検証は0件。`@line/bot-sdk` は `LineService.js` で `Client`（送信用）としてのみ利用しており、SDK提供の `middleware` / `validateSignature` は未使用。

### 2. `ChannelManager.getChannelMapping()` が未実装

`MessageBridge.updateChannelNameIfNeeded()` が `this.channelManager.getChannelMapping(sourceId)` を呼ぶが、`ChannelManager` 側に該当メソッドがない。

影響:

- `getChannelMapping` はメソッド定義自体が存在しない（`ChannelManager` の公開メソッドは `getLineUserId`（`:343`）と `updateChannelName`（`:491`）のみ）
- そのため呼び出し時に `TypeError: this.channelManager.getChannelMapping is not a function` が throw され、`updateChannelNameIfNeeded` の `try/catch`（`MessageBridge.js:630`）で握られてdebugログに落ちる
- 結果としてLINEグループ名変更時のDiscordチャンネル名更新が常に失敗し、運用上気づきにくい

推奨:

- `ChannelManager.getChannelMapping(sourceId)` を追加（内部の `this.mappings.get(sourceId)` を公開するアクセサ）
- もしくは呼び出し側を `this.channelManager.mappings.get(sourceId)` に変更、またはグループ名更新ロジック自体を `ChannelManager` に移す
- グループ名変更時のテストを追加（現状この経路を通るテストがないため回帰検知できていない）

関連:

- `src/services/MessageBridge.js:606`
- `src/services/ChannelManager.js`

## P1: 高優先度の構造改善

### 3. LINE送信責務が分散している

現在、LINE送信は複数箇所に散っている。

- `MessageBridge.sendTrackedLineMessage()`
- `MessageBridge.createTrackedLineService()`
- `MediaService.processDiscordImage()` などの各メディア処理
- `LineUsageMonitor` の管理者通知

影響:

- `replyToken` をどの送信が消費するかが処理順依存になる
- Push通数記録が漏れる/二重になるリスクがある
- `replyMessage` と `pushMessage` のフォールバック方針が局所化できない

推奨:

- `LineOutboundMessage` / `LineSendPlan` を導入する
- `LineSendOrchestrator` を作り、次を一箇所で扱う
  - `replyToken` 優先
  - `quoteToken` 付与
  - Push fallback
  - 月間通数記録
  - 送信結果のmessageId回収
  - マッピング保存

関連:

- `src/services/MessageBridge.js:295`
- `src/services/MessageBridge.js:892`
- `src/services/MediaService.js:397`

### 4. `MessageBridge` が大きすぎる

`MessageBridge` はDiscordイベント、LINEイベント、変換、送信、チャンネル管理、返信処理、バッチ、利用量監視まで持っている。

推奨分割:

- `DiscordEventHandler`
- `LineWebhookEventHandler`
- `LineOutboundPlanner`
- `DiscordOutboundPlanner`
- `LineSendSession`
- `BridgeMetrics`

最初の分割候補:

- `processDiscordToLine()`
- `processLineToDiscord()`
- `sendTrackedLineMessage()`
- `sendToDiscord()`

関連:

- `src/services/MessageBridge.js`

### 5. `MediaService` が大きすぎる

`MediaService.js` は1952行あり、次を同時に担っている。

- Discord添付の取得
- MIME判定
- 画像/動画/音声/ファイル変換
- 一時ファイル管理
- 自己ホストURL生成
- LINE API送信
- CDN fallback
- ファイル名復元
- Discordスタンプ処理

影響:

- 変更の影響範囲が読みにくい
- `processDiscordAttachmentWithCdn`（小文字・`:901`）と `processDiscordAttachmentWithCDN`（大文字・`:1829`）が重複している。実際に使われるのは大文字版（呼び出し元 `:349`、テスト4箇所）で、小文字版は呼び出し元ゼロのdead code
- `fileTypeFromBuffer` 未定義参照（`:1596`）などlint上の実バグ候補が埋もれる。この参照はスコープ内にimportがなく実行時 `ReferenceError` になる。一方 `convertToStaticPng` 以外の `:1315` では `const { fileTypeFromBuffer } = await import('file-type');` と正しく動的importしているため、`:1596` を含むメソッドにも同じ動的importを追加すれば直る（`file-type` は依存に存在）

推奨分割:

- `DiscordAttachmentFetcher`
- `MediaTypeDetector`
- `ImageTransformer`
- `LineMediaMessageBuilder`
- `LineMediaToDiscordConverter`
- `DiscordMediaToLineConverter`
- `TempFileStore`
- `PublicMediaUrlService`

関連:

- `src/services/MediaService.js:26`
- `src/services/MediaService.js:901`
- `src/services/MediaService.js:1829`
- `src/services/MediaService.js:1596`

### 6. 複数LINEメッセージのマッピングが1件に潰れる

Discord 1投稿から添付、本文、位置情報、スタンプなど複数のLINEメッセージが送られる場合でも、最後の `lineMessageId` だけが `discordMessageId` に保存される。

影響:

- 後続の返信/引用が不安定になる
- 監査ログとして不完全
- `replyToken` 対応を拡張しにくい

推奨:

- `discordMessageId -> lineMessageIds[]` のモデルへ移行
- 各partに `type`, `sourcePart`, `fallback`, `sentAt`, `quoteToken` を持たせる

関連:

- `src/services/MessageBridge.js:295`
- `src/services/MessageBridge.js:392`
- `src/services/MessageMappingManager.js`

### 7. JSON永続化の信頼性がばらつく

`MessageMappingManager` はtmp+renameとsave queueを持つが、`ChannelManager` は直接writeしている。また `ChannelManager.getLineUserId()` がDiscord投稿ごとに `lastUsed` を保存する。

影響:

- 破損耐性が揃わない
- 保存頻度が高くI/Oが増える
- 並行保存時の事故が起きやすい

推奨:

- `AtomicJsonStore` / `JsonRepository` を共通化
- 書き込みはtmp+renameに統一
- `lastUsed` はdebounce保存する
- 中期的にはSQLiteへ移行

関連:

- `src/services/MessageMappingManager.js:98`
- `src/services/ChannelManager.js:74`
- `src/services/ChannelManager.js:343`

## P2: 運用/セキュリティ/品質

### 8. ログとruntime dataに秘匿情報が残りやすい

リスク:

- Webhook失敗時に `req.body` 丸ごとログ出力
- `replyToken` をログに出す
- Discord webhook URLをdebugログに出す
- `data/message-mappings.json` がリポジトリ管理対象になっている

推奨:

- loggerにredaction層を入れる
- `replyToken`, `quoteToken`, `webhook token`, userId, raw bodyはマスク
- `data/*.json`, `logs/`, `temp/`, `uploads/` をgit管理から外す運用へ移行
- 既存tracked dataは移行手順を用意してから除外

関連:

- `src/app.js:121`
- `src/services/LineService.js:149`
- `src/services/WebhookManager.js:81`
- `data/message-mappings.json`

### 9. `/temp` 静的公開とPUBLIC_BASE_URLが脆い

`/temp` を静的公開し、自己ホストURL生成時に `PUBLIC_BASE_URL` がなければlocalhost URLを作る。

影響:

- LINE側がHTTPS URLを取得できずメディア送信に失敗しやすい
- temp配下の公開範囲が広い
- ファイル名由来の運用リスクがある

推奨:

- 起動時に `PUBLIC_BASE_URL` のHTTPS必須チェックを行う
- 公開メディアは署名付きURLまたは専用public storageへ寄せる
- self-host不可ならリンクfallbackへ即時切替
- `/temp` の静的公開を廃止または限定する

関連:

- `src/app.js:74`
- `src/services/MediaService.js:1018`
- `src/services/MediaService.js:1037`

### 10. 依存関係に脆弱性がある

現環境で `npm audit --omit=dev` を実行し、14 vulnerabilitiesを確認した。

- moderate: 7
- high: 7

主な対象:

- `axios`
- `express` / `body-parser` / `path-to-regexp` / `qs`
- `discord.js` 経由の `undici` / `ws`
- `form-data`
- `lodash`
- `@line/bot-sdk` 経由の `file-type`

推奨:

- まず `npm audit fix` で非破壊更新
- `@line/bot-sdk` と `file-type` は破壊的変更を別PRで検証
- 依存更新後にメディア処理とDiscord接続の回帰テストを追加

### 11. lintが品質ゲートになっていない

`npm test` は通るが、`npm run lint` は95 errorsで失敗している（うち76件は `eslint --fix` で自動修正可能、残り19件が手動対応）。

代表例:

- quote style
- trailing comma
- `parseInt` radix
- unused variables
- `no-case-declarations`
- `fileTypeFromBuffer` 未定義

推奨:

- まず自動修正可能なstyleを `eslint --fix` で分離コミット
- 実バグ候補は別途手動修正
- CIで `npm test` と `npm run lint` を必須化

関連:

- `src/services/MediaService.js:1596`
- `src/middleware/security.js:95`
- `src/services/MessageBridge.js:830`

### 12. LINE通数制限がメモリ内だけ

`lineLimitHandler` はプロセス内カウンター（`monthlyMessageCount`、`lineLimitHandler.js:9`）のため、再起動で状態が消える。`LineUsageMonitor` 自身はカウンターを持たず `lineLimitHandler.getLimitStatus()` を参照するのみ。

影響:

- 再起動でカウントが0に戻るため、月次上限（`maxMonthlyMessages`＝190、`lineLimitHandler.js:11`）を再起動をまたいで静かに超過しうる
- 月次リセットは稼働中の `getMonth()` 差分でのみ発火するため、月境界をまたいで無通信＋再起動が重なると会計が不正確になる

推奨:

- 月次カウンターを永続化
- `replyMessage` と `pushMessage` を明確に分類
- 管理者通知の通数扱いも同じ送信経路へ寄せる
- LINE公式の利用数APIとの照合機能を検討

関連:

- `src/middleware/lineLimitHandler.js`
- `src/services/LineUsageMonitor.js`

## P3: 整理候補

### 13. 未使用/デッドコード候補

現行参照を見る限り、以下は利用されていない、または重複の可能性がある。

- `src/services/MessageQueue.js`（外部から一切require/importされていない＝dead）
- `src/utils/messageOptimizer.js`（`MessageQueue.js` からのみimportされる。MessageQueue自体がdeadのため事実上到達不能）
- `src/config/fileProcessing.js`（どこからもimportされていない＝dead）
- `MediaService.processDiscordAttachmentWithCdn()` 小文字版（呼び出し元ゼロ。live版は大文字 `processDiscordAttachmentWithCDN`）

推奨:

- 使うなら現行送信経路に統合
- 使わないなら削除
- 削除前にREADMEや設計メモとの整合を確認

### 14. Discord API境界が分散している

`DiscordService` はあるが、実送信は `MessageBridge.sendToDiscord()`、Webhook送信は `WebhookManager`、チャンネル操作は `ChannelManager` に分散している。

推奨:

- `DiscordGateway` / `DiscordOutboundSender` に集約
- Webhook送信、bot reply、通常送信を同じ抽象の下に置く
- `MessageBridge` から `this.discord.channels.fetch()` を減らす

## 推奨リファクタリング順

### Phase 0: 入口防御と明確なバグ修正

1. LINE Webhook署名検証を追加
2. ログredactionを追加
3. `ChannelManager.getChannelMapping()` 不在を修正
4. `data/*.json`, `logs/`, `temp/`, `uploads/` の扱いを整理

### Phase 1: 品質ゲートを信頼できる状態へ

1. `npm audit fix` 可能な依存更新
2. lintの自動修正
3. `fileTypeFromBuffer` 未定義など実バグ候補を修正
4. CIで `npm test` / `npm run lint` を必須化

### Phase 2: LINE送信を集約

1. `LineOutboundMessage` / `LineSendPlan` を定義
2. `LineSendOrchestrator` を作る
3. `replyToken`, `quoteToken`, Push fallback, 通数記録を集約
4. `MessageBridge.processDiscordToLine()` を薄くする

### Phase 3: メディア処理を分割

1. `MediaService` からLINE API送信を取り除く
2. Discord添付を `LineOutboundMessage[]` に変換するだけにする
3. CDN fallbackとfile fallbackを統合
4. download cap / timeout / HEAD先行確認を入れる
5. `/temp` 公開を置き換える

### Phase 4: 永続化とマッピングを再設計

1. `AtomicJsonStore` を導入
2. Channel/Message mapping保存を共通化
3. `discordMessageId -> lineMessageIds[]` へ拡張
4. 中期的にSQLite化を検討

### Phase 5: Discord側境界とFeature拡張

1. `DiscordOutboundSender` を作る
2. `DiscordService` / `WebhookManager` / 直接client操作を整理
3. `BridgeFeatureManager` をfeature pipeline化
4. Reply/Reactionなどを同じ拡張点に乗せる

## 最初に着手するなら

最初の実装単位としては、次の順が一番事故が少ない。

1. Webhook署名検証
2. `ChannelManager.getChannelMapping()` 修正
3. lint baselineのうち実バグ候補だけ修正
4. `LineSendOrchestrator` の薄い導入
5. `MediaService` のLINE送信直接呼び出しを段階的に撤去

## 進行ログ

### 2026-07-01 Phase 0 着手

完了:

- LINE Webhook署名検証を追加
  - `src/middleware/lineSignature.js` を追加
  - `src/app.js` のLINE Webhookルートに `lineSignatureMiddleware` を追加
  - `express.json()` の `verify` でWebhook raw bodyを保持
  - `LINE_SIGNATURE_VALIDATION_ENABLED=false` で一時的に無効化できる互換逃げ道を追加
- Webhookエラーログから `req.body` の丸ごと出力を削除
  - `eventCount` のみ記録する形に変更
- `ChannelManager.getChannelMapping(sourceId)` を追加
  - `MessageBridge.updateChannelNameIfNeeded()` が未実装メソッドを呼んでいたP0バグを修正
- ログredactionを導入
  - `src/utils/logRedaction.js` を追加
  - `replyToken`, `quoteToken`, `channelAccessToken`, `channelSecret`, Discord webhook URL/token, raw body系キーをマスク
  - loggerのconsole/file両方のformatにredactionを適用
- `env.example` に `LINE_SIGNATURE_VALIDATION_ENABLED=true` を追加

追加テスト:

- 正しいLINE署名のWebhookは処理される
- 不正なLINE署名のWebhookは401で拒否される
- `getChannelMapping()` の既存/未知source ID挙動
- グループ相当マッピングの `updateChannelName()` 挙動
- ログredactionの再帰マスク、文字列内tokenマスク、Error処理、循環参照処理

検証:

- `npm test -- --runTestsByPath src/__tests__/app.test.js src/services/__tests__/ChannelManager.test.js` 通過
- `npm test -- --runTestsByPath src/utils/__tests__/logRedaction.test.js` 通過

運用互換メモ:

- 署名検証はデフォルト有効。LINE Developers側のWebhook URLから来る正規リクエストは `x-line-signature` が付くため通る想定
- 既存環境で中継やプロキシにより署名検証が一時的に通らない場合は、緊急回避として `LINE_SIGNATURE_VALIDATION_ENABLED=false` で旧挙動に戻せる
- `data/*.json` のgit除外/移行はまだ未実施。既存運用データを壊さないため、別フェーズで移行手順付きで行う

### 2026-07-01 Phase 1 足場追加

完了:

- `LineSendSession` を追加
  - `replyToken` の1回限りのclaimを専用オブジェクトに閉じ込めた
  - `getPushContext()` でPush fallback時に `replyToken` 系フィールドを落とし、`quoteToken` は維持する
  - `MessageBridge.sendTrackedLineMessage()` は従来どおりプレーンなcontextオブジェクトも受け取れるよう互換を保持
- `MessageBridge.processDiscordToLine()` で1つのDiscordメッセージに対して同じ `LineSendSession` を使うように変更
  - 挙動は「最初の1送信だけreplyTokenを試す」現状維持
  - 共有contextへの `replyToken = null` 代入をやめた
- `MediaService.convertToStaticPng()` の `fileTypeFromBuffer` 未定義参照を修正
  - 既存の `detectFileType()` と同様に `file-type` を動的importする形にした
- `.gitignore` に `data/message-mappings.json`, `temp/`, `uploads/` を追加
  - 既存の運用データは削除しない
  - 今後のruntime生成物が追加で混ざるのを防ぐだけの変更

追加テスト:

- `LineSendSession.claimReplyToken()` は1回だけtokenを返す
- `LineSendSession.getPushContext()` はreply token系を除外し、quote contextを保持する

検証:

- `npm test -- --runTestsByPath src/services/__tests__/LineSendSession.test.js src/services/__tests__/MessageBridge.test.js src/features/__tests__/ReplyBridgeFeature.test.js src/services/__tests__/MessageMappingManager.test.js` 通過
- `npm test` 通過（16 suites / 105 tests）
- 新規追加/変更の主要ファイル単位でESLint通過
  - `src/services/LineSendSession.js`
  - `src/middleware/lineSignature.js`
  - `src/utils/logRedaction.js`
  - `src/utils/logger.js`
  - `src/__tests__/app.test.js`
  - `src/services/__tests__/LineSendSession.test.js`
  - `src/utils/__tests__/logRedaction.test.js`
- `npm run lint` 全体通過
  - `eslint --fix` で既存の自動修正可能なスタイル違反を整理
  - 残った未使用引数、`switch/case` のブロックスコープ、`parseInt(..., 10)`、意図的な2バイト文字検出正規表現を手動で最小修正
- `npm test` 全体通過（16 suites / 105 tests）

運用互換メモ:

- `LineSendSession` は内部実装の足場であり、外部設定やWebhook payload、既存のDiscord/LINE送信操作は変えない
- `.gitignore` 追加は追跡済みファイルを自動削除しないため、既存環境のマッピングファイル運用には影響しない
- lint整理はフォーマット/静的解析対応が中心。既存のruntime dataや環境変数、Webhook URLは変更しない

次に進める候補:

- P2-10: 依存関係脆弱性のうち semver 内で解消できるものを先に適用
- P1-4/P1-5: `MessageBridge` / `MediaService` の分割。ただし大きな差分になるため、lint baseline後の別コミット単位推奨
- P1-7/P2-12: JSON永続化とLINE通数カウントを、既存JSONを読み込める互換層つきで堅牢化

### 2026-07-01 P2-10 依存関係の安全側更新

完了:

- `npm audit fix --omit=dev` を force なしで実行
  - semver互換の範囲で `axios`, `express` 系推移依存、`ws` などを更新
  - `package-lock.json` を現行 `package.json`（`line-discord-bridge@3.1.4`）と同期
- `npm install` を再実行し、開発依存を含むローカル検証環境を復元

検証:

- `npm audit --omit=dev`: 14 vulnerabilities（moderate 7 / high 7）から 7 vulnerabilities（moderate 6 / high 1）へ減少
- `npm run lint` 全体通過
- `npm test` 全体通過（16 suites / 105 tests）

残り:

- `file-type` / `@line/bot-sdk` は `file-type@22` へのbreaking changeが必要
- `discord.js` 系の `undici` 残存は `npm audit fix --force` が `discord.js@13.17.1` への破壊的ダウングレードを提示するため、今回は適用しない
- `uuid` は `uuid@14` へのbreaking changeが必要なため、利用箇所確認後に別フェーズで対応する

運用互換メモ:

- force更新は未実施。Discord/LINE SDKのmajor変更やダウングレードは本番挙動への影響が大きいため、別ブランチ/別検証単位で扱う

### 2026-07-01 P1-7 JSON永続化の安全化

完了:

- `src/utils/jsonFileStore.js` を追加
  - JSON読み込みを共通化
  - 親ディレクトリを自動作成
  - 一時ファイルへ書き込んでからrenameするatomic保存に統一
  - 保存失敗時は一時ファイルをベストエフォートで削除
- `ChannelManager.saveMappings()` をatomic保存化
  - 既存の `data/channel-mappings.json` 形式は変更しない
  - 保存キューを追加し、同時保存でファイル内容が競合しにくい形にした
- `MessageMappingManager.saveMappings()` を共通ヘルパーへ移行
  - 既存の `data/message-mappings.json` 形式は変更しない
  - 失敗した保存があっても、次回保存時にキューが拒否状態で固まらないよう修正

追加テスト:

- `writeJsonFileAtomic()` が親ディレクトリを作ってJSONを書ける
- `writeJsonFileAtomic()` が既存JSONを置き換えられる

検証:

- `npm run lint` 全体通過
- `npm test -- --runTestsByPath src/utils/__tests__/jsonFileStore.test.js src/services/__tests__/ChannelManager.test.js src/services/__tests__/MessageMappingManager.test.js` 通過
- `npm test` 全体通過（17 suites / 107 tests）
- `git diff --check` 通過（CRLF変換warningのみ）

運用互換メモ:

- runtime JSONのスキーマや保存先は変えない。読み込み済み既存データをそのまま保存し直すだけ
- `.gitignore` により今後のruntime JSON混入は抑止するが、追跡済み/既存配置済みの運用ファイルは削除しない

### 2026-07-01 現時点の最終確認

通過:

- `npm run lint`
- `npm test`（17 suites / 107 tests）
- `git diff --check`（CRLF変換warningのみ）
- `npm audit --omit=dev --audit-level=critical`（criticalなし）

残存リスク:

- `npm audit --omit=dev` は 7 vulnerabilities（moderate 6 / high 1）が残る
- 残存分は `npm audit fix --force` が必要で、`file-type@22`, `uuid@14`, または `discord.js@13.17.1` への破壊的変更/ダウングレードを伴うため、現行稼働互換を優先して今回は保留

### 2026-07-01 P2-12 LINE通数カウントの再起動耐性

完了:

- `lineLimitHandler` に `initialize()` を追加し、起動時に `data/line-usage.json` から月間Push通数を復元するようにした
- `recordMessageSent()` と月替わりリセット時に、通数状態をatomic保存するようにした
- 年またぎでも月次リセットされるよう `lastResetYear` を保存/判定に追加
- `MessageBridge.initialize()` で `lineLimitHandler.initialize()` を呼ぶようにした
- `.gitignore` に `data/line-usage.json` を追加

追加テスト:

- 現在月の保存済み通数を読み込める
- 前月分の保存済み通数は起動時に0へリセットされ、保存し直される
- `recordMessageSent()` 後の通数がJSONへ保存される

検証:

- `npm run lint` 全体通過
- `npm test -- --runTestsByPath src/middleware/__tests__/lineLimitHandler.test.js src/services/__tests__/MessageBridge.test.js src/services/__tests__/MessageBridge.replyWebhook.test.js` 通過

運用互換メモ:

- 既存の同期API（`shouldLimitMessage()` / `recordMessageSent()` / `getLimitStatus()`）は維持
- 保存先JSONがない環境では従来通り0通から開始し、初回起動時に `data/line-usage.json` を作成する
- LINE APIから実使用数を取得するものではないため、外部からLINE管理画面/APIで送ったPush通数までは反映しない。この点は次フェーズの運用ルールまたは管理コマンドで補う

### 2026-07-01 P1-3 replyToken判定のPolicy化

完了:

- `ReplyTokenPolicy` を追加
- `ReplyBridgeFeature` / `MessageMappingManager` の重複していた `replyTokenExpiry` 判定を共通化
- 期限作成も `ReplyTokenPolicy.createExpiry()` に集約し、将来のclock注入テストやTTL変更に備えた

検証:

- `npm run lint` 全体通過
- `npm test -- --runTestsByPath src/services/__tests__/ReplyTokenPolicy.test.js src/features/__tests__/ReplyBridgeFeature.test.js src/services/__tests__/MessageMappingManager.test.js src/services/__tests__/MessageBridge.test.js` 通過

運用互換メモ:

- `replyToken` の有効期限は引き続き60秒
- 既存JSONの `replyTokenExpiry` / `replyTokenUsedAt` 形式は変更しない
- `MessageMappingManager.isReplyTokenExpired()` は互換APIとして維持

### 2026-07-01 P2-9 `/temp` 静的公開の運用ガード

完了:

- `TEMP_STATIC_ENABLED` を追加
  - デフォルトは `true` で既存運用を維持
  - `TEMP_STATIC_ENABLED=false` で `/temp` 静的配信を停止できる
- `/temp` 配信時の `express.static` 設定を明示
  - `dotfiles: 'deny'`
  - `index: false`
  - `redirect: false`
  - `X-Content-Type-Options: nosniff`
  - `Cache-Control: public, max-age=300`
- `env.example` に `TEMP_STATIC_ENABLED=true` を追加

追加テスト:

- configで `/temp` 静的配信を無効化できる
- 有効時に防御的ヘッダーが付く

検証:

- `npm run lint` 全体通過
- `npm test -- --runTestsByPath src/__tests__/app.test.js` 通過

運用互換メモ:

- LINE API向け自己ホストURLで `/temp` を使う既存経路があるため、今回はデフォルト公開を維持
- 公開を止めたい環境では `TEMP_STATIC_ENABLED=false` を設定する
- 根本対応としては、今後 `/temp/:token/:filename` の短命URL化、または外部オブジェクトストレージへの移行を検討する

## 検証メモ

- `npm test`: 13 suites / 93 tests 通過（再検証で一致）
- `npm run lint`: 94 errorsで失敗（うち76件が `--fix` で自動修正可能）
- `npm audit --omit=dev`: 14 vulnerabilities（moderate 7 / high 7）。high側の主因は `discord.js` 経由の `undici`・`ws`

### 再検証ステータス（2026-07-01）

本レビューの主要な指摘（P0〜P3）はすべて現行コードに対して再検証済みで、いずれも実在を確認した。行番号もほぼ正確で、以下のみ精緻化した。

- P0-1: Webhookルート本体は `src/app.js:104`（`:103` は直前のコメント行）
- P0-2: `getChannelMapping` は未定義のため `TypeError` が throw され `try/catch`（`MessageBridge.js:630`）で握られる（単なるundefined返却ではない）
- P1-5: `MediaService.js` は正確には1952行。`fileTypeFromBuffer` 未定義は実行時 `ReferenceError`（`:1315` の動的import例を流用して修正可能）
- P2-12: 月次上限は190通（`lineLimitHandler.js:11`）で、再起動またぎで超過しうる

## 参考URL

- LINE Messaging API message types: https://developers.line.biz/en/docs/messaging-api/message-types/
- LINE Messaging API sending messages: https://developers.line.biz/en/docs/messaging-api/sending-messages/
