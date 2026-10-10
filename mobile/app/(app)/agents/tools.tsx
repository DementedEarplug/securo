import { useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { Screen } from '@/components/Screen'
import { SectionHeader } from '@/components/SectionHeader'
import { ErrorState, Loading } from '@/components/States'
import { SwitchField } from '@/components/SwitchField'
import { Text } from '@/components/Text'
import { useAgentTools, useSaveAgentTools } from '@/features/agents/hooks'
import { groupTools, toolKey, toolToggles } from '@/features/agents/manage'
import { toolLabel } from '@/features/agents/ToolChip'
import { useCanWrite } from '@/features/session/hooks'
import { showError } from '@/lib/confirm'
import { errorMessage } from '@/lib/errors'
import { spacing } from '@/theme'

/** Which of the server's tools this assistant may call. */
export default function ToolsScreen() {
  const { t } = useTranslation()
  const { id } = useLocalSearchParams<{ id: string }>()
  const canWrite = useCanWrite()
  const tools = useAgentTools(id)
  const save = useSaveAgentTools(id)
  // Local switches until saved, keyed by server.tool.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})

  if (tools.isPending) return <Loading />
  if (tools.isError) return <ErrorState error={tools.error} onRetry={() => tools.refetch()} />
  const list = tools.data.tools
  const dirty = list.some((tool) => (overrides[toolKey(tool)] ?? tool.enabled) !== tool.enabled)

  const submit = () =>
    save.mutate(toolToggles(list, overrides), {
      onSuccess: () => setOverrides({}),
      onError: (e) => showError(errorMessage(e, t) || t('agents.tools.saveFailed')),
    })

  return (
    <Screen>
      <Text tone="muted">{t('agents.tools.subtitle')}</Text>
      {list.length === 0 ? <Text tone="muted">{t('agents.tools.empty')}</Text> : null}
      {groupTools(list).map(([server, items]) => (
        <Card key={server} style={styles.group}>
          <SectionHeader title={server} />
          {items.map((tool) => (
            <SwitchField
              key={toolKey(tool)}
              label={tool.is_proposal ? `${toolLabel(tool.name)} · ${t('agents.tools.proposeBadge')}` : toolLabel(tool.name)}
              hint={tool.description}
              value={overrides[toolKey(tool)] ?? tool.enabled}
              disabled={!canWrite}
              onChange={(enabled) => setOverrides((o) => ({ ...o, [toolKey(tool)]: enabled }))}
            />
          ))}
        </Card>
      ))}
      {canWrite && list.length ? <Button label={t('common.save')} onPress={submit} loading={save.isPending} disabled={!dirty} /> : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
})
