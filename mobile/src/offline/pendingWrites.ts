/// A way to ask about the write queue from outside the query tree.
///
/// Sign-out has to know whether anything is still waiting to be sent, and it happens in
/// AuthContext - which now sits above the query provider, because the provider is keyed
/// by the very user id AuthContext owns. Same shape as sessionExpiry: a tiny registry
/// rather than an import cycle.

type QueueInspector = {
  pausedCount: () => number;
  persist: () => Promise<void>;
};

let inspector: QueueInspector | null = null;

export const setQueueInspector = (next: QueueInspector | null) => {
  inspector = next;
};

export const pendingWriteCount = (): number => inspector?.pausedCount() ?? 0;

/// Writes are persisted on a throttle, so the most recent one may not be on disk yet.
/// Called before a sign-out tears the client down.
export const persistPendingWrites = (): Promise<void> =>
  inspector?.persist() ?? Promise.resolve();
