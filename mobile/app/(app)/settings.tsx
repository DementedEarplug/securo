import { router } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, StyleSheet } from 'react-native'

import { saveLanguage } from '@/auth/storage'
import { session } from '@/auth/session'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { ListRow } from '@/components/ListRow'
import { Screen } from '@/components/Screen'
import { SelectSheet } from '@/components/SelectSheet'
import { useCurrentWorkspace, useMe, useSession } from '@/features/session/hooks'
import i18n, { deviceLanguage, LANGUAGES, supportedLanguage } from '@/i18n'

export default function SettingsScreen() {
  const { t } = useTranslation()
  const { serverUrl } = useSession()
  const me = useMe().data
  const workspace = useCurrentWorkspace()
  const [choosingLanguage, setChoosingLanguage] = useState(false)

  const setLanguage = async (language: string | null) => {
    setChoosingLanguage(false)
    await saveLanguage(language)
    const accountLanguage = supportedLanguage(me?.preferences?.language as string | undefined)
    await i18n.changeLanguage(language ?? accountLanguage ?? deviceLanguage())
  }

  const confirmSignOut = () =>
    Alert.alert(t('settings.signOutTitle'), t('settings.signOutBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.signOut'), style: 'destructive', onPress: () => void session.signOut({ revoke: true }) },
    ])

  return (
    <Screen>
      <Card style={styles.list}>
        <ListRow title={t('settings.signedInAs')} subtitle={me?.email} />
        <ListRow title={t('settings.server')} subtitle={serverUrl} />
        <ListRow
          title={t('settings.workspace')}
          subtitle={workspace?.name}
          onPress={() => router.push('/workspaces')}
          showChevron
        />
        <ListRow
          title={t('settings.language')}
          subtitle={t(`settings.languages.${i18n.language}`, { defaultValue: i18n.language })}
          onPress={() => setChoosingLanguage(true)}
          showChevron
        />
        <ListRow title={t('settings.devices')} subtitle={t('settings.devicesHint')} onPress={() => router.push('/sessions')} showChevron />
      </Card>
      <Button label={t('settings.signOut')} variant="destructive" onPress={confirmSignOut} />
      <SelectSheet
        visible={choosingLanguage}
        title={t('settings.language')}
        options={LANGUAGES.map((language) => ({ value: language, label: t(`settings.languages.${language}`) }))}
        selected={i18n.language}
        noneLabel={t('settings.languageAuto')}
        onSelect={setLanguage}
        onClose={() => setChoosingLanguage(false)}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  list: { padding: 0, overflow: 'hidden' },
})
