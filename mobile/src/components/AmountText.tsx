import type { TextProps } from 'react-native'

import { useDisplayFormat } from '@/features/session/hooks'
import { formatCurrency } from '@/lib/format'
import { Text } from './Text'

interface Props extends TextProps {
  value: number | null | undefined
  /** Defaults to the user's display currency. */
  currency?: string
  /** Colour by direction: income green, expense red (as on the web). */
  tone?: 'default' | 'muted' | 'income' | 'expense'
  variant?: 'title' | 'heading' | 'body' | 'label' | 'caption'
}

export function AmountText({ value, currency, tone = 'default', variant = 'body', ...props }: Props) {
  const format = useDisplayFormat()
  return (
    <Text variant={variant} tone={tone} {...props}>
      {formatCurrency(value, currency ?? format.currency, format.locale)}
    </Text>
  )
}
