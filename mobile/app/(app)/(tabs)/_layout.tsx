import { Tabs } from 'expo-router'
import type { ColorValue } from 'react-native'
import { useTranslation } from 'react-i18next'

import { Icon, type IconName } from '@/components/Icon'
import { useCurrentWorkspace } from '@/features/session/hooks'
import { useColors } from '@/theme'

function tabIcon(name: IconName) {
  return function TabIcon({ color }: { color: ColorValue }) {
    return <Icon name={name} color={color} />
  }
}

export default function TabsLayout() {
  const { t } = useTranslation()
  const colors = useColors()
  const workspace = useCurrentWorkspace()

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.foreground,
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: workspace?.name ?? t('accounts.title'), tabBarLabel: t('accounts.title'), tabBarIcon: tabIcon('wallet') }}
      />
      <Tabs.Screen name="transactions" options={{ title: t('transactions.title'), tabBarIcon: tabIcon('list') }} />
      <Tabs.Screen name="budgets" options={{ title: t('budgets.title'), tabBarIcon: tabIcon('pie') }} />
      <Tabs.Screen name="reports" options={{ title: t('reports.title'), tabBarIcon: tabIcon('chart') }} />
      <Tabs.Screen name="more" options={{ title: t('more.title'), tabBarIcon: tabIcon('grid') }} />
    </Tabs>
  )
}
