import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { TodayStackParamList } from '../../../navigation/types';
import {
  useGetApiWorkoutsUserIdByDate,
  useGetApiWorkoutsUserIdHistory,
  usePostApiWorkouts,
  usePostApiWorkoutsFromPlanDay,
} from '../../../api/generated/workouts/workouts';
import {
  useGetApiTrainingPlansNextDay,
} from '../../../api/generated/training-plans/training-plans';
import { WorkoutSummaryResponse } from '../../../api/generated/schemas';
import { Button } from '../../../theme/components/Button';
import { tokens } from '../../../theme/tokens';
import { newId } from '../../../offline/ids';
import { getToday, formatWeekdayDayMonth, formatDayMonth, formatShortDate } from '../../../lib/date';
import { exerciseCountLabel } from '../../../lib/plurals';
import { useAuth, useUserId } from '../../../auth/AuthContext';

const LastWorkoutCard = ({
  workout,
  onPress,
}: {
  workout: WorkoutSummaryResponse;
  onPress: () => void;
}) => (
  <Pressable className="bg-surface rounded-md p-4 border border-line" onPress={onPress}>
    <Text className="text-fg font-sans-sb text-body-lg">{workout.name}</Text>
    <Text className="text-muted font-mono-md text-label-sm tracking-label uppercase mt-1">
      {workout.planDayName ? `Z planu · ${workout.planDayName}` : 'Poza planem'}
    </Text>
    <Text className="text-muted font-sans-md text-body-sm mt-2">
      {formatDayMonth(workout.performedAt)} · {exerciseCountLabel(workout.exerciseCount)}
    </Text>
  </Pressable>
);

export const WorkoutsScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<TodayStackParamList>>();
  const userId = useUserId();
  const { name } = useAuth();
  const today = getToday();

  const { data: workout, isLoading } = useGetApiWorkoutsUserIdByDate(
    userId,
    { date: today },
    { query: { retry: false } },
  );
  const { data: history } = useGetApiWorkoutsUserIdHistory(userId, { page: 1, pageSize: 2 });

  // The endpoint answers 204 when there is no active plan, which axios hands over as
  // an empty string - falsy either way, so the check below covers both.
  const { data: nextDay } = useGetApiTrainingPlansNextDay();

  const { mutate: createWorkout, isPending: isCreatingEmpty } = usePostApiWorkouts();

  // Navigation stays on the server's answer for now: nothing seeds a workout into the
  // cache yet, so opening it early would land on a screen with nothing to read.
  const { mutate: startFromDay, isPending: isStartingDay } = usePostApiWorkoutsFromPlanDay();

  if (isLoading) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <ActivityIndicator color={tokens.color.lime} />
      </View>
    );
  }

  // pick most recent workout that's not today
  const lastWorkout = history?.items.find((w) => w.id !== workout?.id);

  return (
    <ScrollView className="flex-1 bg-bg" contentContainerClassName="px-6 pt-6 pb-10 gap-12">
      {/* greeting */}
      <View>
        <Text className="text-muted font-mono-md text-label tracking-label uppercase mb-3">
          [ DZISIAJ ]
        </Text>
        <Text className="text-fg font-sans-b text-h1" style={{ letterSpacing: -1 }}>
          Cześć{name ? ', ' : ''}
          <Text className="text-lime">{name}</Text> 👋
        </Text>
        <Text className="text-muted font-sans-md text-body-lg mt-2 capitalize">
          {formatWeekdayDayMonth()}
        </Text>
      </View>

      {/* today's workout - if it already exists */}
      {workout && (
        <View className="gap-3">
          <Text className="text-muted font-mono-md text-label tracking-label uppercase">
            [ TWÓJ TRENING ]
          </Text>
          <Pressable
            className="bg-surface rounded-md p-5 border border-line"
            onPress={() => navigation.navigate('WorkoutDetail', { workoutId: workout.id })}
          >
            <Text className="text-fg font-sans-sb text-h3">{workout.name}</Text>
            {workout.planDayName && (
              <Text className="text-muted font-mono-md text-label-sm tracking-label uppercase mt-1">
                Z planu · {workout.planDayName}
              </Text>
            )}
            <Text className="text-muted font-sans-md text-body-sm mt-2">
              {exerciseCountLabel(workout.exerciseCount)}
            </Text>
          </Pressable>
        </View>
      )}

      {/* nothing logged yet - suggest where the rotation left off */}
      {!workout && (
        <View className="gap-3">
          <Text className="text-muted font-mono-md text-label tracking-label uppercase">
            [ ROZPOCZNIJ ]
          </Text>

          {nextDay ? (
            <>
              <View className="bg-surface rounded-md p-5 border border-line">
                <Text className="text-muted font-mono-md text-label-sm tracking-label uppercase">
                  Następny w planie
                </Text>
                <Text className="text-fg font-sans-sb text-h3 mt-1">{nextDay.name}</Text>
                <Text className="text-muted font-sans-md text-body-sm mt-2">
                  {exerciseCountLabel(nextDay.exerciseCount)}
                </Text>
              </View>
              <Button
                label={isStartingDay ? 'Zaczynam...' : `Zacznij ${nextDay.name} →`}
                variant="primary"
                loading={isStartingDay}
                disabled={isStartingDay}
                onPress={() =>
                  startFromDay(
                    {
                      data: {
                        id: newId(),
                        planDayId: nextDay.id,
                        performedAt: today,
                        exerciseIds: null,
                      },
                    },
                    {
                      onSuccess: ({ id }) => navigation.navigate('WorkoutDetail', { workoutId: id }),
                    },
                  )
                }
              />
              <Button
                label="Wybierz inny dzień"
                variant="secondary"
                onPress={() => navigation.navigate('StartFromPlanDay')}
              />
            </>
          ) : (
            <Button
              label="Ułóż plan treningowy →"
              variant="primary"
              onPress={() => navigation.navigate('PlanDetail', { planId: null })}
            />
          )}

          <Button
            label="Pusty trening"
            variant="secondary"
            loading={isCreatingEmpty}
            disabled={isCreatingEmpty}
            onPress={() =>
              createWorkout({
                data: {
                  id: newId(),
                  name: `Trening ${formatShortDate()}`,
                  performedAt: today,
                  notes: null,
                },
              })
            }
          />
        </View>
      )}

      {/* last workout - informational */}
      {lastWorkout && (
        <View className="gap-3">
          <Text className="text-muted font-mono-md text-label tracking-label uppercase">
            [ OSTATNI TRENING ]
          </Text>
          <LastWorkoutCard
            workout={lastWorkout}
            onPress={() => navigation.navigate('WorkoutDetail', { workoutId: lastWorkout.id })}
          />
        </View>
      )}
    </ScrollView>
  );
};
