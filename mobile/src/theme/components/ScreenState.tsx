import { ActivityIndicator, Text, View } from 'react-native';
import { tokens } from '../tokens';

export type ScreenStateKind = 'loading' | 'offline' | 'error' | 'empty';

/// What a query is doing, in the two fields that actually distinguish the cases.
type QueryLike = {
  status: 'pending' | 'error' | 'success';
  fetchStatus: 'fetching' | 'paused' | 'idle';
};

/// Works out which of these a screen should show, or null when it should render its data.
///
/// The case worth spelling out is 'offline'. A query that has never resolved and cannot
/// run has status 'pending' with fetchStatus 'paused' - which means isLoading is false,
/// because isLoading is pending AND fetching. Screens keyed off isLoading therefore fall
/// straight through to their empty state and tell the user they have no plans, when the
/// truth is that nobody has been able to ask yet.
export const screenStateOf = (query: QueryLike): ScreenStateKind | null => {
  if (query.status === 'error') return 'error';
  if (query.status !== 'pending') return null;

  return query.fetchStatus === 'paused' ? 'offline' : 'loading';
};

const labels: Record<Exclude<ScreenStateKind, 'loading'>, string> = {
  offline: '[ BRAK POŁĄCZENIA ]',
  error: '[ BŁĄD ŁADOWANIA ]',
  empty: '[ PUSTO ]',
};

const hints: Partial<Record<ScreenStateKind, string>> = {
  offline: 'Tych danych nie pobraliśmy jeszcze na to urządzenie. Pokażemy je, gdy wróci sieć.',
};

type Props = {
  kind: ScreenStateKind;
  label?: string;
  hint?: string;
};

export const ScreenState = ({ kind, label, hint }: Props) => (
  <View className="flex-1 bg-bg items-center justify-center px-8">
    {kind === 'loading' ? (
      <ActivityIndicator color={tokens.color.lime} />
    ) : (
      <>
        <Text className="text-muted font-mono-md text-label tracking-label uppercase text-center">
          {label ?? labels[kind]}
        </Text>
        {(hint ?? hints[kind]) && (
          <Text className="text-dim font-sans-md text-body-sm mt-3 text-center">
            {hint ?? hints[kind]}
          </Text>
        )}
      </>
    )}
  </View>
);
