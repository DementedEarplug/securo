import * as ImagePicker from 'expo-image-picker'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Image, StyleSheet, View } from 'react-native'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { Screen } from '@/components/Screen'
import { SectionHeader } from '@/components/SectionHeader'
import { SegmentedControl } from '@/components/SegmentedControl'
import { ErrorState, Loading } from '@/components/States'
import { Text } from '@/components/Text'
import { TextField } from '@/components/TextField'
import {
  useInvoiceSettings,
  useIssuer,
  useLogoUri,
  useRemoveLogo,
  useTaxIdKinds,
  useUpdateInvoiceSettings,
  useUpdateIssuer,
  useUploadLogo,
  type IssuerProfile,
} from '@/features/invoices/hooks'
import { invoiceErrorMessage, type InvoiceSettings } from '@/features/invoices/model'
import { settingsPatch, EDITABLE_LABELS, isHexColor, logoFilename, type SettingsValues } from '@/features/invoices/settings'
import { showError } from '@/lib/confirm'
import { radius, spacing, useColors } from '@/theme'

/** How invoicing behaves here, and how the document looks (the web's settings dialog). */
export default function InvoiceSettingsScreen() {
  const settings = useInvoiceSettings()
  const issuer = useIssuer()
  if (settings.isPending || issuer.isPending) return <Loading />
  if (settings.isError) return <ErrorState error={settings.error} onRetry={() => settings.refetch()} />
  if (issuer.isError) return <ErrorState error={issuer.error} onRetry={() => issuer.refetch()} />
  return (
    <Screen>
      <SettingsForm settings={settings.data} />
      <IssuerForm issuer={issuer.data} />
    </Screen>
  )
}

function SettingsForm({ settings }: { settings: InvoiceSettings }) {
  const { t } = useTranslation()
  const colors = useColors()
  const save = useUpdateInvoiceSettings()
  const upload = useUploadLogo()
  const removeLogo = useRemoveLogo()
  const logo = useLogoUri(settings.logo_id)
  const labels = (settings.template?.labels as Record<string, string> | undefined) ?? {}
  const [v, setV] = useState<SettingsValues>(() => ({
    preset: settings.preset,
    numberPrefix: settings.number_prefix ?? '',
    paymentTerms: String(settings.default_payment_terms_days),
    issuerName: settings.issuer_display_name ?? '',
    paymentDetails: settings.payment_details ?? '',
    accentColor: settings.accent_color ?? '',
    footerNote: settings.footer_note ?? '',
    labels: { ...labels },
  }))
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<SettingsValues>) => setV((current) => ({ ...current, ...patch }))

  const submit = async () => {
    const days = Number(v.paymentTerms)
    if (!Number.isInteger(days) || days < 0 || days > 365) return setError(t('invoices.schedules.form.termsInvalid'))
    if (v.accentColor.trim() && !isHexColor(v.accentColor.trim())) return setError(t('invoices.settings.accentInvalid'))
    setError(null)
    try {
      await save.mutateAsync(settingsPatch(v, settings.template ?? null))
    } catch (e) {
      setError(invoiceErrorMessage(e, t))
    }
  }

  const pickLogo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 })
    const asset = result.canceled ? null : result.assets[0]
    if (!asset) return
    try {
      await upload.mutateAsync({ uri: asset.uri, name: logoFilename(asset.fileName, asset.mimeType), mimeType: asset.mimeType })
    } catch (e) {
      showError(invoiceErrorMessage(e, t) || t('invoices.settings.logoFailed'))
    }
  }

  const dropLogo = async () => {
    try {
      await removeLogo.mutateAsync()
    } catch (e) {
      showError(invoiceErrorMessage(e, t))
    }
  }

  return (
    <View style={styles.group}>
      <SectionHeader title={t('invoices.settings.groupBehaviour')} />
      <Text variant="label" tone="muted">
        {t('invoices.settings.preset')}
      </Text>
      <SegmentedControl
        options={[
          { value: 'tracking', label: t('invoices.settings.presetTracking') },
          { value: 'document', label: t('invoices.settings.presetDocument') },
        ]}
        value={v.preset}
        onChange={(preset) => set({ preset })}
      />
      <Text variant="caption" tone="muted">
        {v.preset === 'document' ? t('invoices.settings.presetDocumentHint') : t('invoices.settings.presetTrackingHint')}
      </Text>
      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField
            label={t('invoices.settings.numberPrefix')}
            value={v.numberPrefix}
            onChangeText={(numberPrefix) => set({ numberPrefix })}
            placeholder={t('invoices.settings.prefixPlaceholder')}
            maxLength={20}
            autoCapitalize="characters"
          />
        </View>
        <View style={styles.flex}>
          <TextField
            label={t('invoices.settings.paymentTerms')}
            value={v.paymentTerms}
            onChangeText={(paymentTerms) => set({ paymentTerms })}
            keyboardType="number-pad"
            maxLength={3}
          />
        </View>
      </View>

      <SectionHeader title={t('invoices.settings.groupDocument')} />
      <TextField
        label={t('invoices.settings.issuerName')}
        value={v.issuerName}
        onChangeText={(issuerName) => set({ issuerName })}
        maxLength={255}
      />
      <Text variant="label" tone="muted">
        {t('invoices.settings.logo')}
      </Text>
      <Card style={styles.logoCard}>
        {logo.data ? (
          <Image source={{ uri: logo.data }} style={styles.logo} resizeMode="contain" accessibilityLabel={t('invoices.settings.logo')} />
        ) : (
          <Text tone="muted">{t('invoices.settings.logoNone')}</Text>
        )}
        <View style={styles.row}>
          <View style={styles.flex}>
            <Button
              label={settings.logo_id ? t('invoices.settings.logoReplace') : t('invoices.settings.logoPick')}
              variant="secondary"
              onPress={pickLogo}
              loading={upload.isPending}
            />
          </View>
          {settings.logo_id ? (
            <View style={styles.flex}>
              <Button label={t('invoices.settings.logoRemove')} variant="ghost" onPress={dropLogo} loading={removeLogo.isPending} />
            </View>
          ) : null}
        </View>
      </Card>
      <Text variant="caption" tone="muted">
        {t('invoices.settings.logoHint')}
      </Text>
      <TextField
        label={t('invoices.settings.paymentDetails')}
        value={v.paymentDetails}
        onChangeText={(paymentDetails) => set({ paymentDetails })}
        multiline
        style={styles.multiline}
      />
      <Text variant="caption" tone="muted">
        {t('invoices.settings.paymentDetailsHint')}
      </Text>
      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField
            label={t('invoices.settings.accentColor')}
            value={v.accentColor}
            onChangeText={(accentColor) => set({ accentColor })}
            placeholder={t('invoices.settings.accentPlaceholder')}
            autoCapitalize="none"
            maxLength={9}
          />
        </View>
        <View
          style={[
            styles.swatch,
            { borderColor: colors.border, backgroundColor: isHexColor(v.accentColor.trim()) ? v.accentColor.trim() : colors.muted },
          ]}
        />
      </View>
      <TextField
        label={t('invoices.settings.footerNote')}
        value={v.footerNote}
        onChangeText={(footerNote) => set({ footerNote })}
        multiline
        style={styles.multiline}
      />

      <SectionHeader title={t('invoices.settings.labels')} />
      <Text variant="caption" tone="muted">
        {t('invoices.settings.labelsHint')}
      </Text>
      {EDITABLE_LABELS.map((key) => (
        <TextField
          key={key}
          label={t(`invoices.label.${key}`)}
          value={v.labels[key] ?? ''}
          onChangeText={(text) => set({ labels: { ...v.labels, [key]: text } })}
          placeholder={t('invoices.settings.labelsPlaceholder', { label: t(`invoices.label.${key}`) })}
        />
      ))}

      {error ? <Text tone="destructive">{error}</Text> : null}
      <Button label={t('invoices.settings.save')} onPress={submit} loading={save.isPending} />
    </View>
  )
}

