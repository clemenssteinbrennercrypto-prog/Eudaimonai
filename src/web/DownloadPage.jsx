import { useState } from 'react'
import WebShell from './WebShell'
import { DOWNLOAD_URL } from '../lib/downloadLinks'
import { CONTACT_EMAIL } from './contact'
import { EVENTS, trackEvent } from './analytics'

// Install and permission steps in product language. Each permission line must
// match what the app really asks for (Info.plist / Entitlements.plist and the
// blocking helper in companion/src-tauri/src/blocking.rs).
const STEPS = [
  {
    title: 'Download the disk image',
    body: 'One file for Apple Silicon Macs (M1 or newer) running macOS 11 or later.',
  },
  {
    title: 'Drag Eudaimonai into Applications',
    body: 'Open the downloaded file and drag the app icon onto the Applications folder.',
  },
  {
    title: 'Open it from Applications',
    body: 'The app is signed and notarized by Apple. The first time, macOS asks whether to open an app downloaded from the internet. Choose Open.',
  },
  {
    title: 'Allow the camera',
    body: 'Eudaimonai asks for your camera when you set it up. It measures attention during a session; frames are processed on your Mac and immediately discarded. No video is recorded.',
  },
  {
    title: 'Only if you use blocking',
    body: 'To see which app or site is in front, macOS asks you to let Eudaimonai control your browser. To block the sites you list, it asks for your admin password once to install a small helper. Both are optional: measuring focus works without them.',
  },
]

// A phone, a tablet (iPadOS reports a Mac with touch) or a Windows or Linux PC
// can't run the app; those visitors get the page link to open on their Mac.
export function isNotAMac(userAgent = navigator.userAgent, touchPoints = navigator.maxTouchPoints) {
  if (/iPhone|iPad|iPod|Android|Windows|CrOS|Linux/i.test(userAgent)) return true
  return /Macintosh/i.test(userAgent) && touchPoints > 1
}

function OpenOnMac() {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="web-message is-info" role="note">
      <strong>Eudaimonai runs on a Mac.</strong> Open this page on your Mac to download it.{' '}
      <button type="button" className="web-link-button" onClick={copy}>{copied ? 'Link copied' : 'Copy link'}</button>
    </div>
  )
}

export default function DownloadPage({ notMac = isNotAMac() }) {
  return (
    <WebShell site>
      <span className="web-kicker">Download</span>
      <h1 className="web-title">Get Eudaimonai for your Mac</h1>
      <p className="web-lead">
        Eudaimonai is in a closed beta. Install it in a minute, then sign in to the app with the email address you
        used for beta access. The steps below say exactly what your Mac will ask.
      </p>

      {notMac && <OpenOnMac />}

      <div className="web-card">
        <a className="web-button" href={DOWNLOAD_URL} onClick={() => trackEvent(EVENTS.downloadStarted, { device: notMac ? 'not-mac' : 'mac' })}>Download for Apple Silicon</a>
        <p className="web-note">Requires an M1 chip or newer, macOS 11 or later and a camera. Intel Macs are not supported. Signed and notarized by Apple.</p>
      </div>

      <h2 className="web-section-title">Install</h2>
      <ol className="web-steps">
        {STEPS.map(step => (
          <li key={step.title}>
            <div>
              <strong>{step.title}</strong>
              <p>{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <h2 className="web-section-title">What stays on your Mac</h2>
      <div className="web-card">
        <p className="web-note" style={{ marginTop: 0 }}>
          Your focus sessions, session history and everything from the camera stay on your Mac and are never
          uploaded. Our server only knows your email address and your beta access. The app checks that access and
          looks for updates on GitHub.
        </p>
      </div>

      <p className="web-note">
        Stuck? Write to <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: 'inherit' }}>{CONTACT_EMAIL}</a>.
      </p>
    </WebShell>
  )
}
