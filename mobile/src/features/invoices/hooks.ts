import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, unwrap, unwrapAs } from '@/api/client'
import type { components } from '@/api/schema'
import type { PaginatedTransactions } from '@/api/types'
import { useWorkspaceKey } from '@/features/session/hooks'
import { invalidateFinancialQueries } from '@/features/transactions/hooks'
import { downloadToCache } from '@/lib/download'
import { uploadableFile, type PickedFile } from '@/lib/upload'
import {
  stateParam,
  type DeductionKind,
  type Invoice,
  type InvoiceCreate,
  type InvoiceDirection,
  type InvoiceFacets,
  type InvoiceFilter,
  type InvoiceSettings,
  type InvoiceSummary,
  type InvoiceUpdate,
} from './model'
import type { Schedule, ScheduleFilter, SchedulePeriod, ScheduleSummary } from './schedules'

export function useInvoiceSettings() {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'invoices', 'settings'],
    queryFn: () => unwrap<InvoiceSettings>(api().GET('/api/invoices/settings')),
  })
}

export function useInvoiceSummary(direction: InvoiceDirection) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'invoices', 'summary', direction],
    queryFn: () => unwrap<InvoiceSummary>(api().GET('/api/invoices/summary', { params: { query: { direction } } })),
  })
}

export function useInvoiceFacets(direction: InvoiceDirection, year: number | null) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'invoices', 'facets', direction, year],
    queryFn: () =>
      unwrap<InvoiceFacets>(api().GET('/api/invoices/facets', { params: { query: { direction, year: year ?? undefined } } })),
  })
}

export function useInvoices({ direction, filter, year }: { direction: InvoiceDirection; filter: InvoiceFilter; year: number | null }) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'invoices', 'list', { direction, filter, year }],
    queryFn: () =>
      unwrap<Invoice[]>(
        api().GET('/api/invoices', {
          params: { query: { direction, state: stateParam(filter), year: year ?? undefined, limit: 500 } },
        }),
      ),
  })
}

export function useInvoice(id: string) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'invoices', 'detail', id],
    queryFn: () => unwrap<Invoice>(api().GET('/api/invoices/{invoice_id}', { params: { path: { invoice_id: id } } })),
    enabled: Boolean(id),
  })
}

/** Transactions that could settle an invoice: credits for a receivable, debits for a payable. */
export function useSettlingTransactions(direction: InvoiceDirection) {
  const ws = useWorkspaceKey()
  const type = direction === 'payable' ? 'debit' : 'credit'
  return useQuery({
    queryKey: [ws, 'transactions', 'for-invoice', type],
    queryFn: () =>
      unwrap<PaginatedTransactions>(
        api().GET('/api/transactions', { params: { query: { type, limit: 100, sort_by: 'date', sort_dir: 'desc' } } }),
      ),
  })
}

/**
 * Every invoice write invalidates the whole invoice tree (list, summary,
 * facets, detail) and, since payments link transactions, the money views.
 */
function useInvoiceMutation<A, R>(fn: (args: A) => Promise<R>) {
  const ws = useWorkspaceKey()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [ws, 'invoices'] })
      invalidateFinancialQueries(queryClient, ws)
    },
  })
}

export function useCreateInvoice() {
  return useInvoiceMutation((body: InvoiceCreate) => unwrap<Invoice>(api().POST('/api/invoices', { body })))
}

export function useUpdateInvoice(id: string) {
  return useInvoiceMutation((body: InvoiceUpdate) =>
    unwrap<Invoice>(api().PATCH('/api/invoices/{invoice_id}', { params: { path: { invoice_id: id } }, body })),
  )
}

export function useDeleteInvoice() {
  return useInvoiceMutation((id: string) =>
    unwrap<unknown>(api().DELETE('/api/invoices/{invoice_id}', { params: { path: { invoice_id: id } } })),
  )
}

export type InvoiceAction = 'issue' | 'void' | 'uncollectible' | 'reopen'

