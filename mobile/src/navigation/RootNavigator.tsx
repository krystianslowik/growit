import { View, ActivityIndicator } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { TodayStack } from './TodayStack';
import { CalendarStack } from './CalendarStack';
import { PlansStack } from './PlansStack';
import { AuthStack } from './AuthStack';
import { SettingsScreen } from '../features/settings/screens/SettingsScreen';
import { RootStackParamList } from './types';
import { darkStackOptions } from './screenOptions';
import { tokens } from '../theme/tokens';
import { useIsRestoring } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { ConnectionBanner } from '../offline/ConnectionBanner';
import { LostWritesBanner } from '../offline/LostWritesBanner';

const Tab = createBottomTabNavigator();
const Root = createNativeStackNavigator<RootStackParamList>();

type TabIconName = 'flash' | 'calendar' | 'list';

const tabIcon = (name: TabIconName) => ({ color, size }: { color: string; size: number }) =>
  <Ionicons name={name} size={size} color={color} />;

const MainTabs = () => (
  <Tab.Navigator
    screenOptions={{
      headerShown: false,
      tabBarStyle: {
        backgroundColor: tokens.color.bg,
        borderTopColor: tokens.color.line,
        borderTopWidth: 1,
      },
      tabBarActiveTintColor: tokens.color.lime,
      tabBarInactiveTintColor: tokens.color.muted,
      tabBarLabelStyle: {
        fontFamily: tokens.font.monoMedium,
        fontSize: 10,
        letterSpacing: 1.6,
        textTransform: 'uppercase',
      },
    }}
  >
    <Tab.Screen name="Dzisiaj" component={TodayStack} options={{ tabBarIcon: tabIcon('flash') }} />
    <Tab.Screen name="Kalendarz" component={CalendarStack} options={{ tabBarIcon: tabIcon('calendar') }} />
    <Tab.Screen name="Plany" component={PlansStack} options={{ tabBarIcon: tabIcon('list') }} />
  </Tab.Navigator>
);

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: tokens.color.bg,
    card: tokens.color.bg,
    text: tokens.color.fg,
    border: tokens.color.line,
    primary: tokens.color.lime,
  },
};

export const RootNavigator = () => {
  const { isAuthed, isBootstrapping } = useAuth();
  const isRestoring = useIsRestoring();

  // Hold the splash until the stored session is read, otherwise a returning user
  // sees the auth stack flash before being dropped into the tabs.
  //
  // The same goes for the cache coming back off disk: no query runs while it is being
  // restored, so rendering now would show every screen as empty for a moment and then
  // fill in - which reads as data that was lost and then found.
  if (isBootstrapping || isRestoring) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <ActivityIndicator color={tokens.color.lime} />
      </View>
    );
  }

  return (
    <View className="flex-1">
      <NavigationContainer theme={navigationTheme}>
        <Root.Navigator screenOptions={{ headerShown: false }}>
          {isAuthed ? (
            <>
              <Root.Screen name="Main" component={MainTabs} />
              {/* Root-level so every tab can open it without registering its own copy. */}
              <Root.Screen
                name="Settings"
                component={SettingsScreen}
                options={{
                  ...darkStackOptions,
                  headerShown: true,
                  title: 'Ustawienia',
                  presentation: 'modal',
                }}
              />
            </>
          ) : (
            <Root.Screen name="Auth" component={AuthStack} />
          )}
        </Root.Navigator>
      </NavigationContainer>

      {/* Outside the navigator so it survives every screen change, and overlaid rather
          than stacked so showing it never reflows the screen underneath. */}
      <ConnectionBanner />
      <LostWritesBanner />
    </View>
  );
};
