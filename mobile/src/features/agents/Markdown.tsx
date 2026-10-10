import * as WebBrowser from 'expo-web-browser'
import { memo, useMemo } from 'react'
import { ScrollView, StyleSheet, Text as RNText, View, type TextStyle } from 'react-native'

import { Text } from '@/components/Text'
import { font, radius, spacing, useColors, type Colors } from '@/theme'
import { ChartBlock } from './ChartBlock'
import { isSafeLink, parseMarkdown, type Block, type Span } from './markdown-parser'

const MONO = 'monospace'

function SpanText({ spans, colors }: { spans: Span[]; colors: Colors }) {
  return spans.map((span, i) => {
    const style: TextStyle[] = []
    if (span.bold) style.push(styles.bold)
    if (span.italic) style.push(styles.italic)
    if (span.strike) style.push(styles.strike)
    if (span.code) style.push(styles.inlineCode, { backgroundColor: colors.muted })
    const href = span.href
    if (href && isSafeLink(href)) {
      return (
        <RNText
          key={i}
          accessibilityRole="link"
          style={[...style, styles.link, { color: colors.primary }]}
          onPress={() => void WebBrowser.openBrowserAsync(href)}
        >
          {span.text}
        </RNText>
      )
    }
    return (
      <RNText key={i} style={style}>
        {span.text}
      </RNText>
    )
  })
}

function BlockView({ block, colors }: { block: Block; colors: Colors }) {
  switch (block.type) {
    case 'paragraph':
      return (
        <Text>
          <SpanText spans={block.spans} colors={colors} />
        </Text>
      )
    case 'heading':
      return (
        <Text variant={block.level <= 2 ? 'heading' : 'label'} style={styles.heading}>
          <SpanText spans={block.spans} colors={colors} />
        </Text>
      )
    case 'quote':
      return (
        <View style={[styles.quote, { borderLeftColor: colors.border }]}>
          <Text tone="muted" style={styles.italic}>
            <SpanText spans={block.spans} colors={colors} />
          </Text>
        </View>
      )
    case 'list':
      return (
        <View style={styles.list}>
          {block.items.map((item, i) => (
            <View key={i} style={styles.listItem}>
              <Text tone="muted" style={styles.bullet}>
                {block.ordered ? `${block.start + i}.` : '•'}
              </Text>
              <Text style={styles.flex}>
                <SpanText spans={item} colors={colors} />
              </Text>
            </View>
          ))}
        </View>
      )
    case 'code':
      if (block.lang === 'securo-chart') return <ChartBlock raw={block.text} />
      return (
        <ScrollView horizontal style={[styles.codeBlock, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <RNText style={[styles.code, { color: colors.foreground }]}>{block.text}</RNText>
        </ScrollView>
      )
    case 'table':
      return (
        <ScrollView horizontal>
          <View style={[styles.table, { borderColor: colors.border }]}>
            {[block.header, ...block.rows].map((row, r) => (
              <View
                key={r}
                style={[styles.tableRow, { borderColor: colors.border }, r === 0 && { backgroundColor: colors.muted }]}
              >
                {row.map((cell, c) => (
                  <Text key={c} variant="caption" style={[styles.cell, r === 0 && styles.bold]}>
                    <SpanText spans={cell} colors={colors} />
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      )
    case 'rule':
      return <View style={[styles.rule, { backgroundColor: colors.border }]} />
  }
}

/** An assistant reply rendered from Markdown. Memoized: replies don't change once sent. */
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  const colors = useColors()
  const blocks = useMemo(() => parseMarkdown(text), [text])
  return (
    <View style={styles.root}>
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} colors={colors} />
      ))}
    </View>
  )
})

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  flex: { flex: 1 },
  bold: { fontWeight: '600' },
  italic: { fontStyle: 'italic' },
  strike: { textDecorationLine: 'line-through' },
  link: { textDecorationLine: 'underline' },
  inlineCode: { fontFamily: MONO, fontSize: font.sm },
  heading: { marginTop: spacing.xs },
  quote: { borderLeftWidth: 2, paddingLeft: spacing.md },
  list: { gap: spacing.xs },
  listItem: { flexDirection: 'row', gap: spacing.sm },
  bullet: { minWidth: 16 },
  codeBlock: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.sm, padding: spacing.md },
  code: { fontFamily: MONO, fontSize: font.xs, lineHeight: 18 },
  table: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.sm, overflow: 'hidden' },
  tableRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  cell: { minWidth: 90, maxWidth: 220, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: spacing.xs },
})
