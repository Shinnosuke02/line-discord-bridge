/**
 * 安全なメッセージブリッジ
 * リプライ機能が失敗しても通常のメッセージ転送を継続
 * 
 * @version 3.0.0
 * @since 2024-12-19
 */
const MessageBridge = require('./MessageBridge');
const SafeReplyService = require('./SafeReplyService');

/**
 * 安全なメッセージブリッジクラス
 */
class SafeMessageBridge extends MessageBridge {
  constructor() {
    super();
    this.replyServiceEnabled = true;
    this.replyServiceFallback = true;
  }

  /**
   * 初期化（安全版）
   */
  async initialize() {
    try {
      await super.initialize();
      
      // 安全なリプライサービスを初期化
      if (this.replyServiceEnabled) {
        try {
          this.replyService = new SafeReplyService(
            this.messageMappingManager,
            this.lineService,
            this.discord
          );
          
          // リプライサービスのヘルスチェック
          const health = await this.replyService.healthCheck();
          if (health.status !== 'healthy') {
            logger.warn('Reply service health check failed, disabling reply feature', {
              health
            });
            this.replyServiceEnabled = false;
          } else {
            logger.info('Safe reply service initialized successfully', {
              safeMode: true,
              timeoutMs: this.replyService.timeoutMs
            });
          }
        } catch (error) {
          logger.error('Failed to initialize reply service, disabling reply feature', {
            error: error.message,
            fallback: this.replyServiceFallback
          });
          this.replyServiceEnabled = false;
        }
      }
      
      logger.info('Safe message bridge initialized', {
        replyServiceEnabled: this.replyServiceEnabled,
        fallbackEnabled: this.replyServiceFallback
      });
      
    } catch (error) {
      logger.error('Failed to initialize safe message bridge', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Discordメッセージを処理（安全版）
   * @param {Object} message - Discordメッセージ
   */
  async handleDiscordMessage(message) {
    try {
      // 通常のメッセージ処理を実行
      await super.handleDiscordMessage(message);
      
    } catch (error) {
      logger.error('Discord message processing failed', {
        messageId: message.id,
        error: error.message
      });
      
      // メッセージ処理が失敗した場合でも、システム全体は継続
      this.metrics.errors++;
    }
  }

  /**
   * LINEイベントを処理（安全版）
   * @param {Object} event - LINEイベント
   */
  async handleLineEvent(event) {
    try {
      // 通常のLINEイベント処理を実行
      await super.handleLineEvent(event);
      
    } catch (error) {
      logger.error('LINE event processing failed', {
        eventId: event.message?.id,
        error: error.message
      });
      
      // LINEイベント処理が失敗した場合でも、システム全体は継続
      this.metrics.errors++;
    }
  }

  /**
   * リプライ機能の状態を取得
   * @returns {Object} リプライ機能の状態
   */
  getReplyServiceStatus() {
    if (!this.replyService) {
      return {
        enabled: false,
        reason: 'Reply service not initialized',
        fallback: this.replyServiceFallback
      };
    }

    return {
      enabled: this.replyServiceEnabled,
      safeMode: this.replyService.safeMode,
      timeoutMs: this.replyService.timeoutMs,
      stats: this.replyService.getSafetyStats(),
      fallback: this.replyServiceFallback
    };
  }

  /**
   * リプライ機能の有効/無効を切り替え
   * @param {boolean} enabled - 有効にするかどうか
   */
  setReplyServiceEnabled(enabled) {
    this.replyServiceEnabled = enabled;
    logger.info('Reply service enabled status changed', {
      enabled: this.replyServiceEnabled,
      fallback: this.replyServiceFallback
    });
  }

  /**
   * フォールバック機能の有効/無効を切り替え
   * @param {boolean} enabled - 有効にするかどうか
   */
  setFallbackEnabled(enabled) {
    this.replyServiceFallback = enabled;
    logger.info('Reply service fallback status changed', {
      enabled: this.replyServiceEnabled,
      fallback: this.replyServiceFallback
    });
  }

  /**
   * システム全体のヘルスチェック
   * @returns {Object} ヘルスチェック結果
   */
  async getSystemHealth() {
    const baseHealth = await super.getMetrics();
    
    let replyHealth = null;
    if (this.replyService) {
      try {
        replyHealth = await this.replyService.healthCheck();
      } catch (error) {
        replyHealth = {
          status: 'unhealthy',
          error: error.message
        };
      }
    }

    return {
      ...baseHealth,
      replyService: {
        enabled: this.replyServiceEnabled,
        health: replyHealth,
        fallback: this.replyServiceFallback
      },
      overallStatus: this.getOverallStatus(replyHealth),
      safetyFeatures: {
        errorIsolation: true,
        gracefulDegradation: true,
        timeoutProtection: true,
        fallbackMode: this.replyServiceFallback
      }
    };
  }

  /**
   * システム全体の状態を判定
   * @param {Object} replyHealth - リプライサービスのヘルス
   * @returns {string} 全体の状態
   */
  getOverallStatus(replyHealth) {
    // 基本的なメッセージ転送が動作していれば、システムは健全
    if (this.isInitialized && this.metrics.errors < this.metrics.messagesProcessed * 0.1) {
      return 'healthy';
    }
    
    // リプライ機能が失敗していても、基本機能が動作していれば警告レベル
    if (replyHealth && replyHealth.status === 'unhealthy') {
      return 'degraded';
    }
    
    return 'unhealthy';
  }
}

module.exports = SafeMessageBridge;
