/**
 * Main application regression tests.
 */
const request = require('supertest');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');

jest.mock('../services/MessageBridge');
jest.mock('../services/DurableLineEventProcessor');
const mockSqliteDb = {
  pragma: jest.fn((name, options) => {
    if (name === 'quick_check' && options?.simple) return 'ok';
    return null;
  })
};
jest.mock('../infrastructure/sqlite', () => ({
  getDatabase: jest.fn(() => mockSqliteDb),
  closeDatabase: jest.fn()
}));
jest.mock('../utils/logger');

const App = require('../app');
const config = require('../config');
const { createLineSignature } = require('../middleware/lineSignature');
const MessageBridge = require('../services/MessageBridge');
const DurableLineEventProcessor = require('../services/DurableLineEventProcessor');

const mockMessageBridge = {
  start: jest.fn(),
  stop: jest.fn(),
  getMetrics: jest.fn(() => ({})),
  handleLineEvent: jest.fn(),
  isInitialized: true
};

const mockDurableProcessor = {
  start: jest.fn(),
  stop: jest.fn(),
  persist: jest.fn(),
  getStatus: jest.fn(() => ({
    queueSize: 0,
    isDraining: false,
    counts: {}
  }))
};

MessageBridge.mockImplementation(() => mockMessageBridge);
DurableLineEventProcessor.mockImplementation(() => mockDurableProcessor);