/** The status changes. Each is its own route on the server, because each has a reason. */
export function useInvoiceAction(id: string) {
  return useInvoiceMutation((action: InvoiceAction) => {
    const params = { params: { path: { invoice_id: id } } }
    switch (action) {
      case 'issue':
        return unwrap<Invoice>(api().POST('/api/invoices/{invoice_id}/issue', params))
      case 'void':
        return unwrap<Invoice>(api().POST('/api/invoices/{invoice_id}/void', params))
      case 'uncollectible':
        return unwrap<Invoice>(api().POST('/api/invoices/{invoice_id}/uncollectible', params))
      case 'reopen':
        return unwrap<Invoice>(api().POST('/api/invoices/{invoice_id}/reopen', params))
    }
  })
}

/**
 * Link a payment, then (optionally) record what it left short as a
 * deduction. Two requests: if the second fails the link has still landed,
 * which `linked` tells the caller so it doesn't offer to link it again.
 */
export function useRecordPayment(id: string) {
  return useInvoiceMutation(
    async ({
      transactionId,
      amount,
      shortfall,
    }: {
      transactionId: string
      amount?: string
      shortfall?: { kind: DeductionKind; amount: string }
    }) => {
      const path = { invoice_id: id }
      const after = await unwrap<Invoice>(
        api().POST('/api/invoices/{invoice_id}/allocations', { params: { path }, body: { transaction_id: transactionId, amount } }),
      )
      if (!shortfall) return { invoice: after, deductionError: null }
      try {
        const final = await unwrap<Invoice>(
          api().POST('/api/invoices/{invoice_id}/deductions', {
            params: { path },
            body: { kind: shortfall.kind, amount: shortfall.amount, transaction_id: transactionId },
          }),
        )
        return { invoice: final, deductionError: null }
      } catch (error) {
        return { invoice: after, deductionError: error }
      }
    },
  )
}

export function useRemoveAllocation(id: string) {
  return useInvoiceMutation((allocationId: string) =>
    unwrap<Invoice>(
      api().DELETE('/api/invoices/{invoice_id}/allocations/{allocation_id}', {
        params: { path: { invoice_id: id, allocation_id: allocationId } },
      }),
    ),
  )
}

/** Close part of the debt without money: tax withheld, a fee kept, a conversion short. */
export function useRecordDeduction(id: string) {
  return useInvoiceMutation((body: { kind: DeductionKind; amount: string; tax_kind?: string | null; note?: string | null }) =>
    unwrap<Invoice>(api().POST('/api/invoices/{invoice_id}/deductions', { params: { path: { invoice_id: id } }, body })),
  )
}

export function useRemoveDeduction(id: string) {
  return useInvoiceMutation((deductionId: string) =>
    unwrap<Invoice>(
      api().DELETE('/api/invoices/{invoice_id}/deductions/{deduction_id}', {
        params: { path: { invoice_id: id, deduction_id: deductionId } },
      }),
    ),
  )
}

export function useShareInvoice(id: string) {
  return useInvoiceMutation((share: boolean) =>
    share
      ? unwrap<{ token: string; path: string }>(api().POST('/api/invoices/{invoice_id}/share', { params: { path: { invoice_id: id } } }))
      : unwrap<unknown>(api().DELETE('/api/invoices/{invoice_id}/share', { params: { path: { invoice_id: id } } })).then(() => null),
  )
}

/** The invoice as issued (or the filed document), or the live statement of account. */
export function downloadInvoicePdf(invoice: Pick<Invoice, 'id'>, number: string | null, kind: 'pdf' | 'statement' = 'pdf') {
  const base = (number ?? 'invoice').replace(/[\\/]/g, '-')
  return downloadToCache(
    `/api/invoices/${encodeURIComponent(invoice.id)}/${kind}`,
    kind === 'pdf' ? `${base}.pdf` : `${base}-statement.pdf`,
  )
}

// ---------------------------------------------------------------------------
// Notes, which stay editable after issue (the seller's own record)
// ---------------------------------------------------------------------------

export function useUpdateInvoiceNotes(id: string) {
  return useInvoiceMutation((body: { notes: string | null; internal_notes: string | null }) =>
    unwrap<Invoice>(api().PATCH('/api/invoices/{invoice_id}', { params: { path: { invoice_id: id } }, body })),
  )
}

// ---------------------------------------------------------------------------
// Settings, issuer profile and logo
// ---------------------------------------------------------------------------

