class ReplyTokenPolicy {
  constructor(options = {}) {
    this.now = options.now || (() => Date.now());
    this.replyTokenTtlMs = options.replyTokenTtlMs || 60000;
  }

  createExpiry() {
    return new Date(this.now() + this.replyTokenTtlMs).toISOString();
  }

  isExpired(mapping) {
    if (!mapping?.replyTokenExpiry) {
      return false;
    }

    return new Date(mapping.replyTokenExpiry).getTime() <= this.now();
  }

  isUsable(mapping) {
    return !!mapping?.replyToken && !mapping.replyTokenUsedAt && !this.isExpired(mapping);
  }
}

module.exports = ReplyTokenPolicy;
