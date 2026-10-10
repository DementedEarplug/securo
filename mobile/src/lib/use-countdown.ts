import { useEffect, useState } from 'react'

/** Seconds left until a rate limit lifts; `start(n)` begins a new countdown. */
export function useCountdown() {
  const [remaining, setRemaining] = useState(0)
  useEffect(() => {
    if (remaining <= 0) return
    const timer = setTimeout(() => setRemaining((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [remaining])
  return { remaining, start: setRemaining }
}
