import { QueryClient, focusManager } from '@tanstack/react-query'
import { AppState, type AppStateStatus } from 'react-native'

import { ApiError } from '@/api/errors'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      // Retry only when the network blipped; a 4xx/5xx will not change on retry.
      retry: (failureCount, error) => failureCount < 1 && !(error instanceof ApiError),
    },
  },
})

/** Refetch stale data when the app comes back to the foreground. */
export function bindAppFocus(): () => void {
  const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
    focusManager.setFocused(status === 'active')
  })
  return () => subscription.remove()
}
