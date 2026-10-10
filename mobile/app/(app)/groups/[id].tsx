import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { AmountText } from '@/components/AmountText'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { ListRow } from '@/components/ListRow'
import { Screen } from '@/components/Screen'
import { SectionHeader } from '@/components/SectionHeader'
import { ErrorState, Loading } from '@/components/States'
import { Text } from '@/components/Text'
import {
  memberName,
  useDeleteSettlement,
  useGroup,
  useGroupBalances,
  useGroupTransactions,
  useSettlements,
  type Settlement,
} from '@/features/groups/hooks'
import { useCanWrite, useDisplayFormat } from '@/features/session/hooks'
import { TransactionRow } from '@/features/transactions/TransactionRow'
import { confirmDestructive, showError } from '@/lib/confirm'
import { formatDate } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { formatCurrency } from '@/lib/format'
import { spacing, useColors } from '@/theme'

export default function GroupScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { dateLocale, locale } = useDisplayFormat()
  const canWrite = useCanWrite()
  const group = useGroup(id)
  const balances = useGroupBalances(id)
  const settlements = useSettlements(id)
  const transactions = useGroupTransactions(id)
  const removeSettlement = useDeleteSettlement(id)

  if (group.isPending) return <Loading />
  if (group.isError) return <ErrorState error={group.error} onRetry={() => group.refetch()} />
  const members = group.data.members ?? []
  const selfId = balances.data?.self_member_id ?? members.find((m) => m.is_self)?.id ?? null
  const editable = canWrite && group.data.is_owner !== false

  const refresh = () => {
    void group.refetch()
    void balances.refetch()
    void settlements.refetch()
    void transactions.refetch()
  }

  const settleUp = (memberId: string, amount: number, currency: string) => {
    if (!selfId) return
    // Positive: the member owes you, so they pay you.
    const [from, to] = amount > 0 ? [memberId, selfId] : [selfId, memberId]
    router.push({ pathname: '/groups/settle', params: { groupId: id, from, to, amount: String(Math.abs(amount)), currency } })
  }

  const confirmDeleteSettlement = async (settlement: Settlement) => {
    if (!(await confirmDestructive(t('groups.deleteSettlementTitle'), t('groups.deleteSettlementBody')))) return
    try {
      await removeSettlement.mutateAsync(settlement.id)
    } catch (e) {
      showError(errorMessage(e, t))
    }
  }

  const lines = (balances.data?.lines ?? []).filter((line) => line.member_id !== selfId && Number(line.amount) !== 0)

  return (
    <Screen onRefresh={refresh} refreshing={group.isRefetching}>
      <Stack.Screen
        options={{
          title: group.data.name,
          headerRight: editable
            ? () => (
                <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/groups/form', params: { id } })} hitSlop={12}>
                  <Text tone="primary" variant="label">
                    {t('common.edit')}
                  </Text>
                </Pressable>
              )
            : undefined,
        }}
      />

      <SectionHeader title={t('groups.balances')} />
      <Card style={styles.list}>
        {!selfId ? (
          <ListRow title={t('groups.noSelf')} subtitle={t('groups.noSelfHint')} />
        ) : lines.length === 0 ? (
          <ListRow title={t('groups.settled')} />
        ) : (
          lines.map((line) => {
            const amount = Number(line.amount)
            const name = memberName(members, line.member_id)
            return (
              <ListRow
                key={`${line.member_id}-${line.currency}`}
                title={amount > 0 ? t('groups.owesYou', { name }) : t('groups.youOwe', { name })}
                subtitle={editable ? t('groups.tapToSettle') : null}
                onPress={editable ? () => settleUp(line.member_id, amount, line.currency) : undefined}
                trailing={<AmountText variant="label" value={Math.abs(amount)} currency={line.currency} tone={amount > 0 ? 'income' : 'expense'} />}
              />
            )
          })
        )}
      </Card>

      <SectionHeader title={t('groups.members')} />
      <Card style={styles.list}>
        {members.map((member) => (
          <ListRow
            key={member.id}
            title={member.is_self ? t('groups.youName', { name: member.name }) : member.name}
            subtitle={member.email}
            onPress={editable && !member.linked_user_id ? () => router.push({ pathname: '/groups/member', params: { groupId: id, memberId: member.id } }) : undefined}
            showChevron={editable && !member.linked_user_id}
          />
        ))}
      </Card>
      {editable ? <Button label={t('groups.addMember')} variant="secondary" onPress={() => router.push({ pathname: '/groups/member', params: { groupId: id } })} /> : null}

      <SectionHeader title={t('groups.settlements')} />
      <Card style={styles.list}>
        {(settlements.data ?? []).length === 0 ? (
          <ListRow title={t('groups.noSettlements')} />
        ) : (
          settlements.data!.map((s) => (
            <ListRow
              key={s.id}
              title={t('groups.paid', { from: memberName(members, s.from_member_id), to: memberName(members, s.to_member_id) })}
              subtitle={[formatDate(s.date, dateLocale), s.notes].filter(Boolean).join(' · ')}
              onPress={editable ? () => void confirmDeleteSettlement(s) : undefined}
              trailing={<Text variant="label">{formatCurrency(Number(s.amount), s.currency, locale)}</Text>}
            />
          ))
        )}
      </Card>
      {editable && selfId && members.length > 1 ? (
        <Button label={t('groups.recordPayment')} variant="secondary" onPress={() => router.push({ pathname: '/groups/settle', params: { groupId: id } })} />
      ) : null}

      <SectionHeader title={t('transactions.title')} />
      <View style={[styles.transactions, { borderColor: colors.border, backgroundColor: colors.card }]}>
        {(transactions.data ?? []).length === 0 ? (
          <ListRow title={t('groups.noTransactions')} subtitle={t('groups.noTransactionsHint')} />
        ) : (
          transactions.data!.map((tx) => <TransactionRow key={tx.id} tx={tx} />)
        )}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  list: { padding: 0, overflow: 'hidden' },
  transactions: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', marginBottom: spacing.xl },
})
