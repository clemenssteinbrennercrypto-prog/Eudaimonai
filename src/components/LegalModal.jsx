import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

const navy = 'var(--ultra)'

// § 5 ECG (Austrian E-Commerce Act) requires the geographic address: street,
// number, postcode and town. Without another establishment that is the home
// address. Never replace it with a town alone.
export const IMPRESSUM = [
  {
    heading: 'Information pursuant to § 5 ECG (Austrian E-Commerce Act)',
    body: `Name: Clemens Steinbrenner
Address: Heinrich-Casper-Gasse 17, 8010 Graz, Austria
Email: clemenssteinbrenner.crypto@gmail.com`,
  },
  {
    heading: 'Disclaimer',
    body: `The content of this website has been prepared with the greatest possible care. No guarantee is given for its accuracy, completeness or timeliness.`,
  },
]

// This policy describes what the code ACTUALLY does. It once promised that
// data "never leaves your device" while the app asked GitHub for updates at
// launch and every five minutes, sending the IP address to the USA. An
// over-broad promise is worse than a long explanation: it can be disproved,
// and it doubles as the marketing claim.
//
// Before changing anything here, check the code still supports it:
//   Update interval       src/lib/useUpdateAvailable.js  (CHECK_INTERVAL_MS)
//   Model providers off   src/lib/storage.js             (CONTRACT_DEFAULTS)
//   Metadata only         companion/src-tauri/src/output.rs
//   Beta records          supabase/migrations/ (what the tables hold)
//   Waitlist rate limit   supabase/migrations/20261006090000_beta_web_funnel.sql
//   Erasure on deletion   same migration, erase_beta_records_for_deleted_account
//   App access check      companion/src-tauri/src/access/ (what the app sends,
//                         when it checks, what it keeps in the Keychain)
//
// TODO(legal): Clemens to confirm before the first external beta user:
//   – the legal bases named below (Art. 6(1)(b) for beta records, 6(1)(f) for
//     the rate limit),
//   – the third-country transfer wording for Supabase Inc., Resend Inc. and
//     Vercel Inc. (USA), e.g. the EU-US Data Privacy Framework,
//   – whether to promise a fixed retention period for waitlist entries and
//     invitations (the code deletes them on account deletion or on request).
export const DATENSCHUTZ = [
  {
    heading: 'Controller',
    body: `Clemens Steinbrenner (see Legal Notice)`,
  },
  {
    heading: 'Principle',
    body: `Eudaimonai processes your focus data on your Mac. Focus sessions, session history, camera measurements and activity data are stored only on your device and are not uploaded.

To run the closed beta, we process a small amount of account data on servers: your email address, your invitation and your access status (see “Closed beta”). The macOS app connects to the internet for two things only: the beta access check and the update check, both described below.`,
  },
  {
    heading: 'Camera',
    body: `The camera is used only to analyse attention on your device. Individual camera frames are briefly processed in memory for this purpose, but are neither stored permanently nor transmitted. The analysis runs locally with MediaPipe; only measurements such as eyelid opening, blink rate and head pose are derived from the image, and these never leave the device either.

Facial features are NOT processed to identify anyone. There is no face matching and no recognition. This is therefore not biometric data within the meaning of Art. 9 GDPR, which covers processing only for the purpose of uniquely identifying a person.`,
  },
  {
    heading: 'Local storage',
    body: `In the native macOS app, your session data is stored in a local SQLite database in the app's data folder. In web and development mode, the app uses localStorage. The following is stored:
– Session statistics: duration, Focus Score, distraction events and timeline
– Apps and websites observed and, where the system provides them, window titles
– Session name, optional “Definition of plan” and the names of edited files, if you use progress tracking
– Workspace configuration, block lists, onboarding status and local settings

In the app you can delete individual sessions or your entire session history under Analytics → Sessions. “Clear all history” deletes the local session history including its daily totals; workspace configuration and other settings are kept. In web/development mode you can also clear your browser's site data.`,
  },
  {
    heading: 'Companion app (macOS)',
    body: `During a session, the companion app checks roughly every three seconds which app is in the foreground and, for supported browsers, the address of the active tab. This activity data is used for distraction detection, blocking and the local session overview, and is stored in the local session history.

If you choose a project folder for progress tracking, only metadata is read: file names, sizes, modification times and Git counters. File contents are never opened or read, and keystrokes are never recorded.`,
  },
  {
    heading: 'Update check (leaves the device)',
    body: `At launch and then roughly every five minutes, the app asks GitHub Releases whether a newer signed version is available. For technical reasons, GitHub receives your IP address and standard connection data. The app compares the installed version with the response locally; no session, camera or activity data is transmitted.

The legal basis is our legitimate interest in secure, up-to-date installations (Art. 6(1)(f) GDPR).`,
  },
  {
    heading: 'Closed beta: waitlist, invitation and access (leaves the device)',
    body: `When you request beta access, activate an invitation or sign in, we process:
– your email address,
– the campaign label of the link you came from, if it had one (for example the name of a post),
– the dates of your request, invitation, activation and sign-ins,
– your account ID and your access period (start, end, and whether it was ended early),
– while you are signed in, technical data of the sign-in session (IP address and browser or app identifier),
– internal records of administrative changes to your access, which reference your account ID but not your email address.

We use this only to run the closed beta: to manage the waitlist, send invitations and sign-in codes, and decide whether you may use the beta. It is stored with Supabase (Supabase Inc., USA) in a database hosted in Frankfurt, Germany. Supabase also keeps short-lived technical request logs, which include IP addresses.

Your focus sessions, session history, camera data, activity data, window titles and files are not part of this and are never uploaded.

Joining the waitlist does not create an account and does not grant access. An account is created only when you activate an invitation. The legal basis is carrying out the steps you request and your participation in the beta (Art. 6(1)(b) GDPR).`,
  },
  {
    heading: 'Beta access check in the app (leaves the device)',
    body: `When you request access or sign in inside the macOS app, it sends the email address you enter, and the one-time code you type, to our beta backend. The code is not stored. Your sign-in is kept in your Mac's Keychain, not in the app's other storage.

While you are signed in, the app asks the beta backend whether your access is still valid: when it starts, about once an hour while it runs, and before a session starts. It sends only your sign-in, and receives your access status and the server's time. If the Mac is offline, a previous confirmation keeps working for up to 72 hours, never beyond the end of your access.

No session, history, camera, activity or file data is part of this. Signing out, or losing access, removes only the sign-in from the Keychain; your local history stays on your Mac.`,
  },
  {
    heading: 'Emails',
    body: `Sign-in codes and invitations are sent through Resend (Resend Inc., USA), using sending infrastructure in Ireland (EU). Resend processes your email address and the content of these emails to deliver them. We do not send newsletters or marketing emails.`,
  },
  {
    heading: 'Abuse protection',
    body: `To keep the waitlist form from being flooded, we count requests per network address within one hour. We store only a keyed hash of the IP address, never the address itself. The counters are removed once they are a day old, the next time the form is used. The legal basis is our legitimate interest in protecting the service (Art. 6(1)(f) GDPR).`,
  },
  {
    heading: 'Deleting your beta records',
    body: `You can ask us at any time to delete your waitlist entry, invitation or account. When an account is deleted, its waitlist entry and open invitations are deleted with it. We keep only a pseudonymised form (a cryptographic hash) of the email address together with the date its free beta place was used, so that the same address cannot receive a free beta place twice.

If your beta access ends or is revoked, nothing on your Mac is deleted. Your session history stays where it is.`,
  },
  {
    heading: 'This website',
    body: `This website is delivered by the hosting provider Vercel Inc. (USA). When you visit it, Vercel processes technically necessary connection data such as IP address, time, page requested and browser identifier in order to deliver the site and protect it from abuse. The app file itself is provided for download by GitHub (USA), which also receives your IP address and standard connection data.

If you request beta access or activate an invitation here, the data described under “Closed beta” is sent to our beta backend. The website does not record which page you came from and collects no session, camera or activity data. The legal basis for delivering the site is our legitimate interest in providing it securely and reliably (Art. 6(1)(f) GDPR).`,
  },
  {
    heading: 'Cookies',
    body: `No cookies are set and no analytics or tracking service is used. When you activate an invitation or sign in as an administrator, the website keeps your sign-in session in your browser's local storage. After an activation it signs you out again straight away and removes it.`,
  },
  {
    heading: 'Support report',
    body: `You can voluntarily export a local support report as a JSON file from the app. It is never sent automatically and contains no sessions, scores, camera or landmark data, app names, URLs, window titles, file paths or credentials. Error states are included only as technical yes/no flags. You decide whether to share this file, and with whom.`,
  },
  {
    heading: 'Your rights',
    body: `You have the right of access, rectification, erasure, restriction of processing, data portability and objection, as well as the right to lodge a complaint with the Austrian Data Protection Authority (Datenschutzbehörde).

For your beta records (email address, invitation, access), write to the contact address below; we find them by your email address.

Your session data stays with you alone: we store no session data and cannot identify you from an update request, so we cannot match access or erasure requests to it (Art. 11 GDPR). You delete your local session history yourself under Analytics → Sessions → Clear all history; individual sessions can be deleted there too.`,
  },
  {
    heading: 'Contact',
    body: `Questions: clemenssteinbrenner.crypto@gmail.com`,
  },
]

