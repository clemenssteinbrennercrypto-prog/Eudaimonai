import LogoMark from './LogoMark'

// Header and footer shared by the landing page and the legal pages. The
// funnel pages (/activate, /download, /admin) keep their own WebShell.
export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header-bar">
        <a className="site-brand" href="/">
          <LogoMark size={26} tone="ink" />
          <span className="site-word">Eudaimonai</span>
        </a>
        <nav className="site-header-nav" aria-label="Main">
          <a href="/#app">The app</a>
          <a href="/#how">How it works</a>
          <a href="/#privacy">Privacy</a>
          <a href="/#faq">Questions</a>
        </nav>
        <a className="site-pill site-pill-sm" href="/#access">Request access</a>
      </div>
    </header>
  )
}

export function SiteFooter({ sampleNote = false }) {
  return (
    <footer className="site-footer">
      <span className="site-footer-brand"><LogoMark size={28} tone="ink" /><span className="site-word">Eudaimonai</span></span>
      <nav aria-label="Footer">
        <a href="/activate">Activate</a>
        <a href="/download">Download</a>
        <a href="/legal">Legal Notice</a>
        <a href="/privacy">Privacy Policy</a>
      </nav>
      {sampleNote && <p className="site-footer-note">Graphics and product screens show sample data.</p>}
    </footer>
  )
}
