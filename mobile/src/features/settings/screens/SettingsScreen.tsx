import { useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';
import { Button } from '../../../theme/components/Button';
import { useAuth } from '../../../auth/AuthContext';
import { forceOffline, isForcedOffline } from '../../../offline/connectivity';
import { pendingWriteCount } from '../../../offline/pendingWrites';
import { tokens } from '../../../theme/tokens';

/// Flips the same flag the circuit breaker uses, so the offline path under test is the
/// one that ships - no radio, no simulator settings.
const OfflineSimulator = () => {
  const [enabled, setEnabled] = useState(isForcedOffline);

  const toggle = (next: boolean) => {
    setEnabled(next);
    forceOffline(next);
  };

  return (
    <>
      <Text className="text-muted font-mono-md text-label tracking-label uppercase mb-3 mt-8">
        [ DEWELOPERSKIE ]
      </Text>

      <View className="bg-surface rounded-md p-4 border border-line flex-row items-center justify-between">
        <Text className="text-fg font-sans-md text-body">Symuluj tryb offline</Text>
        <Switch
          value={enabled}
          onValueChange={toggle}
          trackColor={{ false: tokens.color.surface2, true: tokens.color.lime }}
          thumbColor={tokens.color.fg}
        />
      </View>
    </>
  );
};

export const SettingsScreen = () => {
  const { email, signOut } = useAuth();

  /// Signing out with writes still queued does not lose them - they stay on disk under
  /// this account and go out at the next sign-in - but leaving without being told would
  /// look exactly like losing them.
  const confirmSignOut = () => {
    const waiting = pendingWriteCount();
    if (waiting === 0) {
      void signOut();
      return;
    }

    Alert.alert(
      'Masz niezapisane zmiany',
      'Część zmian czeka na połączenie. Wyślemy je, gdy zalogujesz się ponownie na to konto.',
      [
        { text: 'Anuluj', style: 'cancel' },
        { text: 'Wyloguj mimo to', style: 'destructive', onPress: () => void signOut() },
      ],
    );
  };

  return (
    <View className="flex-1 bg-bg px-6 pt-6 pb-10">
      <Text className="text-muted font-mono-md text-label tracking-label uppercase mb-3">
        [ KONTO ]
      </Text>

      <View className="bg-surface rounded-md p-4 border border-line">
        <Text className="text-muted font-mono-md text-label-sm tracking-label uppercase">Email</Text>
        <Text className="text-fg font-sans-md text-body-lg mt-1">{email}</Text>
      </View>

      {__DEV__ && <OfflineSimulator />}

      <View className="mt-auto">
        <Button label="Wyloguj się" variant="secondary" onPress={confirmSignOut} />
      </View>
    </View>
  );
};
