import { View, Text, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { TodayStackParamList } from '../../../navigation/types';
import {
  useGetApiTrainingPlans,
  useGetApiTrainingPlansPlanId,
  getGetApiTrainingPlansNextDayQueryKey,
} from '../../../api/generated/training-plans/training-plans';
import {
  usePostApiWorkoutsFromPlanDay,
  getGetApiWorkoutsUserIdByDateQueryKey,
} from '../../../api/generated/workouts/workouts';
import { Button } from '../../../theme/components/Button';
import { tokens } from '../../../theme/tokens';
import { newId } from '../../../offline/ids';
import { getToday } from '../../../lib/date';
import { exerciseCountLabel } from '../../../lib/plurals';
import { useUserId } from '../../../auth/AuthContext';

type Props = NativeStackScreenProps<TodayStackParamList, 'StartFromPlanDay'>;

export const StartFromPlanDayScreen = ({ navigation }: Props) => {
  const userId = useUserId();
  const queryClient = useQueryClient();
  const today = getToday();

  const { data: plans, isLoading: isLoadingPlans } = useGetApiTrainingPlans();
  const activePlan = plans?.find((p) => p.isActive) ?? plans?.[0];

  const { data: plan, isLoading: isLoadingPlan } = useGetApiTrainingPlansPlanId(activePlan?.id ?? '', {
    query: { enabled: !!activePlan },
  });

  const { mutate: start, isPending } = usePostApiWorkoutsFromPlanDay({
    mutation: {
      onSuccess: ({ id }) => {
        queryClient.invalidateQueries({
          queryKey: getGetApiWorkoutsUserIdByDateQueryKey(userId, { date: today }),
        });
        queryClient.invalidateQueries({ queryKey: getGetApiTrainingPlansNextDayQueryKey() });
        navigation.replace('WorkoutDetail', { workoutId: id });
      },
    },
  });

  if (isLoadingPlans || isLoadingPlan) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <ActivityIndicator color={tokens.color.lime} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-bg">
      <FlatList
        data={plan?.days}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          plan ? (
            <Text className="text-muted font-mono-md text-label tracking-label uppercase px-4 pt-4">
              [ {plan.name} ]
            </Text>
          ) : null
        }
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() =>
              start({
                data: { id: newId(), planDayId: item.id, performedAt: today, exerciseIds: null },
              })
            }
            disabled={isPending}
            className="bg-surface rounded-md p-4 border border-line flex-row items-center gap-3"
          >
            <Text className="text-lime font-mono-md text-label tracking-label">{index + 1}</Text>
            <View className="flex-1">
              <Text className="text-fg font-sans-sb text-body-lg">{item.name}</Text>
              <Text className="text-muted font-mono-md text-label-sm tracking-label uppercase mt-1">
                {exerciseCountLabel(item.exerciseCount)}
              </Text>
            </View>
          </Pressable>
        )}
        contentContainerClassName="p-4 gap-2"
        ListEmptyComponent={
          <View className="items-center justify-center p-10 gap-4">
            <Text className="text-muted font-mono-md text-label tracking-label uppercase text-center">
              [ {plans?.length ? 'PLAN BEZ DNI' : 'BRAK PLANÓW'} ]
            </Text>
            <Button
              label={plans?.length ? 'Otwórz plan' : '+ Utwórz plan'}
              variant="primary"
              fullWidth={false}
              onPress={() =>
                navigation.navigate('PlanDetail', { planId: activePlan?.id ?? null })
              }
            />
          </View>
        }
      />
    </View>
  );
};
