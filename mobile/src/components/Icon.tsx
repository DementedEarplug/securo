import type { ColorValue } from 'react-native'
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg'

export type IconName =
  | 'wallet'
  | 'list'
  | 'pie'
  | 'chart'
  | 'settings'
  | 'plus'
  | 'chevron-right'
  | 'chevron-left'
  | 'filter'
  | 'close'
  | 'grid'

/** Stroke icons drawn inline (24×24 grid), so no icon font is bundled. */
export function Icon({ name, color, size = 24 }: { name: IconName; color: ColorValue; size?: number }) {
  const stroke = { stroke: color, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      {name === 'wallet' && (
        <>
          <Rect x={3} y={6} width={18} height={14} rx={2} {...stroke} />
          <Path d="M3 10h18M16 15h2" {...stroke} />
          <Path d="M6 6V5a2 2 0 0 1 2-2h8" {...stroke} />
        </>
      )}
      {name === 'list' && <Path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" {...stroke} />}
      {name === 'pie' && (
        <>
          <Path d="M21 12A9 9 0 1 1 12 3v9z" {...stroke} />
          <Path d="M15 3.5A9 9 0 0 1 20.5 9H15z" {...stroke} />
        </>
      )}
      {name === 'chart' && <Polyline points="3 17 9 11 13 15 21 7" {...stroke} />}
      {name === 'settings' && (
        <>
          <Circle cx={12} cy={12} r={3} {...stroke} />
          <Path
            d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
            {...stroke}
          />
        </>
      )}
      {name === 'plus' && <Path d="M12 5v14M5 12h14" {...stroke} />}
      {name === 'chevron-right' && <Polyline points="9 18 15 12 9 6" {...stroke} />}
      {name === 'chevron-left' && <Polyline points="15 18 9 12 15 6" {...stroke} />}
      {name === 'filter' && <Path d="M22 3H2l8 9.5V19l4 2v-8.5z" {...stroke} />}
      {name === 'grid' && (
        <>
          <Rect x={3} y={3} width={7} height={7} rx={1.5} {...stroke} />
          <Rect x={14} y={3} width={7} height={7} rx={1.5} {...stroke} />
          <Rect x={3} y={14} width={7} height={7} rx={1.5} {...stroke} />
          <Rect x={14} y={14} width={7} height={7} rx={1.5} {...stroke} />
        </>
      )}
      {name === 'close' && (
        <>
          <Line x1={18} y1={6} x2={6} y2={18} {...stroke} />
          <Line x1={6} y1={6} x2={18} y2={18} {...stroke} />
        </>
      )}
    </Svg>
  )
}
