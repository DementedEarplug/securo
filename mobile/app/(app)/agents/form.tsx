import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { PickerField } from '@/components/PickerField'
import { Screen } from '@/components/Screen'
import { SelectSheet } from '@/components/SelectSheet'
import { ErrorState, Loading } from '@/components/States'
import { SwitchField } from '@/components/SwitchField'
import { Text } from '@/components/Text'
import { TextField } from '@/components/TextField'
import { useAgent, useDeleteAgent, useLlmConnections, useSaveAgent } from '@/features/agents/hooks'
import { agentFormValues, toAgentPayload, type AgentFormErrors, type AgentFormValues } from '@/features/agents/manage'
import type { Agent, LlmConnection } from '@/features/agents/types'
import { confirmDestructive, showError } from '@/lib/confirm'
import { errorMessage } from '@/lib/errors'
import { spacing } from '@/theme'

/** Create an assistant, or edit / archive / delete one (`?id=`). */
export default function AgentFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const agent = useAgent(id ?? '')
  const connections = useLlmConnections()
  if ((id && agent.isPending) || connections.isPending) return <Loading />
  if (id && agent.isError) return <ErrorState error={agent.error} onRetry={() => agent.refetch()} />
  if (connections.isError) return <ErrorState error={connections.error} onRetry={() => connections.refetch()} />
  return <AgentForm agent={id ? agent.data : undefined} connections={connections.data} />
}

function AgentForm({ agent, connections }: { agent?: Agent; connections: LlmConnection[] }) {
  const { t } = useTranslation()
  const save = useSaveAgent()
  const remove = useDeleteAgent()
  const [values, setValues] = useState<AgentFormValues>(() => agentFormValues(agent, connections))
  const [errors, setErrors] = useState<AgentFormErrors>({})
  const [picking, setPicking] = useState(false)
  const set = (patch: Partial<AgentFormValues>) => setValues((v) => ({ ...v, ...patch }))
  const message = (key?: string) => (key ? t(key) : null)
  const selected = connections.find((c) => c.id === values.connectionId)

  const submit = () => {
    const result = toAgentPayload(values)
    if ('errors' in result) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    save.mutate(
      { id: agent?.id, body: result.payload },
      {
        onSuccess: (saved) => {
          if (agent || !saved) router.back()
          else router.replace({ pathname: '/agents/[id]', params: { id: saved.id } })
        },
        onError: (e) => showError(errorMessage(e, t)),
      },
    )
  }

  const toggleArchived = () =>
    agent &&
    save.mutate(
      { id: agent.id, body: { is_archived: !agent.is_archived } },
      { onSuccess: () => router.back(), onError: (e) => showError(errorMessage(e, t)) },
    )

  const confirmDelete = async () => {
    if (!agent || !(await confirmDestructive(t('agents.form.deleteTitle'), t('agents.form.deleteConfirm')))) return
    remove.mutate(agent.id, {
      onSuccess: () => router.dismissTo('/agents'),
      onError: (e) => showError(errorMessage(e, t)),
    })
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: agent ? t('agents.form.editTitle') : t('agents.form.createTitle') }} />
      <TextField
        label={t('agents.form.name')}
        value={values.name}
        onChangeText={(name) => set({ name })}
        placeholder={t('agents.form.namePlaceholder')}
        error={message(errors.name)}
      />
      <TextField
        label={t('agents.form.description')}
        value={values.description}
        onChangeText={(description) => set({ description })}
        placeholder={t('agents.form.descriptionPlaceholder')}
      />
      <TextField
        label={t('agents.form.systemPrompt')}
        value={values.systemPrompt}
        onChangeText={(systemPrompt) => set({ systemPrompt })}
        placeholder={t('agents.form.systemPromptPlaceholder')}
        multiline
        style={styles.prompt}
      />

      {connections.length === 0 ? (
        <Card>
          <Text variant="label">{t('agents.form.needConnectionTitle')}</Text>
          <Text variant="caption" tone="muted">
            {t('agents.form.needConnectionHint')}
          </Text>
          <Button label={t('agents.form.goToConnections')} variant="secondary" onPress={() => router.push('/agents/connections')} />
        </Card>
      ) : (
        <View style={styles.group}>
          <PickerField
            label={t('agents.form.connection')}
            value={selected ? `${selected.name} (${selected.kind})` : null}
            placeholder={t('agents.form.connectionPlaceholder')}
            onPress={() => setPicking(true)}
            error={message(errors.connectionId)}
          />
          <Button label={t('agents.form.manageConnections')} variant="ghost" onPress={() => router.push('/agents/connections')} />
          <TextField
            label={t('agents.form.model')}
            value={values.model}
            onChangeText={(model) => set({ model })}
            placeholder={selected?.default_model || t('agents.form.modelPlaceholder')}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {!values.model && selected?.default_model ? (
            <Text variant="caption" tone="muted">
              {t('agents.form.willUseConnectionDefault', { model: selected.default_model })}
            </Text>
          ) : null}
        </View>
      )}

      <TextField
        label={t('agents.form.temperature')}
        value={values.temperature}
        onChangeText={(temperature) => set({ temperature })}
        keyboardType="decimal-pad"
        error={message(errors.temperature)}
      />
      <SwitchField
        label={t('agents.form.autoContext')}
        hint={t('agents.form.autoContextHint')}
        value={values.autoContext}
        onChange={(autoContext) => set({ autoContext })}
      />
      <SwitchField
        label={t('agents.form.isDefault')}
        hint={t('agents.form.isDefaultHint')}
        value={values.isDefault}
        onChange={(isDefault) => set({ isDefault })}
      />
      <Button
        label={agent ? t('common.save') : t('agents.form.create')}
        onPress={submit}
        loading={save.isPending}
        disabled={connections.length === 0}
      />
      {agent ? (
        <>
          <Button
            label={agent.is_archived ? t('agents.form.unarchive') : t('agents.form.archive')}
            variant="secondary"
            onPress={toggleArchived}
          />
          <Button label={t('agents.form.deleteTitle')} variant="destructive" onPress={() => void confirmDelete()} loading={remove.isPending} />
        </>
      ) : null}

      <SelectSheet
        visible={picking}
        title={t('agents.form.connection')}
        options={connections.map((c) => ({ value: c.id, label: c.name, detail: [c.kind, c.default_model].filter(Boolean).join(' · ') }))}
        selected={values.connectionId || null}
        onSelect={(connectionId) => {
          if (connectionId) set({ connectionId })
          setPicking(false)
        }}
        onClose={() => setPicking(false)}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  prompt: { minHeight: 140, paddingTop: spacing.md, textAlignVertical: 'top', fontFamily: 'monospace' },
})
