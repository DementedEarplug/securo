import type { LucideIcon } from 'lucide-react-native'
import Bitcoin from 'lucide-react-native/icons/bitcoin'
import Car from 'lucide-react-native/icons/car'
import ChartLine from 'lucide-react-native/icons/chart-line'
import ChartPie from 'lucide-react-native/icons/chart-pie'
import Gem from 'lucide-react-native/icons/gem'
import House from 'lucide-react-native/icons/house'
import Layers from 'lucide-react-native/icons/layers'
import Package from 'lucide-react-native/icons/package'
import TrendingUp from 'lucide-react-native/icons/trending-up'
import { useState } from 'react'
import { Image, StyleSheet, View } from 'react-native'

import { useColors } from '@/theme'

/** Each asset type's icon and colour, as on the web holdings table. */
const TYPES: Record<string, { icon: LucideIcon; color: string }> = {
  real_estate: { icon: House, color: '#2563EB' },
  vehicle: { icon: Car, color: '#7C3AED' },
  valuable: { icon: Gem, color: '#D97706' },
  investment: { icon: TrendingUp, color: '#059669' },
  stock: { icon: ChartLine, color: '#0284C7' },
  etf: { icon: Layers, color: '#0D9488' },
  crypto: { icon: Bitcoin, color: '#EA580C' },
  fund: { icon: ChartPie, color: '#4F46E5' },
  other: { icon: Package, color: '#475569' },
}

/** The holding's logo when it has one, else its type icon on a tint. */
export function AssetIcon({ type, logoUrl, size = 36 }: { type: string; logoUrl?: string | null; size?: number }) {
  const colors = useColors()
  const [failed, setFailed] = useState(false)
  const config = TYPES[type] ?? TYPES.other!
  const Glyph = config.icon
  const box = { width: size, height: size, borderRadius: size / 4 }
  if (logoUrl && !failed) {
    return (
      <View style={[styles.box, box, { backgroundColor: '#FFFFFF', borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth }]}>
        <Image source={{ uri: logoUrl }} style={styles.logo} resizeMode="contain" onError={() => setFailed(true)} accessibilityIgnoresInvertColors />
      </View>
    )
  }
  return (
    <View accessibilityElementsHidden importantForAccessibility="no" style={[styles.box, box, { backgroundColor: `${config.color}22` }]}>
      <Glyph size={size / 2} color={config.color} strokeWidth={2} />
    </View>
  )
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logo: { width: '100%', height: '100%' },
})
