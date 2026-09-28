/**
 * LINE / Discord message mapping manager.
 * SQLite is the primary store; the legacy JSON file remains a rollback mirror.
 */
const path = require('path');
const logger = require('../utils/logger');
const { readJsonFile, writeJsonFileAtomic } = require('../utils/jsonFileStore');
const ReplyTokenPolicy = require('./ReplyTokenPolicy');
const MessageLinkRepository = require('../repositories/MessageLinkRepository');

class MessageMappingManager {
  constructor(options = {}) {
    this.lineToDiscord = new Map();
    this.discordToLine = new Map();
    this.discordToLineMany = new Map();
    this.lineOriginByDiscordMessage = new Map();
    this.discordOriginByLineMessage = new Map();
    this.mappingFile = options.mappingFile || path.join(process.cwd(), 'data', 'message-mappings.json');
    this.tempMappingFile = `${this.mappingFile}.tmp`;
    this.isInitialized = false;
    this.saveQueue = Promise.resolve();
    this.replyTokenPolicy = options.replyTokenPolicy || new ReplyTokenPolicy();
    this.repository = options.repository || new MessageLinkRepository();
  }

  async initialize() {
    try {
      await this.loadMappings();
      this.isInitialized = true;
      logger.info('MessageMappingManager initialized', {
        lineToDiscordCount: this.lineToDiscord.size,
        discordToLineCount: this.discordToLineMany.size
      });
    } catch (error) {
      logger.error('Failed to initialize MessageMappingManager', { error: error.message });
      throw error;
    }
  }

  async loadMappings() {
    this.resetMappings();

    const persisted = this.repository.getAll();
    if (persisted.length > 0) {
      this.loadRowsIntoMemory(persisted);
      await this.saveMappings();
      logger.info('Message mappings restored from SQLite', { count: persisted.length });
      return;
    }

    let mappings;
    try {
      mappings = await readJsonFile(this.mappingFile);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      logger.info('Message mapping file not found, starting with empty mappings');
      return;
    }

    if (!mappings || Array.isArray(mappings)) {
      logger.info('Legacy or empty message mapping format detected, starting with empty mappings');
      return;
    }

    if (mappings.lineToDiscord) {
      for (const value of Object.values(mappings.lineToDiscord)) {
        if (!value?.lineMessageId || !value?.discordMessageId) continue;
        this.repository.upsert({
          ...value,
          direction: 'line_to_discord',
          ordinal: 0
        });
      }
    }

    if (mappings.discordToLine) {
      for (const value of Object.values(mappings.discordToLine)) {
        if (!value?.lineMessageId || !value?.discordMessageId) continue;
        this.repository.upsert({
          ...value,
          direction: 'discord_to_line',
          ordinal: 0
        });
      }
    }

    const migrated = this.repository.getAll();
    this.loadRowsIntoMemory(migrated);
    logger.info('Legacy JSON message mappings migrated to SQLite', { count: migrated.length });
  }

  loadRowsIntoMemory(rows) {
    this.resetMappings();

    for (const mapping of rows) {
      if (mapping.direction === 'line_to_discord') {
        this.lineToDiscord.set(mapping.lineMessageId, mapping);
        if (mapping.discordMessageId) {
          this.lineOriginByDiscordMessage.set(mapping.discordMessageId, mapping);
        }
        continue;
      }

      if (mapping.direction === 'discord_to_line') {
        const list = this.discordToLineMany.get(mapping.discordMessageId) || [];
        list.push(mapping);
        list.sort((a, b) => (a.ordinal || 0) - (b.ordinal || 0));
        this.discordToLineMany.set(mapping.discordMessageId, list);
        if (!this.discordToLine.has(mapping.discordMessageId)) {
          this.discordToLine.set(mapping.discordMessageId, mapping);
        }
        if (mapping.lineMessageId) {
          this.discordOriginByLineMessage.set(mapping.lineMessageId, mapping);
        }
      }
    }
  }

  async saveMappings() {
    const saveOperation = this.saveQueue.catch(() => {}).then(async () => {
      const discordToLine = {};
      for (const [discordMessageId, mappings] of this.discordToLineMany.entries()) {
        if (mappings[0]) {
          discordToLine[discordMessageId] = mappings[0];
        }
      }

      const mappings = {
        lineToDiscord: Object.fromEntries(this.lineToDiscord),
        discordToLine,
        lastUpdated: new Date().toISOString(),
        version: '3.2.0',
        note: 'Rollback mirror. SQLite message_links is authoritative.'
      };

      await writeJsonFileAtomic(this.mappingFile, mappings);
    });

    this.saveQueue = saveOperation;
    await saveOperation;
  }

