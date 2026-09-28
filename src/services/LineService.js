/**
 * LINE Bot API service.
 * Uses the current @line/bot-sdk LineBotClient API.
 */
const { randomUUID } = require('node:crypto');
const { LineBotClient } = require('@line/bot-sdk');
const config = require('../config');
const logger = require('../utils/logger');
const { sleep } = require('../utils/async');

class LineService {
  constructor(options = {}) {
    this.client = options.client || LineBotClient.fromChannelAccessToken({
      channelAccessToken: config.line.channelAccessToken
    });

    this.rateLimitInfo = {
      lastRequestTime: 0,
      requestCount: 0,
      windowStart: Date.now(),
      maxRequestsPerSecond: 10,
      maxRequestsPerMinute: 500
    };
  }

  async checkRateLimit() {
    const now = Date.now();

    if (now - this.rateLimitInfo.windowStart > 60000) {
      this.rateLimitInfo.windowStart = now;
      this.rateLimitInfo.requestCount = 0;
    }

    const timeSinceLastRequest = now - this.rateLimitInfo.lastRequestTime;
    if (timeSinceLastRequest < 100) {
      await sleep(100 - timeSinceLastRequest);
    }

    if (this.rateLimitInfo.requestCount >= this.rateLimitInfo.maxRequestsPerMinute) {
      const waitTime = 60000 - (now - this.rateLimitInfo.windowStart);
      if (waitTime > 0) {
        logger.warn('LINE local rate limit reached, waiting', { waitTime });
        await sleep(waitTime);
        this.rateLimitInfo.windowStart = Date.now();
        this.rateLimitInfo.requestCount = 0;
      }
    }

    this.rateLimitInfo.lastRequestTime = Date.now();
    this.rateLimitInfo.requestCount++;
  }

  getErrorStatus(error) {
    return error?.status
      || error?.statusCode
      || error?.response?.status
      || error?.response?.statusCode
      || null;
  }

  getRetryAfterMs(error, attempt) {
    const raw = error?.response?.headers?.['retry-after']
      || error?.response?.headers?.get?.('retry-after')
      || error?.headers?.['retry-after']
      || error?.headers?.get?.('retry-after');

    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.max(250, seconds * 1000);
    }

