/**
 * Tab navigator — 5 tabs: Dashboard, Markets, Data, Accounts, Leaderboard.
 */
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { colors } from '../../theme';

// Using text labels as icons (lightweight — no icon library needed)
function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Dashboard: '📊',
    Markets: '📈',
    Data: '📉',
    Accounts: '💰',
    Leaderboard: '🏆',
  };
  return null; // icons are set via tabBarIcon in options
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: Platform.OS === 'web' ? 56 : 80,
          paddingBottom: Platform.OS === 'web' ? 8 : 24,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textDim,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarLabel: 'Home',
        }}
      />
      <Tabs.Screen
        name="markets"
        options={{
          title: 'Markets',
          tabBarLabel: 'Markets',
        }}
      />
      <Tabs.Screen
        name="data"
        options={{
          title: 'Data',
          tabBarLabel: 'Data',
        }}
      />
      <Tabs.Screen
        name="accounts"
        options={{
          title: 'Accounts',
          tabBarLabel: 'Accounts',
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: 'Leaderboard',
          tabBarLabel: 'Ranks',
        }}
      />
    </Tabs>
  );
}
