import { useEffect, useRef, useState } from 'react'

const prefersReducedMotion = () =>
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Animates a number from its previous value up to `target`.
 *
 * Only numeric targets animate — anything else (an arrow, a dash, a string)
 * is returned untouched so KPI tiles can mix counters and glyphs. Honours
 * prefers-reduced-motion by snapping straight to the final value.
 *
 * @param {number|string} target  value to land on
 * @param {number} duration       milliseconds for the roll-up
 */
export default function useCountUp(target, duration = 650) {
  const numeric = typeof target === 'number' && Number.isFinite(target)
  const [display, setDisplay] = useState(numeric ? 0 : target)
  const frameRef = useRef(0)
  const fromRef = useRef(0)

  useEffect(() => {
    if (!numeric) {
      setDisplay(target)
      return undefined
    }

    if (prefersReducedMotion() || duration <= 0) {
      fromRef.current = target
      setDisplay(target)
      return undefined
    }

    const from = fromRef.current
    const delta = target - from
    if (delta === 0) {
      setDisplay(target)
      return undefined
    }

    const start = performance.now()
    // easeOutCubic — quick out of the gate, settles gently on the number.
    const ease = progress => 1 - Math.pow(1 - progress, 3)

    const step = now => {
      const progress = Math.min(1, (now - start) / duration)
      setDisplay(Math.round(from + delta * ease(progress)))
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step)
      } else {
        fromRef.current = target
      }
    }

    frameRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frameRef.current)
  }, [target, duration, numeric])

  return display
}
