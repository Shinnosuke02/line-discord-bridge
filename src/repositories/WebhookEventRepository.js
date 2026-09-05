const { getDatabase } = require('../infrastructure/sqlite');

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
        received_at
      ) VALUES (?, ?, ?, ?, ?, 'pending', 0, ?)
      ON CONFLICT(webhook_event_id) DO NOTHING
    `);

    this.markProcessingStatement = this.db.prepare(`
      UPDATE webhook_events
      SET status = 'processing', attempts = attempts + 1, last_error = NULL
      WHERE webhook_event_id = ?
        AND status IN ('pending', 'retry')
    `);

    this.markCompletedStatement = this.db.prepare(`
      UPDATE webhook_events
      SET status = 'completed', processed_at = ?, last_error = NULL
      WHERE webhook_event_id = ?
    `);

    this.markRetryStatement = this.db.prepare(`
      UPDATE webhook_events
      SET status = 'retry', last_error = ?
      WHERE webhook_event_id = ?
    `);

    this.getByIdStatement = this.db.prepare(`
      SELECT * FROM webhook_events WHERE webhook_event_id = ?
    `);

    this.getRecoverableStatement = this.db.prepare(`
      SELECT *
      FROM webhook_events
      WHERE status IN ('pending', 'processing', 'retry')
      ORDER BY received_at ASC
    `);
  }

  insertIfAbsent(event) {
    const webhookEventId = event.webhookEventId;
    if (!webhookEventId) {
      throw new Error('LINE webhook event is missing webhookEventId');
    }

    const sourceId = event.source?.groupId || event.source?.roomId || event.source?.userId || null;
    const lineMessageId = event.message?.id || null;
    const result = this.insertStatement.run(
      webhookEventId,
      lineMessageId,
      sourceId,
      event.type || 'unknown',
      JSON.stringify(event),
      new Date().toISOString()
    );

    return result.changes === 1;
  }

  claim(webhookEventId) {
    const result = this.markProcessingStatement.run(webhookEventId);
    return result.changes === 1;
  }

  markCompleted(webhookEventId) {
    this.markCompletedStatement.run(new Date().toISOString(), webhookEventId);
  }

  markRetry(webhookEventId, error) {
    this.markRetryStatement.run(error?.message || String(error), webhookEventId);
  }

  getById(webhookEventId) {
    return this.getByIdStatement.get(webhookEventId) || null;
  }

  getRecoverableEvents() {
    return this.getRecoverableStatement.all().map((row) => ({
      ...row,
      event: JSON.parse(row.payload_json)
    }));
  }
}

module.exports = WebhookEventRepository;
