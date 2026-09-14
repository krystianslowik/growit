import { useEffect, useRef } from 'react';
import { usePutApiTrainingPlansPlanId } from '../../../api/generated/training-plans/training-plans';
import { TrainingPlanResponse } from '../../../api/generated/schemas';

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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { mutate: update } = usePutApiTrainingPlansPlanId();

  useEffect(() => {
    if (!planId || !plan) return;
    if (!name.trim()) return;

    const trimmedNotes = notes.trim() || null;
    const unchanged = name.trim() === plan.name && trimmedNotes === (plan.notes ?? null);
    if (unchanged) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      update({ planId, data: { name: name.trim(), notes: trimmedNotes } });
    }, delayMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [name, notes, plan, planId, delayMs, update]);
};
