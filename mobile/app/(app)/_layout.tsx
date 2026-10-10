import { Stack } from 'expo-router'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { loadLanguage } from '@/auth/storage'
import { useMe } from '@/features/session/hooks'
import i18n, { supportedLanguage } from '@/i18n'
import { useColors } from '@/theme'

export default function AppLayout() {
  const { t } = useTranslation()
  const colors = useColors()
  const me = useMe().data

  // Follow the account's language unless one was picked on this phone.
  useEffect(() => {
    const language = supportedLanguage(me?.preferences?.language as string | undefined)
    if (!language) return
    void loadLanguage().then((chosen) => {
      if (!chosen && i18n.language !== language) void i18n.changeLanguage(language)
    })
  }, [me])

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.foreground,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="account/[id]" options={{ title: '' }} />
      <Stack.Screen name="account/form" options={{ title: '', presentation: 'modal' }} />
      <Stack.Screen name="transaction/[id]" options={{ title: t('transactions.detailTitle') }} />
      <Stack.Screen name="transaction/new" options={{ title: t('transactions.newTitle'), presentation: 'modal' }} />
      <Stack.Screen name="transaction/edit" options={{ title: t('transactions.editTitle'), presentation: 'modal' }} />
      <Stack.Screen name="transaction/similar" options={{ title: t('transactions.similar.title'), presentation: 'modal' }} />
      <Stack.Screen name="transaction/list" options={{ title: '' }} />
      <Stack.Screen name="settings" options={{ title: t('settings.title') }} />
      <Stack.Screen name="categories/index" options={{ title: t('more.items.categories') }} />
      <Stack.Screen name="categories/form" options={{ title: '', presentation: 'modal' }} />
      <Stack.Screen name="categories/group" options={{ title: '', presentation: 'modal' }} />
      <Stack.Screen name="budgets/form" options={{ title: '', presentation: 'modal' }} />
      <Stack.Screen name="goals/index" options={{ title: t('more.items.goals') }} />
      <Stack.Screen name="goals/form" options={{ title: '', presentation: 'modal' }} />
      <Stack.Screen name="rules/index" options={{ title: t('more.items.rules') }} />
      <Stack.Screen name="rules/form" options={{ title: '', presentation: 'modal' }} />
      <Stack.Screen name="payees/index" options={{ title: t('more.items.payees') }} />
      <Stack.Screen name="payees/form" options={{ title: '', presentation: 'modal' }} />
      <Stack.Screen name="groups/index" options={{ title: t('more.items.groups') }} />
      <Stack.Screen name="groups/[id]" options={{ title: '' }} />
      <Stack.Screen name="groups/form" options={{ title: '', presentation: 'modal' }} />
      <Stack.Screen name="groups/member" options={{ title: '', presentation: 'modal' }} />
      <Stack.Screen name="groups/settle" options={{ title: t('groups.recordPayment'), presentation: 'modal' }} />
      <Stack.Screen name="recurring/index" options={{ title: t('more.items.recurring') }} />
      <Stack.Screen name="recurring/form" options={{ title: '', presentation: 'modal' }} />
      <Stack.Screen name="import/index" options={{ title: t('more.items.import') }} />
      <Stack.Screen name="import/history" options={{ title: t('more.items.importLogs') }} />
      <Stack.Screen name="connections/index" options={{ title: t('more.items.connections') }} />
      <Stack.Screen name="connections/[id]" options={{ title: '' }} />
      <Stack.Screen name="connections/new" options={{ title: t('connections.add') }} />
      <Stack.Screen name="connections/simplefin" options={{ title: 'SimpleFIN' }} />
      <Stack.Screen name="connections/accounts" options={{ title: t('connections.chooseAccounts') }} />
      <Stack.Screen name="connections/enable-banking" options={{ title: 'Enable Banking' }} />
      <Stack.Screen name="connections/pluggy" options={{ title: 'Pluggy', headerShown: true }} />
      <Stack.Screen name="workspaces" options={{ title: t('settings.workspace') }} />
      <Stack.Screen name="sessions" options={{ title: t('settings.devices') }} />
      <Stack.Screen name="agents/index" options={{ title: t('more.items.agents') }} />
      <Stack.Screen name="agents/[id]" options={{ title: '' }} />
      <Stack.Screen name="agents/chat" options={{ title: '' }} />
      <Stack.Screen name="agents/form" options={{ title: '', presentation: 'modal' }} />
      <Stack.Screen name="agents/knowledge" options={{ title: t('agents.knowledge.title') }} />
      <Stack.Screen name="agents/tools" options={{ title: t('agents.tools.title') }} />
      <Stack.Screen name="agents/connections" options={{ title: t('agents.connections.title') }} />
      <Stack.Screen name="agents/connection-form" options={{ title: '', presentation: 'modal' }} />
      <Stack.Screen name="assets/index" options={{ title: t('more.items.assets') }} />
      <Stack.Screen name="assets/[id]" options={{ title: '' }} />
      <Stack.Screen name="assets/form" options={{ title: '', presentation: 'modal' }} />
      <Stack.Screen name="assets/transaction" options={{ title: '', presentation: 'modal' }} />
      <Stack.Screen name="assets/value" options={{ title: '', presentation: 'modal' }} />
      <Stack.Screen name="assets/group" options={{ title: '', presentation: 'modal' }} />
      <Stack.Screen name="assets/transactions" options={{ title: t('assets.ledgerTitle') }} />
      <Stack.Screen name="assets/import" options={{ title: t('assets.import.title') }} />
      <Stack.Screen name="invoices/index" options={{ title: t('more.items.invoices') }} />
      <Stack.Screen name="invoices/[id]" options={{ title: '' }} />
      <Stack.Screen name="invoices/form" options={{ title: '', presentation: 'modal' }} />
      <Stack.Screen name="invoices/pay" options={{ title: t('invoices.pay.title'), presentation: 'modal' }} />
      <Stack.Screen name="invoices/deduct" options={{ title: t('invoices.deductions.title'), presentation: 'modal' }} />
      <Stack.Screen name="invoices/notes" options={{ title: t('invoices.notesEdit.title'), presentation: 'modal' }} />
      <Stack.Screen name="invoices/settings" options={{ title: t('invoices.settings.title') }} />
      <Stack.Screen name="invoices/schedules/index" options={{ title: t('invoices.schedules.entry') }} />
      <Stack.Screen name="invoices/schedules/[id]" options={{ title: '' }} />
      <Stack.Screen name="invoices/schedules/form" options={{ title: '', presentation: 'modal' }} />
      <Stack.Screen name="invoices/schedules/term" options={{ title: '', presentation: 'modal' }} />
      <Stack.Screen name="invoices/schedules/end" options={{ title: t('invoices.schedules.endTitle'), presentation: 'modal' }} />
      <Stack.Screen name="invoices/schedules/link" options={{ title: t('invoices.schedules.linkTitle'), presentation: 'modal' }} />
      <Stack.Screen name="export" options={{ title: t('more.items.export') }} />
      <Stack.Screen name="admin/index" options={{ title: t('more.items.admin') }} />
      <Stack.Screen name="admin/user" options={{ title: '', presentation: 'modal' }} />
    </Stack>
  )
}
