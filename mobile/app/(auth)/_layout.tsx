import { Stack } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { useColors } from '@/theme'

export default function AuthLayout() {
  const { t } = useTranslation()
  const colors = useColors()
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.foreground,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="server" options={{ title: t('auth.serverTitle') }} />
      <Stack.Screen name="login" options={{ title: t('auth.signInTitle') }} />
      <Stack.Screen name="two-factor" options={{ title: t('auth.twoFactorTitle') }} />
    </Stack>
  )
}
