import { useRef } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator, Alert } from 'react-native';
import { RectButton } from 'react-native-gesture-handler';
import Swipeable, { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PlansStackParamList } from '../../../navigation/types';
import {
  useGetApiTrainingPlans,
  useDeleteApiTrainingPlansPlanId,
} from '../../../api/generated/training-plans/training-plans';
import { TrainingPlanSummaryResponse } from '../../../api/generated/schemas';
import { Button } from '../../../theme/components/Button';
import { tokens } from '../../../theme/tokens';
import { dayCountLabel } from '../../../lib/plurals';

type Props = NativeStackScreenProps<PlansStackParamList, 'PlansList'>;

type RowProps = {
  plan: TrainingPlanSummaryResponse;
  onPress: () => void;
  onDelete: () => void;
};

const PlanRow = ({ plan, onPress, onDelete }: RowProps) => {
  const swipeRef = useRef<SwipeableMethods>(null);

  const confirmDelete = () => {
    swipeRef.current?.close();
    Alert.alert('Usuń plan', `Na pewno usunąć „${plan.name}"? Dni planu znikną razem z nim.`, [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Usuń', style: 'destructive', onPress: onDelete },
    ]);
  };

  const renderRightActions = () => (
    <View
      style={{
        width: 72,
        paddingLeft: tokens.space[2],
        paddingRight: tokens.space[2],
        paddingVertical: tokens.space[2],
      }}
    >
      <RectButton
        onPress={confirmDelete}
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

  return (
    <Swipeable ref={swipeRef} renderRightActions={renderRightActions} overshootRight={false}>
      <Pressable onPress={onPress} className="bg-bg px-4 py-4 border-b border-line">
        <View className="flex-row items-center gap-2">
          <Text className="text-fg font-sans-sb text-body-lg">{plan.name}</Text>
          {plan.isActive && (
            <Text className="text-lime-ink bg-lime rounded-pill px-2 py-0.5 font-mono-md text-label-sm tracking-label uppercase">
              aktywny
            </Text>
          )}
        </View>
        <Text className="text-muted font-mono-md text-label-sm tracking-label uppercase mt-1">
          {dayCountLabel(plan.dayCount)}
        </Text>
      </Pressable>
    </Swipeable>
  );
};

export const PlansListScreen = ({ navigation }: Props) => {
  const { data: plans, isLoading } = useGetApiTrainingPlans();

  const { mutate: remove } = useDeleteApiTrainingPlansPlanId();

  if (isLoading) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <ActivityIndicator color={tokens.color.lime} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-bg">
      <FlatList
        data={plans}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PlanRow
            plan={item}
            onPress={() => navigation.navigate('PlanDetail', { planId: item.id })}
            onDelete={() => remove({ planId: item.id })}
          />
        )}
        ListEmptyComponent={
          <View className="items-center justify-center p-10">
            <Text className="text-muted font-mono-md text-label tracking-label uppercase text-center">
              [ BRAK PLANÓW ]
            </Text>
            <Text className="text-fg font-sans-md text-body mt-3 text-center">
              Plan to zestaw dni, np. Push A, Pull A, Push B.
            </Text>
          </View>
        }
      />
      <View className="px-4 pt-4 pb-6 border-t border-line">
        <Button
          label="+ Nowy plan"
          variant="primary"
          onPress={() => navigation.navigate('PlanDetail', { planId: null })}
        />
      </View>
    </View>
  );
};
