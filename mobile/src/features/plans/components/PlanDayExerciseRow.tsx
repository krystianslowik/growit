import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { RectButton } from 'react-native-gesture-handler';
import Swipeable, { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Ionicons } from '@expo/vector-icons';
import { PlanDayExerciseResponse } from '../../../api/generated/schemas';
import { usePutApiTrainingPlansExercisesPlanDayExerciseId } from '../../../api/generated/training-plans/training-plans';
import { useDebouncedWrite } from '../../../offline/useDebouncedWrite';
import { Input } from '../../../theme/components/Input';
import { tokens } from '../../../theme/tokens';

type Props = {
  exercise: PlanDayExerciseResponse;
  onDelete: () => void;
  /// The row only exists in the optimistic cache so far - the server has not handed back
  /// a real id yet, so editing or deleting it would address a row that does not exist.
};

const SAVE_DELAY_MS = 600;

export const PlanDayExerciseRow = ({ exercise, onDelete }: Props) => {
  const swipeRef = useRef<SwipeableMethods>(null);
  const { mutate: update } = usePutApiTrainingPlansExercisesPlanDayExerciseId();
  const { schedule, cancel } = useDebouncedWrite(update, SAVE_DELAY_MS);

  const [isEditing, setIsEditing] = useState(false);
  const [targets, setTargets] = useState({
    sets: String(exercise.targetSets),
    reps: String(exercise.targetReps),
    rest: String(exercise.restSeconds),
  });

  useEffect(() => {
    if (!isEditing) return;

    const targetSets = parseInt(targets.sets, 10);
    const targetReps = parseInt(targets.reps, 10);
    const restSeconds = parseInt(targets.rest, 10);
    if (!targetSets || !targetReps || isNaN(restSeconds)) return;

    const unchanged =
      targetSets === exercise.targetSets &&
      targetReps === exercise.targetReps &&
      restSeconds === exercise.restSeconds;
    if (unchanged) {
      cancel();
      return;
    }

    schedule({
      planDayExerciseId: exercise.id,
      data: { targetSets, targetReps, restSeconds, orderIndex: exercise.orderIndex },
    });
  }, [targets, isEditing, exercise, schedule, cancel]);

  const openEdit = () => {
    setTargets({
      sets: String(exercise.targetSets),
      reps: String(exercise.targetReps),
      rest: String(exercise.restSeconds),
    });
    setIsEditing(true);
  };

  const setTarget = (key: 'sets' | 'reps' | 'rest', value: string) =>
    setTargets((prev) => ({ ...prev, [key]: value }));

  const renderRightActions = () => (
    <View style={{ width: 72, paddingLeft: tokens.space[2] }}>
      <RectButton
        onPress={() => {
          swipeRef.current?.close();
          onDelete();
        }}
        style={{
          flex: 1,
          backgroundColor: tokens.color.danger,
          borderRadius: tokens.radius.lg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="trash-outline" size={22} color={tokens.color.fg} />
      </RectButton>
    </View>
  );

  if (isEditing) {
    return (
      <View className="bg-surface rounded-md p-4 gap-3 border border-line">
        <Pressable onPress={() => setIsEditing(false)}>
          <Text className="text-fg font-sans-sb text-body-lg">{exercise.exerciseName}</Text>
        </Pressable>
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Input
              label="Serie"
              value={targets.sets}
              onChangeText={(t) => setTarget('sets', t)}
              keyboardType="number-pad"
            />
          </View>
          <View className="flex-1">
            <Input
              label="Powt."
              value={targets.reps}
              onChangeText={(t) => setTarget('reps', t)}
              keyboardType="number-pad"
            />
          </View>
          <View className="flex-1">
            <Input
              label="Przerwa"
              value={targets.rest}
              onChangeText={(t) => setTarget('rest', t)}
              keyboardType="number-pad"
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <Swipeable ref={swipeRef} renderRightActions={renderRightActions} overshootRight={false}>
      <Pressable onPress={openEdit} className="bg-surface rounded-md p-4 border border-line">
        <Text className="text-fg font-sans-sb text-body-lg">{exercise.exerciseName}</Text>
        <Text className="text-muted font-mono-md text-label-sm tracking-label uppercase mt-1">
          {exercise.targetSets} × {exercise.targetReps} · {exercise.restSeconds}s
        </Text>
      </Pressable>
    </Swipeable>
  );
};
