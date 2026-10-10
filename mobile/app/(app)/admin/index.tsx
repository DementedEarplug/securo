import { router } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { ListRow } from '@/components/ListRow'
import { PickerField } from '@/components/PickerField'
import { Screen } from '@/components/Screen'
import { SegmentedControl } from '@/components/SegmentedControl'
import { SelectSheet } from '@/components/SelectSheet'
import { ErrorState, Loading } from '@/components/States'
import { SwitchField } from '@/components/SwitchField'
import { Text } from '@/components/Text'
import { TextField } from '@/components/TextField'
import {
  useAdminSetting,
  useAdminUsers,
  useLocalAuthEnabled,
  useRegistrationStatus,
  useSaveSetting,
  useTimezoneSetting,
} from '@/features/admin/hooks'
import {
  ACCOUNTING_MODES,
  DATE_FORMATS,
  effectiveSetting,
  isHexColor,
  NUMBER_FORMATS,
  savedTimezoneIsBroken,
  timezoneOptions,
  userSubtitleParts,
  type SettingKey,
} from '@/features/admin/model'
import { useMe } from '@/features/session/hooks'
import { showError } from '@/lib/confirm'
import { errorMessage } from '@/lib/errors'
import { radius, spacing, useColors } from '@/theme'

type Tab = 'users' | 'settings'

/** Instance administration, for superusers: people who can sign in, and app-wide settings. */
export default function AdminScreen() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('users')

  return (
    <Screen>
      <SegmentedControl<Tab>
        options={[
          { value: 'users', label: t('admin.tabs.users') },
          { value: 'settings', label: t('admin.tabs.settings') },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'users' ? <UsersTab /> : <SettingsTab />}
    </Screen>
  )
}

function UsersTab() {
  const { t } = useTranslation()
  const me = useMe().data
  const [search, setSearch] = useState('')
  const users = useAdminUsers(search)
  const localAuth = useLocalAuthEnabled()

  return (
    <>
      <TextField
        label={t('admin.users.search')}
        placeholder={t('admin.users.searchPlaceholder')}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
      />
      {localAuth ? (
        <Button label={t('admin.users.add')} variant="secondary" onPress={() => router.push('/admin/user')} />
      ) : (
        <Text variant="caption" tone="muted">
          {t('admin.users.ssoOnly')}
        </Text>
      )}
      {users.isPending ? (
        <Loading />
      ) : users.isError ? (
        <ErrorState error={users.error} onRetry={() => users.refetch()} />
      ) : users.data.items.length === 0 ? (
        <Text tone="muted">{t('admin.users.empty')}</Text>
      ) : (
        <>
          <Card style={styles.list}>
            {users.data.items.map((user) => (
              <ListRow
                key={user.id}
                title={user.email}
                subtitle={userSubtitleParts(user, me?.id)
                  .map((part) => t(`admin.users.${part}`))
                  .join(' · ')}
                onPress={() => router.push({ pathname: '/admin/user', params: { id: user.id } })}
                showChevron
              />
            ))}
          </Card>
          {users.data.total > users.data.items.length ? (
            <Text variant="caption" tone="muted">
              {t('admin.users.showing', { shown: users.data.items.length, total: users.data.total })}
            </Text>
          ) : null}
        </>
      )}
    </>
  )
}

