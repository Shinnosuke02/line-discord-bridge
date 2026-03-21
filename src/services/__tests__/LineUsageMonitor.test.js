const LineUsageMonitor = require('../LineUsageMonitor');

jest.mock('../../utils/logger');
jest.mock('../../middleware/lineLimitHandler', () => ({
  getLimitStatus: jest.fn(() => ({
    monthlyCount: 10,
    maxMonthlyMessages: 500,
    remainingMessages: 490,
    usagePercentage: 2,
    isLimitReached: false,
    resetDate: new Date('2026-04-01T00:00:00Z')
  }))
}));

describe('LineUsageMonitor', () => {
  let monitor;

  beforeEach(() => {
    monitor = new LineUsageMonitor();
    jest.clearAllMocks();
  });

  afterEach(() => {
    monitor.stopMonitoring();
  });

  test('startMonitoringは既存タイマーを置き換えて監視状態を保持する', () => {
    jest.useFakeTimers();

    monitor.startMonitoring(jest.fn(), 60);
    const firstInterval = monitor.monitoringInterval;

    monitor.startMonitoring(jest.fn(), 30);

    expect(firstInterval).not.toBe(monitor.monitoringInterval);
    expect(monitor.getMonitoringStatus().isMonitoring).toBe(true);

    jest.useRealTimers();
  });

  test('stopMonitoringはタイマーをクリアする', () => {
    jest.useFakeTimers();

    monitor.startMonitoring(jest.fn(), 60);
    monitor.stopMonitoring();

    expect(monitor.monitoringInterval).toBe(null);
    expect(monitor.getMonitoringStatus().isMonitoring).toBe(false);

    jest.useRealTimers();
  });
});
