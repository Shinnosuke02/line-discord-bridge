# メッセージ返信機能の相互実現可能性調査報告書

## 調査日
2025年1月

## 調査目的
LINE APIとDiscord Bot APIの最新仕様を調査し、LINE⇄Discord間でのメッセージ返信機能の相互実現が可能かどうかを検証する。

---

## 1. LINE APIの返信機能仕様

### 1.1 返信方法

#### 方法1: replyTokenを使用した返信（推奨）
- **API**: `replyMessage(replyToken, messages)`
- **replyTokenの特徴**:
  - Webhookイベントに含まれる
  - **有効期限**: 30秒以内
  - **使用回数**: 1回のみ（使用後は無効化）
  - **制限**: 同じreplyTokenを複数回使用できない

#### 方法2: pushMessageを使用した通常送信
- **API**: `pushMessage(userId, messages)`
- **特徴**:
  - 返信として表示されない（通常のメッセージとして送信）
  - replyTokenの有効期限切れ後でも使用可能
  - 月間メッセージ送信数の制限にカウントされる

### 1.2 現在の実装状況
- ✅ `LineService.replyMessage()`: 実装済み
- ✅ `LineService.pushMessage()`: 実装済み
- ✅ メッセージマッピング管理: `MessageMappingManager`に返信用メソッドが存在

---

## 2. Discord Bot APIの返信機能仕様

### 2.1 返信方法

#### 方法1: message.reply()を使用した返信
- **API**: `message.reply(content)`
- **特徴**:
  - 返信として表示される（元のメッセージにリンク）
  - `message.reference.messageId`で返信元を取得可能
  - Webhookでも使用可能

#### 方法2: Webhookでの返信
- **API**: `webhook.send({ content, messageReference: { messageId } })`
- **特徴**:
  - Webhook経由でも返信として表示可能
  - `messageReference`オブジェクトで返信元を指定

### 2.2 現在の実装状況
- ✅ `DiscordService.replyToMessage()`: 実装済み
- ✅ `WebhookManager.sendMessage()`: 実装済み（返信対応は未実装）
- ✅ メッセージ参照の取得: `message.reference?.messageId`で検出可能

---

## 3. 実現可能性の分析

### 3.1 Discord → LINE の返信（実現可能度: ⭐⭐⭐⭐）

#### 実現方法
1. Discordで返信メッセージを検出（`message.reference?.messageId`）
2. 返信元のDiscordメッセージIDから、対応するLINEメッセージIDを取得
3. LINEメッセージIDから、元のLINEイベントの`replyToken`を取得
   - **問題**: `replyToken`は30秒で無効化されるため、時間が経過している場合は使用不可
4. `replyToken`が有効な場合: `replyMessage()`を使用
5. `replyToken`が無効な場合: `pushMessage()`を使用（返信として表示されない）

#### 課題
- ❌ **replyTokenの有効期限**: 30秒以内に返信しないと、返信として表示できない
- ⚠️ **replyTokenの保存**: 元のLINEイベントの`replyToken`を保存する必要がある
- ✅ **フォールバック**: `pushMessage()`で通常送信は可能

#### 実装の複雑さ
- **中程度**: replyTokenの管理と有効期限チェックが必要

---

### 3.2 LINE → Discord の返信（実現可能度: ⭐⭐⭐⭐⭐）

#### 実現方法
1. LINEで返信メッセージを受信（Webhookイベント）
2. 返信元のLINEメッセージIDを特定
3. LINEメッセージIDから、対応するDiscordメッセージIDを取得
4. Discordで`message.reply()`またはWebhookの`messageReference`を使用して返信

#### 課題
- ✅ **Discord APIの柔軟性**: 返信元メッセージIDがあれば、いつでも返信可能
- ✅ **Webhook対応**: Webhook経由でも返信可能
- ✅ **メッセージマッピング**: 既に実装済み

#### 実装の複雑さ
- **低**: 既存のメッセージマッピング機能を活用可能

---

## 4. 技術的な実装要件

### 4.1 必要な機能拡張

#### MessageMappingManagerの拡張
```javascript
// replyTokenの保存が必要
async mapLineToDiscord(lineMessageId, discordMessageId, lineUserId, discordChannelId, replyToken) {
  // replyTokenを保存
}

// replyTokenの取得
getReplyTokenForLineMessage(lineMessageId) {
  // 保存されたreplyTokenを取得
}
```

