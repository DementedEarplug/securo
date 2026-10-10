import { useCallback, useEffect, useRef, useState } from 'react'
import { Keyboard, type View } from 'react-native'

/**
 * How much of a view the software keyboard covers. Android apps draw edge to
 * edge, so whether the window shrinks for the keyboard depends on the device;
 * measuring the view against the keyboard's top works either way (0 when the
 * system already made room). Re-measure from the view's `onLayout`.
 */
export function useKeyboardOverlap() {
  const ref = useRef<View>(null)
  const keyboardTop = useRef<number | null>(null)
  const [overlap, setOverlap] = useState(0)

  const measure = useCallback(() => {
    const top = keyboardTop.current
    if (top == null) {
      setOverlap(0)
      return
    }
    ref.current?.measureInWindow((_x, y, _w, height) => setOverlap(Math.max(0, Math.round(y + height - top))))
  }, [])

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      keyboardTop.current = e.endCoordinates.screenY
      measure()
    })
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardTop.current = null
      setOverlap(0)
    })
    return () => {
      show.remove()
      hide.remove()
    }
  }, [measure])

  return { ref, overlap, onLayout: measure }
}
