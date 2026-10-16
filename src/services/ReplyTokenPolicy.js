// @ts-check

/**
 * @typedef {{ now?: () => number, replyTokenTtlMs?: number }} ReplyTokenPolicyOptions
 * @typedef {{ replyToken?: string | null, replyTokenExpiry?: string | null, replyTokenUsedAt?: string | null }} ReplyTokenMapping
 */

class ReplyTokenPolicy {
  /**
   * @param {ReplyTokenPolicyOptions} [options]
   */
  constructor(options = {}) {
    this.now = options.now || (() => Date.now());
    this.replyTokenTtlMs = options.replyTokenTtlMs || 60000;
  }

  /** @returns {string} */
  createExpiry() {
    return new Date(this.now() + this.replyTokenTtlMs).toISOString();
  }

  /**
   * @param {ReplyTokenMapping | null | undefined} mapping
   * @returns {boolean}
   */
  isExpired(mapping) {
    if (!mapping?.replyTokenExpiry) {
      return false;
    }

    return new Date(mapping.replyTokenExpiry).getTime() <= this.now();
  }

  /**
   * @param {ReplyTokenMapping | null | undefined} mapping
   * @returns {boolean}
   */
  isUsable(mapping) {
    return !!mapping?.replyToken && !mapping.replyTokenUsedAt && !this.isExpired(mapping);
  }
}

module.exports = ReplyTokenPolicy;
