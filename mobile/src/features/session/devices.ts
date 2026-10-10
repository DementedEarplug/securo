import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, unwrap } from '@/api/client'
import type { Session } from '@/api/types'

export function useDevices() {
  return useQuery({
    queryKey: ['devices'],
    queryFn: () => unwrap<Session[]>(api().GET('/api/auth/sessions')),
  })
}

export function useRevokeDevice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      unwrap<unknown>(api().DELETE('/api/auth/sessions/{session_id}', { params: { path: { session_id: id } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['devices'] }),
  })
}
