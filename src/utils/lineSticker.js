function isAnimatedStickerResourceType(stickerResourceType = '') {
  return ['ANIMATION', 'ANIMATION_SOUND', 'POPUP', 'POPUP_SOUND'].includes(stickerResourceType);
}

function isAnimatedPngBuffer(buffer) {
  return Buffer.isBuffer(buffer) && buffer.includes(Buffer.from('acTL'));
}

function getLineStickerAssetUrls(stickerId, stickerResourceType = 'STATIC') {
  const baseUrl = `https://stickershop.line-scdn.net/stickershop/v1/sticker/${stickerId}/iPhone`;
  const urls = [];

  if (isAnimatedStickerResourceType(stickerResourceType)) {
    urls.push(`${baseUrl}/sticker_animation@2x.png`);
  }

  urls.push(`${baseUrl}/sticker@2x.png`);
  return urls;
}

function getLineEmojiAssetUrl(productId, emojiId) {
  const normalizedProductId = String(productId || '');
  const normalizedEmojiId = String(emojiId || '');

  if (!/^[A-Za-z0-9_-]{1,128}$/.test(normalizedProductId)
    || !/^[A-Za-z0-9_-]{1,64}$/.test(normalizedEmojiId)) {
    return null;
  }

  return `https://stickershop.line-scdn.net/sticonshop/v1/sticon/${normalizedProductId}/android/${normalizedEmojiId}.png`;
}

module.exports = {
  getLineStickerAssetUrls,
  getLineEmojiAssetUrl,
  isAnimatedPngBuffer,
  isAnimatedStickerResourceType
};
