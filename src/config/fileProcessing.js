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

  // サポートされているファイルタイプ
  supportedTypes: {
    images: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
    videos: ['video/mp4', 'video/quicktime', 'video/avi', 'video/wmv', 'video/flv', 'video/webm'],
    audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/m4a'],
    documents: ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
  },

  // ファイルサイズ制限
  sizeLimits: {
    image: 10 * 1024 * 1024, // 10MB
    video: 50 * 1024 * 1024, // 50MB
    audio: 20 * 1024 * 1024, // 20MB
    file: 10 * 1024 * 1024   // 10MB
  },

  // デバッグ設定
  debug: {
    logFileHeaders: process.env.LOG_LEVEL === 'debug',
    headerAnalysisLength: 16
  },

  // 圧縮設定
  compression: {
    imageQuality: 80,
    maxImageSize: 10 * 1024 * 1024, // 10MB
    enableSharp: true
  }
};
