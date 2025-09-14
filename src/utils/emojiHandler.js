/**
 * 絵文字処理ユーティリティ
 * LINEとDiscord間での絵文字の互換性を確保
 * 
 * @version 3.0.0
 * @since 2024-12-19
 */

/**
 * 絵文字を正規化する
 * @param {string} text - 処理するテキスト
 * @returns {string} 正規化されたテキスト
 */
function normalizeEmojis(text) {
  if (!text) return text;
  
  try {
    // Unicode正規化を実行（NFC形式に統一）
    let normalized = text.normalize('NFC');
    
    // ゼロ幅文字を削除
    normalized = normalized.replace(/[\u200B-\u200D\uFEFF]/g, '');
    
    // 結合文字の正規化
    normalized = normalized.replace(/\u{FE0E}|\u{FE0F}/gu, '');
    
    return normalized;
  } catch (error) {
    console.warn('Emoji normalization failed:', error);
    return text;
  }
}

/**
 * 絵文字が有効かチェックする
 * @param {string} text - チェックするテキスト
 * @returns {boolean} 絵文字が有効かどうか
 */
function isValidEmoji(text) {
  if (!text) return false;
  
  try {
    // 絵文字の正規表現パターン
    const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F018}-\u{1F0F5}]|[\u{1F200}-\u{1F2FF}]|[\u{1FA70}-\u{1FAFF}]|[\u{1F004}]|[\u{1F0CF}]|[\u{1F170}-\u{1F251}]/gu;
    
    return emojiRegex.test(text);
  } catch (error) {
    console.warn('Emoji validation failed:', error);
    return false;
  }
}

/**
 * テキストから絵文字を安全に処理する
 * @param {string} text - 処理するテキスト
 * @returns {string} 処理されたテキスト
 */
function processEmojiText(text) {
  if (!text) return text;
  
  try {
    // まず正規化を実行
    let processed = normalizeEmojis(text);
    
    // 絵文字が含まれているかチェック
    if (isValidEmoji(processed)) {
      return processed;
    }
    
    // 絵文字が見つからない場合は、元のテキストを返す
    // ただし、明らかに文字化けしている場合は警告を出す
    if (text.includes('(emoji)') || text.includes('emoji')) {
      console.warn('Potential emoji encoding issue detected:', text);
      // 可能であれば絵文字を復元するか、代替テキストを提供
      return text.replace(/\(emoji\)/g, '😊'); // デフォルトの絵文字
    }
    
    return processed;
  } catch (error) {
    console.error('Emoji processing failed:', error);
    return text;
  }
}

/**
 * LINEメッセージの絵文字を処理する
 * @param {string} text - LINEメッセージテキスト
 * @returns {string} 処理されたテキスト
 */
function processLineEmoji(text) {
  if (!text) return text;
  
  try {
    // LINE特有の絵文字処理
    let processed = processEmojiText(text);
    
    // LINEの絵文字コードを標準絵文字に変換（必要に応じて）
    const lineEmojiMap = {
      // LINE特有の絵文字マッピング（必要に応じて追加）
    };
    
    Object.entries(lineEmojiMap).forEach(([lineEmoji, standardEmoji]) => {
      processed = processed.replace(new RegExp(lineEmoji, 'g'), standardEmoji);
    });
    
    return processed;
  } catch (error) {
    console.error('Line emoji processing failed:', error);
    return text;
  }
}

/**
 * Discordメッセージの絵文字を処理する
 * @param {string} text - Discordメッセージテキスト
 * @returns {string} 処理されたテキスト
 */
function processDiscordEmoji(text) {
  if (!text) return text;
  
  try {
    // Discord特有の絵文字処理
    let processed = processEmojiText(text);
    
    // Discordの絵文字形式をLINE対応形式に変換
    // <:emoji_name:id> 形式を標準絵文字に変換（必要に応じて）
    processed = processed.replace(/<:[^:]+:\d+>/g, '😊');
    
    return processed;
  } catch (error) {
    console.error('Discord emoji processing failed:', error);
    return text;
  }
}

module.exports = {
  normalizeEmojis,
  isValidEmoji,
  processEmojiText,
  processLineEmoji,
  processDiscordEmoji
};
