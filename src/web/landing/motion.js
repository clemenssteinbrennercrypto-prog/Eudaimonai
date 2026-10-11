import { useEffect, useRef, useState } from 'react'

// Small motion helpers shared by the landing graphics. Every one of them
// settles on its final state at once when the visitor prefers reduced motion,
// or when the browser has no IntersectionObserver (tests, old browsers).

export const prefersReducedMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

const canObserve = () => 'IntersectionObserver' in window

// True once the element has been well inside the viewport.
export function useSeen(ref, threshold = 0.35) {
  const [seen, setSeen] = useState(() => prefersReducedMotion() || !canObserve())
  useEffect(() => {
    const element = ref.current
    if (!element || seen) return undefined
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      setSeen(true)
      observer.disconnect()
    }, { threshold })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, threshold, seen])
  return seen
}

// True while the element is on screen; for loops that should pause off screen.
export function useOnScreen(ref, threshold = 0.2) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const element = ref.current
    if (!element || prefersReducedMotion() || !canObserve()) return undefined
    const observer = new IntersectionObserver(([entry]) => setOn(entry.isIntersecting), { threshold })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, threshold])
  return on
}

// 0 → 1 over `ms` once `run` turns true, eased out.
export function useProgress(run, ms = 1400, delay = 0) {
  const instant = prefersReducedMotion() || !canObserve()
  const [value, setValue] = useState(instant ? 1 : 0)
  const doneRef = useRef(instant)
  useEffect(() => {
    if (!run || doneRef.current) return undefined
    let frame = 0
    let start = 0
    const step = now => {
      start ||= now + delay
      const t = Math.max(0, Math.min(1, (now - start) / ms))
      setValue(1 - (1 - t) ** 3)
      if (t < 1) frame = requestAnimationFrame(step)
      else doneRef.current = true
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [run, ms, delay])
  return value
}

// Below-the-fold blocks marked .site-rv rise and unblur once, the first time
// they scroll in. Visible at rest everywhere else.
export function useReveal(rootRef) {
  useEffect(() => {
    const root = rootRef.current
    if (!root || prefersReducedMotion() || !canObserve()) return undefined
    const items = [...root.querySelectorAll('.site-rv')]
      .filter(element => element.getBoundingClientRect().top > window.innerHeight)
    items.forEach(element => element.classList.add('is-pre'))
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return
      entry.target.classList.remove('is-pre')
      observer.unobserve(entry.target)
    }), { rootMargin: '0px 0px -10% 0px' })
    items.forEach(element => observer.observe(element))
    return () => observer.disconnect()
  }, [rootRef])
}
