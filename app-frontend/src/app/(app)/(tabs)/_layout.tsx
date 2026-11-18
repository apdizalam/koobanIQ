import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { LineIcon, type TabName } from '../../../components/ui/LineIcon';
import { useTheme } from '../../../theme';

const TABS: TabName[] = ['home', 'cv', 'jobs', 'reports', 'profile'];

/**
 * Bottom navigation (PRD FR-DASH-02; design "04 · Home — Overview"):
 * Home · CV · Jobs · Reports · Profile. The active tab has a soft pill behind
 * its icon and a darker, bolder label.
 */
export default function TabsLayout() {
  const { t } = useTranslation();
  const { colors, typography, radius } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}
    >
      {TABS.map((name) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title: t(`mobile.tabs.${name}`),
            tabBarButtonTestID: `tab-${name}`,
            tabBarIcon: ({ color, focused }) => (
              <View
                style={{
                  width: 56,
                  height: 30,
                  borderRadius: radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: focused ? colors.primarySoft : 'transparent',
                }}
              >
                <LineIcon name={name} color={color} size={22} />
              </View>
            ),
            tabBarLabel: ({ color, focused, children }) => (
              <Text
                style={[
                  focused ? typography.labelMedium : typography.labelSmall,
                  { color: focused ? colors.text : color, fontSize: 11, lineHeight: 14 },
                ]}
              >
                {children}
              </Text>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