describe('App', () => {
  let app;
  let processOnSpy;
  let originalTempPath;
  let originalTempStaticEnabled;

  beforeEach(() => {
    processOnSpy = jest.spyOn(process, 'on').mockImplementation(() => process);
    originalTempPath = config.file.tempPath;
    originalTempStaticEnabled = config.file.tempStaticEnabled;
    jest.clearAllMocks();
    mockDurableProcessor.persist.mockReturnValue({ accepted: 1, duplicates: 0 });
    app = new App();
  });

  afterEach(() => {
    if (app.server) app.server.close();
    config.file.tempPath = originalTempPath;
    config.file.tempStaticEnabled = originalTempStaticEnabled;
    processOnSpy.mockRestore();
  });

  test('constructs without initializing services', () => {
    expect(app.app).toBeDefined();
    expect(app.messageBridge).toBeNull();
    expect(app.durableLineEventProcessor).toBeNull();
  });

  test('setupMiddleware works', () => {
    expect(() => app.setupMiddleware()).not.toThrow();
  });

  test('temp static serving can be disabled', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'app-temp-static-'));
    try {
      await fs.writeFile(path.join(tempDir, 'sample.txt'), 'hello');
      config.file.tempPath = tempDir;
      config.file.tempStaticEnabled = false;
      app.setupMiddleware();
      await request(app.app).get('/temp/sample.txt').expect(404);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  test('temp static serving adds defensive headers', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'app-temp-static-'));
    try {
      await fs.writeFile(path.join(tempDir, 'sample.txt'), 'hello');
      config.file.tempPath = tempDir;
      config.file.tempStaticEnabled = true;
      app.setupMiddleware();
      const response = await request(app.app).get('/temp/sample.txt').expect(200);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['cache-control']).toContain('max-age=300');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  test('initializeMessageBridge starts durable processor and bridge', async () => {
    mockMessageBridge.start.mockResolvedValue();
    await app.initializeMessageBridge();
    expect(DurableLineEventProcessor).toHaveBeenCalledWith(mockMessageBridge);
    expect(mockDurableProcessor.start).toHaveBeenCalledTimes(1);
    expect(mockMessageBridge.start).toHaveBeenCalledTimes(1);
  });

  test('setupGracefulShutdown does not register handlers twice', () => {
    app.setupGracefulShutdown();
    const firstCallCount = processOnSpy.mock.calls.length;
    app.setupGracefulShutdown();
    expect(processOnSpy).toHaveBeenCalledTimes(firstCallCount);
  });

  test('health endpoint responds successfully with package version', async () => {
    app.setupRoutes();
    const response = await request(app.app).get('/health').expect(200);
    expect(response.body.status).toBe('healthy');
    expect(response.body.timestamp).toEqual(expect.any(String));
    expect(response.body.version).toBe('3.2.0');
  });

  test('ready endpoint verifies SQLite and bridge readiness', async () => {
    app.messageBridge = mockMessageBridge;
    app.durableLineEventProcessor = mockDurableProcessor;
    app.setupRoutes();

    const response = await request(app.app).get('/ready').expect(200);
    expect(response.body).toEqual(expect.objectContaining({
      status: 'ready',
      sqlite: 'ok',
      discord: 'ready',
      version: '3.2.0'
    }));
    expect(response.body.durable).toEqual(expect.objectContaining({
      queueSize: 0
    }));
  });

  test('ready endpoint returns 503 before MessageBridge is initialized', async () => {
    app.messageBridge = { ...mockMessageBridge, isInitialized: false };
    app.durableLineEventProcessor = mockDurableProcessor;
    app.setupRoutes();

    const response = await request(app.app).get('/ready').expect(503);
    expect(response.body.status).toBe('not_ready');
    expect(response.body.discord).toBe('not_ready');
  });

  test('valid LINE webhook is persisted before ACK instead of waiting for bridge delivery', async () => {
    app.messageBridge = mockMessageBridge;
    app.durableLineEventProcessor = mockDurableProcessor;
    app.setupMiddleware();
    app.setupRoutes();

    const body = {
      events: [{
        webhookEventId: '01JTESTWEBHOOKEVENT0000000000',
        type: 'message',
        message: { id: 'line-message-1', type: 'text', text: 'hello' },
        source: { userId: 'line-user-1' }
      }]
    };
    const rawBody = JSON.stringify(body);
    const signature = createLineSignature(rawBody, config.line.channelSecret);

    const response = await request(app.app)
      .post(config.line.webhookPath)
      .set('content-type', 'application/json')
      .set('x-line-signature', signature)
      .send(rawBody)
      .expect(200);

    expect(mockDurableProcessor.persist).toHaveBeenCalledWith(body.events);
    expect(mockMessageBridge.handleLineEvent).not.toHaveBeenCalled();
    expect(response.body).toEqual({ success: true, accepted: 1, duplicates: 0 });
  });

  test('duplicate webhook ACK reports duplicate without bridge delivery in request', async () => {
    app.messageBridge = mockMessageBridge;
    app.durableLineEventProcessor = mockDurableProcessor;
    mockDurableProcessor.persist.mockReturnValue({ accepted: 0, duplicates: 1 });
    app.setupMiddleware();
    app.setupRoutes();

    const body = {
      events: [{
        webhookEventId: '01JTESTDUPLICATE000000000000',
        type: 'message',
        message: { id: 'line-message-1', type: 'text', text: 'hello' },
        source: { userId: 'line-user-1' }
      }]
    };
    const rawBody = JSON.stringify(body);
    const signature = createLineSignature(rawBody, config.line.channelSecret);

    const response = await request(app.app)
      .post(config.line.webhookPath)
      .set('content-type', 'application/json')
      .set('x-line-signature', signature)
      .send(rawBody)
      .expect(200);

    expect(response.body).toEqual({ success: true, accepted: 0, duplicates: 1 });
  });

  test('invalid LINE signature is rejected before persistence', async () => {
    app.messageBridge = mockMessageBridge;
    app.durableLineEventProcessor = mockDurableProcessor;
    app.setupMiddleware();
    app.setupRoutes();

    await request(app.app)
      .post(config.line.webhookPath)
      .set('content-type', 'application/json')
      .set('x-line-signature', 'invalid-signature')
      .send(JSON.stringify({ events: [] }))
      .expect(401);

    expect(mockDurableProcessor.persist).not.toHaveBeenCalled();
  });
});
