import { View, FlatList, Text, Pressable, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { TodayStackParamList } from '../../../navigation/types';
import { useGetApiExercises } from '../../../api/generated/exercises/exercises';
import {
  usePostApiWorkoutsWorkoutIdExercises,
  getGetApiWorkoutsWorkoutIdQueryKey,
} from '../../../api/generated/workouts/workouts';
import { WorkoutResponse } from '../../../api/generated/schemas';
import { tokens } from '../../../theme/tokens';
import { newId } from '../../../offline/ids';

type Props = NativeStackScreenProps<TodayStackParamList, 'AddExerciseToWorkout'>;

export const AddExerciseToWorkoutScreen = ({ route, navigation }: Props) => {
  const { workoutId } = route.params;
  const queryClient = useQueryClient();

  const { data: exercises, isLoading } = useGetApiExercises({
    query: { staleTime: Infinity },
  });

  // Position is the client's to decide now - the server no longer guesses it. The
  // workout is already in cache because the screen we came from rendered it.
  const nextOrderIndex = () => {
    const workout = queryClient.getQueryData<WorkoutResponse>(
      getGetApiWorkoutsWorkoutIdQueryKey(workoutId),
    );
    return workout?.exercises.length ?? 0;
  };
  // See WorkoutsScreen: a paused write never settles, so isPending alone would leave
  // every row in the list disabled after the first tap.
  const { mutate: addExercise, isPending, isPaused } = usePostApiWorkoutsWorkoutIdExercises();
  const isAddingNow = isPending && !isPaused;

  if (isLoading) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <ActivityIndicator color={tokens.color.lime} />
      </View>
    );
  }

  return (
    <FlatList
      className="bg-bg"
      data={exercises}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <Pressable
          className="bg-surface rounded-md p-4 border border-line"
          onPress={() => {
            addExercise({
              workoutId,
              data: {
                id: newId(),
                exerciseId: item.id,
                orderIndex: nextOrderIndex(),
                targetSets: null,
                targetReps: null,
                restSeconds: null,
              },
            });
            // Safe to close on the spot: the registry has already appended the row to
            // the cached workout, so the screen behind us shows it whether or not the
            // write has left the device.
            navigation.goBack();
          }}
          disabled={isAddingNow}
        >
          <Text className="text-fg font-sans-sb text-body-lg">{item.name}</Text>
          <Text className="text-muted font-mono-md text-label-sm tracking-label uppercase mt-1">
            {item.category}
          </Text>
        </Pressable>
      )}
      contentContainerClassName="p-4 gap-2"
    />
  );
};
