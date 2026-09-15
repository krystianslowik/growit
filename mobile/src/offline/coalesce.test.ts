/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Mutation, MutationCache } from '@tanstack/react-query';
import { dropSupersededWrites } from './coalesce.ts';

type FakeMutation = {
  options: { mutationKey: unknown[] };
  state: { isPaused: boolean; variables: unknown };
};

const RENAME_PLAN = ['putApiTrainingPlansPlanId'];
const LOG_SET = ['postApiExercisesWorkoutExerciseIdSets'];

const supersedable = new Set([JSON.stringify(RENAME_PLAN)]);

const write = (
  mutationKey: unknown[],
  variables: unknown,
  { paused = true } = {},
): FakeMutation => ({ options: { mutationKey }, state: { isPaused: paused, variables } });

/// Stands in for the real cache: dropSupersededWrites only ever reads getAll and removes.
const fakeCache = (queue: FakeMutation[]) => {
  const removed: FakeMutation[] = [];
  const cache = {
    getAll: () => queue,
    remove: (mutation: FakeMutation) => {
      removed.push(mutation);
      queue.splice(queue.indexOf(mutation), 1);
    },
  };
  return { cache: cache as unknown as MutationCache, queue, removed };
};

const run = (
  cache: MutationCache,
  issued: FakeMutation,
  keys: ReadonlySet<string> = supersedable,
) => dropSupersededWrites(cache, issued as unknown as Mutation<unknown, unknown, unknown, unknown>, keys);

describe('dropSupersededWrites', () => {
  test('a newer write clears out the queued ones it replaces', () => {
    const older = write(RENAME_PLAN, { planId: 'p1', data: { name: 'A' } });
    const newer = write(RENAME_PLAN, { planId: 'p1', data: { name: 'B' } });
    const { cache, queue } = fakeCache([older, newer]);

    run(cache, newer);

    // Renaming the same plan ten times on a train should leave one request, not ten.
    assert.deepEqual(queue, [newer]);
  });

  test('never removes the write that triggered it', () => {
    // By the time this runs the new write is already in the cache and already marked
    // paused, so it looks exactly like the ones it supersedes.
    const issued = write(RENAME_PLAN, { planId: 'p1', data: { name: 'B' } });
    const { cache, queue } = fakeCache([issued]);

    run(cache, issued);

    assert.deepEqual(queue, [issued]);
  });

  test('leaves writes aimed at a different target alone', () => {
    const otherPlan = write(RENAME_PLAN, { planId: 'p2', data: { name: 'A' } });
    const issued = write(RENAME_PLAN, { planId: 'p1', data: { name: 'B' } });
    const { cache, queue } = fakeCache([otherPlan, issued]);

    run(cache, issued);

    assert.deepEqual(queue, [otherPlan, issued]);
  });

  test('leaves a write that is already on its way out', () => {
    const inFlight = write(RENAME_PLAN, { planId: 'p1', data: { name: 'A' } }, { paused: false });
    const issued = write(RENAME_PLAN, { planId: 'p1', data: { name: 'B' } });
    const { cache, queue } = fakeCache([inFlight, issued]);

    run(cache, issued);

    // Calling off a request that has already left is not something we can do.
    assert.deepEqual(queue, [inFlight, issued]);
  });

  test('leaves a different kind of write alone even on the same target', () => {
    const otherKind = write(['putApiTrainingPlansPlanIdActive'], { planId: 'p1' });
    const issued = write(RENAME_PLAN, { planId: 'p1', data: { name: 'B' } });
    const { cache, queue } = fakeCache([otherKind, issued]);

    run(cache, issued);

    assert.deepEqual(queue, [otherKind, issued]);
  });

  test('never touches writes that are facts rather than desired state', () => {
    // Two sets logged at the same exercise are two separate sets. Collapsing them would
    // quietly throw away a set the user actually did.
    const first = write(LOG_SET, { workoutExerciseId: 'e1', data: { reps: 8 } });
    const second = write(LOG_SET, { workoutExerciseId: 'e1', data: { reps: 6 } });
    const { cache, queue } = fakeCache([first, second]);

    run(cache, second);

    assert.deepEqual(queue, [first, second]);
  });
});
