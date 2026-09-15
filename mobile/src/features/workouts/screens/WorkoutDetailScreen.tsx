import { View, Text, FlatList } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TodayStackParamList } from '../../../navigation/types';
import { useGetApiWorkoutsWorkoutId } from '../../../api/generated/workouts/workouts';
import { WorkoutExerciseResponse } from '../../../api/generated/schemas';
import { SetLogger } from '../components/SetLogger';
import { Button } from '../../../theme/components/Button';
import { ScreenState, screenStateOf } from '../../../theme/components/ScreenState';

type Props = NativeStackScreenProps<TodayStackParamList, 'WorkoutDetail'>;

const ExerciseCard = ({ item }: { item: WorkoutExerciseResponse }) => (
  <View className="bg-surface rounded-md p-4 border border-line">
    <Text className="text-fg font-sans-sb text-body-lg">{item.exerciseName}</Text>
    {item.category && (
      <Text className="text-muted font-mono-md text-label-sm tracking-label uppercase mt-1">
        {item.category}
      </Text>
    )}
    {item.targetSets != null && item.targetReps != null && (
      <Text className="text-muted font-sans-md text-body-sm mt-2">
        Cel: {item.targetSets} × {item.targetReps}
        {item.restSeconds != null ? ` · przerwa ${item.restSeconds}s` : ''}
      </Text>
    )}
    {item.sets.length > 0 && (
      <View className="mt-3 gap-1 pt-3 border-t border-line">
        {item.sets.map((set, i) => (
          <Text key={set.id} className="text-fg font-mono-md text-body-sm">
            <Text className="text-muted">SERIA {i + 1}</Text> · {set.weightKg} kg × {set.reps}
          </Text>
        ))}
      </View>
    )}
    <SetLogger exercise={item} />
  </View>
);

export const WorkoutDetailScreen = ({ route, navigation }: Props) => {
  const { workoutId } = route.params;
  const workoutQuery = useGetApiWorkoutsWorkoutId(workoutId);
  const workout = workoutQuery.data;
  const screenState = screenStateOf(workoutQuery);

  if (screenState) return <ScreenState kind={screenState} />;

  if (!workout) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <Text className="text-muted font-mono-md text-label tracking-label uppercase">
          [ NIE ZNALEZIONO ]
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-bg">
      <FlatList
        data={workout.exercises}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <View className="items-center justify-center py-10">
            <Text className="text-muted font-mono-md text-label tracking-label uppercase">
              [ BRAK ĆWICZEŃ ]
            </Text>
            <Text className="text-fg font-sans-md text-body mt-3">Dodaj pierwsze poniżej.</Text>
          </View>
        }
        renderItem={({ item }) => <ExerciseCard item={item} />}
        contentContainerClassName="p-4 gap-3 pb-28"
      />
      <View className="absolute bottom-6 left-4 right-4">
        <Button
          label="+ Dodaj ćwiczenie"
          variant="primary"
          onPress={() => navigation.navigate('AddExerciseToWorkout', { workoutId })}
        />
      </View>
    </View>
  );
};