export type IssuerProfile = components['schemas']['IssuerProfileRead']
export interface TaxIdKind {
  kind: string
  label_key: string
  offered: boolean
}

export function useIssuer() {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'invoices', 'issuer'],
    queryFn: () => unwrap<IssuerProfile>(api().GET('/api/invoices/issuer')),
  })
}

/** Tax document kinds; the workspace's jurisdiction asks for the `offered` ones. */
export function useTaxIdKinds() {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'fiscal', 'tax-id-kinds'],
    queryFn: () => unwrapAs<{ kinds: TaxIdKind[] }>(api().GET('/api/fiscal/tax-id-kinds')),
    staleTime: Infinity,
  })
}

export function useUpdateInvoiceSettings() {
  return useInvoiceMutation((body: components['schemas']['InvoiceSettingsUpdate']) =>
    unwrap<InvoiceSettings>(api().PATCH('/api/invoices/settings', { body })),
  )
}

export function useUpdateIssuer() {
  return useInvoiceMutation((body: components['schemas']['IssuerProfileUpdate']) =>
    unwrap<IssuerProfile>(api().PATCH('/api/invoices/issuer', { body })),
  )
}

/** Upload a picked image as the workspace's logo; the server normalises it to a PNG. */
export function useUploadLogo() {
  return useInvoiceMutation(async (picked: PickedFile) => {
    const form = new FormData()
    form.append('file', await uploadableFile(picked))
    return unwrap<InvoiceSettings>(
      api().POST('/api/invoices/settings/logo', {
        // The typed body is the schema's shape; the wire format is the FormData.
        body: {} as never,
        bodySerializer: () => form,
      }),
    )
  })
}

export function useRemoveLogo() {
  return useInvoiceMutation(() => unwrap<InvoiceSettings>(api().DELETE('/api/invoices/settings/logo')))
}

/** A local copy of a logo for <Image>: the file needs the session's auth headers. */
export function useLogoUri(logoId: string | null | undefined) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'invoices', 'logo', logoId],
    queryFn: async () => (await downloadToCache(`/api/invoices/logo/${encodeURIComponent(logoId!)}`, `logo-${logoId}.png`)).file.uri,
    enabled: Boolean(logoId),
    // An id names one file forever.
    staleTime: Infinity,
  })
}

// ---------------------------------------------------------------------------
// Recurring invoices (agreements)
// ---------------------------------------------------------------------------

export function useScheduleSummary() {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'invoices', 'schedules', 'summary'],
    queryFn: () => unwrap<ScheduleSummary>(api().GET('/api/invoice-schedules/summary')),
  })
}

export function useSchedules(filter: ScheduleFilter) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'invoices', 'schedules', 'list', filter],
    queryFn: () =>
      unwrap<Schedule[]>(
        api().GET('/api/invoice-schedules', { params: { query: filter === 'all' ? {} : { status: filter } } }),
      ),
  })
}

export function useSchedule(id: string) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'invoices', 'schedules', 'detail', id],
    queryFn: () => unwrap<Schedule>(api().GET('/api/invoice-schedules/{schedule_id}', { params: { path: { schedule_id: id } } })),
    enabled: Boolean(id),
  })
}

export function useScheduleInvoices(id: string) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'invoices', 'schedules', 'invoices', id],
    queryFn: () =>
      unwrap<Invoice[]>(api().GET('/api/invoice-schedules/{schedule_id}/invoices', { params: { path: { schedule_id: id } } })),
    enabled: Boolean(id),
  })
}

export function useSchedulePeriods(id: string) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'invoices', 'schedules', 'periods', id],
    queryFn: () =>
      unwrap<SchedulePeriod[]>(
        api().GET('/api/invoice-schedules/{schedule_id}/periods', { params: { path: { schedule_id: id }, query: { ahead: 3 } } }),
      ),
    enabled: Boolean(id),
  })
}

