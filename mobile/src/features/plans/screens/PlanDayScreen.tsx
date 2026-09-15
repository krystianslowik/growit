import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PlansStackParamList } from '../../../navigation/types';
import { useGetApiTrainingPlansDaysDayId } from '../../../api/generated/training-plans/training-plans';
import { PlanDayExerciseRow } from '../components/PlanDayExerciseRow';
import { usePlanDayAutoSave } from '../hooks/usePlanDayAutoSave';
import { useDeleteApiTrainingPlansExercisesPlanDayExerciseId } from '../../../api/generated/training-plans/training-plans';
import { Input } from '../../../theme/components/Input';
import { ScreenState, screenStateOf } from '../../../theme/components/ScreenState';

type Props = NativeStackScreenProps<PlansStackParamList, 'PlanDay'>;

export const PlanDayScreen = ({ route, navigation }: Props) => {
  const { dayId } = route.params;

  const dayQuery = useGetApiTrainingPlansDaysDayId(dayId);
  const day = dayQuery.data;
  const screenState = screenStateOf(dayQuery);
  const { mutate: removeExercise } = useDeleteApiTrainingPlansExercisesPlanDayExerciseId();

  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (day) {
      setName(day.name);
      setNotes(day.notes ?? '');
    }
  }, [day]);

  usePlanDayAutoSave({ dayId, day, name, notes });

  if (screenState) return <ScreenState kind={screenState} />;

  return (
    <ScrollView className="flex-1 bg-bg" contentContainerClassName="p-4 gap-5">
      <Input label="Nazwa dnia" value={name} onChangeText={setName} placeholder="np. Push A" />

      <Input
        label="Notatki"
        value={notes}
        onChangeText={setNotes}
        placeholder="Opcjonalnie"
        multiline
      />

      <View className="mt-2">
        <Text className="text-muted font-mono-md text-label tracking-label uppercase mb-3">
          [ ĆWICZENIA ]
        </Text>

        {day && day.exercises.length === 0 ? (
          <View className="items-center justify-center py-8 border border-line rounded-md">
            <Text className="text-muted font-sans-md text-body">Brak ćwiczeń w tym dniu</Text>
          </View>
        ) : (
          <View className="gap-2 mb-3">
            {day?.exercises.map((exercise) => (
              <PlanDayExerciseRow
                key={exercise.id}
                exercise={exercise}
                onDelete={() => removeExercise({ planDayExerciseId: exercise.id })}
              />
            ))}
          </View>
        )}

        <Pressable
          onPress={() =>
            day && navigation.navigate('PlanDayExercisePicker', { dayId, planId: day.planId })
          }
          className="border border-line rounded-md py-4 items-center"
        >
          <Text className="text-fg font-sans-sb text-body-sm tracking-label uppercase">
            + Dodaj ćwiczenie
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
};
