import { useRef } from 'react'
import { ART_SESSIONS, smooth } from './dataArt'
import { useSeen } from './motion'

// Every session of the sample week as one ridge, stacked like a pulsar plot:
// the line rises with attention and dips where it slipped. Each ridge is
// filled with the ground colour so the ones in front hide those behind.
const WIDTH = 600
const ROW = 20

export default function Ridgeline() {
  const ref = useRef(null)
  const seen = useSeen(ref, 0.3)
  const rows = ART_SESSIONS.length
  const height = rows * ROW + 60
  return (
    <figure className={`site-ridge${seen ? ' is-drawn' : ''}`} ref={ref}>
      <svg viewBox={`0 0 ${WIDTH} ${height}`} role="img" aria-label={`${rows} focus sessions from one sample week, drawn as stacked lines that rise with attention and dip where it slipped.`}>
        {ART_SESSIONS.map((session, index) => {
          const scores = smooth(session.scores, 2)
          const base = 50 + index * ROW
          const x = i => 20 + (i / (scores.length - 1)) * (WIDTH - 40)
          const y = i => base - Math.max(0, scores[i] - 30) * 0.6
          const line = scores.map((_, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(i).toFixed(1)}`).join('')
          const fill = `${line}L${x(scores.length - 1).toFixed(1)} ${base + ROW}L${x(0).toFixed(1)} ${base + ROW}Z`
          return (
            <g key={session.startedAt} style={{ '--i': index }}>
              <path className="site-ridge-fill" d={fill} />
              <path className="site-ridge-line" d={line} pathLength="1" />
            </g>
          )
        })}
      </svg>
      <figcaption>{rows} sessions, one sample week. Every dip is a moment attention slipped.</figcaption>
    </figure>
  )
}
