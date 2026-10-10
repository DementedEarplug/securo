import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, FlatList, Image, StyleSheet, TextInput, View } from 'react-native'
import { WebView, type WebViewNavigation } from 'react-native-webview'

import { Button } from '@/components/Button'
import { ListRow } from '@/components/ListRow'
import { SelectSheet } from '@/components/SelectSheet'
import { EmptyState, ErrorState, Loading } from '@/components/States'
import { Text } from '@/components/Text'
import {
  fetchOAuthUrl,
  fetchReauthUrl,
  useCompleteLink,
  useInstitutions,
  type Institution,
} from '@/features/connections/hooks'
import { alertLinkError } from '@/features/connections/link-errors'
import { parseOAuthReturn } from '@/features/connections/oauth-return'
import { font, radius, spacing, useColors } from '@/theme'

function countryName(code: string, language: string): string {
  try {
    return new Intl.DisplayNames([language], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

/**
 * Enable Banking: choose a country and bank, then consent at the bank inside a
 * WebView. The bank finally redirects to the web app's callback URL; the app
 * stops that navigation and completes the link with the code it carries.
 */
export default function EnableBankingScreen() {
  const { t, i18n } = useTranslation()
  const colors = useColors()
  const { reconnectId } = useLocalSearchParams<{ reconnectId?: string }>()
  const [country, setCountry] = useState<string | null>(null)
  const [choosingCountry, setChoosingCountry] = useState(false)
  const [query, setQuery] = useState('')
  const [consentUrl, setConsentUrl] = useState<string | null>(null)
  const [starting, setStarting] = useState<string | null>(null)
  const finishing = useRef(false)
  const link = useCompleteLink()
  const countries = useInstitutions('enable_banking', null)
  const institutions = useInstitutions('enable_banking', country)

  // Reconnecting reuses the bank chosen originally: straight to its consent page.
  useEffect(() => {
    if (!reconnectId) return
    fetchReauthUrl(reconnectId)
      .then(setConsentUrl)
      .catch((e) => {
        alertLinkError(e, t)
        router.back()
      })
  }, [reconnectId, t])

  const banks = useMemo(() => {
    const list = country ? (institutions.data?.institutions ?? []) : []
    const q = query.trim().toLowerCase()
    return q ? list.filter((i) => i.display_name.toLowerCase().includes(q)) : list
  }, [country, institutions.data, query])

  const choose = async (institution: Institution) => {
    setStarting(institution.name)
    try {
      setConsentUrl(
        await fetchOAuthUrl({
          country: institution.country,
          institution_name: institution.name,
          valid_until_days: institution.max_consent_days ?? undefined,
        }),
      )
    } catch (e) {
      alertLinkError(e, t)
    } finally {
      setStarting(null)
    }
  }

  const onNavigation = (request: { url: string }): boolean => {
    const result = parseOAuthReturn(request.url)
    if (!result) return true
    if (finishing.current) return false
    finishing.current = true
    setConsentUrl(null)
    if (result.kind === 'error') {
      alertLinkError(new Error(result.description ?? result.error), t)
      finishing.current = false
      return false
    }
    link
      .mutateAsync({ code: result.code, state: result.state, provider: 'enable_banking' })
      .then((connection) => router.replace({ pathname: '/connections/[id]', params: { id: connection.id } }))
      .catch((e) => alertLinkError(e, t))
      .finally(() => {
        finishing.current = false
      })
    return false
  }

  if (link.isPending) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text tone="muted" style={styles.centerText}>
          {t('connections.linkPatience')}
        </Text>
      </View>
    )
  }

  if (consentUrl) {
    return (
      <>
        <Stack.Screen options={{ title: t('connections.enableBanking.consentTitle') }} />
        <WebView
          source={{ uri: consentUrl }}
          onShouldStartLoadWithRequest={onNavigation}
          // Android reports redirects here too; covers banks that bypass the hook above.
          onNavigationStateChange={(state: WebViewNavigation) => {
            if (parseOAuthReturn(state.url)) onNavigation(state)
          }}
          startInLoadingState
          renderLoading={() => <Loading />}
          incognito
          setSupportMultipleWindows={false}
        />
      </>
    )
  }

  if (reconnectId) return <Loading />
  if (countries.isPending) return <Loading />
  if (countries.isError) return <ErrorState error={countries.error} onRetry={() => countries.refetch()} />

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text tone="muted">{t('connections.enableBanking.intro')}</Text>
        <Button
          variant="secondary"
          label={country ? countryName(country, i18n.language) : t('connections.enableBanking.chooseCountry')}
          onPress={() => setChoosingCountry(true)}
        />
        {country ? (
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('connections.enableBanking.searchBank')}
            placeholderTextColor={colors.mutedForeground}
            accessibilityLabel={t('connections.enableBanking.searchBank')}
            style={[styles.search, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
          />
        ) : null}
      </View>
      {country && institutions.isPending ? (
        <Loading />
      ) : country && institutions.isError ? (
        <ErrorState error={institutions.error} onRetry={() => institutions.refetch()} />
      ) : (
        <FlatList
          data={banks}
          keyExtractor={(item) => `${item.country}:${item.name}`}
          ListEmptyComponent={country ? <EmptyState title={t('connections.enableBanking.noBanks')} /> : null}
          renderItem={({ item }) => (
            <ListRow
              title={item.display_name}
              leading={item.logo ? <Image source={{ uri: item.logo }} style={styles.logo} resizeMode="contain" /> : null}
              trailing={starting === item.name ? <ActivityIndicator color={colors.primary} /> : null}
              onPress={() => void choose(item)}
              showChevron
            />
          )}
        />
      )}
      <SelectSheet
        visible={choosingCountry}
        title={t('connections.enableBanking.chooseCountry')}
        options={(countries.data.countries ?? [])
          .map((code) => ({ value: code, label: countryName(code, i18n.language), detail: code }))
          .sort((a, b) => a.label.localeCompare(b.label))}
        selected={country}
        onSelect={(code) => {
          setCountry(code)
          setQuery('')
          setChoosingCountry(false)
        }}
        onClose={() => setChoosingCountry(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { padding: spacing.lg, gap: spacing.md },
  search: { minHeight: 44, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: font.md },
  logo: { width: 28, height: 28 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl },
  centerText: { textAlign: 'center' },
})
