/// <reference types="node" />
import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { MutationCache, QueryClient, onlineManager } from '@tanstack/react-query';
import { dropSupersededWrites } from './coalesce.ts';
import { shouldRetryWrite } from './retryPolicy.ts';

/// Exercises the queue against the real mutation cache rather than a stand-in.
///
/// Everything the offline design leans on lives in TanStack rather than in code of ours -
/// that a write with no network pauses instead of failing, that one scope makes the queue
/// run in order, that a paused write is still pending. Those are assumptions, and this is
/// where they are checked.

const RENAME_PLAN = ['putApiTrainingPlansPlanId'];
const LOG_SET = ['postApiExercisesWorkoutExerciseIdSets'];

const supersedable = new Set([JSON.stringify(RENAME_PLAN)]);

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const makeClient = () => {
  const mutationCache = new MutationCache({
    onMutate: (_variables, mutation) => {
      dropSupersededWrites(mutationCache, mutation, supersedable);
    },
  });

  return new QueryClient({
    mutationCache,
    defaultOptions: {
      mutations: {
        networkMode: 'online',
        retry: shouldRetryWrite,
        scope: { id: 'growit-writes' },
      },
    },
  });
};

/// Starts a write the way a screen would, without waiting for it - offline it will not
/// settle at all, which is the whole point.
const issue = (
  queryClient: QueryClient,
  mutationKey: unknown[],
  mutationFn: (variables: unknown) => Promise<unknown>,
  variables: unknown,
) => {
  const mutation = queryClient
    .getMutationCache()
    .build(queryClient, { mutationKey, mutationFn } as never);

  void mutation.execute(variables as never).catch(() => undefined);
  return mutation;
};

afterEach(() => onlineManager.setOnline(true));

describe('a write made with no network', () => {
  test('is paused rather than failed, and never reaches the server', async () => {
    const queryClient = makeClient();
    let calls = 0;

    onlineManager.setOnline(false);
    const mutation = issue(queryClient, RENAME_PLAN, async () => ++calls, { planId: 'p1' });
    await tick();

    assert.equal(calls, 0);
    assert.equal(mutation.state.isPaused, true);
    // Paused counts as pending, which is what holds the rest of the scope behind it - and
    // also why a button bound to isPending alone would sit disabled forever.
    assert.equal(mutation.state.status, 'pending');
  });

  test('goes out once the connection is back', async () => {
    const queryClient = makeClient();
    let calls = 0;

    onlineManager.setOnline(false);
    issue(queryClient, RENAME_PLAN, async () => ++calls, { planId: 'p1' });
    await tick();

    onlineManager.setOnline(true);
    await queryClient.resumePausedMutations();

    assert.equal(calls, 1);
  });
});

describe('the queue drains in order', () => {
  test('writes land in the order they were made, not all at once', async () => {
    const queryClient = makeClient();
    const landed: string[] = [];

    const slowWrite = (name: string) => async () => {
      await new Promise((resolve) => setTimeout(resolve, name === 'first' ? 20 : 0));
      landed.push(name);
    };

    onlineManager.setOnline(false);
    // The second write depends on the first: a day cannot be added to a plan the server
    // has not been told about yet. One shared scope is what keeps that true.
    issue(queryClient, ['postApiTrainingPlans'], slowWrite('first'), { id: 'a' });
    issue(queryClient, ['postApiTrainingPlansPlanIdDays'], slowWrite('second'), { planId: 'a' });
    await tick();

    onlineManager.setOnline(true);
    await queryClient.resumePausedMutations();

    assert.deepEqual(landed, ['first', 'second']);
  });
});

describe('coalescing, against the real cache', () => {
  test('only the newest of several edits to one target survives', async () => {
    const queryClient = makeClient();
    const sent: string[] = [];
    const write = async (variables: unknown) => {
      sent.push((variables as { data: { name: string } }).data.name);
    };

    onlineManager.setOnline(false);
    for (const name of ['A', 'B', 'C']) {
      issue(queryClient, RENAME_PLAN, write, { planId: 'p1', data: { name } });
      await tick();
    }

    assert.equal(queryClient.getMutationCache().getAll().length, 1);

    onlineManager.setOnline(true);
    await queryClient.resumePausedMutations();

    // Renaming a plan three times on a train is one request, not three.
    assert.deepEqual(sent, ['C']);
  });

  test('edits to a different target are left alone', async () => {
    const queryClient = makeClient();

    onlineManager.setOnline(false);
    issue(queryClient, RENAME_PLAN, async () => undefined, { planId: 'p1', data: { name: 'A' } });
    await tick();
    issue(queryClient, RENAME_PLAN, async () => undefined, { planId: 'p2', data: { name: 'B' } });
    await tick();

    assert.equal(queryClient.getMutationCache().getAll().length, 2);
  });

  test('facts are never collapsed into one another', async () => {
    const queryClient = makeClient();

    onlineManager.setOnline(false);
    // Two sets logged at the same exercise are two sets the user actually did.
    issue(queryClient, LOG_SET, async () => undefined, { workoutExerciseId: 'e1', data: { reps: 8 } });
    await tick();
    issue(queryClient, LOG_SET, async () => undefined, { workoutExerciseId: 'e1', data: { reps: 6 } });
    await tick();

    assert.equal(queryClient.getMutationCache().getAll().length, 2);
  });
});
