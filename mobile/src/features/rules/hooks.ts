import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, unwrap, unwrapAs } from '@/api/client'
import { ApiError } from '@/api/errors'
import type { components } from '@/api/schema'
import { useWorkspaceKey } from '@/features/session/hooks'
import { invalidateFinancialQueries } from '@/features/transactions/hooks'

import { findVendorRule, renamedVendorRule, similarCondition, vendorRuleName, vendorRulePriority, withCategory, type SimilarMatch } from './similar'

type Schemas = components['schemas']
export type Rule = Schemas['RuleRead']
export type RulePreview = Schemas['RulePreviewResponse']

export interface RulePack {
  code: string
  name: string
  flag?: string
  rule_count: number
  installed: boolean
}

export function useRules() {
  const ws = useWorkspaceKey()
  return useQuery({ queryKey: [ws, 'rules'], queryFn: () => unwrap<Rule[]>(api().GET('/api/rules')) })
}

export function useRulePacks() {
  const ws = useWorkspaceKey()
  return useQuery({ queryKey: [ws, 'rules', 'packs'], queryFn: () => unwrapAs<RulePack[]>(api().GET('/api/rules/packs')) })
}

/** Rules recategorise existing transactions, so everything financial refreshes. */
function useRuleMutation<A, R>(fn: (args: A) => Promise<R>) {
  const ws = useWorkspaceKey()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [ws, 'rules'] })
      void queryClient.invalidateQueries({ queryKey: [ws, 'categories'] })
      void queryClient.invalidateQueries({ queryKey: [ws, 'category-groups'] })
      invalidateFinancialQueries(queryClient, ws)
    },
  })
}

export function useSaveRule() {
  return useRuleMutation(({ id, body }: { id?: string; body: Schemas['RuleUpdate'] }) =>
    id
      ? unwrapAs<Rule & { applied_count?: number }>(api().PATCH('/api/rules/{rule_id}', { params: { path: { rule_id: id } }, body }))
      : unwrapAs<Rule & { applied_count?: number }>(api().POST('/api/rules', { body: body as Schemas['RuleCreate'] })),
  )
}

export function useDeleteRule() {
  return useRuleMutation((id: string) => unwrap<unknown>(api().DELETE('/api/rules/{rule_id}', { params: { path: { rule_id: id } } })))
}

export function useApplyAllRules() {
  return useRuleMutation(() => unwrapAs<{ applied?: number }>(api().POST('/api/rules/apply-all')))
}

export function useInstallPack() {
  return useRuleMutation((code: string) =>
    unwrapAs<{ installed: number; unresolved?: number; categories_created?: number }>(
      api().POST('/api/rules/packs/{pack_code}/install', {
        params: { path: { pack_code: code }, query: { create_missing_categories: true } },
      }),
    ),
  )
}

export async function previewRule(body: Schemas['RulePreviewRequest']): Promise<RulePreview> {
  return unwrap<RulePreview>(api().POST('/api/rules/preview', { body }))
}

export interface CategorizeSimilarArgs {
  match: SimilarMatch
  /** What the vendor is called, for the rule's name. */
  vendor: string
  categoryId: string
  categoryName: string
  /** Recategorise matching transactions already in the ledger, not only future ones. */
  applyToPast: boolean
  /** Also change matches that already have a category. */
  overwrite: boolean
}

/**
 * Give a vendor's transactions one category, now and on every later import: a
 * rule that matches the vendor and sets the category. Reuses the vendor's rule
 * from an earlier correction when there is one.
 */
export function useCategorizeSimilar() {
  return useRuleMutation(async ({ match, vendor, categoryId, categoryName, applyToPast, overwrite }: CategorizeSimilarArgs) => {
    const rules = await unwrap<Rule[]>(api().GET('/api/rules'))
    const leaf = similarCondition(match)
    const existing = findVendorRule(rules, leaf)
    const saved = { is_active: true, apply_to_existing: applyToPast, overwrite_existing_categories: overwrite }
    if (existing) {
      const update = (name?: string) =>
        unwrapAs<Rule & { applied_count?: number }>(
          api().PATCH('/api/rules/{rule_id}', {
            params: { path: { rule_id: existing.id } },
            body: { ...saved, name, actions: withCategory(existing.actions, categoryId), priority: vendorRulePriority(rules, existing.id) },
          }),
        )
      const name = renamedVendorRule(existing, vendor, categoryName)
      try {
        return await update(name)
      } catch (e) {
        // Another rule already has the new name: keep the old one rather than fail.
        if (name && e instanceof ApiError && e.status === 409) return update()
        throw e
      }
    }
    const body: Schemas['RuleCreate'] = {
      ...saved,
      name: vendorRuleName(vendor, categoryName),
      conditions_op: 'and',
      conditions: [leaf],
      actions: [{ op: 'set_category', value: categoryId }],
      priority: vendorRulePriority(rules),
    }
    // Names are unique per workspace; a hand-made rule may already use this one.
    for (let attempt = 1; ; attempt++) {
      try {
        const name = attempt === 1 ? body.name : `${body.name} (${attempt})`
        return await unwrapAs<Rule & { applied_count?: number }>(api().POST('/api/rules', { body: { ...body, name } }))
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 409) || attempt >= 5) throw e
      }
    }
  })
}
