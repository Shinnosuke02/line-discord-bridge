/**
 * DiscordService テストファイル
 * 
 * Discord Bot APIサービスのテストケースを定義
 * - 初期化テスト
 * - メッセージ送信テスト
 * - エラーハンドリングテスト
 * - チャンネル検索テスト
 * 
 * @version 3.0.0
 * @since 2024-12-19
 */
const DiscordService = require('../DiscordService');

// モックの設定
jest.mock('discord.js', () => ({
  AttachmentBuilder: jest.fn(),
  EmbedBuilder: jest.fn()
}));

jest.mock('../../utils/logger');

describe('DiscordService', () => {
  let discordService;
  let mockClient;

  beforeEach(() => {
    mockClient = {
      channels: {
        fetch: jest.fn()
      }
    };
    
    discordService = new DiscordService();
    discordService.setClient(mockClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('初期化', () => {
    test('DiscordServiceが正常に初期化される', () => {
      expect(discordService).toBeDefined();
      expect(discordService.client).toBe(mockClient);
    });
  });

  describe('メッセージ送信', () => {
    test('sendMessageが正常に動作する', async () => {
      const channelId = 'test-channel';
      const message = { content: 'test message' };
      const mockChannel = {
        send: jest.fn().mockResolvedValue({ id: 'message-id' })
      };
      
      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      const result = await discordService.sendMessage(channelId, message);
      
      expect(mockClient.channels.fetch).toHaveBeenCalledWith(channelId);
      expect(mockChannel.send).toHaveBeenCalledWith(message);
      expect(result).toBeDefined();
    });

    test('チャンネルが見つからない場合のエラーハンドリング', async () => {
      const channelId = 'invalid-channel';
      
      mockClient.channels.fetch.mockResolvedValue(null);

      await expect(discordService.sendMessage(channelId, 'test message'))
        .rejects.toThrow(`Channel not found: ${channelId}`);
    });
  });

  describe('エラーハンドリング', () => {
    test('クライアント未初期化エラーが適切に処理される', async () => {
      const service = new DiscordService();
      // クライアントを設定しない

      await expect(service.sendMessage('test-channel', 'test message'))
        .rejects.toThrow('Discord client not initialized');
    });

    test('API呼び出しエラーが適切に処理される', async () => {
      const error = new Error('Discord API Error');
      const mockChannel = {
        send: jest.fn().mockRejectedValue(error)
      };
      
      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      await expect(discordService.sendMessage('test-channel', 'test message'))
        .rejects.toThrow('Discord API Error');
    });
  });
});
