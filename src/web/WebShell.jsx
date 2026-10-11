import { useState } from 'react'
import LegalModal from '../components/LegalModal'
import { SiteFooter, SiteHeader } from './landing/SiteChrome'
import './landing/landing.css'

// Frame for the funnel and admin pages: wordmark home link, content, legal
// footer. The landing page keeps its own full-bleed layout.
//
// `site` dresses a funnel page (/activate, /download) in the public site's
// silver look, with the site's header and footer; the page's own markup and
// logic stay the same. The admin console keeps the dark frame.
export default function WebShell({ children, wide = false, note = null, site = false }) {
  const [legalTab, setLegalTab] = useState(null)
  if (site) {
    return (
      <div className="site site-shell">
        <SiteHeader />
        <main className="site-wrap site-shell-main">{children}</main>
        <SiteFooter />
      </div>
    )
  }
  return (
    <div className="web-page">
      <header className="web-header">
        <a className="web-wordmark" href="/">Eudaimonai</a>
        {note && <span className="web-header-note">{note}</span>}
      </header>
      <main className={`web-main${wide ? ' is-wide' : ''}`}>{children}</main>
      <footer className="web-footer">
        <span className="web-wordmark">Eudaimonai</span>
        <div style={{ display: 'flex', gap: 20 }}>
          <button type="button" onClick={() => setLegalTab('impressum')}>Legal Notice</button>
          <button type="button" onClick={() => setLegalTab('datenschutz')}>Privacy Policy</button>
        </div>
      </footer>
      <LegalModal open={legalTab !== null} onClose={() => setLegalTab(null)} initialTab={legalTab ?? 'impressum'} />
    </div>
  )
}