/** Invoices that could answer for a period: same client and currency, not void, in no agreement yet. */
export function useLinkableInvoices(schedule: Pick<Schedule, 'id' | 'payee_id' | 'currency'>) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'invoices', 'linkable', schedule.id],
    queryFn: () =>
      unwrap<Invoice[]>(
        api().GET('/api/invoices', { params: { query: { payee_id: schedule.payee_id ?? undefined, limit: 500 } } }),
      ),
    select: (rows: Invoice[]) =>
      rows.filter((invoice) => !invoice.schedule_id && invoice.status !== 'void' && invoice.currency === schedule.currency),
  })
}

export function useCreateSchedule() {
  return useInvoiceMutation((body: components['schemas']['ScheduleCreate']) =>
    unwrap<Schedule>(api().POST('/api/invoice-schedules', { body })),
  )
}

export function useUpdateSchedule(id: string) {
  return useInvoiceMutation((body: components['schemas']['ScheduleUpdate']) =>
    unwrap<Schedule>(api().PATCH('/api/invoice-schedules/{schedule_id}', { params: { path: { schedule_id: id } }, body })),
  )
}

export function useDeleteSchedule() {
  return useInvoiceMutation((id: string) =>
    unwrap<unknown>(api().DELETE('/api/invoice-schedules/{schedule_id}', { params: { path: { schedule_id: id } } })),
  )
}

export type ScheduleAction = 'pause' | 'resume'

export function useScheduleAction(id: string) {
  return useInvoiceMutation((action: ScheduleAction) => {
    const params = { params: { path: { schedule_id: id } } }
    return action === 'pause'
      ? unwrap<Schedule>(api().POST('/api/invoice-schedules/{schedule_id}/pause', params))
      : unwrap<Schedule>(api().POST('/api/invoice-schedules/{schedule_id}/resume', params))
  })
}

export function useEndSchedule(id: string) {
  return useInvoiceMutation((body: components['schemas']['ScheduleEnd']) =>
    unwrap<Schedule>(api().POST('/api/invoice-schedules/{schedule_id}/end', { params: { path: { schedule_id: id } }, body })),
  )
}

/** Emit the next period now, whether or not its date has come. */
export function useGenerateNow(id: string) {
  return useInvoiceMutation(() =>
    unwrap<Invoice[]>(api().POST('/api/invoice-schedules/{schedule_id}/generate', { params: { path: { schedule_id: id } } })),
  )
}

export function useSaveTerm(scheduleId: string) {
  return useInvoiceMutation(({ termId, body }: { termId?: string; body: components['schemas']['ScheduleTermInput'] }) =>
    termId
      ? unwrap<Schedule>(
          api().PATCH('/api/invoice-schedules/{schedule_id}/terms/{term_id}', {
            params: { path: { schedule_id: scheduleId, term_id: termId } },
            body,
          }),
        )
      : unwrap<Schedule>(
          api().POST('/api/invoice-schedules/{schedule_id}/terms', { params: { path: { schedule_id: scheduleId } }, body }),
        ),
  )
}

export function useDeleteTerm(scheduleId: string) {
  return useInvoiceMutation((termId: string) =>
    unwrap<Schedule>(
      api().DELETE('/api/invoice-schedules/{schedule_id}/terms/{term_id}', {
        params: { path: { schedule_id: scheduleId, term_id: termId } },
      }),
    ),
  )
}

export function useLinkInvoice(scheduleId: string) {
  return useInvoiceMutation((body: components['schemas']['ScheduleLinkInvoice']) =>
    unwrap<Invoice>(api().POST('/api/invoice-schedules/{schedule_id}/link', { params: { path: { schedule_id: scheduleId } }, body })),
  )
}

/** Turn an issued invoice into period one of a new agreement. */
export function useMakeRecurring(invoiceId: string) {
  return useInvoiceMutation((body: components['schemas']['MakeRecurring']) =>
    unwrap<Schedule>(api().POST('/api/invoices/{invoice_id}/make-recurring', { params: { path: { invoice_id: invoiceId } }, body })),
  )
}

/** Take an invoice out of its agreement; it keeps its number, date and payments. */
export function useUnlinkSchedule(invoiceId: string) {
  return useInvoiceMutation(() =>
    unwrap<Invoice>(api().DELETE('/api/invoices/{invoice_id}/schedule', { params: { path: { invoice_id: invoiceId } } })),
  )
}
