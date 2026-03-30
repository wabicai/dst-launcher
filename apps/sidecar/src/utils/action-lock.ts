/**
 * Per-project mutex to prevent concurrent actions (e.g. two starts at the same time).
 * Uses a simple Map of Promises — only one action per project runs at a time.
 */
const locks = new Map<string, Promise<unknown>>();

export async function withProjectLock<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
  // Wait for any existing action to finish before starting ours
  const previous = locks.get(projectId) ?? Promise.resolve();

  let releaseLock!: () => void;
  const lockPromise = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  locks.set(projectId, lockPromise);

  try {
    await previous;
    return await fn();
  } finally {
    releaseLock();
    // Clean up the map entry if we're still the current holder
    if (locks.get(projectId) === lockPromise) {
      locks.delete(projectId);
    }
  }
}
