import { zodResolver } from '@hookform/resolvers/zod'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import type { Account } from '@/api/types'
import { Button } from '@/components/Button'
import { DateField } from '@/components/DateField'
import { PickerField } from '@/components/PickerField'
import { Screen } from '@/components/Screen'
import { SelectSheet } from '@/components/SelectSheet'
import { ErrorState, Loading } from '@/components/States'
import { Text } from '@/components/Text'
import { TextField } from '@/components/TextField'
import {
  ACCOUNT_TYPES,
  accountFormSchema,
  accountValuesFrom,
  emptyAccountValues,
  toAccountCreate,
  toAccountUpdate,
  type AccountFormValues,
} from '@/features/accounts/form'
import { useAccount, useCreateAccount, useCurrencies, useUpdateAccount } from '@/features/accounts/hooks'
import { useDisplayFormat } from '@/features/session/hooks'
import { errorMessage } from '@/lib/errors'
import { spacing } from '@/theme'

/** Add an account, or edit one (`?id=`). */
export default function AccountFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const account = useAccount(id ?? '')
  if (id && account.isPending) return <Loading />
  if (id && account.isError) return <ErrorState error={account.error} onRetry={() => account.refetch()} />
  return <AccountForm account={id ? account.data : undefined} />
}

function AccountForm({ account }: { account?: Account }) {
  const { t } = useTranslation()
  const { locale, currency } = useDisplayFormat()
  const currencies = useCurrencies().data ?? []
  const create = useCreateAccount()
  const update = useUpdateAccount(account?.id ?? '')
  const connected = Boolean(account?.connection_id)
  const [picking, setPicking] = useState<'type' | 'currency' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { control, handleSubmit, formState } = useForm<AccountFormValues>({
    defaultValues: account ? accountValuesFrom(account, locale) : emptyAccountValues(currency),
    resolver: zodResolver(accountFormSchema(locale, { connected })),
  })
  const type = useWatch({ control, name: 'type' })
  const message = (key?: string) => (key ? t(key) : null)

  const submit = handleSubmit(async (values) => {
    setError(null)
    try {
      if (account) {
        await update.mutateAsync(toAccountUpdate(values, locale, { connected }))
        router.back()
      } else {
        const created = await create.mutateAsync(toAccountCreate(values, locale))
        router.replace({ pathname: '/account/[id]', params: { id: created.id } })
      }
    } catch (e) {
      setError(errorMessage(e, t))
    }
  })

  return (
    <Screen>
      <Stack.Screen options={{ title: account ? t('accounts.form.editTitle') : t('accounts.form.newTitle') }} />
      {connected ? (
        <Text variant="caption" tone="muted">
          {t('accounts.form.connectedNotice')}
        </Text>
      ) : null}

      {connected ? (
        <Controller
          control={control}
          name="displayName"
          render={({ field }) => (
            <TextField label={t('accounts.form.displayName')} value={field.value} onChangeText={field.onChange} placeholder={account?.name} />
          )}
        />
      ) : (
        <Controller
          control={control}
          name="name"
          render={({ field, fieldState }) => (
            <TextField label={t('accounts.form.name')} value={field.value} onChangeText={field.onChange} error={message(fieldState.error?.message)} />
          )}
        />
      )}

      <Controller
        control={control}
        name="type"
        render={({ field }) => (
          <>
            <PickerField
              label={t('accounts.form.type')}
              value={t(`accountTypes.${field.value}`, { defaultValue: field.value })}
              placeholder={t('accounts.form.type')}
              onPress={() => setPicking('type')}
            />
            <SelectSheet
              visible={picking === 'type'}
              title={t('accounts.form.type')}
              options={ACCOUNT_TYPES.map((value) => ({ value, label: t(`accountTypes.${value}`) }))}
              selected={field.value}
              onSelect={(value) => {
                if (value) field.onChange(value)
                setPicking(null)
              }}
              onClose={() => setPicking(null)}
            />
          </>
        )}
      />

      {account ? null : (
        <Controller
          control={control}
          name="currency"
          render={({ field }) => (
            <>
              <PickerField
                label={t('accounts.form.currency')}
                value={field.value}
                placeholder={t('accounts.form.currency')}
                onPress={() => setPicking('currency')}
              />
              <SelectSheet
                visible={picking === 'currency'}
                title={t('accounts.form.currency')}
                options={currencies.map((c) => ({ value: c.code, label: `${c.flag ?? ''} ${c.code}`.trim(), detail: c.name }))}
                selected={field.value}
                onSelect={(value) => {
                  if (value) field.onChange(value)
                  setPicking(null)
                }}
                onClose={() => setPicking(null)}
              />
            </>
          )}
        />
      )}

      {connected ? null : (
        <View style={styles.group}>
          <Controller
            control={control}
            name="balance"
            render={({ field, fieldState }) => (
              <TextField
                label={type === 'credit_card' ? t('accounts.form.amountOwed') : t('accounts.form.openingBalance')}
                value={field.value}
                onChangeText={field.onChange}
                keyboardType="numbers-and-punctuation"
                placeholder="0"
                error={message(fieldState.error?.message)}
              />
            )}
          />
          <Text variant="caption" tone="muted">
            {type === 'credit_card' ? t('accounts.form.amountOwedHint') : t('accounts.form.openingBalanceHint')}
          </Text>
          <Controller
            control={control}
            name="balanceDate"
            render={({ field }) => <DateField label={t('accounts.form.balanceDate')} value={field.value} onChange={field.onChange} />}
          />
        </View>
      )}

      {type === 'credit_card' ? (
        <View style={styles.group}>
          <Controller
            control={control}
            name="creditLimit"
            render={({ field, fieldState }) => (
              <TextField label={t('accounts.form.creditLimit')} value={field.value} onChangeText={field.onChange} keyboardType="decimal-pad" error={message(fieldState.error?.message)} />
            )}
          />
          <View style={styles.row}>
            <View style={styles.flex}>
              <Controller
                control={control}
                name="statementCloseDay"
                render={({ field, fieldState }) => (
                  <TextField label={t('accounts.form.closeDay')} value={field.value} onChangeText={field.onChange} keyboardType="number-pad" maxLength={2} error={message(fieldState.error?.message)} />
                )}
              />
            </View>
            <View style={styles.flex}>
              <Controller
                control={control}
                name="paymentDueDay"
                render={({ field, fieldState }) => (
                  <TextField label={t('accounts.form.dueDay')} value={field.value} onChangeText={field.onChange} keyboardType="number-pad" maxLength={2} error={message(fieldState.error?.message)} />
                )}
              />
            </View>
          </View>
        </View>
      ) : null}

      {error ? <Text tone="destructive">{error}</Text> : null}
      <Button label={t('common.save')} onPress={submit} loading={formState.isSubmitting} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  group: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
})
