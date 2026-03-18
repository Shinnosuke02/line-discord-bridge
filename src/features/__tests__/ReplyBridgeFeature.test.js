const ReplyBridgeFeature = require('../ReplyBridgeFeature');

describe('ReplyBridgeFeature', () => {
  test('LINE reply target resolves to Discord reply target', async () => {
    const feature = new ReplyBridgeFeature({
      messageMappingManager: {
        getDiscordOriginByLineMessageId: jest.fn().mockReturnValue({
          discordMessageId: 'discord-original-1'
        })
      }
    });

    const result = await feature.resolveDiscordSendOptions({
      message: {
        id: 'line-new-1',
        quotedMessageId: 'line-original-1'
      }
    });

    expect(result).toEqual({
      replyToMessageId: 'discord-original-1'
    });
  });

  test('Discord reply target resolves to LINE quote token', async () => {
    const feature = new ReplyBridgeFeature({
      messageMappingManager: {
        getLineOriginByDiscordMessageId: jest.fn().mockReturnValue({
          lineMessageId: 'line-original-1',
          quoteToken: 'quote-token-1'
        })
      }
    });

    const result = await feature.resolveLineSendContext({
      id: 'discord-new-1',
      reference: {
        messageId: 'discord-original-1'
      }
    });

    expect(result).toEqual({
      quoteToken: 'quote-token-1',
      quotedLineMessageId: 'line-original-1'
    });
  });

  test('LINE send payload is decorated with quote token only when present', () => {
    const feature = new ReplyBridgeFeature({
      messageMappingManager: {}
    });

    expect(
      feature.applyLineSendContext(
        { type: 'text', text: 'hello' },
        { quoteToken: 'quote-token-1' }
      )
    ).toEqual({
      type: 'text',
      text: 'hello',
      quoteToken: 'quote-token-1'
    });

    expect(
      feature.applyLineSendContext(
        { type: 'text', text: 'hello' },
        {}
      )
    ).toEqual({
      type: 'text',
      text: 'hello'
    });
  });
});