function Section({ heading, body }) {
  return (
    <div>
      <p style={{
        fontSize: 13, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.07em',
        color: 'var(--text-muted)', marginTop: 28, marginBottom: 8,
      }}>
        {heading}
      </p>
      <p style={{
        fontSize: 15, lineHeight: 1.7, color: 'var(--text)',
        whiteSpace: 'pre-line',
      }}>
        {body}
      </p>
    </div>
  )
}

export default function LegalModal({ open, onClose, initialTab }) {
  const [tab, setTab] = useState(initialTab ?? 'impressum')
  const closeRef = useRef(null)
  const onCloseRef = useRef(onClose)
  const titleId = useId()

  useLayoutEffect(() => {
    if (open && initialTab) setTab(initialTab)
  }, [open, initialTab])

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return undefined
    const previousFocus = document.activeElement
    closeRef.current?.focus()
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onCloseRef.current?.()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus?.()
    }
  }, [open])

  if (!open) return null

  const sections = tab === 'impressum' ? IMPRESSUM : DATENSCHUTZ
  const keepFocusInside = (event) => {
    if (event.key !== 'Tab') return
    const controls = [...event.currentTarget.querySelectorAll(
      'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]',
    )]
    if (controls.length === 0) return
    const first = controls[0]
    const last = controls[controls.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      className="legal-modal-enter"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={keepFocusInside}
      style={{
        position: 'fixed', inset: 0,
        background: 'var(--bg)',
        overflowY: 'auto',
        zIndex: 400,
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif',
      }}
    >
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '48px 24px 80px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <h1 id={titleId} style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.022em', color: 'var(--text)', margin: 0 }}>
            {tab === 'impressum' ? 'Legal Notice' : 'Privacy Policy'}
          </h1>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            style={{
              padding: '9px 22px', fontSize: 14, fontWeight: 600,
              background: navy, color: 'var(--text)',
              border: 'none', borderRadius: 12,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            ← Back
          </button>
        </div>

        {/* Tabs */}
        <div role="group" aria-label="Legal information" style={{ display: 'flex', gap: 8, marginBottom: 32 }}>
          {[
            { id: 'impressum',   label: 'Legal Notice'   },
            { id: 'datenschutz', label: 'Privacy Policy' },
          ].map(t => (
            <button
              key={t.id}
              type="button"
              aria-pressed={tab === t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '8px 20px', fontSize: 13, fontWeight: 600,
                borderRadius: 100, cursor: 'pointer', fontFamily: 'inherit',
                background: tab === t.id ? navy : 'transparent',
                color:      tab === t.id ? '#fff' : '#6B7280',
                border:     tab === t.id ? 'none' : '1px solid var(--line)',
                transition: 'all 0.15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div>
          {sections.map((s, i) => (
            <Section key={i} heading={s.heading} body={s.body} />
          ))}
        </div>

      </div>
    </div>
  )
}
