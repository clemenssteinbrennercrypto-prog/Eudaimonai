import { useRef } from 'react'
import { useSeen } from './motion'

// Privacy, concretely: what the camera does with a frame, then where every
// kind of data lives. Mirrors the privacy policy and the code (LegalModal.jsx
// names the files each claim rests on); change both together.

// Face points in the style of a landmark mesh, not a photo: outline, brows,
// eyes, nose and mouth as dots.
const FACE = (() => {
  const points = []
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2
    points.push([60 + Math.cos(a) * 34, 62 + Math.sin(a) * 44])
  }
  const arc = (cx, cy, rx, ry, from, to, n) => {
    for (let i = 0; i <= n; i++) {
      const a = from + ((to - from) * i) / n
      points.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry])
    }
  }
  arc(45, 50, 9, 4, 0, Math.PI * 2, 9)
  arc(75, 50, 9, 4, 0, Math.PI * 2, 9)
  arc(45, 41, 10, 3, Math.PI, Math.PI * 2, 5)
  arc(75, 41, 10, 3, Math.PI, Math.PI * 2, 5)
  for (let i = 0; i < 6; i++) points.push([60, 52 + i * 4])
  arc(60, 82, 12, 4, 0, Math.PI, 8)
  arc(60, 82, 12, 2, Math.PI, Math.PI * 2, 8)
  return points
})()

const ON_MAC = [
  { title: 'Camera frames', body: 'Analysed in memory, then thrown away. Never saved, never sent.' },
  { title: 'Measurements', body: 'Where you were facing, whether you were there, attention over time.' },
  { title: 'Apps and sites', body: 'Which one was in front during a session, to spot distractions.' },
  { title: 'Sessions and history', body: 'Names, reports, scores and records, in a local database you can export or delete.' },
  { title: 'Your workspace', body: 'Where your screens and notes are on your desk.' },
]

const ON_SERVER = [
  { title: 'Email address', body: 'To invite you and sign you in.' },
  { title: 'Invitation and access', body: 'When your beta access starts and ends.' },
  { title: 'Spam protection', body: 'A one-way hash of your network address when you join the list, to limit abuse.' },
]

const NEVER = ['Video recordings', 'Face recognition', 'Keystrokes or file contents', 'Selling your data']

export default function PrivacyMap() {
  const ref = useRef(null)
  const seen = useSeen(ref, 0.35)
  return (
    <div className={`site-pmap${seen ? ' is-seen' : ''}`} ref={ref}>
      <figure className="site-camera" aria-label="What happens to a camera frame: it is turned into face points, those into three measurements, and then the frame is discarded.">
        <div className="site-camera-step">
          <svg viewBox="0 0 120 120" className="site-face" aria-hidden="true">
            {FACE.map(([cx, cy], index) => (
              <circle key={index} cx={cx.toFixed(1)} cy={cy.toFixed(1)} r="1.3" style={{ transitionDelay: `${index * 8}ms` }} />
            ))}
          </svg>
          <b>1 · The frame</b>
          <span>Turned into face points, in memory.</span>
        </div>
        <span className="site-camera-arrow" aria-hidden="true" />
        <div className="site-camera-step">
          <ul className="site-camera-reads" aria-hidden="true">
            <li><i />Facing your main screen</li>
            <li><i />At your desk</li>
            <li><i />Eyes open</li>
          </ul>
          <b>2 · Three readings</b>
          <span>That is all it keeps from the camera.</span>
        </div>
        <span className="site-camera-arrow" aria-hidden="true" />
        <div className="site-camera-step">
          <div className="site-camera-bin" aria-hidden="true"><span><i /></span></div>
          <b>3 · Discarded</b>
          <span>The frame is gone. No image is ever stored.</span>
        </div>
      </figure>

      <div className="site-where">
        <section className="site-where-mac" aria-label="Stays on your Mac">
          <h3>Stays on your Mac</h3>
          <ul>{ON_MAC.map(item => <li key={item.title}><b>{item.title}</b><span>{item.body}</span></li>)}</ul>
        </section>
        <section className="site-where-server" aria-label="On our server">
          <h3>On our server</h3>
          <ul>{ON_SERVER.map(item => <li key={item.title}><b>{item.title}</b><span>{item.body}</span></li>)}</ul>
          <p>Stored in Frankfurt. The app also checks your access and looks for updates on GitHub.</p>
        </section>
        <section className="site-where-never" aria-label="Never">
          <h3>Never</h3>
          <ul>{NEVER.map(item => <li key={item}>{item}</li>)}</ul>
        </section>
      </div>
    </div>
  )
}
