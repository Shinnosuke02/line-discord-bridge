/**
 * Per-Discord-message LINE send state.
 */
class LineSendSession {
  constructor(context = {}) {
    this.context = { ...context };
    this.replyTokenConsumed = false;
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
}

module.exports = LineSendSession;
