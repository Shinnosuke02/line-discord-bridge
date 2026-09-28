function getLineSourceId(source = {}) {
  return source.groupId || source.roomId || source.userId || null;
}

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
