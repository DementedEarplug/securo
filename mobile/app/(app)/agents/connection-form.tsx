import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { Button } from '@/components/Button'
import { PickerField } from '@/components/PickerField'
import { Screen } from '@/components/Screen'
import { SelectSheet } from '@/components/SelectSheet'
import { ErrorState, Loading } from '@/components/States'
import { SwitchField } from '@/components/SwitchField'
import { Text } from '@/components/Text'
import { TextField } from '@/components/TextField'
import { useLlmConnections, useSaveConnection } from '@/features/agents/hooks'
import {
  CONNECTION_KIND_ORDER,
  CONNECTION_KINDS,
  connectionFormValues,
  toConnectionPayload,
  type ConnectionFormValues,
} from '@/features/agents/manage'
import type { LlmConnection, LlmConnectionKind } from '@/features/agents/types'
import { showError } from '@/lib/confirm'
import { errorMessage } from '@/lib/errors'
import { spacing } from '@/theme'

/** Add an LLM connection, or edit one (`?id=`). */
export default function ConnectionFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const connections = useLlmConnections()
  if (connections.isPending) return <Loading />
  if (connections.isError) return <ErrorState error={connections.error} onRetry={() => connections.refetch()} />
  const connection = id ? connections.data.find((c) => c.id === id) : undefined
  return <ConnectionForm key={connection?.id ?? 'new'} connection={connection} />
}

function ConnectionForm({ connection }: { connection?: LlmConnection }) {
  const { t } = useTranslation()
  const save = useSaveConnection()
  const isEdit = Boolean(connection)
  const [values, setValues] = useState<ConnectionFormValues>(() => connectionFormValues(connection))
  // Until the user types a model, switching kinds offers that kind's default.
  const [modelTouched, setModelTouched] = useState(isEdit)
  const [errors, setErrors] = useState<Partial<Record<'name' | 'baseUrl', string>>>({})
  const [picking, setPicking] = useState(false)
  const set = (patch: Partial<ConnectionFormValues>) => setValues((v) => ({ ...v, ...patch }))
  const meta = CONNECTION_KINDS[values.kind]
  const message = (key?: string) => (key ? t(key) : null)
  const optional = (label: string, isOptional: boolean) => (isOptional ? `${label} (${t('agents.connections.optional')})` : label)

  const changeKind = (kind: LlmConnectionKind) =>
    set(modelTouched ? { kind } : { kind, defaultModel: CONNECTION_KINDS[kind].defaultModel ?? '' })

  const submit = () => {
    const result = toConnectionPayload(values, isEdit)
    if ('errors' in result) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    save.mutate(
      { id: connection?.id, body: result.payload },
      { onSuccess: () => router.back(), onError: (e) => showError(errorMessage(e, t) || t('agents.connections.saveFailed')) },
    )
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: isEdit ? t('agents.connections.editTitle') : t('agents.connections.createTitle') }} />
      <TextField
        label={t('agents.connections.name')}
        value={values.name}
        onChangeText={(name) => set({ name })}
        placeholder={t('agents.connections.namePlaceholder')}
        error={message(errors.name)}
      />
      <PickerField
        label={t('agents.connections.kind')}
        value={meta.label}
        placeholder={t('agents.connections.kind')}
        // The server can't change a connection's kind after creation.
        onPress={() => (isEdit ? undefined : setPicking(true))}
      />
      <View style={styles.group}>
        <TextField
          label={optional(t('agents.connections.baseUrl'), !meta.needsBaseUrl)}
          value={values.baseUrl}
          onChangeText={(baseUrl) => set({ baseUrl })}
          placeholder={meta.urlHint || t('agents.connections.baseUrlPlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          error={message(errors.baseUrl)}
        />
        {values.kind === 'ollama' || values.kind === 'openai_compatible' ? (
          <Text variant="caption" tone="muted">
            {values.kind === 'ollama' ? t('agents.connections.ollamaHint') : t('agents.connections.openaiCompatHint')}
          </Text>
        ) : null}
      </View>
      <View style={styles.group}>
        <TextField
          label={optional(t('agents.connections.apiKey'), !meta.needsKey)}
          value={values.apiKey}
          onChangeText={(apiKey) => set({ apiKey, keyTouched: true })}
          placeholder={
            isEdit && connection?.has_api_key ? t('agents.connections.apiKeyPlaceholderEdit') : t('agents.connections.apiKeyPlaceholder')
          }
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text variant="caption" tone="muted">
          {t('agents.connections.apiKeyHint')}
        </Text>
      </View>
      <TextField
        label={t('agents.connections.defaultModel')}
        value={values.defaultModel}
        onChangeText={(defaultModel) => {
          setModelTouched(true)
          set({ defaultModel })
        }}
        placeholder={meta.modelHint}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <SwitchField label={t('agents.connections.setAsDefault')} value={values.isDefault} onChange={(isDefault) => set({ isDefault })} />
      <Button label={isEdit ? t('common.save') : t('agents.connections.create')} onPress={submit} loading={save.isPending} />
      <SelectSheet
        visible={picking}
        title={t('agents.connections.kind')}
        options={CONNECTION_KIND_ORDER.map((kind) => ({
          value: kind,
          label: CONNECTION_KINDS[kind].label,
          detail: kind === 'openai_compatible' ? t('agents.connections.openaiCompatDetail') : null,
        }))}
        selected={values.kind}
        onSelect={(kind) => {
          if (kind) changeKind(kind as LlmConnectionKind)
          setPicking(false)
        }}
        onClose={() => setPicking(false)}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  group: { gap: spacing.xs },
})
