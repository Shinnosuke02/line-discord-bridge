const DurableLineEventProcessor = require('../DurableLineEventProcessor');

function createRepository() {
  const rows = new Map();

  return {
    rows,
    recoverInterrupted: jest.fn(() => 0),
    insertIfAbsent: jest.fn((event) => {
      if (rows.has(event.webhookEventId)) return false;
      rows.set(event.webhookEventId, {
        webhook_event_id: event.webhookEventId,
        source_id: event.source?.groupId || event.source?.userId || null,
        event,
        status: 'pending'
      });
      return true;
    }),
    getRecoverableEvents: jest.fn(() => Array.from(rows.values()).filter((row) => ['pending', 'retry'].includes(row.status))),
    claim: jest.fn((eventId) => {
      const row = rows.get(eventId);
      if (!row || !['pending', 'retry'].includes(row.status)) return false;
      row.status = 'processing';
      return true;
    }),
    markCompleted: jest.fn((eventId) => {
      rows.get(eventId).status = 'completed';
    }),
    markRetry: jest.fn((eventId) => {
      rows.get(eventId).status = 'retry';
    })
  };
}

describe('DurableLineEventProcessor', () => {
  test('deduplicates the same webhookEventId before processing', () => {
    const repository = createRepository();
    const bridge = { isInitialized: false };
    const processor = new DurableLineEventProcessor(bridge, { repository, pollIntervalMs: 60000 });

    const event = {
      webhookEventId: 'evt-1',
      type: 'message',
      source: { userId: 'U1' },
      message: { id: 'm1', type: 'text', text: 'hello' }
    };

    expect(processor.persist([event])).toEqual({ accepted: 1, duplicates: 0 });
    expect(processor.persist([event])).toEqual({ accepted: 0, duplicates: 1 });
    expect(repository.insertIfAbsent).toHaveBeenCalledTimes(2);
  });

  test('marks a message event complete only after message mapping exists', async () => {
    const repository = createRepository();
    const bridge = {
      isInitialized: true,
      messageMappingManager: {
        getLineToDiscordMapping: jest.fn(() => ({ discordMessageId: 'd1' }))
      },
      handleLineEvent: jest.fn(async () => undefined)
    };
    const processor = new DurableLineEventProcessor(bridge, { repository, pollIntervalMs: 60000 });

    const event = {
      webhookEventId: 'evt-2',
      type: 'message',
      source: { userId: 'U1' },
      message: { id: 'm2', type: 'text', text: 'hello' }
    };

    processor.persist([event]);
    await processor.drain();
    await processor.queue.drain();

    expect(bridge.handleLineEvent).toHaveBeenCalledTimes(1);
    expect(repository.markCompleted).toHaveBeenCalledWith('evt-2');
    expect(repository.rows.get('evt-2').status).toBe('completed');
  });

  test('returns failed processing to retry state', async () => {
    const repository = createRepository();
    const bridge = {
      isInitialized: true,
      messageMappingManager: {
        getLineToDiscordMapping: jest.fn(() => null)
      },
      handleLineEvent: jest.fn(async () => undefined)
    };
    const processor = new DurableLineEventProcessor(bridge, { repository, pollIntervalMs: 60000 });

    const event = {
      webhookEventId: 'evt-3',
      type: 'message',
      source: { userId: 'U1' },
      message: { id: 'm3', type: 'text', text: 'hello' }
    };

    processor.persist([event]);
    await processor.drain();
    await processor.queue.drain();

    expect(repository.markRetry).toHaveBeenCalledWith('evt-3', expect.any(Error));
    expect(repository.rows.get('evt-3').status).toBe('retry');
  });
});
