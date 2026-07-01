# replyToken対応後リファクタリングレビュー

作成日: 2026-07-01

## 現状

DiscordでLINE由来のメッセージへ標準返信した場合、保存済みのLINE `replyToken` が未使用かつ期限内であれば、Discord→LINE送信を `replyMessage` で試行するようにした。

`replyToken` が使えない場合、または `replyMessage` が失敗した場合は、既存挙動を維持して `quoteToken` 付き `pushMessage` にフォールバックする。

## 対象になる操作

- Discord上で、LINEから転送されたメッセージに対して標準の「返信」を使う
- 返信先Discordメッセージが、LINEメッセージIDとのマッピングを持っている
- 保存済み `replyToken` が未使用で、期限内である

## 実装上の判断

- `replyToken` はLINE側で消費状態を正確に問い合わせられないため、`replyMessage` 呼び出し前に使用済みとして記録する
- `replyMessage` が失敗した場合も、同じ `replyToken` は再試行しない
- 運用継続性を優先し、失敗時は既存の `pushMessage` フォールバックを維持する
- Reply API成功時は月間Push通数として記録しない

## チームレビュー所見

### 1. replyToken状態管理を分離したい

現在は `markReplyTokenUsed()`（`MessageMappingManager.js:218-244`）が「使用権の確保」（`replyTokenUsedAt`・期限チェックで不可なら false 返却）と「使用済み記録」（`replyTokenUsedAt` セット＋永続化）を1メソッドで兼ねている。今後は次の状態を分けると、失敗時の挙動を読みやすくできる。

- `replyTokenClaimedAt`
- `replyTokenSentAt`
- `replyTokenFailedAt`

LINE APIのタイムアウト時は、LINE側で実際には送信済みの可能性がある。Pushフォールバックは二重送信になりうるため、将来的にはフォールバック方針を設定化したい。

候補:

- `REPLY_TOKEN_FALLBACK=push`
- `REPLY_TOKEN_FALLBACK=notify`
- `REPLY_TOKEN_FALLBACK=drop`

### 2. 送信オーケストレーションを切り出したい

`MessageBridge` は、Discordイベント処理、メディア処理、LINE送信、通数記録、返信トークン制御を同時に抱えている。

次のような小さな責務へ分けるとテストしやすい。

- `LineSendSession`
- `LineOutboundMessageBuilder`
- `ReplyTokenPolicy`
- `LineDeliveryRecorder`

特に、添付ファイル、本文、位置情報、スタンプが複数のLINE送信に分かれるケースでは、どの1件に `replyToken` を使うかが順序依存になっている。

### 3. replyToken判定を一箇所へ寄せたい

現在は `ReplyBridgeFeature.isReplyTokenUsable()`（`ReplyBridgeFeature.js:76-86`）と `MessageMappingManager.isReplyTokenExpired()`（`MessageMappingManager.js:250-256`）の両方が、それぞれ独立に `replyTokenExpiry` と `Date.now()` を比較している。将来的には `MessageMappingManager` または専用Policyに寄せる。

候補API:

- `getUsableReplyTokenByDiscordMessageId(discordMessageId)`
- `claimReplyTokenForDiscordMessage(discordMessageId)`

時計依存も `Date.now()` 直呼び（`MessageMappingManager.js:146`＝期限セット `Date.now() + 60000`、同 `:255`、`ReplyBridgeFeature.js:85`）ではなく、テスト用にclockを注入できる形が望ましい。

### 4. 複数メッセージ対応を検討したい

LINEのReply APIは最大5 message objectsを1回で送れる。今は「最初の1送信だけreplyTokenを試す」実装なので、将来的にはDiscordメッセージからLINE送信用payload配列を先に組み立て、1回の `replyMessage` にまとめたい。

優先度が高いケース:

- テキスト + 位置情報
- テキスト + 添付
- 複数添付
- スタンプ + テキストフォールバック

### 5. テスト拡充候補

追加済み:

- `replyToken` 優先送信
- `replyToken` 不可時のPushフォールバック
- `replyToken` の1分期限保存
- 使用済み記録
- 期限切れ拒否
- 位置情報送信のPush通数二重記録防止

