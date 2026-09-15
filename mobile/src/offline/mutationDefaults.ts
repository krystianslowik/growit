import { QueryClient, UseMutationOptions } from '@tanstack/react-query';
import {
  getGetApiExercisesQueryKey,
  getPostApiExercisesWorkoutExerciseIdSetsMutationOptions,
} from '../api/generated/exercises/exercises';
import {
  getDeleteApiTrainingPlansDaysDayIdMutationOptions,
  getDeleteApiTrainingPlansExercisesPlanDayExerciseIdMutationOptions,
  getDeleteApiTrainingPlansPlanIdMutationOptions,
  getGetApiTrainingPlansPlanIdQueryKey,
  getGetApiTrainingPlansQueryKey,
  getGetApiTrainingPlansDaysDayIdQueryKey,
  getPostApiTrainingPlansDaysDayIdExercisesMutationOptions,
  getPostApiTrainingPlansMutationOptions,
  getPostApiTrainingPlansPlanIdDaysMutationOptions,
  getPutApiTrainingPlansDaysDayIdExercisesMutationOptions,
  getPutApiTrainingPlansDaysDayIdMutationOptions,
  getPutApiTrainingPlansExercisesPlanDayExerciseIdMutationOptions,
  getPutApiTrainingPlansPlanIdActiveMutationOptions,
  getPutApiTrainingPlansPlanIdDaysOrderMutationOptions,
  getPutApiTrainingPlansPlanIdMutationOptions,
} from '../api/generated/training-plans/training-plans';
import {
  getGetApiWorkoutsWorkoutIdQueryKey,
  getPostApiWorkoutsFromPlanDayMutationOptions,
  getPostApiWorkoutsMutationOptions,
  getPostApiWorkoutsWorkoutIdExercisesMutationOptions,
} from '../api/generated/workouts/workouts';
import {
  ExerciseResponse,
  PlanDayResponse,
  WorkoutByDateResponse,
  WorkoutExerciseResponse,
  WorkoutResponse,
  TrainingPlanResponse,
  TrainingPlanSummaryResponse,
} from '../api/generated/schemas';
import { newId } from './ids';
import { QueryFamily, optimistic } from './optimistic';

const PLAN_DAY_KEY_PREFIX = '/api/training-plans/days/';

/// Some writes name only the row, not the day it sits on, so the day has to be found by
/// looking for whichever cached one is holding it.
const patchPlanDayHolding = (
  queryClient: QueryClient,
  planDayExerciseId: string,
  patch: (day: PlanDayResponse) => PlanDayResponse,
) => {
  const cached = queryClient.getQueriesData<PlanDayResponse>({
    predicate: (query) => {
      const [first] = query.queryKey;
      return typeof first === 'string' && first.startsWith(PLAN_DAY_KEY_PREFIX);
    },
  });

  for (const [queryKey, day] of cached) {
    if (day?.exercises.some((exercise) => exercise.id === planDayExerciseId)) {
      queryClient.setQueryData<PlanDayResponse>(queryKey, patch(day));
    }
  }
};

const WORKOUT_BY_DATE_KEY_MARKER = '/by-date';

/// The "today" screen reads a workout by user and date, and the user id is not in the
/// mutation variables - it was dropped from the contract once the server started taking
/// it from the token. So the entry is found by what it is rather than by its key.
const patchWorkoutForDate = (
  queryClient: QueryClient,
  performedAt: string,
  entry: WorkoutByDateResponse,
) => {
  const cached = queryClient.getQueriesData<WorkoutByDateResponse>({
    predicate: (query) => {
      const [first, params] = query.queryKey;
      if (typeof first !== 'string' || !first.includes(WORKOUT_BY_DATE_KEY_MARKER)) return false;
      return (params as { date?: string } | undefined)?.date === performedAt;
    },
  });

  for (const [queryKey] of cached) {
    queryClient.setQueryData<WorkoutByDateResponse>(queryKey, entry);
  }
};

