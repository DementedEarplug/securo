import type { TFunction } from 'i18next'

import type { Report } from '@/api/types'

type Labelled = { key: string; label: string }

/** The app's name for the server's catch-all buckets, as the web does; other labels are user data. */
export function bucketLabel<T extends Labelled>(item: T, t: TFunction): T {
  if (item.key === 'uncategorized') return { ...item, label: t('reports.uncategorized') }
  if (item.key === 'other') return { ...item, label: t('reports.other') }
  return item
}

/** `report` with its composition and category-trend labels in the app's language. */
export function localizeReport(report: Report, t: TFunction): Report {
  return {
    ...report,
    composition: report.composition?.map((item) => bucketLabel(item, t)),
    category_trend: report.category_trend?.map((item) => bucketLabel(item, t)),
  }
}
