const logger = require('../utils/logger');
const WebhookEventRepository = require('../repositories/WebhookEventRepository');
const ConversationRepository = require('../repositories/ConversationRepository');
const ConversationQueue = require('../utils/conversationQueue');
const { getLineSourceId } = require('../utils/lineSource');

class DurableLineEventProcessor {
  constructor(messageBridge, options = {}) {
    this.messageBridge = messageBridge;
    this.repository = options.repository || new WebhookEventRepository();
    this.conversationRepository = options.conversationRepository || new ConversationRepository();
    this.queue = options.queue || new ConversationQueue();
    this.pollIntervalMs = options.pollIntervalMs || 1000;
    this.retryDelaysMs = options.retryDelaysMs || [1000, 5000, 30000, 120000, 600000];
    this.maxAttempts = options.maxAttempts || this.retryDelaysMs.length + 1;
    this.pollTimer = null;
    this.drainScheduled = false;
    this.isDraining = false;
  }

  start() {
    const recovered = this.repository.recoverInterrupted();
    if (recovered > 0) {
      logger.warn('Recovered interrupted LINE webhook events', { count: recovered });
    }

    if (!this.pollTimer) {
      this.pollTimer = setInterval(() => this.scheduleDrain(), this.pollIntervalMs);
      this.pollTimer.unref?.();
    }

    this.scheduleDrain();
  }

  persist(events) {
    let accepted = 0;
    let duplicates = 0;

    for (const event of events) {
      if (!event?.webhookEventId) {
        throw new Error('LINE webhook event is missing webhookEventId');
      }

      if (this.repository.insertIfAbsent(event)) {
        accepted += 1;
      } else {
        duplicates += 1;
      }
    }

    this.scheduleDrain();
    return { accepted, duplicates };
  }

  scheduleDrain() {
    if (this.drainScheduled) {
      return;
    }

    this.drainScheduled = true;
    setImmediate(() => {
      this.drainScheduled = false;
      this.drain().catch((error) => {
        logger.error('Durable LINE event drain failed', { error: error.message });
      });
    });
  }

  async drain() {
    if (this.isDraining || !this.messageBridge?.isInitialized) {
      return;
    }

    this.isDraining = true;
    try {
      const pending = this.repository.getRecoverableEvents();
      for (const row of pending) {
        const sourceId = row.source_id || '__unknown_source__';
        this.queue.enqueue(sourceId, () => this.processRow(row)).catch((error) => {
          logger.error('Queued LINE webhook event failed', {
            webhookEventId: row.webhook_event_id,
            sourceId,
            error: error.message
          });
        });
      }
    } finally {
      this.isDraining = false;
    }
  }

  getRetryDelayMs(attempts) {
    const index = Math.max(0, Math.min(attempts - 1, this.retryDelaysMs.length - 1));
    return this.retryDelaysMs[index];
  }

  async processRow(row) {
    const eventId = row.webhook_event_id;
    if (!this.repository.claim(eventId)) {
      return;
    }

    try {
      const result = await this.messageBridge.handleLineEvent(row.event);

      if (result === false || (row.event.type === 'message' && !this.wasProcessed(row.event))) {
        throw new Error('LINE event returned without a durable delivery result');
      }

      this.syncConversation(row.event);
      this.repository.markCompleted(eventId);
      logger.debug('Durable LINE webhook event completed', { webhookEventId: eventId });
    } catch (error) {
      const current = this.repository.getById(eventId);
      const attempts = current?.attempts || 1;
      const delayMs = this.getRetryDelayMs(attempts);
      const nextAttemptAt = new Date(Date.now() + delayMs).toISOString();
      const retryResult = this.repository.markRetry(eventId, error, {
        maxAttempts: this.maxAttempts,
        nextAttemptAt
      });

      logger.error(
        retryResult.status === 'dead_letter'
          ? 'Durable LINE webhook event moved to dead letter'
          : 'Durable LINE webhook event will be retried',
        {
          webhookEventId: eventId,
          attempts,
          nextAttemptAt: retryResult.nextAttemptAt || null,
          error: error.message
        }
      );

      throw error;
    }
  }

  syncConversation(event) {
    const sourceId = getLineSourceId(event.source);
    if (!sourceId) {
      return;
    }

    const mapping = this.messageBridge.channelManager?.getChannelMapping(sourceId);
    if (!mapping?.discordChannelId) {
      return;
    }

    this.conversationRepository.upsert({
      ...mapping,
      sourceId
    });
  }

  wasProcessed(event) {
    if (event.type !== 'message') {
      return true;
    }

    const lineMessageId = event.message?.id;
    if (!lineMessageId) {
      return false;
    }

    return Boolean(
      this.messageBridge.messageMappingManager?.getLineToDiscordMapping(lineMessageId)
    );
  }

  getStatus() {
    return {
      queueSize: this.queue.size(),
      isDraining: this.isDraining,
      counts: this.repository.getStatusCounts?.() || {}
    };
  }

  retryDeadLetter(webhookEventId) {
    const retried = this.repository.retryDeadLetter(webhookEventId);
    if (retried) {
      this.scheduleDrain();
    }
    return retried;
  }

  async stop() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    await this.queue.drain();
  }
}

module.exports = DurableLineEventProcessor;
