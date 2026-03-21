const {
  getLineStickerAssetUrls,
  isAnimatedPngBuffer,
  isAnimatedStickerResourceType
} = require('../lineSticker');

describe('lineSticker utils', () => {
  test('animated resource types are detected correctly', () => {
    expect(isAnimatedStickerResourceType('ANIMATION')).toBe(true);
    expect(isAnimatedStickerResourceType('POPUP_SOUND')).toBe(true);
    expect(isAnimatedStickerResourceType('STATIC')).toBe(false);
  });

  test('APNG buffer detection uses animation control chunk', () => {
    const animatedBuffer = Buffer.concat([Buffer.from('PNG'), Buffer.from('acTL')]);
    const staticBuffer = Buffer.from('PNG only');

    expect(isAnimatedPngBuffer(animatedBuffer)).toBe(true);
    expect(isAnimatedPngBuffer(staticBuffer)).toBe(false);
  });

  test('animated stickers prefer animation asset url before static fallback', () => {
    expect(getLineStickerAssetUrls('123', 'ANIMATION')).toEqual([
      'https://stickershop.line-scdn.net/stickershop/v1/sticker/123/iPhone/sticker_animation@2x.png',
      'https://stickershop.line-scdn.net/stickershop/v1/sticker/123/iPhone/sticker@2x.png'
    ]);
  });
});
