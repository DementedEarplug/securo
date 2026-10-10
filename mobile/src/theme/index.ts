import { useColorScheme } from 'react-native'

/** The web app's palette (`frontend/src/index.css`), so both clients match. */
const light = {
  background: '#F8F9FB',
  foreground: '#0F172A',
  card: '#FFFFFF',
  primary: '#6366F1',
  primaryForeground: '#FFFFFF',
  muted: '#F1F5F9',
  mutedForeground: '#64748B',
  accent: '#EEF2FF',
  destructive: '#F43F5E',
  border: '#E8ECF1',
  income: '#059669',
  expense: '#F43F5E',
  warning: '#D97706',
}

const dark: typeof light = {
  background: '#0C0D12',
  foreground: '#F0F0F5',
  card: '#16171F',
  primary: '#818CF8',
  primaryForeground: '#FFFFFF',
  muted: '#252836',
  mutedForeground: '#8A8F9E',
  accent: '#1E1B4B',
  destructive: '#FB7185',
  border: '#2A2D3A',
  income: '#34D399',
  expense: '#FB7185',
  warning: '#FBBF24',
}

export type Colors = typeof light

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const
export const radius = { sm: 6, md: 10, lg: 14, full: 999 } as const
export const font = { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, xxl: 28 } as const

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light
}
