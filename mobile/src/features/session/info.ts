import { useQuery } from '@tanstack/react-query'

import { api, unwrapAs } from '@/api/client'

interface AppInfo {
  features: { agents?: boolean; tesouro_direto?: boolean }
}

/** Server feature flags (`/api/info`); optional modules hide when off. */
export function useAppInfo() {
  return useQuery({
    queryKey: ['info'],
    queryFn: () => unwrapAs<AppInfo>(api().GET('/api/info')),
    staleTime: 10 * 60 * 1000,
  })
}
