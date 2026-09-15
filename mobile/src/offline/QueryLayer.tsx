import { ReactNode, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Query, QueryClientProvider } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { PersistQueryClientProvider, persistQueryClientSave } from '@tanstack/react-query-persist-client';
import { useAuth } from '../auth/AuthContext';
import { setQueueInspector } from './pendingWrites';
import { createQueryClient } from './queryClient';

/// Bump when the shape of what we store changes, so old payloads are discarded rather
/// than hydrated into a client that no longer understands them.
const CACHE_VERSION = 'v1';

/// Everything the app reads from the API, and nothing else. The exercise library is in
/// here on purpose: without it a session opened offline after a restart would show rows
/// with no names.
const PERSISTED_PREFIXES = ['/api/training-plans', '/api/Workouts', '/api/Exercises'];

const persistOptionsFor = (userId: string) => ({
  // Keyed by user. Query keys for plans carry no user id - the server takes it from the
  // token - so one shared store would hand the next account the previous one's plans.
  persister: createAsyncStoragePersister({
    storage: AsyncStorage,
    key: `growit.rq.${userId}`,
    throttleTime: 1000,
  }),
  // Not the default 24 hours. That clock governs the write queue as much as the cache,
  // and a day offline is a long weekend, not a reason to throw away someone's training.
  maxAge: Infinity,
  buster: CACHE_VERSION,
  dehydrateOptions: {
    shouldDehydrateQuery: (query: Query) => {
      if (query.state.status !== 'success') return false;
      const [first] = query.queryKey;
      return typeof first === 'string' && PERSISTED_PREFIXES.some((p) => first.startsWith(p));
    },
  },
});

/// Signed in: a client of this user's own, restored from disk and saved back to it.
///
/// The key on this component is what isolates accounts - a different user remounts the
/// whole thing rather than reusing a client that has been told to forget. queryClient.clear()
/// used to do that job and took the write queue with it every time.
const PersistedQueries = ({ userId, children }: { userId: string; children: ReactNode }) => {
  // Built during render, before anything can hydrate into it: hydration rebuilds mutations
  // through defaultMutationOptions, and a key whose mutationFn is not registered yet comes
  // back unable to run. createQueryClient registers them synchronously for that reason.
  const queryClient = useMemo(() => createQueryClient(), [userId]);
  const persistOptions = useMemo(() => persistOptionsFor(userId), [userId]);

  useEffect(() => {
    setQueueInspector({
      pausedCount: () =>
        queryClient.getMutationCache().getAll().filter((m) => m.state.isPaused).length,
      persist: () =>
        persistQueryClientSave({
          queryClient,
          persister: persistOptions.persister,
          buster: persistOptions.buster,
          dehydrateOptions: persistOptions.dehydrateOptions,
        }),
    });

    return () => setQueueInspector(null);
  }, [queryClient, persistOptions]);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
      // Deliberately not returning the promise. The provider chains whatever onSuccess
      // gives back into the same .finally that clears isRestoring, and resuming a queue
      // that cannot run yet settles only once it does - which would hold the app on a
      // loading screen for as long as the writes are waiting.
      onSuccess={() => {
        void queryClient.resumePausedMutations();
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
};

export const QueryLayer = ({ children }: { children: ReactNode }) => {
  const { isAuthed, userId } = useAuth();

  // Signed out there is nothing worth keeping: the auth screens read no API, and writing
  // a store for a user we do not have would only leave rubbish behind.
  const anonymousClient = useMemo(() => createQueryClient(), []);

  if (!isAuthed || !userId) {
    return <QueryClientProvider client={anonymousClient}>{children}</QueryClientProvider>;
  }

  return (
    <PersistedQueries key={userId} userId={userId}>
      {children}
    </PersistedQueries>
  );
};
