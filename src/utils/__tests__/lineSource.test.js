const { getLineSourceId, getLineSourceType } = require('../lineSource');

describe('lineSource', () => {
  test.each([
    [{ groupId: 'G1', userId: 'U1' }, 'G1', 'group'],
    [{ roomId: 'R1', userId: 'U1' }, 'R1', 'room'],
    [{ userId: 'U1' }, 'U1', 'user'],
    [{}, null, 'unknown']
  ])('normalizes LINE source identity', (source, id, type) => {
    expect(getLineSourceId(source)).toBe(id);
    expect(getLineSourceType(source)).toBe(type);
  });
});
