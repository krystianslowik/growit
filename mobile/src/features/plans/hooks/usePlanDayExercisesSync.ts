import { useEffect, useRef } from 'react';
import { usePutApiTrainingPlansDaysDayIdExercises } from '../../../api/generated/training-plans/training-plans';
import { PlanDayExerciseSelection } from '../../../api/generated/schemas';
import { useDebouncedWrite } from '../../../offline/useDebouncedWrite';

type Args = {
  dayId: string;
  /// The exercises the day should hold, in order. Null until the day has loaded - the
  /// first non-null value is what the server already has, so there is nothing to send.
  items: PlanDayExerciseSelection[] | null;
};

const DEBOUNCE_MS = 1000;

const signatureOf = (items: PlanDayExerciseSelection[]) =>
  JSON.stringify(
    items.map((item) => item.planDayExerciseId ?? item.exerciseId ?? `custom:${item.customExerciseName}`),
  );

/// Keeps the server's copy of a day's exercise list in step with the local one.
///
/// This used to be a sync engine of its own - retries, backoff, an in-flight slot, a flush
/// on backgrounding, an alert on failure - written before there was a queue to put the
/// write on. All of that belongs to the mutation layer now, and is done better there: a
/// write made with no signal waits rather than failing after a minute, it is ordered
/// against the writes creating the plan and day it belongs to, it survives the app being
/// killed, and a run of edits collapses into the one that matters.
///
/// The request still carries the desired state rather than a list of operations. That is
/// what makes sending it twice harmless, and what makes collapsing them safe.
export const usePlanDayExercisesSync = ({ dayId, items }: Args) => {
  const { mutate } = usePutApiTrainingPlansDaysDayIdExercises();
  const { schedule } = useDebouncedWrite(mutate, DEBOUNCE_MS);

  /// The state we last asked the server for. Toggling an exercise off and straight back on
  /// leaves the day as it was, and should cost nothing.
  const requestedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!items) return;

    const signature = signatureOf(items);

    if (requestedRef.current === null) {
      requestedRef.current = signature;
      return;
    }

    if (signature === requestedRef.current) return;

    requestedRef.current = signature;
    schedule({ dayId, data: { exercises: items } });
  }, [items, dayId, schedule]);
};
