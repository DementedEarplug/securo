import { QueryClientProvider } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { loadLanguage } from '@/auth/storage'
import { session } from '@/auth/session'
import { Loading } from '@/components/States'
import { useSession } from '@/features/session/hooks'
import i18n, { supportedLanguage } from '@/i18n'
import { bindAppFocus, queryClient } from '@/lib/query-client'

export default function RootLayout() {
  const [ready, setReady] = useState(false)
  const { status } = useSession()

  useEffect(() => {
    void (async () => {
      const [, language] = await Promise.all([session.hydrate(), loadLanguage()])
      const chosen = supportedLanguage(language)
      if (chosen) await i18n.changeLanguage(chosen)
      setReady(true)
    })()
    return bindAppFocus()
  }, [])

  // Nothing cached for one account may be shown to the next.
  useEffect(() => {
    if (status === 'signedOut') queryClient.clear()
  }, [status])

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="auto" />
        {ready && status !== 'loading' ? (
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Protected guard={status === 'signedIn'}>
              <Stack.Screen name="(app)" />
            </Stack.Protected>
            <Stack.Protected guard={status !== 'signedIn'}>
              <Stack.Screen name="(auth)" />
            </Stack.Protected>
          </Stack>
        ) : (
          <Loading />
        )}
      </QueryClientProvider>
    </SafeAreaProvider>
  )
}
