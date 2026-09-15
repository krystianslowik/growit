import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { usePostApiExercisesWorkoutExerciseIdSets } from '../../../api/generated/exercises/exercises';
import { WorkoutExerciseResponse } from '../../../api/generated/schemas';
import { newId } from '../../../offline/ids';
import { tokens } from '../../../theme/tokens';

type Props = { exercise: WorkoutExerciseResponse };

/// Both fields start on whatever the last set was, because that is usually what the next
/// set is - and with nothing logged yet they fall back to the plan's target. Most sets
/// should be one tap.
const startingValues = (exercise: WorkoutExerciseResponse) => {
  const last = exercise.sets.at(-1);
  if (last) return { weight: String(last.weightKg), reps: String(last.reps) };

  return { weight: '', reps: exercise.targetReps != null ? String(exercise.targetReps) : '' };
};

/// Logging a set, mid-workout, on a phone with one hand free - and usually in a basement
/// with no signal, which is the case the rest of this offline work exists to serve.
export const SetLogger = ({ exercise }: Props) => {
  const [values, setValues] = useState(() => startingValues(exercise));
  const { mutate: logSet } = usePostApiExercisesWorkoutExerciseIdSets();

  const weightKg = Number(values.weight.replace(',', '.'));
  const reps = parseInt(values.reps, 10);
  const canLog = values.weight.trim() !== '' && Number.isFinite(weightKg) && weightKg >= 0 && reps > 0;

  const log = () => {
    if (!canLog) return;

    logSet({
      workoutExerciseId: exercise.id,
      data: {
        id: newId(),
        weightKg,
        reps,
        // The position is the client's to decide: several sets can be logged with no
        // signal, and nothing on the server could work out what order they happened in.
        orderIndex: exercise.sets.length,
      },
    });
  };

  return (
    <View className="flex-row items-center gap-2 mt-3 pt-3 border-t border-line">
      <TextInput
        value={values.weight}
        onChangeText={(weight) => setValues((prev) => ({ ...prev, weight }))}
        keyboardType="decimal-pad"
        placeholder="kg"
        placeholderTextColor={tokens.color.dim}
        className="bg-surface2 border border-line rounded-md px-3 py-2 text-fg font-mono-md text-body w-20 text-center"
      />
      <Text className="text-muted font-mono-md text-body">×</Text>
      <TextInput
        value={values.reps}
        onChangeText={(reps) => setValues((prev) => ({ ...prev, reps }))}
        keyboardType="number-pad"
        placeholder="powt."
        placeholderTextColor={tokens.color.dim}
        className="bg-surface2 border border-line rounded-md px-3 py-2 text-fg font-mono-md text-body w-20 text-center"
      />

      <Pressable
        onPress={log}
        disabled={!canLog}
        className={`flex-1 rounded-md py-3 items-center ${canLog ? 'bg-lime' : 'bg-surface2'}`}
      >
        <Text
          className={`font-sans-b text-body-sm tracking-label uppercase ${
            canLog ? 'text-lime-ink' : 'text-dim'
          }`}
        >
          + Seria
        </Text>
      </Pressable>
    </View>
  );
};
