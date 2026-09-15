import { useEffect } from 'react';
import { usePutApiTrainingPlansDaysDayId } from '../../../api/generated/training-plans/training-plans';
import { PlanDayResponse } from '../../../api/generated/schemas';
import { useDebouncedWrite } from '../../../offline/useDebouncedWrite';

type Args = {
  dayId: string;
  day: PlanDayResponse | undefined;
  name: string;
  notes: string;
  delayMs?: number;
};

/// See usePlanAutoSave: the cache work lives in the mutation registry.
export const usePlanDayAutoSave = ({ dayId, day, name, notes, delayMs = 600 }: Args) => {
  const { mutate: update } = usePutApiTrainingPlansDaysDayId();
  const { schedule, cancel } = useDebouncedWrite(update, delayMs);
  
  useEffect(() => {
    if (!day) return;
    if (!name.trim()) return;

    const trimmedNotes = notes.trim() || null;
    if (name.trim() === day.name && trimmedNotes === (day.notes ?? null)) {
      cancel();
      return;
    }

    schedule({ dayId, data: { name: name.trim(), notes: trimmedNotes } });
  }, [name, notes, day, dayId, schedule, cancel]);
};
