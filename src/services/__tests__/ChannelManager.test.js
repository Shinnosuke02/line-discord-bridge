/**
 * ChannelManager テスト
 */
const ChannelManager = require('../ChannelManager');
const config = require('../../config');

// モック
jest.mock('../../config');
jest.mock('../../utils/logger');

describe('ChannelManager', () => {
  let channelManager;
  let mockDiscordClient;
  let mockLineService;

  beforeEach(() => {
    // モックの設定
    mockDiscordClient = {
      guilds: {
        fetch: jest.fn()
      },
      channels: {
        fetch: jest.fn()
      }
    };

    mockLineService = {
      getGroupSummary: jest.fn(),
      getUserProfile: jest.fn()
    };

    // 設定のモック
    config.discord = {
      guildId: 'test-guild-id',
      categories: {
        friends: '1397253861965561988',
        groups: '1397253777643409631',
        shop: null,
        test: null,
        archive: null
      }
    };

    channelManager = new ChannelManager(mockDiscordClient, mockLineService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getCategoryForSource', () => {
    test('LINE個人ユーザーの場合、Friendsカテゴリを返す', () => {
      const sourceId = 'U1234567890abcdef';
      const categoryId = channelManager.getCategoryForSource(sourceId);
      
      expect(categoryId).toBe('1397253861965561988');
    });

    test('LINEグループの場合、Groupsカテゴリを返す', () => {
      const sourceId = 'C1234567890abcdef';
      const categoryId = channelManager.getCategoryForSource(sourceId);
      
      expect(categoryId).toBe('1397253777643409631');
    });

    test('不明なソースIDの場合、nullを返す', () => {
      const sourceId = 'X1234567890abcdef';
      const categoryId = channelManager.getCategoryForSource(sourceId);
      
      expect(categoryId).toBeNull();
    });

    test('カテゴリ設定がnullの場合、nullを返す', () => {
      // 設定を一時的に変更
      config.discord.categories.friends = null;
      
      const sourceId = 'U1234567890abcdef';
      const categoryId = channelManager.getCategoryForSource(sourceId);
      
      expect(categoryId).toBeNull();
    });

    test('カテゴリ設定が"null"文字列の場合、nullを返す', () => {
      // 設定を一時的に変更
      config.discord.categories.friends = 'null';
      
      const sourceId = 'U1234567890abcdef';
      const categoryId = channelManager.getCategoryForSource(sourceId);
      
      expect(categoryId).toBeNull();
    });
  });

  describe('sanitizeChannelName', () => {
    test('正常な名前はそのまま返す', () => {
      const name = 'テストグループ';
      const result = channelManager.sanitizeChannelName(name);
      
      expect(result).toBe('テストグループ');
    });

    test('Discordで使用できない文字を置換する', () => {
      const name = 'テスト<グループ>';
      const result = channelManager.sanitizeChannelName(name);
      
      expect(result).toBe('テスト-グループ-');
    });

    test('連続するハイフンを1つにまとめる', () => {
      const name = 'テスト--グループ---';
      const result = channelManager.sanitizeChannelName(name);
      
      expect(result).toBe('テスト-グループ-');
    });

    test('先頭と末尾のハイフンを削除する', () => {
      const name = '-テストグループ-';
      const result = channelManager.sanitizeChannelName(name);
      
      expect(result).toBe('テストグループ');
    });

    test('長すぎる名前を切り詰める', () => {
      const longName = 'a'.repeat(150);
      const result = channelManager.sanitizeChannelName(longName);
      
      expect(result).toHaveLength(100);
      expect(result).toBe('a'.repeat(100));
    });

    test('空文字列の場合、空文字列を返す', () => {
      const result = channelManager.sanitizeChannelName('');
      expect(result).toBe('');
    });

    test('nullの場合、空文字列を返す', () => {
      const result = channelManager.sanitizeChannelName(null);
      expect(result).toBe('');
    });
  });

  describe('generateChannelName', () => {
    test('LINEグループの場合、グループ名を取得して返す', async () => {
      const sourceId = 'C1234567890abcdef';
      const groupName = 'テストグループ';
      
      mockLineService.getGroupSummary.mockResolvedValue({
        groupName: groupName
      });
      
      const result = await channelManager.generateChannelName(sourceId);
      
      expect(result).toBe(groupName);
      expect(mockLineService.getGroupSummary).toHaveBeenCalledWith(sourceId);
    });

    test('LINE個人の場合、ユーザー名を取得して返す', async () => {
      const sourceId = 'U1234567890abcdef';
      const userName = 'テストユーザー';
      
      mockLineService.getUserProfile.mockResolvedValue({
        displayName: userName
      });
      
      const result = await channelManager.generateChannelName(sourceId);
      
      expect(result).toBe(userName);
      expect(mockLineService.getUserProfile).toHaveBeenCalledWith(sourceId);
    });

    test('グループ名取得に失敗した場合、フォールバック名を返す', async () => {
      const sourceId = 'C1234567890abcdef';
      
      mockLineService.getGroupSummary.mockRejectedValue(new Error('API Error'));
      
      const result = await channelManager.generateChannelName(sourceId);
      
      expect(result).toBe(`user-${sourceId.substring(0, 8)}`);
    });

    test('ユーザー名取得に失敗した場合、フォールバック名を返す', async () => {
      const sourceId = 'U1234567890abcdef';
      
      mockLineService.getUserProfile.mockRejectedValue(new Error('API Error'));
      
      const result = await channelManager.generateChannelName(sourceId);
      
      expect(result).toBe(`user-${sourceId.substring(0, 8)}`);
    });
  });
});
