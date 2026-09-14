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
  const { mutate: addExercise, isPending } = usePostApiWorkoutsWorkoutIdExercises({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getGetApiWorkoutsWorkoutIdQueryKey(workoutId),
        });
        navigation.goBack();
      },
    },
  });

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
          onPress={() =>
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
            })
          }
          disabled={isPending}
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
