const express = require('express');
const request = require('supertest');

jest.mock('../../config', () => ({
  line: {
    webhookPath: '/line-hook'
  },
  security: {
    rateLimit: {
      enabled: true,
      windowMs: 60 * 1000,
      maxRequests: 1
    },
    cors: {
      enabled: false,
      origins: ['*']
    }
  },
  file: {
    maxFileSize: 1024 * 1024
  }
}));

const { rateLimiter } = require('../security');

describe('security rate limiter', () => {
  test('does not rate-limit the configured LINE webhook path', async () => {
    const app = express();
    app.use(rateLimiter());
    app.post('/line-hook', (req, res) => res.sendStatus(200));

    await request(app).post('/line-hook').expect(200);
    await request(app).post('/line-hook').expect(200);
    await request(app).post('/line-hook').expect(200);
  });

  test('continues to rate-limit ordinary endpoints', async () => {
    const app = express();
    app.use(rateLimiter());
    app.get('/api', (req, res) => res.sendStatus(200));

    await request(app).get('/api').expect(200);
    await request(app).get('/api').expect(429);
  });
});
