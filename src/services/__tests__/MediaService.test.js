const MediaService = require('../MediaService');
const config = require('../../config');
const path = require('path');
const axios = require('axios');

jest.mock('../../utils/logger');
jest.mock('axios');
jest.mock('sharp');
jest.mock('file-type');
jest.mock('mime-types');
jest.mock('child_process', () => ({ execFile: jest.fn() }));

describe('MediaService Phase 2 API correctness', () => {
  let mediaService;
  let lineService;
  let originalTempPath;

  beforeEach(() => {
    originalTempPath = config.file.tempPath;
    mediaService = new MediaService();
    lineService = {
      pushMessage: jest.fn().mockResolvedValue({ messageId: 'line-1' }),
      getMessageContent: jest.fn()
    };
  });

  afterEach(() => {
    config.file.tempPath = originalTempPath;
    jest.clearAllMocks();
  });

  test('uses configured TEMP_PATH', () => {
    config.file.tempPath = './custom-temp';
    expect(new MediaService().tempDir).toBe(path.resolve('./custom-temp'));
  });

  test('returns LINE limits by MIME category', () => {
    expect(mediaService.getLineLimitForMimeType('image/jpeg')).toBe(config.file.lineLimits.image);
    expect(mediaService.getLineLimitForMimeType('video/mp4')).toBe(config.file.lineLimits.video);
    expect(mediaService.getLineLimitForMimeType('audio/mpeg')).toBe(config.file.lineLimits.audio);
    expect(mediaService.getLineLimitForMimeType('application/pdf')).toBe(config.file.lineLimits.file);
  });

  test('never creates an outbound LINE file message', () => {
    const data = mediaService.createLineMessageData('file', {
      name: 'manual.pdf',
      url: 'https://cdn.example/manual.pdf'
    });
    expect(data).toEqual({
      type: 'text',
      text: '📎 manual.pdf\nhttps://cdn.example/manual.pdf'
    });
  });

  test('document delivery is a text link from the first API call', async () => {
    const attachment = {
      name: 'manual.pdf',
      contentType: 'application/pdf',
      url: 'https://cdn.example/manual.pdf'
    };

    const result = await mediaService.processDiscordDocument(attachment, 'U1', lineService);

    expect(result).toEqual(expect.objectContaining({
      success: true,
      type: 'text',
      fallback: true
    }));
    expect(lineService.pushMessage).toHaveBeenCalledTimes(1);
    expect(lineService.pushMessage).toHaveBeenCalledWith('U1', {
      type: 'text',
      text: expect.stringContaining('https://cdn.example/manual.pdf')
    });
    expect(lineService.pushMessage.mock.calls[0][1].type).not.toBe('file');
  });

  test('generic file delivery is a text link from the first API call', async () => {
    await mediaService.processDiscordFile({
      name: 'archive.zip',
      contentType: 'application/zip',
      url: 'https://cdn.example/archive.zip'
    }, 'U1', lineService);

    expect(lineService.pushMessage).toHaveBeenCalledWith('U1', {
      type: 'text',
      text: expect.stringContaining('archive.zip')
    });
  });

  test('video without a real preview image falls back to a link', async () => {
    const result = await mediaService.processDiscordVideo({
      name: 'movie.mp4',
      contentType: 'video/mp4',
      url: 'https://cdn.example/movie.mp4'
    }, 'U1', lineService);

    expect(result.type).toBe('text');
    expect(lineService.pushMessage).toHaveBeenCalledWith('U1', expect.objectContaining({
      type: 'text'
    }));
  });

  test('video with an explicit HTTPS preview can use native LINE video', async () => {
    const attachment = {
      name: 'movie.mp4',
      contentType: 'video/mp4',
      url: 'https://cdn.example/movie.mp4',
      previewImageUrl: 'https://cdn.example/movie.jpg'
    };

    const result = await mediaService.processDiscordVideo(attachment, 'U1', lineService);

    expect(result.type).toBe('video');
    expect(lineService.pushMessage).toHaveBeenCalledWith('U1', {
      type: 'video',
      originalContentUrl: attachment.url,
      previewImageUrl: attachment.previewImageUrl
    });
  });

  test('audio without an accurate duration falls back to a link', async () => {
    const result = await mediaService.processDiscordAudio({
      name: 'voice.m4a',
      contentType: 'audio/mp4',
      url: 'https://cdn.example/voice.m4a'
    }, 'U1', lineService);

    expect(result.type).toBe('text');
  });

  test('audio with an accurate duration uses native LINE audio', async () => {
    const result = await mediaService.processDiscordAudio({
      name: 'voice.m4a',
      contentType: 'audio/mp4',
      url: 'https://cdn.example/voice.m4a',
      durationMs: 4321
    }, 'U1', lineService);

    expect(result.type).toBe('audio');
    expect(lineService.pushMessage).toHaveBeenCalledWith('U1', {
      type: 'audio',
      originalContentUrl: 'https://cdn.example/voice.m4a',
      duration: 4321
    });
  });

  test('large non-image CDN content also uses link fallback', async () => {
    const result = await mediaService.processDiscordAttachmentWithCDN({
      name: 'large.pdf',
      contentType: 'application/pdf',
      url: 'https://cdn.example/large.pdf'
    }, 'U1', lineService, 'application/pdf');

    expect(result.type).toBe('text');
    expect(result.fallback).toBe(true);
    expect(lineService.pushMessage.mock.calls[0][1].type).not.toBe('file');
  });

  test('LINE text emoji prefers the sticon image over fallback text', async () => {
    const text = '了解です（ありがとう）！';
    const fallback = '（ありがとう）';
    const emoji = {
      index: text.indexOf(fallback),
      length: fallback.length,
      productId: '670e0cce840a8236ddd4ee4c',
      emojiId: '078'
    };

    axios.get.mockResolvedValueOnce({
      data: Buffer.from('png-image'),
      headers: { 'content-type': 'image/png' }
    });

    const result = await mediaService.processLineTextEmojis(text, [emoji]);

    expect(axios.get).toHaveBeenCalledWith(
      'https://stickershop.line-scdn.net/sticonshop/v1/sticon/670e0cce840a8236ddd4ee4c/android/078.png',
      expect.objectContaining({
        responseType: 'arraybuffer',
        timeout: 3500
      })
    );
    expect(result.content).toBe('了解です！');
    expect(result.files).toHaveLength(1);
    expect(result.files[0].name).toContain('line_emoji_670e0cce840a8236ddd4ee4c_078_1.png');
    expect(result.files[0].description).toBe(fallback);
  });

  test('same LINE emoji fallback text keeps distinct images by product and emoji ID', async () => {
    const fallback = '（ありがとう）';
    const text = `${fallback}${fallback}`;
    const emojis = [
      {
        index: 0,
        length: fallback.length,
        productId: 'product-a',
        emojiId: '001'
      },
      {
        index: fallback.length,
        length: fallback.length,
        productId: 'product-b',
        emojiId: '002'
      }
    ];

    axios.get
      .mockResolvedValueOnce({
        data: Buffer.from('image-a'),
        headers: { 'content-type': 'image/png' }
      })
      .mockResolvedValueOnce({
        data: Buffer.from('image-b'),
        headers: { 'content-type': 'image/png' }
      });

    const result = await mediaService.processLineTextEmojis(text, emojis);

    expect(result.content).toBe('');
    expect(result.files).toHaveLength(2);
    expect(result.files[0].name).toContain('product-a_001');
    expect(result.files[1].name).toContain('product-b_002');
  });

  test('LINE emoji image failure preserves fallback text', async () => {
    const text = '了解です（ありがとう）！';
    const fallback = '（ありがとう）';
    const emoji = {
      index: text.indexOf(fallback),
      length: fallback.length,
      productId: 'unknown-product',
      emojiId: '999'
    };

    axios.get.mockRejectedValueOnce(new Error('404'));

    const result = await mediaService.processLineTextEmojis(text, [emoji]);

    expect(result).toEqual({
      content: text,
      files: []
    });
  });

  test('LINE emoji image failure can still use an exact Unicode ID fallback', async () => {
    const text = 'Hello (love)';
    const emoji = {
      index: text.indexOf('(love)'),
      length: '(love)'.length,
      productId: '5ac1bfd5040ab15980c9b435',
      emojiId: '001'
    };

    axios.get.mockRejectedValueOnce(new Error('CDN unavailable'));

    const result = await mediaService.processLineTextEmojis(text, [emoji]);

    expect(result).toEqual({
      content: 'Hello ❤️',
      files: []
    });
  });

  test('LINE emoji image downloads are cached by exact asset URL', async () => {
    const text = '(love)';
    const emoji = {
      index: 0,
      length: text.length,
      productId: '5ac1bfd5040ab15980c9b435',
      emojiId: '001'
    };

    axios.get.mockResolvedValue({
      data: Buffer.from('cached-image'),
      headers: { 'content-type': 'image/png' }
    });

    await mediaService.processLineTextEmojis(text, [emoji]);
    await mediaService.processLineTextEmojis(text, [emoji]);

    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  test('LINE file names preserve Japanese characters on Discord', async () => {
    const lineMessage = {
      id: 'msg-1',
      fileName: '電気料金請求書.pdf',
      type: 'file'
    };
    lineService.getMessageContent.mockResolvedValue(Buffer.from('PDF'));
    jest.spyOn(mediaService, 'detectFileType').mockResolvedValue({
      ext: 'pdf',
      mime: 'application/pdf'
    });

    const result = await mediaService.processLineFile(lineMessage, lineService);
    expect(result.files[0].name).toBe('電気料金請求書.pdf');
  });

  test('dangerous Discord file-name characters are sanitized', () => {
    expect(mediaService.sanitizeFileNameForDiscord('請求書/2026:07.pdf'))
      .toBe('請求書_2026_07.pdf');
    expect(mediaService.sanitizeFileNameForDiscord('bad\u0000name.pdf'))
      .toBe('badname.pdf');
  });
});
