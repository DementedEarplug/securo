import { router } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native'

import { Fab } from '@/components/Fab'
import { ListRow } from '@/components/ListRow'
import { EmptyState, ErrorState, Loading } from '@/components/States'
import { Text } from '@/components/Text'
import { usePayees, useSavePayee } from '@/features/payees/hooks'
import { useCanWrite } from '@/features/session/hooks'
import { useDebounced } from '@/lib/use-debounced'
import { font, radius, spacing, useColors } from '@/theme'

export default function PayeesScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const canWrite = useCanWrite()
  const [search, setSearch] = useState('')
  const q = useDebounced(search)
  const payees = usePayees(q)
  const save = useSavePayee()

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder={t('payees.search')}
        placeholderTextColor={colors.mutedForeground}
        accessibilityLabel={t('common.search')}
        style={[styles.search, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
      />
      {payees.isPending ? (
        <Loading />
      ) : payees.isError ? (
        <ErrorState error={payees.error} onRetry={() => payees.refetch()} />
      ) : (
        <FlatList
          data={[...payees.data].sort((a, b) => Number(b.is_favorite) - Number(a.is_favorite) || a.name.localeCompare(b.name))}
          keyExtractor={(p) => p.id}
          refreshing={payees.isRefetching}
          onRefresh={() => payees.refetch()}
          ListEmptyComponent={<EmptyState title={t('payees.empty')} />}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <ListRow
              title={item.name}
              subtitle={[item.type ? t(`payees.types.${item.type}`) : null, t('payees.transactionCount', { count: item.transaction_count ?? 0 })]
                .filter(Boolean)
                .join(' · ')}
              onPress={canWrite ? () => router.push({ pathname: '/payees/form', params: { id: item.id } }) : undefined}
              trailing={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={item.is_favorite ? t('payees.unfavorite') : t('payees.favorite')}
                  disabled={!canWrite}
                  hitSlop={10}
                  onPress={() => save.mutate({ id: item.id, body: { is_favorite: !item.is_favorite } })}
                >
                  <Text tone={item.is_favorite ? 'primary' : 'muted'} style={styles.star}>
                    {item.is_favorite ? '★' : '☆'}
                  </Text>
                </Pressable>
              }
            />
          )}
        />
      )}
      {canWrite ? <Fab label={t('payees.newTitle')} onPress={() => router.push('/payees/form')} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  search: { margin: spacing.lg, marginBottom: spacing.sm, minHeight: 44, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: font.md },
  listContent: { paddingBottom: 96 },
  star: { fontSize: 22 },
})
