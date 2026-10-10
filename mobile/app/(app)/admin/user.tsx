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
import { useCurrencies } from '@/features/accounts/hooks'
import { useAdminUser, useCreateUser, useDeleteUser, useLocalAuthEnabled, useUpdateUser } from '@/features/admin/hooks'
import {
  MAX_PASSWORD,
  toUserCreate,
  toUserUpdate,
  USER_LANGUAGES,
  validateUserForm,
  type AdminUser,
  type UserFormErrors,
  type UserFormValues,
} from '@/features/admin/model'
import { useDisplayFormat, useMe } from '@/features/session/hooks'
import { confirmDestructive } from '@/lib/confirm'
import { errorMessage } from '@/lib/errors'
import { spacing } from '@/theme'

/** Add a user, or edit one (`?id=`). */
export default function AdminUserScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const user = useAdminUser(id ?? '')
  if (id && user.isPending) return <Loading />
  if (id && user.isError) return <ErrorState error={user.error} onRetry={() => user.refetch()} />
  return <UserForm user={id ? user.data : undefined} />
}

function UserForm({ user }: { user?: AdminUser }) {
  const { t, i18n } = useTranslation()
  const me = useMe().data
  const { currency } = useDisplayFormat()
  const currencies = useCurrencies().data ?? []
  const localAuth = useLocalAuthEnabled()
  const create = useCreateUser()
  const update = useUpdateUser(user?.id ?? '')
  const remove = useDeleteUser()
  const isSelf = Boolean(user && user.id === me?.id)

  const [values, setValues] = useState<UserFormValues>(() => ({
    email: user?.email ?? '',
    password: '',
    isActive: user?.is_active ?? true,
    isSuperuser: user?.is_superuser ?? false,
    language: USER_LANGUAGES.some((l) => l.code === i18n.language) ? i18n.language : 'en',
    // New users follow the display currency the admin is using, as on the web.
    currency,
  }))
  const [errors, setErrors] = useState<UserFormErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [picking, setPicking] = useState<'language' | 'currency' | null>(null)
  const [showPassword, setShowPassword] = useState(!user)
  const saving = create.isPending || update.isPending

  const set = (patch: Partial<UserFormValues>) => {
    setValues((v) => ({ ...v, ...patch }))
    setErrors({})
    setError(null)
  }

  const submit = async () => {
    const problems = validateUserForm(values, !user)
    setErrors(problems)
    if (Object.keys(problems).length) return
    try {
      if (user) {
        const patch = toUserUpdate(user, values)
        if (patch) await update.mutateAsync(patch)
      } else {
        await create.mutateAsync(toUserCreate(values))
      }
      router.back()
    } catch (e) {
      setError(errorMessage(e, t))
    }
  }

  const confirmDelete = async () => {
    if (!user) return
    if (!(await confirmDestructive(t('admin.users.deleteTitle'), t('admin.users.deleteBody', { email: user.email })))) return
    try {
      await remove.mutateAsync(user.id)
      router.back()
    } catch (e) {
      setError(errorMessage(e, t))
    }
  }

  const languageLabel = USER_LANGUAGES.find((l) => l.code === values.language)?.label ?? values.language

  return (
    <Screen>
      <Stack.Screen options={{ title: user ? t('admin.users.edit') : t('admin.users.add') }} />
      {user ? null : (
        <Text variant="caption" tone="muted">
          {t('admin.users.addDesc')}
        </Text>
      )}
      <TextField
        label={t('admin.users.email')}
        value={values.email}
        onChangeText={(email) => set({ email })}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        placeholder="user@example.com"
        error={errors.email ? t(errors.email) : null}
      />

      {localAuth ? (
        showPassword ? (
          <TextField
            label={user ? t('admin.users.newPassword') : t('admin.users.password')}
            value={values.password}
            onChangeText={(password) => set({ password })}
            placeholder={user ? t('admin.users.resetPasswordPlaceholder') : undefined}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            maxLength={MAX_PASSWORD}
            error={errors.password ? t(errors.password, { min: 8, max: MAX_PASSWORD }) : null}
          />
        ) : (
          <Button label={t('admin.users.resetPassword')} variant="secondary" onPress={() => setShowPassword(true)} />
        )
      ) : null}

      {user ? null : (
        <View style={styles.group}>
          <PickerField label={t('admin.users.language')} value={languageLabel} placeholder={t('admin.users.language')} onPress={() => setPicking('language')} />
          <PickerField label={t('admin.users.currency')} value={values.currency} placeholder={t('admin.users.currency')} onPress={() => setPicking('currency')} />
        </View>
      )}

      {user ? (
        <SwitchField
          label={t('admin.users.active')}
          hint={isSelf ? t('admin.users.selfLocked') : t('admin.users.activeHint')}
          value={values.isActive}
          disabled={isSelf}
          onChange={(isActive) => set({ isActive })}
        />
      ) : null}
      <SwitchField
        label={t('admin.users.adminRole')}
        hint={isSelf ? t('admin.users.selfLocked') : t('admin.users.adminRoleHint')}
        value={values.isSuperuser}
        disabled={isSelf}
        onChange={(isSuperuser) => set({ isSuperuser })}
      />

      {error ? <Text tone="destructive">{error}</Text> : null}
      <Button label={t('common.save')} onPress={() => void submit()} loading={saving} />
      {user && !isSelf ? (
        <Button label={t('admin.users.delete')} variant="destructive" onPress={() => void confirmDelete()} loading={remove.isPending} />
      ) : null}

      <SelectSheet
        visible={picking === 'language'}
        title={t('admin.users.language')}
        options={USER_LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
        selected={values.language}
        onSelect={(language) => {
          if (language) set({ language })
          setPicking(null)
        }}
        onClose={() => setPicking(null)}
      />
      <SelectSheet
        visible={picking === 'currency'}
        title={t('admin.users.currency')}
        options={currencies.map((c) => ({ value: c.code, label: `${c.flag ?? ''} ${c.code}`.trim(), detail: c.name }))}
        selected={values.currency}
        onSelect={(code) => {
          if (code) set({ currency: code })
          setPicking(null)
        }}
        onClose={() => setPicking(null)}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  group: { gap: spacing.md },
})