  async mapLineToDiscord(lineMessageId, discordMessageId, lineUserId, discordChannelId, metadata = null) {
    const normalized = this.normalizeLegacyMetadata(metadata);
    const existing = this.lineToDiscord.get(lineMessageId) || {};
    const mapping = {
      ...existing,
      direction: 'line_to_discord',
      lineMessageId,
      discordMessageId,
      lineUserId: lineUserId || existing.lineUserId || null,
      discordChannelId,
      ordinal: 0,
      messageType: normalized.messageType || existing.messageType || null,
      transport: normalized.transport || existing.transport || null,
      webhookId: normalized.webhookId || existing.webhookId || null,
      replyToken: normalized.replyToken || existing.replyToken || null,
      replyTokenExpiry: normalized.replyTokenExpiry || existing.replyTokenExpiry || null,
      replyTokenUsedAt: existing.replyTokenUsedAt || null,
      quoteToken: normalized.quoteToken || existing.quoteToken || null,
      metadata: {
        ...(existing.metadata || {}),
        ...(normalized.metadata || {})
      },
      timestamp: existing.timestamp || new Date().toISOString()
    };

    if (mapping.replyToken && !mapping.replyTokenExpiry) {
      mapping.replyTokenExpiry = this.replyTokenPolicy.createExpiry();
    }

    this.repository.upsert(mapping);
    this.lineToDiscord.set(lineMessageId, mapping);
    this.lineOriginByDiscordMessage.set(discordMessageId, mapping);
    await this.saveMappings();

    logger.info('LINE to Discord mapping created', {
      lineMessageId,
      discordMessageId,
      hasReplyToken: !!mapping.replyToken,
      hasQuoteToken: !!mapping.quoteToken
    });

    return mapping;
  }

  async mapDiscordToLine(discordMessageId, lineMessageId, lineUserId, discordChannelId, metadata = {}) {
    return this.mapDiscordToLines(
      discordMessageId,
      [{ lineMessageId, ...metadata }],
      lineUserId,
      discordChannelId
    );
  }

  async mapDiscordToLines(discordMessageId, lineMessages, lineUserId, discordChannelId) {
    const valid = (lineMessages || []).filter((item) => item?.lineMessageId);
    const mappings = [];

    for (let index = 0; index < valid.length; index++) {
      const item = valid[index];
      const mapping = {
        direction: 'discord_to_line',
        discordMessageId,
        lineMessageId: item.lineMessageId,
        lineUserId,
        discordChannelId,
        ordinal: Number.isInteger(item.ordinal) ? item.ordinal : index,
        messageType: item.messageType || item.type || null,
        transport: item.transport || null,
        quoteToken: item.quoteToken || null,
        timestamp: item.timestamp || new Date().toISOString()
      };

      this.repository.upsert(mapping);
      mappings.push(mapping);
      this.discordOriginByLineMessage.set(mapping.lineMessageId, mapping);
    }

    if (mappings.length > 0) {
      this.discordToLineMany.set(discordMessageId, mappings);
      this.discordToLine.set(discordMessageId, mappings[0]);
      await this.saveMappings();

      logger.info('Discord to LINE mappings created', {
        discordMessageId,
        lineMessageCount: mappings.length,
        lineUserId,
        discordChannelId
      });
    }

    return mappings;
  }

  getLineOriginByDiscordMessageId(discordMessageId) {
    return this.lineOriginByDiscordMessage.get(discordMessageId) || null;
  }

  getDiscordOriginByLineMessageId(lineMessageId) {
    return this.discordOriginByLineMessage.get(lineMessageId) || null;
  }

  getLineToDiscordMapping(lineMessageId) {
    return this.lineToDiscord.get(lineMessageId) || null;
  }

  getDiscordToLineMapping(discordMessageId) {
    return this.discordToLine.get(discordMessageId) || null;
  }

  getDiscordToLineMappings(discordMessageId) {
    return [...(this.discordToLineMany.get(discordMessageId) || [])];
  }

  async markReplyTokenUsed(lineMessageId) {
    const mapping = this.lineToDiscord.get(lineMessageId);
    if (!this.replyTokenPolicy.isUsable(mapping)) {
      return false;
    }

    const usedAt = new Date().toISOString();
    mapping.replyTokenUsedAt = usedAt;
    this.repository.markReplyTokenUsed(lineMessageId, usedAt);
    if (mapping.discordMessageId) {
      this.lineOriginByDiscordMessage.set(mapping.discordMessageId, mapping);
    }
    await this.saveMappings();
    return true;
  }

