import { Text as RNText, type TextProps } from 'react-native'

import { font, useColors } from '@/theme'

type Variant = 'title' | 'heading' | 'body' | 'label' | 'caption'
type Tone = 'default' | 'muted' | 'primary' | 'income' | 'expense' | 'destructive'

const VARIANTS: Record<Variant, { fontSize: number; fontWeight: '400' | '500' | '600' | '700' }> = {
  title: { fontSize: font.xxl, fontWeight: '700' },
  heading: { fontSize: font.lg, fontWeight: '600' },
  body: { fontSize: font.md, fontWeight: '400' },
  label: { fontSize: font.sm, fontWeight: '500' },
  caption: { fontSize: font.xs, fontWeight: '400' },
}

export function Text({
  variant = 'body',
  tone = 'default',
  style,
  ...props
}: TextProps & { variant?: Variant; tone?: Tone }) {
  const colors = useColors()
  const color = {
    default: colors.foreground,
    muted: colors.mutedForeground,
    primary: colors.primary,
    income: colors.income,
    expense: colors.expense,
    destructive: colors.destructive,
  }[tone]
  return <RNText style={[VARIANTS[variant], { color }, style]} {...props} />
}
