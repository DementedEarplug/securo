import type { CategoryGroup } from '@/api/types'
import type { SelectOption } from '@/components/SelectSheet'

/** Visible categories as picker options, labelled with their group. */
export function categoryOptions(groups: CategoryGroup[] | undefined): SelectOption[] {
  if (!groups) return []
  return [...groups]
    .filter((group) => !group.is_hidden)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .flatMap((group) =>
      (group.categories ?? [])
        .filter((category) => !category.is_hidden)
        .map((category) => ({
          value: category.id,
          label: category.name,
          // A group holding one same-named category would read "Housing / Housing".
          detail: group.name === category.name ? null : group.name,
          color: category.color ?? null,
        })),
    )
}
