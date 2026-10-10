import type { TFunction } from 'i18next'

import type { Report } from '@/api/types'
import { localizeReport } from './labels'

const t = ((key: string) => ({ 'reports.uncategorized': 'Sem categoria', 'reports.other': 'Outros' })[key] ?? key) as unknown as TFunction

describe('localizeReport', () => {
  it('names the catch-all buckets in the app language and keeps user labels', () => {
    const item = (key: string, label: string) => ({ key, label, color: '#000', group: 'expense', value: 1 })
    const report = {
      composition: [item('uncategorized', 'Uncategorized'), item('other', 'Other'), item('c1', 'Uncategorized stuff')],
      category_trend: [{ ...item('uncategorized', 'Uncategorized'), series: [], total: 1 }],
    } as unknown as Report

    const out = localizeReport(report, t)

    expect(out.composition!.map((c) => c.label)).toEqual(['Sem categoria', 'Outros', 'Uncategorized stuff'])
    expect(out.category_trend![0]!.label).toBe('Sem categoria')
  })
})
