import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { Card } from '@/components/Card'
import { ListRow } from '@/components/ListRow'
import { Screen } from '@/components/Screen'
import { SectionHeader } from '@/components/SectionHeader'
import type { MoreContext } from '@/features/more/items'
import { MORE_SECTIONS } from '@/features/more/sections'
import { useAppInfo } from '@/features/session/info'
import { useCurrentWorkspace, useMe } from '@/features/session/hooks'
import { useColors } from '@/theme'

export default function MoreScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const me = useMe().data
  const info = useAppInfo().data
  const workspace = useCurrentWorkspace()
  const ctx: MoreContext = {
    isSuperuser: Boolean(me?.is_superuser),
    agentsEnabled: Boolean(info?.features.agents),
    modules: workspace?.enabled_modules ?? [],
  }

  return (
    <Screen>
      {MORE_SECTIONS.map((section) => {
        const items = section.items.filter((item) => !item.visible || item.visible(ctx))
        if (!items.length) return null
        return (
          <View key={section.key}>
            <SectionHeader title={t(`more.sections.${section.key}`)} />
            <Card style={styles.list}>
              {items.map((item) => {
                const Glyph = item.icon
                return (
                  <ListRow
                    key={item.key}
                    title={t(`more.items.${item.key}`)}
                    leading={<Glyph size={20} color={colors.primary} />}
                    onPress={() => router.push(item.href)}
                    showChevron
                  />
                )
              })}
            </Card>
          </View>
        )
      })}
    </Screen>
  )
}

const styles = StyleSheet.create({
  list: { padding: 0, overflow: 'hidden', marginTop: 8 },
})
