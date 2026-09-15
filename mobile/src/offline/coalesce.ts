import type { Mutation, MutationCache, MutationKey } from '@tanstack/react-query';

const keyOf = (mutationKey: MutationKey | undefined) => JSON.stringify(mutationKey ?? []);

/// Two writes aim at the same thing when they name the same target - which is every
/// variable except the payload itself.
const targetOf = (variables: unknown) => {
  if (!variables || typeof variables !== 'object') return JSON.stringify(variables ?? null);
  const { data: _payload, ...target } = variables as Record<string, unknown>;
  return JSON.stringify(target);
};

/// Throws away queued writes that the one just issued has made pointless.
///
/// Only ever applied to requests carrying the whole desired state of their target rather
/// than a delta. For those, sending the latest is equivalent to replaying every earlier
/// one in order - so renaming a plan ten times on a train should leave one request in the
/// queue, not ten.
///
/// Creates and logged sets are deliberately left out: each one is a fact of its own, and
/// dropping the earlier ones would lose what the user did.
///
/// Hooked to the cache rather than to individual mutations because it needs to know which
/// write is the new one. By the time onMutate runs, that write is already sitting in the
/// cache marked paused, indistinguishable from the ones it supersedes - and only the
/// cache-level callback is handed the mutation itself.
export const dropSupersededWrites = (
  cache: MutationCache,
  issued: Mutation<unknown, unknown, unknown, unknown>,
  supersedable: ReadonlySet<string>,
) => {
  const key = keyOf(issued.options.mutationKey);
  if (!supersedable.has(key)) return;

  const target = targetOf(issued.state.variables);

  for (const queued of cache.getAll()) {
    if (queued === issued) continue;
    // Anything already in flight is past the point of being called off.
    if (!queued.state.isPaused) continue;
    if (keyOf(queued.options.mutationKey) !== key) continue;
    if (targetOf(queued.state.variables) !== target) continue;

    cache.remove(queued);
  }
};