function SettingsTab() {
  const { t } = useTranslation()
  const save = useSaveSetting()
  const registration = useRegistrationStatus()
  const accounting = useAdminSetting('credit_card_accounting_mode')
  const providerCategories = useAdminSetting('use_provider_categories')
  const numberFormat = useAdminSetting('number_format')
  const dateFormat = useAdminSetting('date_format')
  const [picking, setPicking] = useState<'number' | 'date' | 'timezone' | null>(null)

  const set = async (key: SettingKey, value: string | null) => {
    try {
      await save.mutateAsync({ key, value })
    } catch (e) {
      showError(errorMessage(e, t))
    }
  }

  const accountingMode = effectiveSetting('credit_card_accounting_mode', accounting.data) as (typeof ACCOUNTING_MODES)[number]
  const number = effectiveSetting('number_format', numberFormat.data) ?? 'auto'
  const date = effectiveSetting('date_format', dateFormat.data) ?? 'auto'
  const savingKey = save.isPending ? save.variables?.key : null

  return (
    <>
      <Card>
        <Text variant="heading">{t('admin.settings.registrationTitle')}</Text>
        <SwitchField
          label={t('admin.settings.registration')}
          hint={t('admin.settings.registrationDesc')}
          value={Boolean(registration.data?.enabled)}
          disabled={registration.isPending || savingKey === 'registration_enabled'}
          onChange={(on) => void set('registration_enabled', on ? 'true' : 'false')}
        />
      </Card>

      <Card>
        <Text variant="heading">{t('admin.settings.accountingTitle')}</Text>
        <Text variant="caption" tone="muted">
          {t('admin.settings.accountingSubtitle')}
        </Text>
        <SegmentedControl
          options={ACCOUNTING_MODES.map((value) => ({ value, label: t(`admin.settings.accounting.${value}`) }))}
          value={accounting.isPending ? null : accountingMode}
          onChange={(value) => {
            if (value !== accountingMode) void set('credit_card_accounting_mode', value)
          }}
        />
        <Text variant="caption" tone="muted">
          {t(`admin.settings.accounting.${accountingMode}Desc`)}
        </Text>
      </Card>

      <Card>
        <Text variant="heading">{t('admin.settings.providerCategoriesTitle')}</Text>
        <SwitchField
          label={t('admin.settings.providerCategories')}
          hint={t('admin.settings.providerCategoriesDesc')}
          value={effectiveSetting('use_provider_categories', providerCategories.data) !== 'false'}
          disabled={providerCategories.isPending || savingKey === 'use_provider_categories'}
          onChange={(on) => void set('use_provider_categories', on ? 'true' : 'false')}
        />
      </Card>

      <Card>
        <Text variant="heading">{t('admin.settings.formatsTitle')}</Text>
        <PickerField
          label={t('admin.settings.numberFormat')}
          value={t(`admin.settings.numberFormats.${number}`)}
          placeholder={t('admin.settings.numberFormat')}
          onPress={() => setPicking('number')}
        />
        <Text variant="caption" tone="muted">
          {t('admin.settings.numberFormatDesc')}
        </Text>
        <PickerField
          label={t('admin.settings.dateFormat')}
          value={t(`admin.settings.dateFormats.${date}`)}
          placeholder={t('admin.settings.dateFormat')}
          onPress={() => setPicking('date')}
        />
        <Text variant="caption" tone="muted">
          {t('admin.settings.dateFormatDesc')}
        </Text>
      </Card>

      <TimezoneCard picking={picking === 'timezone'} onPick={() => setPicking('timezone')} onClose={() => setPicking(null)} set={set} />

      <ThemeColorsCard />

      <SelectSheet
        visible={picking === 'number'}
        title={t('admin.settings.numberFormat')}
        options={NUMBER_FORMATS.map((value) => ({
          value,
          label: t(`admin.settings.numberFormats.${value}`),
          detail: t(`admin.settings.numberFormatHints.${value}`),
        }))}
        selected={number}
        onSelect={(value) => {
          setPicking(null)
          if (value && value !== number) void set('number_format', value)
        }}
        onClose={() => setPicking(null)}
      />
      <SelectSheet
        visible={picking === 'date'}
        title={t('admin.settings.dateFormat')}
        options={DATE_FORMATS.map((value) => ({
          value,
          label: t(`admin.settings.dateFormats.${value}`),
          detail: t(`admin.settings.dateFormatHints.${value}`),
        }))}
        selected={date}
        onSelect={(value) => {
          setPicking(null)
          if (value && value !== date) void set('date_format', value)
        }}
        onClose={() => setPicking(null)}
      />
    </>
  )
}

