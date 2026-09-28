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
        source_id: event.source?.groupId || event.source?.roomId || event.source?.userId || null,
        event,
        status: 'pending',
        attempts: 0
      });
      return true;
    }),
    getRecoverableEvents: jest.fn(() => Array.from(rows.values()).filter(
      (row) => ['pending', 'retry'].includes(row.status)
    )),
    getById: jest.fn((eventId) => rows.get(eventId) || null),
    claim: jest.fn((eventId) => {
      const row = rows.get(eventId);
      if (!row || !['pending', 'retry'].includes(row.status)) return false;
      row.status = 'processing';
      row.attempts += 1;
      return true;
    }),
    markCompleted: jest.fn((eventId) => {
      rows.get(eventId).status = 'completed';
    }),
    markRetry: jest.fn((eventId, _error, options = {}) => {
      const row = rows.get(eventId);
      if (row.attempts >= (options.maxAttempts || 6)) {
        row.status = 'dead_letter';
        return { status: 'dead_letter', attempts: row.attempts };
      }
      row.status = 'retry';
      row.next_attempt_at = options.nextAttemptAt;
      return {
        status: 'retry',
        attempts: row.attempts,
        nextAttemptAt: options.nextAttemptAt
      };
    }),
    retryDeadLetter: jest.fn(() => false),
    getStatusCounts: jest.fn(() => ({ pending: 0, retry: 0 }))
  };
}

describe('DurableLineEventProcessor Phase 2', () => {
  test('deduplicates webhookEventId before processing', () => {
    const repository = createRepository();
    const processor = new DurableLineEventProcessor({ isInitialized: false }, {
      repository,
      conversationRepository: { upsert: jest.fn() },
      pollIntervalMs: 60000
    });
    const event = {
      webhookEventId: 'evt-1',
      type: 'message',
      source: { userId: 'U1' },
      message: { id: 'm1', type: 'text', text: 'hello' }
    };

    expect(processor.persist([event])).toEqual({ accepted: 1, duplicates: 0 });
    expect(processor.persist([event])).toEqual({ accepted: 0, duplicates: 1 });
  });

  test('completes a message only after a durable mapping exists', async () => {
    const repository = createRepository();
    const conversationRepository = { upsert: jest.fn() };
    const bridge = {
      isInitialized: true,
      messageMappingManager: {
        getLineToDiscordMapping: jest.fn(() => ({ discordMessageId: 'd1' }))
      },
      channelManager: {
        getChannelMapping: jest.fn(() => ({
          sourceId: 'U1',
          discordChannelId: 'D1',
          channelName: 'Alice'
        }))
      },
      handleLineEvent: jest.fn(async () => true)
    };
    const processor = new DurableLineEventProcessor(bridge, {
      repository,
      conversationRepository,
      pollIntervalMs: 60000
    });

    processor.persist([{
      webhookEventId: 'evt-2',
      type: 'message',
      source: { userId: 'U1' },
      message: { id: 'm2', type: 'text', text: 'hello' }
    }]);
    await processor.drain();
    await processor.queue.drain();

    expect(repository.rows.get('evt-2').status).toBe('completed');
    expect(conversationRepository.upsert).toHaveBeenCalledWith(expect.objectContaining({
      sourceId: 'U1',
      discordChannelId: 'D1'
    }));
  });

  test('failed delivery is scheduled with backoff instead of immediate completion', async () => {
    const repository = createRepository();
    const bridge = {
      isInitialized: true,
      messageMappingManager: {
        getLineToDiscordMapping: jest.fn(() => null)
      },
      handleLineEvent: jest.fn(async () => true)
    };
    const processor = new DurableLineEventProcessor(bridge, {
      repository,
      conversationRepository: { upsert: jest.fn() },
      pollIntervalMs: 60000,
      retryDelaysMs: [1000, 5000],
      maxAttempts: 3
    });

    processor.persist([{
      webhookEventId: 'evt-3',
      type: 'message',
      source: { userId: 'U1' },
      message: { id: 'm3', type: 'text', text: 'hello' }
    }]);
    await processor.drain();
    await processor.queue.drain();

    expect(repository.markRetry).toHaveBeenCalledWith(
      'evt-3',
      expect.any(Error),
      expect.objectContaining({
        maxAttempts: 3,
        nextAttemptAt: expect.any(String)
      })
    );
    expect(repository.rows.get('evt-3').status).toBe('retry');
  });

  test('non-message lifecycle events do not require a message mapping', async () => {
    const repository = createRepository();
    const bridge = {
      isInitialized: true,
      handleLineEvent: jest.fn(async () => true)
    };
    const processor = new DurableLineEventProcessor(bridge, {
      repository,
      conversationRepository: { upsert: jest.fn() },
      pollIntervalMs: 60000
    });

    processor.persist([{
      webhookEventId: 'evt-unsend',
      type: 'unsend',
      source: { groupId: 'G1' },
      unsend: { messageId: 'm1' }
    }]);
    await processor.drain();
    await processor.queue.drain();

    expect(repository.rows.get('evt-unsend').status).toBe('completed');
  });

  test('recovers interrupted processing events on start', () => {
    const repository = createRepository();
    repository.recoverInterrupted.mockReturnValue(2);
    const processor = new DurableLineEventProcessor({ isInitialized: false }, {
      repository,
      conversationRepository: { upsert: jest.fn() },
      pollIntervalMs: 60000
    });

    processor.start();
    expect(repository.recoverInterrupted).toHaveBeenCalledTimes(1);
    clearInterval(processor.pollTimer);
  });
});
