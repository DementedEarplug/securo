import { useTranslation } from 'react-i18next'

import { SelectSheet } from '@/components/SelectSheet'

export type Scope = 'this' | 'future' | 'all'

/** Which installments of a plan an edit or delete applies to. */
export function ScopeSheet({
  visible,
  action,
  onChoose,
  onClose,
}: {
  visible: boolean
  action: 'edit' | 'delete'
  onChoose: (scope: Scope) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  return (
    <SelectSheet
      visible={visible}
      title={t(action === 'edit' ? 'transactions.scope.editTitle' : 'transactions.scope.deleteTitle')}
      options={(['this', 'future', 'all'] as const).map((scope) => ({
        value: scope,
        label: t(`transactions.scope.${scope}`),
        detail: t(`transactions.scope.${scope}Hint`),
      }))}
      selected={null}
      onSelect={(scope) => {
        if (scope) onChoose(scope as Scope)
      }}
      onClose={onClose}
    />
  )
}
