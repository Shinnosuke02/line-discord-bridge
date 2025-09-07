/**
 * Discord Bot サービス
 * Discord.jsを使用したDiscord API操作を管理
 */
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Discordサービスクラス
 */
class DiscordService {
  constructor() {
    this.client = null;
  }

  /**
   * Discordクライアントを設定
   * @param {Client} client - Discordクライアント
   */
  setClient(client) {
    this.client = client;
  }

  /**
   * チャンネルにメッセージを送信
   * @param {string} channelId - チャンネルID
   * @param {Object} message - メッセージ
   * @returns {Object} 送信されたメッセージ
   */
  async sendMessage(channelId, message) {
    try {
      if (!this.client) {
        throw new Error('Discord client not initialized');
      }

      const channel = await this.client.channels.fetch(channelId);
      if (!channel) {
        throw new Error(`Channel not found: ${channelId}`);
      }

      const sentMessage = await channel.send(message);
      
      logger.debug('Discord message sent', {
        channelId,
        messageId: sentMessage.id,
        content: message.content?.substring(0, 100)
      });
      
      return sentMessage;
    } catch (error) {
      logger.error('Failed to send Discord message', {
        channelId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * メッセージに返信
   * @param {string} channelId - チャンネルID
   * @param {string} messageId - 元のメッセージID
   * @param {Object} message - 返信メッセージ
   * @returns {Object} 送信されたメッセージ
   */
  async replyToMessage(channelId, messageId, message) {
    try {
      if (!this.client) {
        throw new Error('Discord client not initialized');
      }

      const channel = await this.client.channels.fetch(channelId);
      if (!channel) {
        throw new Error(`Channel not found: ${channelId}`);
      }

      const originalMessage = await channel.messages.fetch(messageId);
      if (!originalMessage) {
        throw new Error(`Original message not found: ${messageId}`);
      }

      const sentMessage = await originalMessage.reply(message);
      
      logger.debug('Discord reply sent', {
        channelId,
        originalMessageId: messageId,
        replyMessageId: sentMessage.id
      });
      
      return sentMessage;
    } catch (error) {
      logger.error('Failed to send Discord reply', {
        channelId,
        messageId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * ファイルを添付してメッセージを送信
   * @param {string} channelId - チャンネルID
   * @param {string} content - メッセージ内容
   * @param {Array} files - ファイル配列
   * @returns {Object} 送信されたメッセージ
   */
  async sendMessageWithFiles(channelId, content, files = []) {
    try {
      if (!this.client) {
        throw new Error('Discord client not initialized');
      }

      const channel = await this.client.channels.fetch(channelId);
      if (!channel) {
        throw new Error(`Channel not found: ${channelId}`);
      }

      const attachments = files.map(file => {
        if (typeof file === 'string') {
          return new AttachmentBuilder(file);
        } else if (file.buffer) {
          return new AttachmentBuilder(file.buffer, { name: file.name });
        }
        return file;
      });

      const message = {
        content,
        files: attachments
      };

      const sentMessage = await channel.send(message);
      
      logger.debug('Discord message with files sent', {
        channelId,
        messageId: sentMessage.id,
        fileCount: files.length
      });
      
      return sentMessage;
    } catch (error) {
      logger.error('Failed to send Discord message with files', {
        channelId,
        fileCount: files.length,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 埋め込みメッセージを送信
   * @param {string} channelId - チャンネルID
   * @param {Object} embedData - 埋め込みデータ
   * @returns {Object} 送信されたメッセージ
   */
  async sendEmbed(channelId, embedData) {
    try {
      if (!this.client) {
        throw new Error('Discord client not initialized');
      }

      const channel = await this.client.channels.fetch(channelId);
      if (!channel) {
        throw new Error(`Channel not found: ${channelId}`);
      }

      const embed = new EmbedBuilder(embedData);
      const sentMessage = await channel.send({ embeds: [embed] });
      
      logger.debug('Discord embed sent', {
        channelId,
        messageId: sentMessage.id,
        embedTitle: embedData.title
      });
      
      return sentMessage;
    } catch (error) {
      logger.error('Failed to send Discord embed', {
        channelId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * メッセージを編集
   * @param {string} channelId - チャンネルID
   * @param {string} messageId - メッセージID
   * @param {Object} newContent - 新しい内容
   * @returns {Object} 編集されたメッセージ
   */
  async editMessage(channelId, messageId, newContent) {
    try {
      if (!this.client) {
        throw new Error('Discord client not initialized');
      }

      const channel = await this.client.channels.fetch(channelId);
      if (!channel) {
        throw new Error(`Channel not found: ${channelId}`);
      }

      const message = await channel.messages.fetch(messageId);
      if (!message) {
        throw new Error(`Message not found: ${messageId}`);
      }

      const editedMessage = await message.edit(newContent);
      
      logger.debug('Discord message edited', {
        channelId,
        messageId,
        newContent: newContent.content?.substring(0, 100)
      });
      
      return editedMessage;
    } catch (error) {
      logger.error('Failed to edit Discord message', {
        channelId,
        messageId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * メッセージを削除
   * @param {string} channelId - チャンネルID
   * @param {string} messageId - メッセージID
   * @returns {boolean} 削除成功
   */
  async deleteMessage(channelId, messageId) {
    try {
      if (!this.client) {
        throw new Error('Discord client not initialized');
      }

      const channel = await this.client.channels.fetch(channelId);
      if (!channel) {
        throw new Error(`Channel not found: ${channelId}`);
      }

      const message = await channel.messages.fetch(messageId);
      if (!message) {
        throw new Error(`Message not found: ${messageId}`);
      }

      await message.delete();
      
      logger.debug('Discord message deleted', {
        channelId,
        messageId
      });
      
      return true;
    } catch (error) {
      logger.error('Failed to delete Discord message', {
        channelId,
        messageId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * チャンネル情報を取得
   * @param {string} channelId - チャンネルID
   * @returns {Object} チャンネル情報
   */
  async getChannel(channelId) {
    try {
      if (!this.client) {
        throw new Error('Discord client not initialized');
      }

      const channel = await this.client.channels.fetch(channelId);
      
      logger.debug('Discord channel retrieved', {
        channelId,
        channelName: channel.name,
        channelType: channel.type
      });
      
      return channel;
    } catch (error) {
      logger.error('Failed to get Discord channel', {
        channelId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * ギルド情報を取得
   * @param {string} guildId - ギルドID
   * @returns {Object} ギルド情報
   */
  async getGuild(guildId) {
    try {
      if (!this.client) {
        throw new Error('Discord client not initialized');
      }

      const guild = await this.client.guilds.fetch(guildId);
      
      logger.debug('Discord guild retrieved', {
        guildId,
        guildName: guild.name,
        memberCount: guild.memberCount
      });
      
      return guild;
    } catch (error) {
      logger.error('Failed to get Discord guild', {
        guildId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * ユーザー情報を取得
   * @param {string} userId - ユーザーID
   * @returns {Object} ユーザー情報
   */
  async getUser(userId) {
    try {
      if (!this.client) {
        throw new Error('Discord client not initialized');
      }

      const user = await this.client.users.fetch(userId);
      
      logger.debug('Discord user retrieved', {
        userId,
        username: user.username,
        discriminator: user.discriminator
      });
      
      return user;
    } catch (error) {
      logger.error('Failed to get Discord user', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * メッセージを取得
   * @param {string} channelId - チャンネルID
   * @param {string} messageId - メッセージID
   * @returns {Object} メッセージ
   */
  async getMessage(channelId, messageId) {
    try {
      if (!this.client) {
        throw new Error('Discord client not initialized');
      }

      const channel = await this.client.channels.fetch(channelId);
      if (!channel) {
        throw new Error(`Channel not found: ${channelId}`);
      }

      const message = await channel.messages.fetch(messageId);
      
      logger.debug('Discord message retrieved', {
        channelId,
        messageId,
        authorId: message.author.id
      });
      
      return message;
    } catch (error) {
      logger.error('Failed to get Discord message', {
        channelId,
        messageId,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = DiscordService;