    return Math.min(30000, (2 ** attempt) * 500);
  }

  isNetworkError(error) {
    return !this.getErrorStatus(error)
      || ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT']
        .includes(error?.code);
  }

  async executeWithRetry(apiCall, options = {}) {
    const maxRetries = options.maxRetries || 3;
    const allowServerRetry = options.allowServerRetry !== false;
    const allowNetworkRetry = options.allowNetworkRetry !== false;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.checkRateLimit();
        return await apiCall(attempt);
      } catch (error) {
        lastError = error;
        const status = this.getErrorStatus(error);
        const retryable = status === 429
          || (allowServerRetry && status >= 500 && status < 600)
          || (allowNetworkRetry && this.isNetworkError(error));

        if (!retryable || attempt >= maxRetries) {
          throw error;
        }

        const retryAfter = this.getRetryAfterMs(error, attempt);
        logger.warn('LINE API request will be retried', {
          attempt,
          maxRetries,
          status,
          retryAfter
        });
        await sleep(retryAfter);
      }
    }

    throw lastError;
  }

  async pushMessage(userId, messages) {
    const messageArray = Array.isArray(messages) ? messages : [messages];
    const retryKey = randomUUID();

    try {
      const rawResult = await this.executeWithRetry(
        async () => this.client.pushMessage({
          to: userId,
          messages: messageArray
        }, retryKey),
        {
          maxRetries: 4,
          allowServerRetry: true,
          allowNetworkRetry: true
        }
      );
      const result = this.normalizeSendResult(rawResult);

      logger.debug('LINE push message sent', {
        userId,
        messageCount: messageArray.length,
        retryKey,
        messageId: result?.messageId || null
      });

      return result;
    } catch (error) {
      const status = this.getErrorStatus(error);
      if (status === 409) {
        logger.warn('LINE push retry key was already accepted', {
          userId,
          retryKey
        });
        return {
          acceptedByRetryKey: true,
          retryKey,
          messageId: null
        };
      }

      logger.error('Failed to send LINE push message', {
        userId,
        error: error.message,
        status
      });
      throw error;
    }
  }

  async replyMessage(replyToken, messages) {
    const messageArray = Array.isArray(messages) ? messages : [messages];

    try {
      // Reply messages do not support X-Line-Retry-Key. Avoid ambiguous
      // retries for network/5xx failures to prevent duplicate replies.
      const rawResult = await this.executeWithRetry(
        async () => this.client.replyMessage({
          replyToken,
          messages: messageArray
        }),
        {
          maxRetries: 2,
          allowServerRetry: false,
          allowNetworkRetry: false
        }
      );
      return this.normalizeSendResult(rawResult);
    } catch (error) {
      logger.error('Failed to send LINE reply message', {
        error: error.message,
        status: this.getErrorStatus(error)
      });
      throw error;
    }
  }

  async getUserProfile(userId) {
    return this.executeWithRetry(() => this.client.getProfile(userId));
  }

  async getGroupMemberProfile(groupId, userId) {
    return this.executeWithRetry(() => this.client.getGroupMemberProfile(groupId, userId));
  }

  async getRoomMemberProfile(roomId, userId) {
    return this.executeWithRetry(() => this.client.getRoomMemberProfile(roomId, userId));
  }

  async getGroupSummary(groupId) {
    return this.executeWithRetry(() => this.client.getGroupSummary(groupId));
  }

  async getMessageContent(messageId) {
    try {
      const stream = await this.executeWithRetry(() => this.client.getMessageContent(messageId));
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch (error) {
      logger.error('Failed to get LINE message content', {
        messageId,
        error: error.message,
        status: this.getErrorStatus(error)
      });
      throw error;
    }
  }

  async getDisplayName(event) {
    try {
      if (event.source?.groupId && event.source?.userId) {
        const profile = await this.getGroupMemberProfile(event.source.groupId, event.source.userId);
        return profile.displayName || 'Unknown User';
      }

      if (event.source?.roomId && event.source?.userId) {
        const profile = await this.getRoomMemberProfile(event.source.roomId, event.source.userId);
        return profile.displayName || 'Unknown User';
      }

      if (event.source?.userId) {
        const profile = await this.getUserProfile(event.source.userId);
        return profile.displayName || 'Unknown User';
      }

      return 'Unknown User';
    } catch (error) {
      logger.warn('Failed to get LINE display name, using fallback', {
        userId: event.source?.userId || null,
        error: error.message
      });
      return 'Unknown User';
    }
  }

  formatMessage(event, _displayName) {
    const message = event.message;

    switch (message.type) {
    case 'text':
      return message.text;
    case 'sticker':
      return '😊 Sticker';
    case 'image':
      return '📷 Image message';
    case 'video':
      return '🎥 Video message';
    case 'audio':
      return '🎵 Audio message';
    case 'file':
      return `📎 File: ${message.fileName || 'Unknown file'}`;
    case 'location': {
      const { latitude, longitude, address } = message;
      const googleMapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
      const addressText = address ? `\n📍 住所: ${address}` : '';
      return `📍 位置情報${addressText}\n🌐 Googleマップ: ${googleMapsUrl}\n📊 座標: ${latitude}, ${longitude}`;
    }
    default:
      return `Unsupported message type: ${message.type}`;
    }
  }

  async linkRichMenuToUser(userId, richMenuId) {
    return this.executeWithRetry(() => this.client.linkRichMenuIdToUser(userId, richMenuId));
  }

  async unlinkRichMenuFromUser(userId) {
    return this.executeWithRetry(() => this.client.unlinkRichMenuIdFromUser(userId));
  }

  async markMessagesAsRead(markAsReadToken) {
    if (!markAsReadToken) {
      return false;
    }

    try {
      await this.executeWithRetry(() => this.client.markMessagesAsReadByToken({
        markAsReadToken
      }));
      return true;
    } catch (error) {
      logger.warn('Failed to mark LINE messages as read', {
        error: error.message,
        status: this.getErrorStatus(error)
      });
      return false;
    }
  }

  normalizeSendResult(result) {
    const firstSentMessage = result?.sentMessages?.[0] || null;

    if (!firstSentMessage) {
      return result || {};
    }

    return {
      ...result,
      messageId: result?.messageId || firstSentMessage.id || null,
      quoteToken: result?.quoteToken || firstSentMessage.quoteToken || null,
      sentMessage: firstSentMessage
    };
  }
}

module.exports = LineService;
