import { router } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, StyleSheet, Switch, View } from 'react-native'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { Fab } from '@/components/Fab'
import { ListRow } from '@/components/ListRow'
import { Screen } from '@/components/Screen'
import { SelectSheet } from '@/components/SelectSheet'
import { EmptyState, ErrorState, Loading } from '@/components/States'
import { useApplyAllRules, useInstallPack, useRulePacks, useRules, useSaveRule } from '@/features/rules/hooks'
import { useCanWrite } from '@/features/session/hooks'
import { confirmDestructive } from '@/lib/confirm'
import { errorMessage } from '@/lib/errors'
import { useColors } from '@/theme'

export default function RulesScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const canWrite = useCanWrite()
  const rules = useRules()
  const packs = useRulePacks()
  const save = useSaveRule()
  const applyAll = useApplyAllRules()
  const install = useInstallPack()
  const [choosingPack, setChoosingPack] = useState(false)

  if (rules.isPending) return <Loading />
  if (rules.isError) return <ErrorState error={rules.error} onRetry={() => rules.refetch()} />

  const runApplyAll = async () => {
    if (!(await confirmDestructive(t('rules.applyAllTitle'), t('rules.applyAllBody'), t('rules.applyAll')))) return
    try {
      const result = await applyAll.mutateAsync(undefined)
      Alert.alert(t('rules.appliedTitle'), t('rules.appliedBody', { count: result.applied ?? 0 }))
    } catch (e) {
      Alert.alert(t('common.errorTitle'), errorMessage(e, t))
    }
  }

  const installPack = async (code: string) => {
    setChoosingPack(false)
    try {
      const result = await install.mutateAsync(code)
      Alert.alert(t('rules.installedTitle'), t('rules.installedBody', { count: result.installed }))
    } catch (e) {
      Alert.alert(t('common.errorTitle'), errorMessage(e, t))
    }
  }

  const sorted = [...rules.data].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name))
  return (
    <View style={styles.root}>
      <Screen onRefresh={() => rules.refetch()} refreshing={rules.isRefetching}>
        {canWrite ? (
          <View style={styles.actions}>
            <Button label={t('rules.applyAll')} variant="secondary" onPress={runApplyAll} loading={applyAll.isPending} />
            {(packs.data ?? []).some((p) => !p.installed) ? (
              <Button label={t('rules.installPack')} variant="ghost" onPress={() => setChoosingPack(true)} loading={install.isPending} />
            ) : null}
          </View>
        ) : null}
        {sorted.length === 0 ? (
          <EmptyState title={t('rules.emptyTitle')} body={t('rules.emptyBody')} />
        ) : (
          <Card style={styles.list}>
            {sorted.map((rule) => (
              <ListRow
                key={rule.id}
                title={rule.name}
                subtitle={`${t('rules.conditionCount', { count: rule.conditions.length })} · ${t('rules.actionCount', { count: rule.actions.length })}`}
                onPress={canWrite ? () => router.push({ pathname: '/rules/form', params: { id: rule.id } }) : undefined}
                trailing={
                  <Switch
                    accessibilityLabel={t('rules.activeFor', { name: rule.name })}
                    value={rule.is_active}
                    disabled={!canWrite}
                    // Toggling doesn't re-run the rule over history (as on the web).
                    onValueChange={(is_active) => save.mutate({ id: rule.id, body: { is_active, apply_to_existing: false } })}
                    trackColor={{ true: colors.primary, false: colors.muted }}
                  />
                }
              />
            ))}
          </Card>
        )}
        <View style={styles.fabSpace} />
      </Screen>
      {canWrite ? <Fab label={t('rules.newTitle')} onPress={() => router.push('/rules/form')} /> : null}
      <SelectSheet
        visible={choosingPack}
        title={t('rules.installPack')}
        options={(packs.data ?? []).filter((p) => !p.installed).map((p) => ({ value: p.code, label: `${p.flag ?? ''} ${p.name}`.trim(), detail: t('rules.packCount', { count: p.rule_count }) }))}
        selected={null}
        onSelect={(code) => code && void installPack(code)}
        onClose={() => setChoosingPack(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  actions: { gap: 4 },
  list: { padding: 0, overflow: 'hidden' },
  fabSpace: { height: 72 },
})
