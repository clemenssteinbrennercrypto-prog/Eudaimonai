import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Charts draw in real pixels so an 11px label is 11px at every width. A fixed
 * viewBox scaled the type with the container and letterboxed wide screens.
 */
export function useChartWidth(fallback = 960) {
  const ref = useRef(null)
  const [width, setWidth] = useState(fallback)
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return undefined
    const measure = () => {
      const next = Math.round(node.getBoundingClientRect().width)
      if (next > 0) setWidth(current => (current === next ? current : next))
    }
    measure()
    if (typeof ResizeObserver !== 'function') return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

const easeOutCubic = t => 1 - (1 - t) ** 3

/** Count from 0 to the target once per target change; instant without motion. */
export function useCountUp(target, duration = 750) {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0))
  useEffect(() => {
    if (!Number.isFinite(target) || prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
      setValue(target)
      return undefined
    }
    let frame = 0
    const start = performance.now()
    const tick = now => {
      const progress = Math.min(1, (now - start) / duration)
      setValue(target * easeOutCubic(progress))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, duration])
  return value
}

/** Flip once to true when the element first scrolls into view. */
export function useReveal() {
  const ref = useRef(null)
  const [revealed, setRevealed] = useState(() => typeof IntersectionObserver !== 'function')
  useEffect(() => {
    if (revealed || !ref.current) return undefined
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setRevealed(true)
        observer.disconnect()
      }
    }, { threshold: 0.12 })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [revealed])
  return [ref, revealed]
}
