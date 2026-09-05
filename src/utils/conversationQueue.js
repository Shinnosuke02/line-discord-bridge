class ConversationQueue {
  constructor() {
    this.tails = new Map();
  }

  enqueue(key, task) {
    const queueKey = key || '__global__';
    const previous = this.tails.get(queueKey) || Promise.resolve();

    const current = previous
      .catch(() => undefined)
      .then(task)
      .finally(() => {
        if (this.tails.get(queueKey) === current) {
          this.tails.delete(queueKey);
        }
      });

    this.tails.set(queueKey, current);
    return current;
  }

  async drain() {
    const pending = Array.from(this.tails.values());
    if (pending.length === 0) {
      return;
    }

    await Promise.allSettled(pending);
  }

  size() {
    return this.tails.size;
  }
}

module.exports = ConversationQueue;
