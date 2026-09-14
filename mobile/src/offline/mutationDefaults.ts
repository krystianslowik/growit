import { QueryClient, UseMutationOptions } from '@tanstack/react-query';
import { getPostApiExercisesWorkoutExerciseIdSetsMutationOptions } from '../api/generated/exercises/exercises';
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
  getPostApiWorkoutsFromPlanDayMutationOptions,
  getPostApiWorkoutsMutationOptions,
  getPostApiWorkoutsWorkoutIdExercisesMutationOptions,
} from '../api/generated/workouts/workouts';
import {
  PlanDayResponse,
  TrainingPlanResponse,
  TrainingPlanSummaryResponse,
} from '../api/generated/schemas';
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
export const registerMutationDefaults = (queryClient: QueryClient) => {
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
  };

  // ---------------------------------------------------------------- training plans

  register(
    getPostApiTrainingPlansMutationOptions(),
    ['plans'],
    ({ data }, client) => {
      // Seeded so the screen can switch from "new" to "editing" on our own id, with no
      // round trip to wait for.
      client.setQueryData<TrainingPlanResponse>(getGetApiTrainingPlansPlanIdQueryKey(data.id), {
        id: data.id,
        name: data.name,
        notes: data.notes ?? null,
        isActive: false,
        days: [],
      });

      client.setQueryData<TrainingPlanSummaryResponse[]>(getGetApiTrainingPlansQueryKey(), (old) =>
        old ? [...old, { id: data.id, name: data.name, isActive: false, dayCount: 0 }] : old,
      );
    },
  );

  register(
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

  register(
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
    },
  );

  register(getPutApiTrainingPlansPlanIdDaysOrderMutationOptions(), ['plans']);

  register(
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
  register(getPutApiTrainingPlansDaysDayIdExercisesMutationOptions(), ['plans']);

  register(
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
  register(getPostApiWorkoutsMutationOptions(), ['workouts', 'plans']);
  register(getPostApiWorkoutsFromPlanDayMutationOptions(), ['workouts', 'plans']);
  register(getPostApiWorkoutsWorkoutIdExercisesMutationOptions(), ['workouts']);
  register(getPostApiExercisesWorkoutExerciseIdSetsMutationOptions(), ['workouts']);
};
