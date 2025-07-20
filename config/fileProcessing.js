/**
 * ファイル処理設定
 */
module.exports = {
  // ファイルサイズ制限
  maxFileSize: 10 * 1024 * 1024, // 10MB
  
  // 期待されるタイプに基づくデフォルトMIMEタイプ
  defaultMimeTypes: {
    'image': 'image/jpeg',
    'video': 'video/mp4',
    'audio': 'audio/m4a',
    'file': 'application/octet-stream'
  },
  
  // フォールバック拡張子マッピング
  fallbackExtensions: {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'audio/mpeg': 'mp3',
    'audio/m4a': 'm4a',
    'application/pdf': 'pdf',
    'application/zip': 'zip'
  },
  
  // デバッグ設定
  debug: {
    headerAnalysisLength: 32,
    logFileHeaders: true
  }
}; 