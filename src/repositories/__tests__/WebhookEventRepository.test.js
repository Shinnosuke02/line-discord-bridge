const Database = require('better-sqlite3');
const { initializeSchema } = require('../../infrastructure/sqlite');
const WebhookEventRepository = require('../WebhookEventRepository');

describe('WebhookEventRepository Phase 2', () => {
  let db;
  let repository;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeSchema(db);
    repository = new WebhookEventRepository(db);
  });

  afterEach(() => db.close());

  test('persists room source IDs and deduplicates webhook event IDs', () => {
    const event = {
      webhookEventId: 'evt-1',
      type: 'message',
      source: { roomId: 'R1', userId: 'U1' },
      message: { id: 'm1', type: 'text', text: 'hello' }
    };

    expect(repository.insertIfAbsent(event)).toBe(true);
    expect(repository.insertIfAbsent(event)).toBe(false);
    expect(repository.getById('evt-1').source_id).toBe('R1');
  });

  test('only returns retry events after next_attempt_at becomes due', () => {
    const event = {
      webhookEventId: 'evt-2',
      type: 'message',
      source: { userId: 'U1' },
      message: { id: 'm2', type: 'text', text: 'hello' }
    };
    repository.insertIfAbsent(event);
    expect(repository.claim('evt-2')).toBe(true);

    repository.markRetry('evt-2', new Error('temporary'), {
      maxAttempts: 6,
      nextAttemptAt: '2099-01-01T00:00:00.000Z'
    });

    expect(repository.getRecoverableEvents('2026-09-28T00:00:00.000Z')).toEqual([]);
    expect(repository.getRecoverableEvents('2100-01-01T00:00:00.000Z')).toHaveLength(1);
  });

  test('moves an event to dead letter after the configured max attempts', () => {
    const event = {
      webhookEventId: 'evt-3',
      type: 'unsend',
      source: { groupId: 'G1' },
      unsend: { messageId: 'm3' }
    };
    repository.insertIfAbsent(event);
    expect(repository.claim('evt-3')).toBe(true);

    const result = repository.markRetry('evt-3', new Error('permanent'), {
      maxAttempts: 1,
      nextAttemptAt: '2026-09-28T00:00:01.000Z'
    });

    expect(result.status).toBe('dead_letter');
    expect(repository.getById('evt-3').status).toBe('dead_letter');
    expect(repository.getById('evt-3').dead_lettered_at).toEqual(expect.any(String));
  });
});
