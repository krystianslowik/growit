import { View, Text, FlatList } from 'react-native';
import { useGetApiExercises } from '../../../api/generated/exercises/exercises';
import { ScreenState, screenStateOf } from '../../../theme/components/ScreenState';

export const ExercisesScreen = () => {
  const exercisesQuery = useGetApiExercises({
    query: { staleTime: Infinity },
  });

  const screenState = screenStateOf(exercisesQuery);
  if (screenState) return <ScreenState kind={screenState} />;

  return (
    <FlatList
      className="bg-bg"
      data={exercisesQuery.data}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <View className="bg-surface rounded-md p-4 border border-line">
          <Text className="text-fg font-sans-sb text-body-lg">{item.name}</Text>
          <Text className="text-muted font-mono-md text-label-sm tracking-label uppercase mt-1">
            {item.category}
          </Text>
        </View>
      )}
      contentContainerClassName="p-4 gap-2"
    />
  );
};
