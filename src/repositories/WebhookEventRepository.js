const { getDatabase } = require('../infrastructure/sqlite');
const { getLineSourceId } = require('../utils/lineSource');

class WebhookEventRepository {
  constructor(db = getDatabase()) {
    this.db = db;

    this.insertStatement = this.db.prepare(`
      INSERT INTO webhook_events (
        webhook_event_id,
        line_message_id,
        source_id,
        event_type,
        payload_json,
        status,
        attempts,
        received_at,
        next_attempt_at
      ) VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?)
      ON CONFLICT(webhook_event_id) DO NOTHING
    `);

    this.markProcessingStatement = this.db.prepare(`
      UPDATE webhook_events
      SET status = 'processing',
          attempts = attempts + 1,
          last_error = NULL,
          next_attempt_at = NULL
      WHERE webhook_event_id = ?
        AND status IN ('pending', 'retry')
        AND dead_lettered_at IS NULL
        AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
    `);

    this.markCompletedStatement = this.db.prepare(`
      UPDATE webhook_events
      SET status = 'completed',
          processed_at = ?,
          last_error = NULL,
          next_attempt_at = NULL
      WHERE webhook_event_id = ?
    `);

    this.markRetryStatement = this.db.prepare(`
      UPDATE webhook_events
      SET status = 'retry',
          last_error = ?,
          next_attempt_at = ?
      WHERE webhook_event_id = ?
    `);

    this.markDeadLetterStatement = this.db.prepare(`
      UPDATE webhook_events
      SET status = 'dead_letter',
          last_error = ?,
          next_attempt_at = NULL,
          dead_lettered_at = ?
      WHERE webhook_event_id = ?
    `);

    this.recoverInterruptedStatement = this.db.prepare(`
      UPDATE webhook_events
      SET status = 'retry',
          next_attempt_at = ?,
          last_error = COALESCE(last_error, 'Recovered after process restart')
      WHERE status = 'processing'
        AND dead_lettered_at IS NULL
    `);

    this.getByIdStatement = this.db.prepare(`
      SELECT * FROM webhook_events WHERE webhook_event_id = ?
    `);

    this.getRecoverableStatement = this.db.prepare(`
      SELECT *
      FROM webhook_events
      WHERE status IN ('pending', 'retry')
        AND dead_lettered_at IS NULL
        AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
      ORDER BY received_at ASC
    `);

    this.countByStatusStatement = this.db.prepare(`
      SELECT status, COUNT(*) AS count
      FROM webhook_events
      GROUP BY status
    `);
  }

  insertIfAbsent(event) {
    const webhookEventId = event.webhookEventId;
    if (!webhookEventId) {
      throw new Error('LINE webhook event is missing webhookEventId');
    }

    const now = new Date().toISOString();
    const sourceId = getLineSourceId(event.source);
    const lineMessageId = event.message?.id || event.unsend?.messageId || event.messageEdited?.messageId || null;
    const result = this.insertStatement.run(
      webhookEventId,
      lineMessageId,
      sourceId,
      event.type || 'unknown',
      JSON.stringify(event),
      now,
      now
    );

    return result.changes === 1;
  }

  claim(webhookEventId, now = new Date().toISOString()) {
    const result = this.markProcessingStatement.run(webhookEventId, now);
    return result.changes === 1;
  }

  markCompleted(webhookEventId) {
    this.markCompletedStatement.run(new Date().toISOString(), webhookEventId);
  }

  markRetry(webhookEventId, error, options = {}) {
    const row = this.getById(webhookEventId);
    if (!row) {
      return { status: 'missing', attempts: 0 };
    }

    const maxAttempts = options.maxAttempts || 6;
    const message = error?.message || String(error);

    if (row.attempts >= maxAttempts) {
      const now = new Date().toISOString();
      this.markDeadLetterStatement.run(message, now, webhookEventId);
      return { status: 'dead_letter', attempts: row.attempts };
    }

    const nextAttemptAt = options.nextAttemptAt || new Date().toISOString();
    this.markRetryStatement.run(message, nextAttemptAt, webhookEventId);
    return { status: 'retry', attempts: row.attempts, nextAttemptAt };
  }

  retryDeadLetter(webhookEventId) {
    const now = new Date().toISOString();
    const result = this.db.prepare(`
      UPDATE webhook_events
      SET status = 'retry',
          next_attempt_at = ?,
          dead_lettered_at = NULL,
          last_error = 'Manual dead-letter retry'
      WHERE webhook_event_id = ?
        AND status = 'dead_letter'
    `).run(now, webhookEventId);
    return result.changes === 1;
  }

  recoverInterrupted() {
    return this.recoverInterruptedStatement.run(new Date().toISOString()).changes;
  }

  getById(webhookEventId) {
    return this.getByIdStatement.get(webhookEventId) || null;
  }

  getRecoverableEvents(now = new Date().toISOString()) {
    return this.getRecoverableStatement.all(now).map((row) => ({
      ...row,
      event: JSON.parse(row.payload_json)
    }));
  }

  getStatusCounts() {
    return Object.fromEntries(
      this.countByStatusStatement.all().map((row) => [row.status, row.count])
    );
  }
}

module.exports = WebhookEventRepository;
