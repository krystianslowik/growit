import { MutationCache, QueryClient } from '@tanstack/react-query';
import { dropSupersededWrites } from './coalesce';
import { recordLostWrite } from './failedWrites';
import { shouldRetryWrite } from './retryPolicy';
import { registerMutationDefaults } from './mutationDefaults';

/// Every write in the app shares one scope, which is what makes the mutation cache run
/// them strictly in order: canRun() only lets the first pending mutation of a scope
/// through, and a paused one still counts as pending. So a queue drained after a flight
/// lands create-then-child rather than all at once, and nothing arrives before the row
/// it depends on.
///
/// Splitting this per aggregate was tempting and wrong: "add a plan day offline, then
/// start a workout from it" crosses aggregates, and separate scopes would race.
const WRITE_SCOPE = { id: 'growit-writes' };

export const createQueryClient = () => {
  const supersedable = new Set<string>();

  // Cache-level rather than per-mutation: only this callback is handed the mutation that
  // was just issued, and without that reference a write cannot tell itself apart from the
  // ones it supersedes.
  const mutationCache = new MutationCache({
    onMutate: (_variables, mutation) => {
      dropSupersededWrites(mutationCache, mutation, supersedable);
    },
    // Reached only once a write has stopped being retried, so this is where a write is
    // finally lost. The optimistic patch it applied is still in the cache and offline
    // nothing will refetch it away, so someone has to say so out loud.
    onError: () => recordLostWrite(),
  });

  const queryClient = new QueryClient({
    mutationCache,
    defaultOptions: {
      queries: {
        // 'online', not 'offlineFirst': React Native has no HTTP cache underneath, so
        // offlineFirst would just turn every read into an error instead of leaving it
        // paused with whatever the cache already holds.
        networkMode: 'online',
        staleTime: 30_000,
        // Persistence needs the entry to still be in memory when it is written out.
        gcTime: Infinity,
        retry: 2,
      },
      mutations: {
        networkMode: 'online',
        // The default is 0, and with it a write that failed once would be dropped on
        // the floor rather than queued.
        retry: shouldRetryWrite,
        scope: WRITE_SCOPE,
      },
    },
  });

  // Registered here rather than by the caller because the two cannot be separated: once
  // the queue is persisted, hydration rebuilds mutations through defaultMutationOptions,
  // and a key with no registered mutationFn comes back unable to run.
  registerMutationDefaults(queryClient, supersedable);

  return queryClient;
};