function TimezoneCard({
  picking,
  onPick,
  onClose,
  set,
}: {
  picking: boolean
  onPick: () => void
  onClose: () => void
  set: (key: SettingKey, value: string | null) => Promise<void>
}) {
  const { t } = useTranslation()
  const timezone = useTimezoneSetting()
  const setting = timezone.data
  const serverDefault = setting ? t('admin.settings.timezoneServerDefault', { zone: setting.fallback }) : ''

  return (
    <Card>
      <Text variant="heading">{t('admin.settings.timezoneTitle')}</Text>
      {timezone.isError ? (
        <Text tone="destructive">{errorMessage(timezone.error, t)}</Text>
      ) : (
        <PickerField
          label={t('admin.settings.timezone')}
          value={setting ? (setting.saved ?? serverDefault) : null}
          placeholder={t('admin.settings.timezone')}
          onPress={onPick}
        />
      )}
      {setting && savedTimezoneIsBroken(setting) ? (
        <Text variant="caption" tone="destructive">
          {t('admin.settings.timezoneSavedInvalid', { value: setting.saved, zone: setting.timezone })}
        </Text>
      ) : null}
      <Text variant="caption" tone="muted">
        {t('admin.settings.timezoneHelp')}
      </Text>
      {setting ? (
        <SelectSheet
          visible={picking}
          title={t('admin.settings.timezone')}
          options={timezoneOptions(setting).map((zone) => ({ value: zone, label: zone }))}
          selected={setting.saved ?? null}
          noneLabel={serverDefault}
          onSelect={(value) => {
            onClose()
            if (value !== (setting.saved ?? null)) void set('timezone', value)
          }}
          onClose={onClose}
        />
      ) : null}
    </Card>
  )
}

/** The web app's accent colours (the app itself keeps its own palette). */
function ThemeColorsCard() {
  const light = useAdminSetting('theme_color_light')
  const dark = useAdminSetting('theme_color_dark')
  if (light.isPending || dark.isPending) {
    return (
      <Card>
        <ActivityIndicator />
      </Card>
    )
  }
  // Remount when the saved values change so the fields start from them.
  return <ThemeColorsForm key={`${light.data}|${dark.data}`} light={light.data ?? ''} dark={dark.data ?? ''} />
}

function ThemeColorsForm({ light, dark }: { light: string; dark: string }) {
  const { t } = useTranslation()
  const save = useSaveSetting()
  const [values, setValues] = useState({ light, dark })
  const [error, setError] = useState<string | null>(null)
  const changed = values.light !== light || values.dark !== dark

  const submit = async () => {
    setError(null)
    if (!isHexColor(values.light) || !isHexColor(values.dark)) {
      setError(t('admin.settings.colorInvalid'))
      return
    }
    try {
      await Promise.all([
        save.mutateAsync({ key: 'theme_color_light', value: values.light }),
        save.mutateAsync({ key: 'theme_color_dark', value: values.dark }),
      ])
    } catch (e) {
      showError(errorMessage(e, t))
    }
  }

  return (
    <Card>
      <Text variant="heading">{t('admin.settings.colorsTitle')}</Text>
      <Text variant="caption" tone="muted">
        {t('admin.settings.colorsDesc')}
      </Text>
      <ColorInput label={t('admin.settings.lightMode')} value={values.light} onChange={(v) => setValues((s) => ({ ...s, light: v }))} />
      <ColorInput label={t('admin.settings.darkMode')} value={values.dark} onChange={(v) => setValues((s) => ({ ...s, dark: v }))} />
      {error ? <Text tone="destructive">{error}</Text> : null}
      <Button label={t('common.save')} variant="secondary" onPress={() => void submit()} loading={save.isPending} disabled={!changed} />
    </Card>
  )
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const colors = useColors()
  return (
    <View style={styles.colorRow}>
      <View style={styles.flex}>
        <TextField label={label} value={value} onChangeText={onChange} placeholder="#4F46E5" autoCapitalize="none" autoCorrect={false} maxLength={7} />
      </View>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={[styles.swatch, { borderColor: colors.border, backgroundColor: isHexColor(value) ? value : 'transparent' }]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  list: { padding: 0, overflow: 'hidden' },
  colorRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  flex: { flex: 1 },
  swatch: { width: 48, height: 48, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
})