/** The workspace describing itself: the sender block on every document issued from now on. */
function IssuerForm({ issuer }: { issuer: IssuerProfile }) {
  const { t } = useTranslation()
  const kinds = (useTaxIdKinds().data?.kinds ?? []).filter((k) => k.offered)
  const save = useUpdateIssuer()
  const [legalName, setLegalName] = useState(issuer.legal_name ?? '')
  const [address, setAddress] = useState(issuer.address ?? '')
  const [taxIds, setTaxIds] = useState<Record<string, string>>(() =>
    Object.fromEntries((issuer.tax_ids ?? []).map((row) => [row.kind, row.value])),
  )
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    try {
      await save.mutateAsync({
        legal_name: legalName.trim() || null,
        address: address.trim() || null,
        tax_ids: Object.entries(taxIds)
          .filter(([, value]) => value.trim())
          .map(([kind, value]) => ({ kind, value: value.trim() })),
      })
    } catch (e) {
      setError(invoiceErrorMessage(e, t))
    }
  }

  return (
    <View style={styles.group}>
      <SectionHeader title={t('invoices.settings.issuer')} />
      <Text variant="caption" tone="muted">
        {t('invoices.settings.issuerHint')}
      </Text>
      <TextField label={t('invoices.settings.legalName')} value={legalName} onChangeText={setLegalName} maxLength={255} />
      <TextField
        label={t('invoices.settings.addressLabel')}
        value={address}
        onChangeText={setAddress}
        multiline
        maxLength={500}
        style={styles.multiline}
      />
      {kinds.map((kind) => (
        <TextField
          key={kind.kind}
          // The web's labels come from the fiscal pack; the code reads the same everywhere.
          label={t(kind.label_key, { defaultValue: kind.kind.toUpperCase() })}
          value={taxIds[kind.kind] ?? ''}
          onChangeText={(value) => setTaxIds({ ...taxIds, [kind.kind]: value })}
          maxLength={120}
          autoCapitalize="characters"
        />
      ))}
      {error ? <Text tone="destructive">{error}</Text> : null}
      <Button label={t('invoices.settings.saveIssuer')} variant="secondary" onPress={submit} loading={save.isPending} />
    </View>
  )
}

const styles = StyleSheet.create({
  group: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' },
  flex: { flex: 1 },
  multiline: { minHeight: 72, paddingTop: spacing.md, textAlignVertical: 'top' },
  logoCard: { gap: spacing.md, alignItems: 'stretch' },
  logo: { height: 80, width: '100%' },
  swatch: { width: 48, height: 48, borderRadius: radius.md, borderWidth: 1 },
})
