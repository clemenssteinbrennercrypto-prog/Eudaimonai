import { useEffect, useRef, useState } from 'react'
import Ridgeline from './Ridgeline'
import { prefersReducedMotion, useOnScreen, useSeen } from './motion'

// The idea, on ultramarine. The fields cycle so every reader finds their own
// work in it (studying included: students are a core audience), the three
// scores land one by one, and the last line turns from a feeling into a
// number when it scrolls in. A week of real sessions is drawn beside it.
const FIELDS = [
  'Studying for an exam.',
  'Building a company.',
  'Writing a thesis.',
  'Learning a language.',
  'Shipping hard code.',
  'Composing an album.',
]

function useCycle(on, length, ms) {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (!on || prefersReducedMotion()) return undefined
    const timer = window.setInterval(() => setIndex(value => (value + 1) % length), ms)
    return () => window.clearInterval(timer)
  }, [on, length, ms])
  return index
}

export default function WhySection() {
  const ref = useRef(null)
  const linesRef = useRef(null)
  const on = useOnScreen(ref, 0.2)
  const turned = useSeen(linesRef, 0.8)
  const field = useCycle(on, FIELDS.length, 2200)

  return (
    <div className="site-why" ref={ref}>
      <div className="site-wrap site-why-inner">
        <div className="site-why-grid">
          <div className="site-why-text">
            <p className="site-label">Why</p>
            <p className="site-why-fields" aria-label={FIELDS.join(' ')}>
              {FIELDS.map((text, index) => (
                <span key={text} className={index === field ? 'is-on' : ''} aria-hidden="true">{text}</span>
              ))}
            </p>
            <h2 className="site-rv">Everything worth doing takes deep focus.</h2>
            <div className="site-why-body site-rv">
              <p>
                An exam, a company, a thesis, a piece of music, a hard problem in code. Whatever you are working towards,
                it gets done in long, unbroken stretches of attention, day after day. The ability to stay with something
                deeply, and for long, is what turns effort into results.
              </p>
            </div>
            <div className={`site-why-lines${turned ? ' is-turned' : ''}`} ref={linesRef}>
              <p>Sleep has a score.</p>
              <p>Training has a load.</p>
              <p className="site-why-swap">
                <span className="is-before">Focus only has a feeling.</span>
                <span className="is-after">Now focus has a number.</span>
              </p>
            </div>
          </div>
          <Ridgeline />
        </div>
        <figure className="site-why-name site-rv">
          <p><span lang="grc">εὐδαιμονία</span> · eudaimonia</p>
          <blockquote>“For one swallow does not make a summer, nor does one day; and so too one day, or a short time, does not make a man blessed and happy.”</blockquote>
          <figcaption>Aristotle, <cite>Nicomachean Ethics</cite> I.7, on the highest good: not a feeling but an activity, sustained over a complete life. Tr. W. D. Ross.</figcaption>
        </figure>
      </div>
    </div>
  )
}
