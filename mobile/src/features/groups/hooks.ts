import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, unwrap } from '@/api/client'
import type { components } from '@/api/schema'
import type { Transaction } from '@/api/types'
import { useWorkspaceKey } from '@/features/session/hooks'
import { invalidateFinancialQueries } from '@/features/transactions/hooks'

type Schemas = components['schemas']
export type Group = Schemas['GroupRead']
export type Member = Schemas['GroupMemberRead']
export type Balances = Schemas['GroupBalances']
export type Settlement = Schemas['GroupSettlementRead']

export const GROUP_KINDS = ['social', 'cost_center', 'project', 'client', 'other'] as const
export type GroupKind = (typeof GROUP_KINDS)[number]

export function useGroups() {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'groups'],
    queryFn: () => unwrap<Group[]>(api().GET('/api/groups')),
  })
}

export function useGroup(id: string) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'groups', id],
    queryFn: () => unwrap<Group>(api().GET('/api/groups/{group_id}', { params: { path: { group_id: id } } })),
    enabled: Boolean(id),
  })
}

export function useGroupBalances(id: string) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'groups', id, 'balances'],
    queryFn: () => unwrap<Balances>(api().GET('/api/groups/{group_id}/balances', { params: { path: { group_id: id } } })),
  })
}

export function useGroupTransactions(id: string) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'groups', id, 'transactions'],
    queryFn: () =>
      unwrap<Transaction[]>(api().GET('/api/groups/{group_id}/transactions', { params: { path: { group_id: id } } })),
  })
}

export function useSettlements(id: string) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'groups', id, 'settlements'],
    queryFn: () =>
      unwrap<Settlement[]>(api().GET('/api/groups/{group_id}/settlements', { params: { path: { group_id: id } } })),
  })
}

/** Group writes move balances and, for settlements, create transactions. */
function useGroupMutation<A, R>(fn: (args: A) => Promise<R>) {
  const ws = useWorkspaceKey()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [ws, 'groups'] })
      invalidateFinancialQueries(queryClient, ws)
    },
  })
}

export function useCreateGroup() {
  return useGroupMutation((body: Schemas['GroupCreate']) => unwrap<Group>(api().POST('/api/groups', { body })))
}

export function useUpdateGroup(id: string) {
  return useGroupMutation((body: Schemas['GroupUpdate']) =>
    unwrap<Group>(api().PATCH('/api/groups/{group_id}', { params: { path: { group_id: id } }, body })),
  )
}

export function useDeleteGroup() {
  return useGroupMutation((id: string) =>
    unwrap<unknown>(api().DELETE('/api/groups/{group_id}', { params: { path: { group_id: id } } })),
  )
}

export function useSaveMember(groupId: string) {
  return useGroupMutation(({ id, body }: { id?: string; body: Schemas['GroupMemberCreate'] }) =>
    id
      ? unwrap<Member>(
          api().PATCH('/api/groups/{group_id}/members/{member_id}', {
            params: { path: { group_id: groupId, member_id: id } },
            body,
          }),
        )
      : unwrap<Member>(api().POST('/api/groups/{group_id}/members', { params: { path: { group_id: groupId } }, body })),
  )
}

export function useDeleteMember(groupId: string) {
  return useGroupMutation((id: string) =>
    unwrap<unknown>(
      api().DELETE('/api/groups/{group_id}/members/{member_id}', { params: { path: { group_id: groupId, member_id: id } } }),
    ),
  )
}

export function useCreateSettlement(groupId: string) {
  return useGroupMutation((body: Schemas['GroupSettlementCreate']) =>
    unwrap<Settlement>(api().POST('/api/groups/{group_id}/settlements', { params: { path: { group_id: groupId } }, body })),
  )
}

export function useDeleteSettlement(groupId: string) {
  return useGroupMutation((id: string) =>
    unwrap<unknown>(
      api().DELETE('/api/groups/{group_id}/settlements/{settlement_id}', {
        params: { path: { group_id: groupId, settlement_id: id } },
      }),
    ),
  )
}

export function memberName(members: Member[] | undefined, id: string): string {
  return members?.find((m) => m.id === id)?.name ?? '—'
}
