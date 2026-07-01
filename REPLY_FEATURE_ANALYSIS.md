# メッセージ返信機能の実装状況メモ

更新日: 2026-07-01

この文書は、LINE ⇄ Discord 間の返信連携について、現在の実装状況と制約をまとめたものです。初期調査時点の「実現可能性」ではなく、現行コードの仕様に合わせています。

## 現在の結論

- LINE → Discord の返信連携は実装済み
- Discord → LINE の返信連携も実装済み
- Discord → LINE は `replyToken` が使える短時間のみ Reply API を使い、それ以外は `quoteToken` 付き Push または通常 Push にフォールバック
- 返信機能は `BRIDGE_REPLY_ENABLED=false` で無効化可能

## LINE → Discord

LINE webhook のメッセージに `quotedMessageId` が含まれる場合、`MessageMappingManager` から対応する Discord メッセージIDを探し、Discord 側へ返信として送信します。

関連実装:

- `src/features/ReplyBridgeFeature.js`
- `src/services/MessageBridge.js`
- `src/services/MessageMappingManager.js`

送信モード:

- `LINE_TO_DISCORD_REPLY_MODE=webhook`
  - LINEユーザー名/アイコン表示を優先
- `LINE_TO_DISCORD_REPLY_MODE=bot-reply`
  - Discord Bot のネイティブ reply 表示を優先

## Discord → LINE

Discordで LINE由来メッセージへ標準返信した場合、返信元の Discord メッセージIDから LINE側の保存済みコンテキストを解決します。

送信優先順:

1. `replyToken` が未使用かつ期限内なら `replyMessage()`
2. `replyToken` が使えない場合は `quoteToken` 付き `pushMessage()`
3. `quoteToken` もない場合は通常の `pushMessage()`

関連実装:

- `src/features/ReplyBridgeFeature.js`
- `src/services/ReplyTokenPolicy.js`
- `src/services/LineSendSession.js`
- `src/services/MessageBridge.js`
- `src/services/MessageMappingManager.js`

## replyToken 管理

`replyToken` は短時間かつ1回のみ使える制約があります。現在の実装では、LINE由来メッセージをDiscordへ転送するときに `replyToken` と期限を保存します。

保存項目:

- `replyToken`
- `replyTokenExpiry`
- `replyTokenUsedAt`
- `quoteToken`

設計方針:

- 期限作成/期限切れ/使用可否は `ReplyTokenPolicy` に集約
- 1つのDiscordメッセージ処理内で `replyToken` を複数回消費しないよう `LineSendSession` が管理
- `replyMessage()` 呼び出し前に使用済み記録を行い、同じtokenの再利用を避ける
- 失敗時も既存運用を止めないため、Push fallbackを維持

## 制約

- `replyToken` が期限切れの場合、LINE上のネイティブ返信にはできない
- `quoteToken` がある場合は引用付きPushとして近い表示を狙う
- LINEの仕様上、すべてのメッセージ種別で同じ返信表示を保証できるわけではない
- 複数LINEメッセージに分かれるDiscord送信では、現状は最初の1送信だけ `replyToken` を試す

## 今後の改善候補

- 複数LINE message objectsを1回の `replyMessage()` にまとめる
- `replyToken` 失敗時の fallback 方針を環境変数化する
- `MessageBridge` から LINE payload 構築と送信オーケストレーションを分離する
- fake timers を使った期限テストをさらに増やす

## テスト

関連テスト:

- `src/features/__tests__/ReplyBridgeFeature.test.js`
- `src/services/__tests__/ReplyTokenPolicy.test.js`
- `src/services/__tests__/LineSendSession.test.js`
- `src/services/__tests__/MessageBridge.test.js`
- `src/services/__tests__/MessageMappingManager.test.js`
