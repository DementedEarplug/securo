import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { toast } from 'sonner'
import { connections } from '@/lib/api'
import { invalidateFinancialQueries } from '@/lib/invalidate-queries'
import {
  accountState,
  groupByInstitution,
  initiallyIncluded,
  selectionChange,
} from '@/lib/connection-account-selection'
import { formatCurrency } from '@/lib/format'
import { useDisplayLocale } from '@/hooks/use-display-locale'
import { usePrivacyMode } from '@/hooks/use-privacy-mode'
import { getConnectionName } from '@/lib/connection-utils'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { BankConnection, ConnectionAccounts } from '@/types'

interface ConnectionAccountsDialogProps {
  open: boolean
  onClose: () => void
  connection: BankConnection | null
}

/**
 * Which of a connection's accounts are imported. Opened right after linking
 * SimpleFIN (nothing is imported until this is saved) and from a connection's
 * card, so one bank login can feed several workspaces with different accounts.
 */
export function ConnectionAccountsDialog({ open, onClose, connection }: ConnectionAccountsDialogProps) {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: ['connections', connection?.id, 'accounts'],
    queryFn: () => connections.getAccounts(connection!.id),
    enabled: open && !!connection,
  })

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('connections.chooseAccounts')}</DialogTitle>
          {connection && <p className="text-sm text-muted-foreground">{getConnectionName(connection, t)}</p>}
        </DialogHeader>
        {query.data && connection ? (
          // Keyed so a refetch after saving starts from the saved choice.
          <Selection key={query.dataUpdatedAt} connection={connection} data={query.data} onDone={onClose} />
        ) : query.isError ? (
          <p className="text-sm text-rose-500">{t('common.error')}</p>
        ) : (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Selection({
  connection,
  data,
  onDone,
}: {
  connection: BankConnection
  data: ConnectionAccounts
  onDone: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const locale = useDisplayLocale()
  const { mask } = usePrivacyMode()
  const [included, setIncluded] = useState(() => initiallyIncluded(data.accounts))
  const [importNew, setImportNew] = useState(data.import_new_accounts)
  const [confirmingHistory, setConfirmingHistory] = useState(false)
  const change = selectionChange(data.accounts, included)
  const dirty = change.changed || importNew !== data.import_new_accounts || data.awaiting_selection
  const allOn = included.size === data.accounts.length

  const mutation = useMutation({
    mutationFn: (removeHistory: string[]) =>
      connections.updateAccounts(connection.id, {
        excluded: change.excluded,
        import_new_accounts: importNew,
        remove_history: removeHistory,
      }),
    onSuccess: () => {
      toast.success(t('connections.accountsSaved'))
      onDone()
    },
    onError: (err) => {
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : null
      toast.error((typeof detail === 'string' ? detail : detail?.message) || t('common.error'))
    },
    onSettled: () => {
      invalidateFinancialQueries(queryClient)
      queryClient.invalidateQueries({ queryKey: ['connections'] })
    },
  })

  const toggle = (externalId: string, on: boolean) =>
    setIncluded((current) => {
      const next = new Set(current)
      if (on) next.add(externalId)
      else next.delete(externalId)
      return next
    })

  const save = () => {
    if (change.losingHistory.length) setConfirmingHistory(true)
    else mutation.mutate([])
  }

  if (confirmingHistory) {
    const count = change.losingHistory.reduce((sum, a) => sum + a.transaction_count, 0)
    return (
      <>
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">{t('connections.historyTitle')}</p>
          <p className="text-sm text-muted-foreground">
            {t('connections.historyBody', { names: change.losingHistory.map((a) => a.name).join(', '), count })}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirmingHistory(false)} disabled={mutation.isPending}>
            {t('common.cancel')}
          </Button>
          <Button variant="outline" onClick={() => mutation.mutate([])} disabled={mutation.isPending}>
            {t('connections.keepHistory')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => mutation.mutate(change.losingHistory.map((a) => a.external_id))}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? t('common.loading') : t('connections.deleteHistory')}
          </Button>
        </DialogFooter>
      </>
    )
  }

  return (
    <>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {data.awaiting_selection ? t('connections.awaitingSelection') : t('connections.chooseAccountsIntro')}
        </p>
        {data.accounts.length > 1 && (
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIncluded(allOn ? new Set() : new Set(data.accounts.map((a) => a.external_id)))}
            >
              {allOn ? t('connections.clearAll') : t('connections.selectAll')}
            </Button>
          </div>
        )}
        <div className="max-h-[50vh] space-y-3 overflow-y-auto">
          {data.accounts.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('accounts.noAccountsFound')}</p>
          )}
          {groupByInstitution(data.accounts).map((group) => (
            <div key={group.institution ?? ''} className="space-y-1">
              {group.institution && (
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{group.institution}</p>
              )}
              <div className="divide-y divide-muted rounded-lg border border-border">
                {group.accounts.map((account) => {
                  const on = included.has(account.external_id)
                  const state = accountState(account, on)
                  const id = `connection-account-${account.external_id}`
                  const balance = account.balance == null ? null : Number(account.balance)
                  return (
                    <label key={account.external_id} htmlFor={id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-muted/50">
                      <input
                        id={id}
                        type="checkbox"
                        checked={on}
                        onChange={(e) => toggle(account.external_id, e.target.checked)}
                        disabled={mutation.isPending}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {account.name}
                          {account.masked_number && <span className="text-muted-foreground"> · {account.masked_number}</span>}
                        </p>
                        <p className={`text-xs ${state === 'willStop' ? 'text-rose-500' : 'text-muted-foreground'}`}>
                          {t(`connections.accountState.${state}`)}
                          {state === 'imported' && account.transaction_count > 0 && (
                            <> · {t('connections.transactionCount', { count: account.transaction_count })}</>
                          )}
                        </p>
                      </div>
                      {balance != null && !Number.isNaN(balance) && (
                        <p className="shrink-0 text-sm tabular-nums text-muted-foreground">
                          {mask(formatCurrency(balance, account.currency, locale))}
                        </p>
                      )}
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        <label htmlFor="import-new-accounts" className="flex cursor-pointer items-start justify-between gap-4">
          <span className="space-y-1">
            <span className="block text-sm font-medium text-foreground">{t('connections.importNewAccounts')}</span>
            <span className="block text-[11px] text-muted-foreground">{t('connections.importNewAccountsHint')}</span>
          </span>
          <input
            id="import-new-accounts"
            type="checkbox"
            checked={importNew}
            onChange={(e) => setImportNew(e.target.checked)}
            disabled={mutation.isPending}
            className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
        </label>
        {mutation.isPending && change.importing.length > 0 && (
          <p className="text-xs text-muted-foreground">{t('connections.importingAccounts')}</p>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={mutation.isPending}>
          {t('common.cancel')}
        </Button>
        <Button onClick={save} disabled={!dirty || mutation.isPending}>
          {mutation.isPending
            ? t('common.loading')
            : change.importing.length > 0
              ? t('connections.saveAndImport')
              : t('common.save')}
        </Button>
      </DialogFooter>
    </>
  )
}
