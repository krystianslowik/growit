import { useEffect, useRef } from 'react';
import { usePutApiTrainingPlansDaysDayId } from '../../../api/generated/training-plans/training-plans';
import { PlanDayResponse } from '../../../api/generated/schemas';

type Args = {
  dayId: string;
  day: PlanDayResponse | undefined;
  name: string;
  notes: string;
  delayMs?: number;
};

/// See usePlanAutoSave: the cache work lives in the mutation registry.
export const usePlanDayAutoSave = ({ dayId, day, name, notes, delayMs = 600 }: Args) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { mutate: update } = usePutApiTrainingPlansDaysDayId();
  
  useEffect(() => {
    if (!day) return;
    if (!name.trim()) return;

    const trimmedNotes = notes.trim() || null;
    const unchanged = name.trim() === day.name && trimmedNotes === (day.notes ?? null);
    if (unchanged) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      update({ dayId, data: { name: name.trim(), notes: trimmedNotes } });
    }, delayMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [name, notes, day, dayId, delayMs, update]);
};
