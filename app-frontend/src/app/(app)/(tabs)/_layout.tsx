import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TabIcon, type TabName } from '../../../components/ui/TabIcon';
import { useTheme } from '../../../theme';

const TABS: TabName[] = ['home', 'cv', 'jobs', 'reports', 'profile'];

/** Bottom navigation (PRD FR-DASH-02): Home · CV · Jobs · Reports · Profile. */
export default function TabsLayout() {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: {
          fontFamily: typography.labelSmall.fontFamily,
          fontSize: typography.labelSmall.fontSize,
        },
      }}
    >
      {TABS.map((name) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title: t(`mobile.tabs.${name}`),
            tabBarButtonTestID: `tab-${name}`,
            tabBarIcon: ({ color }) => <TabIcon name={name} color={color} />,
          }}
        />
      ))}
    </Tabs>
  );
}
