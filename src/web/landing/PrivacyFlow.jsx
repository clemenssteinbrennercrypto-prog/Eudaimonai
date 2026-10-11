import { useRef } from 'react'
import { useOnScreen } from './motion'

// Where data goes, drawn as it is: the camera's frames are measured and
// thrown away inside the Mac, history stays there, and only account and access
// cross to our server. Dots move only while the diagram is on screen.
export default function PrivacyFlow() {
  const ref = useRef(null)
  const live = useOnScreen(ref)
  return (
    <figure className={`site-flow${live ? ' is-live' : ''}`} ref={ref} aria-label="On your Mac: camera frames are analysed in memory, turned into measurements and kept in your local history. Only your email address, invitation and beta access are on our server; the app checks access and looks for updates.">
      <div className="site-flow-mac" aria-hidden="true">
        <p className="site-flow-title">Your Mac</p>
        <ol className="site-flow-pipe">
          <li><b>Camera</b><span>Frames, in memory only</span></li>
          <li><b>Analysis</b><span>Where you’re facing, whether you’re there</span></li>
          <li><b>Measurements</b><span>Attention, second by second</span></li>
          <li><b>Your history</b><span>A local database you control</span></li>
        </ol>
        <p className="site-flow-note">Frames are discarded right away. Nothing is recorded.</p>
      </div>
      <div className="site-flow-link" aria-hidden="true">
        <span className="site-flow-wire" />
        <small>Access check · updates</small>
      </div>
      <div className="site-flow-server" aria-hidden="true">
        <p className="site-flow-title">Our server</p>
        <ul>
          <li>Email address</li>
          <li>Invitation</li>
          <li>Beta access</li>
        </ul>
        <p className="site-flow-note">Nothing about your sessions. Stored in Frankfurt.</p>
      </div>
    </figure>
  )
}
