import { QueryClient } from '@tanstack/react-query';
import { getGetApiTrainingPlansDaysDayIdQueryKey } from '../../api/generated/training-plans/training-plans';
import { PlanDayResponse, WorkoutExerciseIdAssignment } from '../../api/generated/schemas';
import { newId } from '../../offline/ids';

/// Names the ids the copied exercises will get when a session is started from a plan day.
///
/// Sending them up front is what lets the session be opened and written to before the
/// server has answered - the client and the server end up agreeing on the same ids rather
/// than the client waiting to be told. Returns null when the day was never opened, in
/// which case the server names them and they arrive with the refetch.
export const planDayExerciseAssignments = (
  queryClient: QueryClient,
  planDayId: string,
): WorkoutExerciseIdAssignment[] | null => {
  const day = queryClient.getQueryData<PlanDayResponse>(
    getGetApiTrainingPlansDaysDayIdQueryKey(planDayId),
  );
  if (!day) return null;

  return day.exercises.map((exercise) => ({
    planDayExerciseId: exercise.id,
    workoutExerciseId: newId(),
  }));
};
