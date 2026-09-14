import { QueryClient } from '@tanstack/react-query';
import { isPermanentError } from '../api/errors';

/// Every write in the app shares one scope, which is what makes the mutation cache run
/// them strictly in order: canRun() only lets the first pending mutation of a scope
/// through, and a paused one still counts as pending. So a queue drained after a flight
/// lands create-then-child rather than all at once, and nothing arrives before the row
/// it depends on.
///
/// Splitting this per aggregate was tempting and wrong: "add a plan day offline, then
/// start a workout from it" crosses aggregates, and separate scopes would race.
const WRITE_SCOPE = { id: 'growit-writes' };

/// A write that keeps failing against a server that is up and answering should not loop
/// forever. Offline does not consume these - the mutation is paused, not failed - and a
/// flaky link trips the circuit breaker into offline before it gets far, so this budget
/// is only ever spent on real trouble. Roughly two minutes with the default backoff.
const MAX_WRITE_ATTEMPTS = 8;

export const createQueryClient = () =>
  new QueryClient({
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
        retry: (failureCount, error) =>
          !isPermanentError(error) && failureCount < MAX_WRITE_ATTEMPTS,
        scope: WRITE_SCOPE,
      },
    },
  });
