// Header and footer shared by the landing page and the legal pages. The
// funnel pages (/activate, /download, /admin) keep their own WebShell.
export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header-bar">
        <a className="site-brand" href="/">
          <img src="/apple-touch-icon.png" alt="" width="24" height="24" />
          <span className="site-word">Eudaimonai</span>
        </a>
        <a className="site-pill site-pill-sm" href="/#beta">Request access</a>
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <span className="site-word">Eudaimonai</span>
      <nav aria-label="Footer">
        <a href="/activate">Activate</a>
        <a href="/download">Download</a>
        <a href="/legal">Legal Notice</a>
        <a href="/privacy">Privacy Policy</a>
      </nav>
      <p className="site-footer-note">Product screens show sample data.</p>
    </footer>
  )
}
