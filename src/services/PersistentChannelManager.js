const { ChannelType } = require('discord.js');
const config = require('../config');
const logger = require('../utils/logger');
const ChannelManager = require('./ChannelManager');
const ConversationRepository = require('../repositories/ConversationRepository');

/**
 * ChannelManager compatibility layer for the SQLite migration.
 *
 * The legacy JSON file remains a rollback mirror while DB_TYPE=sqlite makes
 * SQLite the primary source on restart. Keeping this outside ChannelManager
 * avoids destabilising the already-working LINE/Discord channel behaviour.
 */
class PersistentChannelManager extends ChannelManager {
  constructor(discordClient, lineService, options = {}) {
    super(discordClient, lineService);
    this.conversationRepository = options.conversationRepository
      || (config.database.type === 'sqlite' ? new ConversationRepository() : null);
    this.sourceCreationLocks = new Map();
  }

  rowToMapping(row) {
    return {
      sourceId: row.line_source_id,
      discordChannelId: row.discord_channel_id,
      channelName: row.display_name || undefined,
      createdAt: row.created_at,
      lastUsed: row.last_used_at
    };
  }

  async loadMappings() {
    if (this.conversationRepository && this.conversationRepository.count() > 0) {
      this.mappings.clear();
      for (const row of this.conversationRepository.listAll()) {
        this.mappings.set(row.line_source_id, this.rowToMapping(row));
      }
      logger.info('Channel mappings loaded from SQLite', {
        count: this.mappings.size
      });
      return;
    }

    await super.loadMappings();

    if (this.conversationRepository) {
      for (const [sourceId, value] of this.mappings) {
        if (!value?.discordChannelId) continue;
        this.conversationRepository.upsert({
          ...value,
          sourceId: value.sourceId || sourceId
        });
      }
      logger.info('Legacy JSON channel mappings mirrored to SQLite', {
        count: this.mappings.size
      });
    }
  }

  async saveMappings() {
    // Keep the JSON mirror during the migration window so rollback remains
    // possible without reconstructing the old storage format.
    await super.saveMappings();

    if (!this.conversationRepository) return;

    for (const [sourceId, value] of this.mappings) {
      if (!value?.discordChannelId) continue;
      this.conversationRepository.upsert({
        ...value,
        sourceId: value.sourceId || sourceId
      });
    }
  }

  async getOrCreateChannel(sourceId) {
    const existing = this.sourceCreationLocks.get(sourceId);
    if (existing) return existing;

    const operation = super.getOrCreateChannel(sourceId);
    this.sourceCreationLocks.set(sourceId, operation);

    try {
      return await operation;
    } finally {
      if (this.sourceCreationLocks.get(sourceId) === operation) {
        this.sourceCreationLocks.delete(sourceId);
      }
    }
  }

  async removeChannelMapping(sourceId) {
    const removed = await super.removeChannelMapping(sourceId);
    if (removed && this.conversationRepository) {
      this.conversationRepository.deleteBySource(sourceId);
    }
    return removed;
  }

  /**
   * Same naming/category behaviour as the legacy manager, but do not expose
   * the LINE source ID in the topic and do not grant @everyone permissions.
   * Discord/category inheritance decides visibility instead.
   */
  async createNewChannel(sourceId) {
    try {
      const guildId = config.discord.guildId;
      if (!guildId) {
        throw new Error('Discord guild ID not configured');
      }

      const guild = await this.discord.guilds.fetch(guildId);
      if (!guild) {
        throw new Error(`Discord guild not found: ${guildId}`);
      }

      const channelName = await this.generateChannelName(sourceId);
      const categoryId = this.getCategoryForSource(sourceId);
      const channelOptions = {
        name: channelName,
        type: ChannelType.GuildText,
        topic: 'LINE Bridge Channel'
      };

      if (categoryId) {
        channelOptions.parent = categoryId;
      }

      const channel = await guild.channels.create(channelOptions);
      const now = new Date().toISOString();

      return {
        sourceId,
        discordChannelId: channel.id,
        channelName: channel.name,
        categoryId,
        createdAt: now,
        lastUsed: now
      };
    } catch (error) {
      logger.error('Failed to create new channel', {
        sourceId,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = PersistentChannelManager;
