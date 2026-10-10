import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, unwrap } from '@/api/client'
import type { components } from '@/api/schema'
import { useWorkspaceKey } from '@/features/session/hooks'

type Schemas = components['schemas']
export type Goal = Schemas['GoalRead']

export const TRACKING_TYPES = ['manual', 'account', 'asset', 'asset_group', 'net_worth'] as const
export type TrackingType = (typeof TRACKING_TYPES)[number]
export const GOAL_STATUSES = ['active', 'paused', 'completed', 'archived'] as const

export function useGoals() {
  const ws = useWorkspaceKey()
  return useQuery({ queryKey: [ws, 'goals'], queryFn: () => unwrap<Goal[]>(api().GET('/api/goals')) })
}

function useGoalMutation<A, R>(fn: (args: A) => Promise<R>) {
  const ws = useWorkspaceKey()
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => void queryClient.invalidateQueries({ queryKey: [ws, 'goals'] }) })
}

export function useSaveGoal() {
  return useGoalMutation(({ id, body }: { id?: string; body: Schemas['GoalUpdate'] }) =>
    id
      ? unwrap<Goal>(api().PATCH('/api/goals/{goal_id}', { params: { path: { goal_id: id } }, body }))
      : unwrap<Goal>(api().POST('/api/goals', { body: body as Schemas['GoalCreate'] })),
  )
}

export function useDeleteGoal() {
  return useGoalMutation((id: string) => unwrap<unknown>(api().DELETE('/api/goals/{goal_id}', { params: { path: { goal_id: id } } })))
}