#### MessageBridgeの拡張
```javascript
// Discord → LINE の返信処理
async processDiscordReplyToLine(message, lineUserId) {
  // 1. 返信元のDiscordメッセージIDを取得
  const originalDiscordMessageId = message.reference?.messageId;
  
  // 2. LINEメッセージIDを取得
  const lineMessageId = this.messageMappingManager.getLineMessageIdForDiscordReply(originalDiscordMessageId);
  
  // 3. replyTokenを取得
  const replyToken = this.messageMappingManager.getReplyTokenForLineMessage(lineMessageId);
  
  // 4. 返信送信
  if (replyToken && this.isReplyTokenValid(replyToken)) {
    await this.lineService.replyMessage(replyToken, message);
  } else {
    // フォールバック: 通常送信
    await this.lineService.pushMessage(lineUserId, message);
  }
}

// LINE → Discord の返信処理
async processLineReplyToDiscord(event) {
  // 1. 返信元のLINEメッセージIDを特定（イベントから取得）
  // 2. DiscordメッセージIDを取得
  // 3. Discordで返信送信
}
```

#### WebhookManagerの拡張
```javascript
// Webhookでの返信送信
async sendReplyMessage(channelId, message, username, avatarUrl, replyToMessageId) {
  const webhookMessage = {
    content: message.content,
    username: username,
    avatarURL: avatarUrl,
    files: message.files || [],
    messageReference: {
      messageId: replyToMessageId
    }
  };
  
  return await webhook.send(webhookMessage);
}
```

### 4.2 データ構造の拡張

#### メッセージマッピングの拡張
```json
{
  "lineToDiscord": {
    "lineMessageId": {
      "lineMessageId": "...",
      "discordMessageId": "...",
      "lineUserId": "...",
      "discordChannelId": "...",
      "replyToken": "...",  // 追加
      "replyTokenExpiry": "2025-01-01T00:00:30Z",  // 追加
      "timestamp": "..."
    }
  }
}
```

---

## 5. 実現可能性の総合評価

### 5.1 実現可能性スコア

| 機能 | 実現可能度 | 実装難易度 | 備考 |
|------|-----------|-----------|------|
| LINE → Discord 返信 | ⭐⭐⭐⭐⭐ | 低 | 既存機能で実現可能 |
| Discord → LINE 返信 | ⭐⭐⭐⭐ | 中 | replyToken管理が必要 |

### 5.2 制約事項

1. **LINE replyTokenの有効期限**
   - 30秒以内に返信しないと、返信として表示できない
   - フォールバックとして通常送信は可能

2. **メッセージマッピングの永続化**
   - replyTokenを保存する必要がある
   - 有効期限切れのreplyTokenは削除する必要がある

3. **Webhook再送信への対応**
   - 既に実装済みの重複チェック機能を活用

### 5.3 推奨実装方針

#### フェーズ1: LINE → Discord の返信（優先度高）
- 実装難易度: 低
- ユーザー体験への影響: 高
- 実装推奨度: ⭐⭐⭐⭐⭐

#### フェーズ2: Discord → LINE の返信（優先度中）
- 実装難易度: 中
- ユーザー体験への影響: 中
- 実装推奨度: ⭐⭐⭐⭐
- 注意: replyTokenの有効期限により、完全な返信機能は保証できない

---

## 6. 結論

### 6.1 実現可能性
✅ **実現可能**: LINE⇄Discord間でのメッセージ返信機能の相互実現は技術的に可能です。

### 6.2 推奨事項
1. **段階的実装**: まずLINE → Discordの返信機能を実装し、その後Discord → LINEの返信機能を実装
2. **フォールバック機能**: replyTokenが無効な場合でも、通常送信で対応
3. **ユーザーへの説明**: Discord → LINEの返信は、30秒以内の返信のみ返信として表示されることを明記

### 6.3 実装時の注意点
- replyTokenの有効期限管理
- メッセージマッピングの拡張
- Webhookでの返信対応
- エラーハンドリングの強化

---

## 7. 参考資料

- [LINE Messaging API - メッセージの受信](https://developers.line.biz/ja/docs/messaging-api/receiving-messages/)
- [LINE Messaging API - メッセージの送信](https://developers.line.biz/ja/docs/messaging-api/sending-messages/)
- [Discord.js Documentation - Message Replies](https://discord.js.org/#/docs/discord.js/main/class/Message?scrollTo=reply)
- [Discord API - Webhooks](https://discord.com/developers/docs/resources/webhook)

