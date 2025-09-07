/**
 * ファイル処理設定
 */
module.exports = {
  // デフォルトMIMEタイプ
  defaultMimeTypes: {
    'image': 'image/jpeg',
    'video': 'video/mp4',
    'audio': 'audio/m4a',
    'file': 'application/octet-stream'
  },

  // 最大ファイルサイズ（バイト）
  maxFileSize: 10 * 1024 * 1024, // 10MB

  // デバッグ設定
  debug: {
    // ファイルヘッダーのログ出力
    logFileHeaders: process.env.LOG_LEVEL === 'debug',
    // ヘッダー分析の長さ
    headerAnalysisLength: 16
  },

  // サポートされているファイルタイプ
  supportedTypes: {
    images: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
    videos: ['video/mp4', 'video/quicktime', 'video/avi', 'video/wmv', 'video/flv', 'video/webm'],
    audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/m4a'],
    documents: ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
  }
};