/// Seeds a session so the screen can be opened on our own id right away. Without this a
/// tap made offline leaves the mutation paused forever, which reads on screen as a button
/// stuck on "Zaczynam..." and an app that has hung.
const seedWorkout = (queryClient: QueryClient, workout: WorkoutResponse) => {
  queryClient.setQueryData<WorkoutResponse>(
    getGetApiWorkoutsWorkoutIdQueryKey(workout.id),
    workout,
  );

  patchWorkoutForDate(queryClient, workout.performedAt, {
    id: workout.id,
    name: workout.name,
    performedAt: workout.performedAt,
    exerciseCount: workout.exercises.length,
    planDayId: workout.planDayId,
    planDayName: workout.planDayName,
  });
};

/// Everything a write does - the optimistic patch, the invalidation - lives here rather
/// than at the call site, for two reasons.
///
/// The first is that a mutation restored from storage after the app was killed has no
/// component behind it. Its mutationFn has to come from somewhere, and setMutationDefaults
/// is that somewhere; without it a resumed write fails with "No mutationFn found".
///
/// The second is that options passed at a hook override these defaults outright
/// ({...defaultOptions, ...mutationDefaults, ...options}). An onSuccess left in a screen
/// does not merge with what is registered here - it replaces it, silently, and the write
/// stops invalidating anything. So callbacks belong here and nowhere else; screens hand
/// their UI effects to mutate(variables, { onSuccess }) instead, which runs through the
/// observer on its own.
///
/// Registrations are built from orval's own factories, so regenerating the client after a
/// contract change breaks the build rather than quietly detaching a key from its defaults.
export const registerMutationDefaults = (
  queryClient: QueryClient,
  /// Filled in as we go: the keys whose queued writes may be thrown away when a newer
  /// one for the same target arrives. See coalesce.ts.
  supersedable: Set<string>,
) => {
  // Taking orval's own options object means TVariables is inferred from the generated
  // client, so a contract change lands as a type error in the patch below rather than as
  // a silently mismatched field at runtime.
  const register = <TData, TVariables>(
    base: UseMutationOptions<TData, unknown, TVariables, unknown>,
    families: readonly QueryFamily[],
    apply?: (variables: TVariables, queryClient: QueryClient) => void,
  ) => {
    if (!base.mutationKey) {
      throw new Error('Orval stopped emitting a mutationKey; the offline registry needs one.');
    }

    queryClient.setMutationDefaults(base.mutationKey, {
      mutationFn: base.mutationFn,
      ...optimistic(queryClient, families, apply),
    });

    return base.mutationKey;
  };

  /// For writes that carry the whole desired state of their target rather than a delta,
  /// so an older queued copy of the same write is pure waste once a newer one exists.
  const registerDesiredState: typeof register = (base, families, apply) => {
    const mutationKey = register(base, families, apply);
    supersedable.add(JSON.stringify(mutationKey));
    return mutationKey;
  };

  // ---------------------------------------------------------------- training plans

  register(
    getPostApiTrainingPlansMutationOptions(),
    ['plans'],
    ({ data }, client) => {
      const listKey = getGetApiTrainingPlansQueryKey();
      const plans = client.getQueryData<TrainingPlanSummaryResponse[]>(listKey);

      // The server makes a user's first plan the active one, so guessing false here would
      // have the today screen offer "Ułóż plan treningowy" next to a plan that was just
      // created - for as long as the user stays offline.
      const isActive = (plans?.length ?? 0) === 0;

      // Seeded so the screen can switch from "new" to "editing" on our own id, with no
      // round trip to wait for.
      client.setQueryData<TrainingPlanResponse>(getGetApiTrainingPlansPlanIdQueryKey(data.id), {
        id: data.id,
        name: data.name,
        notes: data.notes ?? null,
        isActive,
        days: [],
      });

      // Falling back to [entry] rather than leaving the list alone: a plan created before
      // the list was ever loaded would otherwise not appear on it at all.
      client.setQueryData<TrainingPlanSummaryResponse[]>(listKey, (old) => [
        ...(old ?? []),
        { id: data.id, name: data.name, isActive, dayCount: 0 },
      ]);
    },
  );

  registerDesiredState(
getPutApiTrainingPlansPlanIdMutationOptions(),
    ['plans'],
    ({ planId, data }, client) => {
      client.setQueryData<TrainingPlanResponse>(
        getGetApiTrainingPlansPlanIdQueryKey(planId),
        (old) => (old ? { ...old, name: data.name, notes: data.notes ?? null } : old),
      );
      client.setQueryData<TrainingPlanSummaryResponse[]>(getGetApiTrainingPlansQueryKey(), (old) =>
        old?.map((plan) => (plan.id === planId ? { ...plan, name: data.name } : plan)),
      );
    },
  );

  register(
    getDeleteApiTrainingPlansPlanIdMutationOptions(),
    ['plans'],
    ({ planId }, client) => {
      client.setQueryData<TrainingPlanSummaryResponse[]>(getGetApiTrainingPlansQueryKey(), (old) =>
        old?.filter((plan) => plan.id !== planId),
      );
    },
  );

  registerDesiredState(
getPutApiTrainingPlansPlanIdActiveMutationOptions(),
    ['plans'],
    ({ planId }, client) => {
      // Exactly one plan is active, so the others have to give it up in the same breath.
      client.setQueryData<TrainingPlanSummaryResponse[]>(getGetApiTrainingPlansQueryKey(), (old) =>
        old?.map((plan) => ({ ...plan, isActive: plan.id === planId })),
      );
    },
  );

  register(
    getPostApiTrainingPlansPlanIdDaysMutationOptions(),
    ['plans'],
    ({ planId, data }, client) => {
      const planKey = getGetApiTrainingPlansPlanIdQueryKey(planId);
      const plan = client.getQueryData<TrainingPlanResponse>(planKey);
      const orderIndex = plan?.days.length ?? 0;

      // Seeded so the day screen can be opened on our own id straight away, instead of
      // arriving before the write and reading a 404.
      client.setQueryData<PlanDayResponse>(getGetApiTrainingPlansDaysDayIdQueryKey(data.id), {
        id: data.id,
        planId,
        name: data.name,
        notes: data.notes ?? null,
        orderIndex,
        hasBeenPerformed: false,
        exercises: [],
      });

      client.setQueryData<TrainingPlanResponse>(planKey, (old) =>
        old
          ? {
              ...old,
              days: [...old.days, { id: data.id, name: data.name, orderIndex, exerciseCount: 0 }],
            }
          : old,
      );

      // The plans list shows a day count per plan, and offline nothing else will correct
      // it until the write lands.
      client.setQueryData<TrainingPlanSummaryResponse[]>(getGetApiTrainingPlansQueryKey(), (old) =>
        old?.map((plan) =>
          plan.id === planId ? { ...plan, dayCount: plan.dayCount + 1 } : plan,
        ),
      );
    },
  );

  registerDesiredState(
getPutApiTrainingPlansPlanIdDaysOrderMutationOptions(), ['plans']);

  registerDesiredState(
getPutApiTrainingPlansDaysDayIdMutationOptions(),
    ['plans'],
    ({ dayId, data }, client) => {
      client.setQueryData<PlanDayResponse>(getGetApiTrainingPlansDaysDayIdQueryKey(dayId), (old) =>
        old ? { ...old, name: data.name, notes: data.notes ?? null } : old,
      );
    },
  );

  register(getDeleteApiTrainingPlansDaysDayIdMutationOptions(), ['plans']);
  register(getPostApiTrainingPlansDaysDayIdExercisesMutationOptions(), ['plans']);
  registerDesiredState(
getPutApiTrainingPlansDaysDayIdExercisesMutationOptions(), ['plans']);

  registerDesiredState(
getPutApiTrainingPlansExercisesPlanDayExerciseIdMutationOptions(),
    ['plans'],
    ({ planDayExerciseId, data }, client) => {
      patchPlanDayHolding(client, planDayExerciseId, (day) => ({
        ...day,
        exercises: day.exercises.map((exercise) =>
          exercise.id === planDayExerciseId
            ? {
                ...exercise,
                targetSets: data.targetSets,
                targetReps: data.targetReps,
                restSeconds: data.restSeconds,
                orderIndex: data.orderIndex,
              }
            : exercise,
        ),
      }));
    },
  );

  register(
    getDeleteApiTrainingPlansExercisesPlanDayExerciseIdMutationOptions(),
    ['plans'],
    ({ planDayExerciseId }, client) => {
      patchPlanDayHolding(client, planDayExerciseId, (day) => ({
        ...day,
        exercises: day.exercises.filter((exercise) => exercise.id !== planDayExerciseId),
      }));
    },
  );

  // --------------------------------------------------------------------- workouts

  // Starting or creating a session changes which day the today screen suggests next, so
  // these disturb the plan queries as well as the workout ones.
  register(getPostApiWorkoutsMutationOptions(), ['workouts', 'plans'], ({ data }, client) => {
    seedWorkout(client, {
      id: data.id,
      name: data.name,
      performedAt: data.performedAt,
      notes: data.notes ?? null,
      planDayId: null,
      planDayName: null,
      exercises: [],
    });
  });

  register(
    getPostApiWorkoutsFromPlanDayMutationOptions(),
    ['workouts', 'plans'],
    ({ data }, client) => {
      // The session is a copy of the plan day, so the day in cache is what it should
      // look like. If the day was never opened there is nothing to copy from and the
      // exercises arrive with the refetch.
      const day = client.getQueryData<PlanDayResponse>(
        getGetApiTrainingPlansDaysDayIdQueryKey(data.planDayId),
      );

      // Ids the caller already promised the server, so the copy carries the same ones
      // here as it will there.
      const promised = new Map(
        (data.exerciseIds ?? []).map((a) => [a.planDayExerciseId, a.workoutExerciseId]),
      );

      const exercises: WorkoutExerciseResponse[] = (day?.exercises ?? []).map((exercise) => ({
        id: promised.get(exercise.id) ?? newId(),
        exerciseId: exercise.exerciseId,
        exerciseName: exercise.exerciseName,
        category: exercise.category,
        targetSets: exercise.targetSets,
        targetReps: exercise.targetReps,
        restSeconds: exercise.restSeconds,
        orderIndex: exercise.orderIndex,
        sets: [],
      }));

      seedWorkout(client, {
        id: data.id,
        name: day?.name ?? 'Trening',
        performedAt: data.performedAt,
        notes: null,
        planDayId: data.planDayId,
        planDayName: day?.name ?? null,
        exercises,
      });
    },
  );

  register(
    getPostApiWorkoutsWorkoutIdExercisesMutationOptions(),
    ['workouts'],
    ({ workoutId, data }, client) => {
      const fromLibrary = client
        .getQueryData<ExerciseResponse[]>(getGetApiExercisesQueryKey())
        ?.find((exercise) => exercise.id === data.exerciseId);

      client.setQueryData<WorkoutResponse>(
        getGetApiWorkoutsWorkoutIdQueryKey(workoutId),
        (old) =>
          old
            ? {
                ...old,
                exercises: [
                  ...old.exercises,
                  {
                    id: data.id,
                    exerciseId: data.exerciseId,
                    // The payload carries only the id, so the name comes from the
                    // library - which every screen that can reach this point has already
                    // loaded and holds indefinitely.
                    exerciseName: fromLibrary?.name ?? '',
                    category: fromLibrary?.category ?? null,
                    targetSets: data.targetSets,
                    targetReps: data.targetReps,
                    restSeconds: data.restSeconds,
                    orderIndex: data.orderIndex,
                    sets: [],
                  },
                ],
              }
            : old,
      );
    },
  );
  register(getPostApiExercisesWorkoutExerciseIdSetsMutationOptions(), ['workouts']);
};
