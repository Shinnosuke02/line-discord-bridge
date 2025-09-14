/**
 * MediaService テストファイル
 *
 * メディア処理サービスのテストケースを定義
 * - ファイルサイズ制限テスト
 * - LINE側制限テスト
 * - Discord CDN URL処理テスト
 * - エラーハンドリングテスト
 *
 * @version 3.1.0
 * @since 2024-12-19
 */
const MediaService = require('../MediaService');
const config = require('../../config');

// モックの設定
jest.mock('../../utils/logger');
jest.mock('axios');
jest.mock('sharp');
jest.mock('file-type');
jest.mock('mime-types');

describe('MediaService', () => {
  let mediaService;
  let mockLineService;

  beforeEach(() => {
    // モックの初期化
    mockLineService = {
      pushMessage: jest.fn()
    };

    mediaService = new MediaService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('ファイルサイズ制限', () => {
    test('LINE側の制限値を正しく取得する', () => {
      expect(mediaService.getLineLimitForMimeType('image/jpeg')).toBe(config.file.lineLimits.image);
      expect(mediaService.getLineLimitForMimeType('video/mp4')).toBe(config.file.lineLimits.video);
      expect(mediaService.getLineLimitForMimeType('audio/mpeg')).toBe(config.file.lineLimits.audio);
      expect(mediaService.getLineLimitForMimeType('application/pdf')).toBe(config.file.lineLimits.file);
      expect(mediaService.getLineLimitForMimeType('application/msword')).toBe(config.file.lineLimits.file);
      expect(mediaService.getLineLimitForMimeType('text/plain')).toBe(config.file.lineLimits.file);
    });

    test('ファイルサイズ検証が正しく動作する', () => {
      const validSize = 5 * 1024 * 1024; // 5MB
      const invalidSize = 15 * 1024 * 1024; // 15MB

      expect(mediaService.validateFileSize(validSize)).toBe(true);
      expect(mediaService.validateFileSize(invalidSize)).toBe(false);
    });
  });

  describe('Discord CDN URL処理', () => {
    test('大容量ファイルでCDN URL処理が実行される', async () => {
      const largeAttachment = {
        name: 'large_video.mp4',
        size: 60 * 1024 * 1024, // 60MB（LINE制限50MBを超過）
        contentType: 'video/mp4',
        url: 'https://cdn.discordapp.com/attachments/123/456/large_video.mp4'
      };

      mockLineService.pushMessage.mockResolvedValue({ messageId: 'line123' });

      const result = await mediaService.processDiscordAttachmentWithCDN(
        largeAttachment,
        'user123',
        mockLineService,
        'video/mp4'
      );

      expect(result.success).toBe(true);
      expect(result.cdnUsed).toBe(true);
      expect(result.warning).toContain('24時間有効期限');
      expect(mockLineService.pushMessage).toHaveBeenCalledWith(
        'user123',
        expect.objectContaining({
          type: 'video',
          originalContentUrl: largeAttachment.url
        })
      );
    });

    test('CDN処理失敗時にフォールバックが実行される', async () => {
      const largeAttachment = {
        name: 'large_file.pdf',
        size: 60 * 1024 * 1024,
        contentType: 'application/pdf',
        url: 'https://cdn.discordapp.com/attachments/123/456/large_file.pdf'
      };

      // 最初のpushMessageが失敗
      mockLineService.pushMessage
        .mockRejectedValueOnce(new Error('LINE API Error'))
        .mockResolvedValueOnce({ messageId: 'fallback123' });

      const result = await mediaService.processDiscordAttachmentWithCDN(
        largeAttachment,
        'user123',
        mockLineService,
        'application/pdf'
      );

      expect(result.success).toBe(true);
      expect(result.fallback).toBe(true);
      expect(result.warning).toContain('フォールバック');
      expect(mockLineService.pushMessage).toHaveBeenCalledTimes(2);
    });
  });

  describe('LINEメッセージデータ作成', () => {
    test('画像メッセージデータが正しく作成される', () => {
      const attachment = {
        name: 'image.jpg',
        url: 'https://cdn.discordapp.com/attachments/123/456/image.jpg'
      };

      const messageData = mediaService.createLineMessageData('image', attachment);

      expect(messageData).toEqual({
        type: 'image',
        originalContentUrl: attachment.url,
        previewImageUrl: attachment.url
      });
    });

    test('音声メッセージデータが正しく作成される', () => {
      const attachment = {
        name: 'audio.mp3',
        url: 'https://cdn.discordapp.com/attachments/123/456/audio.mp3'
      };

      const messageData = mediaService.createLineMessageData('audio', attachment);

      expect(messageData).toEqual({
        type: 'audio',
        originalContentUrl: attachment.url,
        previewImageUrl: attachment.url,
        duration: 60000
      });
    });

    test('ファイルメッセージデータが正しく作成される', () => {
      const attachment = {
        name: 'document.pdf',
        url: 'https://cdn.discordapp.com/attachments/123/456/document.pdf'
      };

      const messageData = mediaService.createLineMessageData('file', attachment);

      expect(messageData).toEqual({
        type: 'file',
        originalContentUrl: attachment.url,
        previewImageUrl: attachment.url,
        fileName: attachment.name
      });
    });
  });

  describe('ドキュメント処理', () => {
    test('PDFファイルが正しく処理される', async () => {
      const pdfAttachment = {
        name: 'document.pdf',
        size: 3 * 1024 * 1024, // 3MB
        contentType: 'application/pdf',
        url: 'https://cdn.discordapp.com/attachments/123/456/document.pdf'
      };

      mockLineService.pushMessage.mockResolvedValue({ messageId: 'pdf123' });

      const result = await mediaService.processDiscordDocument(
        pdfAttachment,
        'user123',
        mockLineService
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('document');
      expect(mockLineService.pushMessage).toHaveBeenCalledWith(
        'user123',
        expect.objectContaining({
          type: 'file',
          fileName: pdfAttachment.name,
          originalContentUrl: pdfAttachment.url
        })
      );
    });

    test('Word文書が正しく処理される', async () => {
      const wordAttachment = {
        name: 'report.docx',
        size: 2 * 1024 * 1024, // 2MB
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        url: 'https://cdn.discordapp.com/attachments/123/456/report.docx'
      };

      mockLineService.pushMessage.mockResolvedValue({ messageId: 'word123' });

      const result = await mediaService.processDiscordDocument(
        wordAttachment,
        'user123',
        mockLineService
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('document');
    });
  });

  describe('ファイル名処理', () => {
    test('LINE⇒Discordで重複拡張子が回避される', async () => {
      const lineMessage = {
        id: 'msg123',
        fileName: 'document.pdf',
        type: 'file'
      };

      mockLineService.getMessageContent.mockResolvedValue(Buffer.from('PDF content'));
      mockDetectFileType.mockResolvedValue({ ext: 'pdf', mime: 'application/pdf' });

      const result = await mediaService.processLineFile(lineMessage, mockLineService);

      expect(result.files[0].name).toBe('document.pdf'); // 重複しない
      expect(result.content).toBe('File: document.pdf');
    });

    test('LINE⇒Discordで拡張子がないファイルに拡張子が追加される', async () => {
      const lineMessage = {
        id: 'msg123',
        fileName: 'document',
        type: 'file'
      };

      mockLineService.getMessageContent.mockResolvedValue(Buffer.from('PDF content'));
      mockDetectFileType.mockResolvedValue({ ext: 'pdf', mime: 'application/pdf' });

      const result = await mediaService.processLineFile(lineMessage, mockLineService);

      expect(result.files[0].name).toBe('document.pdf'); // 拡張子が追加される
      expect(result.content).toBe('File: document');
    });

    test('Discord⇒LINEでファイル名がnullの場合にフォールバックが動作する', async () => {
      const attachment = {
        name: null,
        size: 3 * 1024 * 1024,
        contentType: 'application/pdf',
        url: 'https://cdn.discordapp.com/attachments/123/456/document.pdf'
      };

      mockLineService.pushMessage
        .mockRejectedValueOnce(new Error('LINE API Error'))
        .mockResolvedValueOnce({ messageId: 'fallback123' });

      const result = await mediaService.processDiscordDocument(
        attachment,
        'user123',
        mockLineService
      );

      expect(result.success).toBe(true);
      expect(result.fallback).toBe(true);
      expect(mockLineService.pushMessage).toHaveBeenCalledWith(
        'user123',
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('unknown_file')
        })
      );
    });
  });

  describe('統合テスト', () => {
    test('通常サイズのファイルは通常処理される', async () => {
      const normalAttachment = {
        name: 'normal_image.jpg',
        size: 2 * 1024 * 1024, // 2MB
        contentType: 'image/jpeg',
        url: 'https://cdn.discordapp.com/attachments/123/456/normal_image.jpg'
      };

      // axiosモック
      const axios = require('axios');
      axios.get.mockResolvedValue({
        data: Buffer.from('fake image data'),
        headers: { 'content-type': 'image/jpeg' }
      });

      // file-typeモック
      const { fileTypeFromBuffer } = require('file-type');
      fileTypeFromBuffer.mockResolvedValue({ mime: 'image/jpeg', ext: 'jpg' });

      mockLineService.pushMessage.mockResolvedValue({ messageId: 'normal123' });

      const result = await mediaService.processDiscordAttachment(
        normalAttachment,
        'user123',
        mockLineService
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('image');
      expect(result.cdnUsed).toBeUndefined(); // CDNは使用されない
    });

    test('大容量ファイルはCDN処理される', async () => {
      const largeAttachment = {
        name: 'large_video.mp4',
        size: 60 * 1024 * 1024, // 60MB
        contentType: 'video/mp4',
        url: 'https://cdn.discordapp.com/attachments/123/456/large_video.mp4'
      };

      mockLineService.pushMessage.mockResolvedValue({ messageId: 'cdn123' });

      const result = await mediaService.processDiscordAttachment(
        largeAttachment,
        'user123',
        mockLineService
      );

      expect(result.success).toBe(true);
      expect(result.cdnUsed).toBe(true);
      expect(result.warning).toContain('24時間有効期限');
    });

    test('PDFファイルはドキュメント処理される', async () => {
      const pdfAttachment = {
        name: 'manual.pdf',
        size: 5 * 1024 * 1024, // 5MB
        contentType: 'application/pdf',
        url: 'https://cdn.discordapp.com/attachments/123/456/manual.pdf'
      };

      mockLineService.pushMessage.mockResolvedValue({ messageId: 'pdf123' });

      const result = await mediaService.processDiscordAttachment(
        pdfAttachment,
        'user123',
        mockLineService
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('document');
    });
  });

  describe('フォールバック機能', () => {
    test('動画送信失敗時にフォールバックが実行される', async () => {
      const videoAttachment = {
        name: 'video.mp4',
        size: 5 * 1024 * 1024,
        contentType: 'video/mp4',
        url: 'https://cdn.discordapp.com/attachments/123/456/video.mp4'
      };

      mockLineService.pushMessage
        .mockRejectedValueOnce(new Error('LINE API Error'))
        .mockResolvedValueOnce({ messageId: 'fallback123' });

      const result = await mediaService.processDiscordVideo(
        videoAttachment,
        'user123',
        mockLineService
      );

      expect(result.success).toBe(true);
      expect(result.fallback).toBe(true);
      expect(result.warning).toContain('動画送信失敗');
      expect(mockLineService.pushMessage).toHaveBeenCalledTimes(2);
    });

    test('音声送信失敗時にフォールバックが実行される', async () => {
      const audioAttachment = {
        name: 'audio.mp3',
        size: 3 * 1024 * 1024,
        contentType: 'audio/mpeg',
        url: 'https://cdn.discordapp.com/attachments/123/456/audio.mp3'
      };

      mockLineService.pushMessage
        .mockRejectedValueOnce(new Error('LINE API Error'))
        .mockResolvedValueOnce({ messageId: 'fallback123' });

      const result = await mediaService.processDiscordAudio(
        audioAttachment,
        'user123',
        mockLineService
      );

      expect(result.success).toBe(true);
      expect(result.fallback).toBe(true);
      expect(result.warning).toContain('音声送信失敗');
    });

    test('ドキュメント送信失敗時にフォールバックが実行される', async () => {
      const documentAttachment = {
        name: 'document.pdf',
        size: 2 * 1024 * 1024,
        contentType: 'application/pdf',
        url: 'https://cdn.discordapp.com/attachments/123/456/document.pdf'
      };

      mockLineService.pushMessage
        .mockRejectedValueOnce(new Error('LINE API Error'))
        .mockResolvedValueOnce({ messageId: 'fallback123' });

      const result = await mediaService.processDiscordDocument(
        documentAttachment,
        'user123',
        mockLineService
      );

      expect(result.success).toBe(true);
      expect(result.fallback).toBe(true);
      expect(result.warning).toContain('ドキュメント送信失敗');
    });
  });

  describe('エラーハンドリング', () => {
    test('LINE制限を超えるファイルのエラーログが記録される', async () => {
      const logger = require('../../utils/logger');
      
      const largeAttachment = {
        name: 'huge_file.mp4',
        size: 100 * 1024 * 1024, // 100MB
        contentType: 'video/mp4',
        url: 'https://cdn.discordapp.com/attachments/123/456/huge_file.mp4'
      };

      mockLineService.pushMessage.mockRejectedValue(new Error('LINE API Error'));

      await expect(
        mediaService.processDiscordAttachmentWithCDN(
          largeAttachment,
          'user123',
          mockLineService,
          'video/mp4'
        )
      ).rejects.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to process large file with Discord CDN',
        expect.objectContaining({
          fileName: largeAttachment.name,
          fileSize: largeAttachment.size
        })
      );
    });

    test('詳細なエラー情報がログに記録される', async () => {
      const logger = require('../../utils/logger');
      
      const attachment = {
        name: 'test.mp4',
        size: 5 * 1024 * 1024,
        contentType: 'video/mp4',
        url: 'https://cdn.discordapp.com/attachments/123/456/test.mp4'
      };

      const error = new Error('LINE API Error');
      error.status = 400;
      error.statusCode = 400;

      mockLineService.pushMessage.mockRejectedValue(error);

      await expect(
        mediaService.processDiscordVideo(
          attachment,
          'user123',
          mockLineService
        )
      ).rejects.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to process Discord video',
        expect.objectContaining({
          fileName: attachment.name,
          attachmentUrl: attachment.url,
          error: 'LINE API Error',
          status: 400,
          statusCode: 400
        })
      );
    });
  });
});