  isReplyTokenExpired(mapping) {
    return this.replyTokenPolicy.isExpired(mapping);
  }

  async removeMapping(lineMessageId, discordMessageId) {
    let removed = false;

    if (lineMessageId) {
      const lineMapping = this.lineToDiscord.get(lineMessageId);
      if (lineMapping?.discordMessageId) {
        this.lineOriginByDiscordMessage.delete(lineMapping.discordMessageId);
      }
      this.lineToDiscord.delete(lineMessageId);

      const discordOrigin = this.discordOriginByLineMessage.get(lineMessageId);
      if (discordOrigin?.discordMessageId) {
        const list = (this.discordToLineMany.get(discordOrigin.discordMessageId) || [])
          .filter((item) => item.lineMessageId !== lineMessageId);
        if (list.length > 0) {
          this.discordToLineMany.set(discordOrigin.discordMessageId, list);
          this.discordToLine.set(discordOrigin.discordMessageId, list[0]);
        } else {
          this.discordToLineMany.delete(discordOrigin.discordMessageId);
          this.discordToLine.delete(discordOrigin.discordMessageId);
        }
      }
      this.discordOriginByLineMessage.delete(lineMessageId);
      removed = this.repository.deleteByLineMessageId(lineMessageId) > 0 || removed;
    }

    if (discordMessageId) {
      const lineOrigin = this.lineOriginByDiscordMessage.get(discordMessageId);
      if (lineOrigin?.lineMessageId) {
        this.lineToDiscord.delete(lineOrigin.lineMessageId);
      }
      this.lineOriginByDiscordMessage.delete(discordMessageId);

      const list = this.discordToLineMany.get(discordMessageId) || [];
      for (const item of list) {
        if (item.lineMessageId) {
          this.discordOriginByLineMessage.delete(item.lineMessageId);
        }
      }
      this.discordToLineMany.delete(discordMessageId);
      this.discordToLine.delete(discordMessageId);
      removed = this.repository.deleteByDiscordMessageId(discordMessageId) > 0 || removed;
    }

    if (removed) {
      await this.saveMappings();
    }

    return removed;
  }

  async cleanupOldMappings(daysOld = 7) {
    const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();
    const removedCount = this.repository.deleteOlderThan(cutoff);
    if (removedCount > 0) {
      this.loadRowsIntoMemory(this.repository.getAll());
      await this.saveMappings();
    }
    return removedCount;
  }

  resetMappings() {
    this.lineToDiscord.clear();
    this.discordToLine.clear();
    this.discordToLineMany.clear();
    this.lineOriginByDiscordMessage.clear();
    this.discordOriginByLineMessage.clear();
  }

  normalizeLegacyMetadata(metadata) {
    if (!metadata) return {};
    if (typeof metadata === 'string') return { replyToken: metadata };
    return metadata;
  }

  getAllMappings() {
    return {
      lineToDiscord: Array.from(this.lineToDiscord.values()),
      discordToLine: Array.from(this.discordToLineMany.values()).flat()
    };
  }

  getStats() {
    const lineToDiscordMappings = Array.from(this.lineToDiscord.values());
    const discordToLineMappings = Array.from(this.discordToLineMany.values()).flat();
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent = [...lineToDiscordMappings, ...discordToLineMappings]
      .filter((mapping) => new Date(mapping.timestamp).getTime() > oneDayAgo).length;
    const weekly = [...lineToDiscordMappings, ...discordToLineMappings]
      .filter((mapping) => new Date(mapping.timestamp).getTime() > oneWeekAgo).length;

    return {
      totalMappings: lineToDiscordMappings.length + discordToLineMappings.length,
      lineToDiscordCount: lineToDiscordMappings.length,
      discordToLineCount: discordToLineMappings.length,
      discordParentCount: this.discordToLineMany.size,
      recentMappings: recent,
      weeklyMappings: weekly,
      isInitialized: this.isInitialized
    };
  }

  async stop() {
    try {
      await this.saveMappings();
      this.isInitialized = false;
      logger.info('MessageMappingManager stopped');
    } catch (error) {
      logger.error('Failed to stop MessageMappingManager', { error: error.message });
    }
  }
}

module.exports = MessageMappingManager;
