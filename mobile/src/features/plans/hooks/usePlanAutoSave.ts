import { useEffect } from 'react';
import { usePutApiTrainingPlansPlanId } from '../../../api/generated/training-plans/training-plans';
import { TrainingPlanResponse } from '../../../api/generated/schemas';
import { useDebouncedWrite } from '../../../offline/useDebouncedWrite';

type Args = {
  planId: string | null;
  plan: TrainingPlanResponse | undefined;
  name: string;
  notes: string;
  delayMs?: number;
};

/// Saves the plan header a moment after typing stops, so the screen has no save button.
///
/// The optimistic patch and the invalidation live in the mutation registry now - passing
/// them here would override what is registered rather than add to it.
export const usePlanAutoSave = ({ planId, plan, name, notes, delayMs = 600 }: Args) => {
  const { mutate: update } = usePutApiTrainingPlansPlanId();
  const { schedule, cancel } = useDebouncedWrite(update, delayMs);

  useEffect(() => {
    if (!planId || !plan) return;
    if (!name.trim()) return;

    const trimmedNotes = notes.trim() || null;
    if (name.trim() === plan.name && trimmedNotes === (plan.notes ?? null)) {
      // Typed back to where it started, so anything waiting to be sent is now void.
      cancel();
      return;
    }

    schedule({ planId, data: { name: name.trim(), notes: trimmedNotes } });
  }, [name, notes, plan, planId, schedule, cancel]);
};
