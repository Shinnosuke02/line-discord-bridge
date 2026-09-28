/**
 * Per-Discord-message LINE send state.
 */
class LineSendSession {
  constructor(context = {}) {
    this.context = { ...context };
    this.replyTokenConsumed = false;
    this.sentMessages = [];
  }

  claimReplyToken() {
    if (
      this.replyTokenConsumed ||
      !this.context.replyToken ||
      !this.context.replyTokenLineMessageId
    ) {
      return null;
    }

    this.replyTokenConsumed = true;

    return {
      replyToken: this.context.replyToken,
      replyTokenLineMessageId: this.context.replyTokenLineMessageId,
      replyTokenExpiry: this.context.replyTokenExpiry || null
    };
  }

  getPushContext() {
    const pushContext = { ...this.context };
    delete pushContext.replyToken;
    delete pushContext.replyTokenLineMessageId;
    delete pushContext.replyTokenExpiry;

    return pushContext;
  }

  recordResult(result, messageType = null, transport = null) {
    if (!result?.messageId) {
      return null;
    }

    if (this.sentMessages.some((item) => item.lineMessageId === result.messageId)) {
      return this.sentMessages.find((item) => item.lineMessageId === result.messageId);
    }

    const item = {
      lineMessageId: result.messageId,
      quoteToken: result.quoteToken || result.sentMessage?.quoteToken || null,
      messageType,
      transport,
      ordinal: this.sentMessages.length
    };
    this.sentMessages.push(item);
    return item;
  }

  getSentMessages() {
    return this.sentMessages.map((item) => ({ ...item }));
  }
}

module.exports = LineSendSession;
