import { useRef } from 'react'
import { useProgress, useSeen } from './motion'

// The spec band: four facts of the product, set large on black. Each one is
// true of the code: NATIVE_CAMERA_MAX_FPS in native_camera/capture.rs, the
// 478-point face mesh checked in cameraMeasurement.js, frames analysed in
// memory and discarded, and one Focus Score per day. Change them together.
// Ordered from largest to smallest, so the row counts down and ends on the
// zero: nothing stored.
const SPECS = [
  { value: 478, unit: 'points', label: 'Tracked on your face in every frame' },
  { value: 15, unit: 'per second', label: 'Camera frames read, on your Mac' },
  { value: 1, unit: 'number', label: 'For your whole day' },
  { value: 0, unit: 'frames', label: 'Ever stored or uploaded' },
]

export default function SpecBand() {
  const ref = useRef(null)
  const seen = useSeen(ref, 0.4)
  const progress = useProgress(seen, 1600, 150)
  return (
    <section className="site-specs" ref={ref} aria-labelledby="specs-title">
      <div className="site-wrap">
        <p className="site-specs-kicker">Built like an instrument</p>
        <h2 id="specs-title">Precise enough to trust. Private by design.</h2>
        <dl className="site-specs-grid">
          {SPECS.map(spec => (
            <div key={spec.label}>
              <dt>
                <b aria-label={String(spec.value)}>{Math.round(spec.value * progress)}</b>
                <span>{spec.unit}</span>
              </dt>
              <dd>{spec.label}</dd>
            </div>
          ))}
        </dl>
        <p className="site-specs-foot">Runs natively on Apple Silicon. Signed and notarized by Apple.</p>
      </div>
    </section>
  )
}
