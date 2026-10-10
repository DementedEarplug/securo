import type { ReactNode } from 'react'
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView, type Edge } from 'react-native-safe-area-context'

import { spacing, useColors } from '@/theme'

interface Props {
  children: ReactNode
  /** Wrap in a ScrollView; lists that virtualize pass false. */
  scroll?: boolean
  /** Pull-to-refresh, for scrolling screens. */
  onRefresh?: () => void
  refreshing?: boolean
  /** Screens under a native header only need the bottom inset. */
  edges?: Edge[]
}

export function Screen({ children, scroll = true, onRefresh, refreshing = false, edges = ['bottom'] }: Props) {
  const colors = useColors()
  return (
    <SafeAreaView edges={edges} style={[styles.root, { backgroundColor: colors.background }]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={styles.root}>{children}</View>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg },
})