今後追加したい:

- `replyMessage` 失敗時にPushへ落ちるが、同じ `replyToken` は再利用しない
- `processDiscordToLine()` 経由でDiscord標準返信がReply APIに到達する統合寄りテスト
- 添付ありメッセージで最初の送信だけ `replyToken` を消費する現状挙動
- Google Mapsリンク分割時の送信順序
- fake timersによる期限テストの安定化

## 推奨リファクタリング順

1. `ReplyTokenPolicy` を作り、期限判定と使用権確保を集約する（2026-07-01 部分完了: 期限作成/期限切れ/使用可否を集約）
2. `LineSendSession` を作り、1つのDiscordメッセージに対するLINE送信状態を持たせる（2026-07-01 完了）
3. `MessageBridge.processDiscordToLine()` からLINE payload構築と送信を分離する
4. フォールバック方針を環境変数で切り替えられるようにする
5. 複数LINE message objectsを1回の `replyMessage` にまとめる

## 進行ログ

### 2026-07-01 `LineSendSession` 導入

完了:

- `src/services/LineSendSession.js` を追加し、`replyToken` の1回限りの使用権を `claimReplyToken()` に閉じ込めた
- `MessageBridge.processDiscordToLine()` から同じ `LineSendSession` を各LINE送信経路へ渡すようにした
- Push fallback時は `getPushContext()` で `replyToken` 系フィールドを除外し、`quoteToken` は維持する
- 既存互換のため、`sendTrackedLineMessage()` は従来のプレーンcontextオブジェクトも受け取れる

検証:

- `npm test -- --runTestsByPath src/services/__tests__/LineSendSession.test.js src/services/__tests__/MessageBridge.test.js src/features/__tests__/ReplyBridgeFeature.test.js src/services/__tests__/MessageMappingManager.test.js` 通過
- `npm run lint` 全体通過
- `npm test` 全体通過（16 suites / 105 tests）

### 2026-07-01 `ReplyTokenPolicy` 導入

完了:

- `src/services/ReplyTokenPolicy.js` を追加
- `replyToken` の期限作成、期限切れ判定、使用可否判定を集約
- `ReplyBridgeFeature` の `Date.now()` 直呼び期限判定を撤去
- `MessageMappingManager` の期限作成/期限切れ判定を `ReplyTokenPolicy` 経由へ変更
- 既存互換のため `MessageMappingManager.isReplyTokenExpired()` は残し、中身だけPolicyへ委譲

追加テスト:

- `createExpiry()` がTTLを反映する
- 使用済み/期限切れ/未設定tokenを拒否する
- 期限内かつ未使用tokenを使用可能と判定する

検証:

- `npm run lint` 全体通過
- `npm test -- --runTestsByPath src/services/__tests__/ReplyTokenPolicy.test.js src/features/__tests__/ReplyBridgeFeature.test.js src/services/__tests__/MessageMappingManager.test.js src/services/__tests__/MessageBridge.test.js` 通過

## 再検証ステータス（2026-07-01）

現行の作業ツリー（`ReplyBridgeFeature.js` / `MessageBridge.js` / `MessageMappingManager.js` の未コミット変更を含む）に対し本レビュー内容を再検証済み。以下を確認した。

- Discord標準返信 → `replyMessage` 試行 → 失敗/不可時に `quoteToken` 付き `pushMessage` へフォールバックする実装は `MessageBridge.sendTrackedLineMessage()`（`:892`）／`sendLineReplyMessageIfAvailable()`（`:923-959`）に存在する
- Reply API成功時は `lineLimitHandler.recordMessageSent()`（Push経路の `:917` でのみ呼ばれる）に到達せず、月間Push通数に計上されない
- 期限判定が2箇所に重複、`markReplyTokenUsed()` が使用権確保と使用済み記録を兼ねる点も上記の通り実在（セクション1・3参照）

## 注意

`replyToken` は1分以内かつ1回だけというLINE側制約があるため、完全な返信保証ではなく「短時間のDiscord標準返信を月間Push通数なしで送れる可能性を拾う」機能として扱う。
