import { getLocales } from 'expo-localization'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import { en, ptBR } from './locales'

export const LANGUAGES = ['en', 'pt-BR'] as const
export type Language = (typeof LANGUAGES)[number]

/** Map any BCP-47 tag onto a bundled language (`pt-PT` reads as `pt-BR`). */
export function supportedLanguage(tag: string | null | undefined): Language | null {
  if (!tag) return null
  const lower = tag.toLowerCase()
  if (lower.startsWith('pt')) return 'pt-BR'
  if (lower.startsWith('en')) return 'en'
  return null
}

export function deviceLanguage(): Language {
  return supportedLanguage(getLocales()[0]?.languageTag) ?? 'en'
}

// eslint-disable-next-line import/no-named-as-default-member -- i18next's documented API
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, 'pt-BR': { translation: ptBR } },
  lng: deviceLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
  showSupportNotice: false,
})

export default i18n
