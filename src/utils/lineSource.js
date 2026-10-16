// @ts-check

/**
 * LINE source identifiers are mutually exclusive in a webhook event, but
 * the provider can omit some properties depending on the conversation type.
 * @typedef {{ groupId?: string | null, roomId?: string | null, userId?: string | null }} LineSource
 */

/**
 * @param {LineSource} [source]
 * @returns {string | null}
 */
function getLineSourceId(source = {}) {
  return source.groupId || source.roomId || source.userId || null;
}

/**
 * @param {LineSource} [source]
 * @returns {'group' | 'room' | 'user' | 'unknown'}
 */
function getLineSourceType(source = {}) {
  if (source.groupId) return 'group';
  if (source.roomId) return 'room';
  if (source.userId) return 'user';
  return 'unknown';
}

module.exports = {
  getLineSourceId,
  getLineSourceType
};
