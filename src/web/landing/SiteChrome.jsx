import { useEffect, useRef } from 'react'

// Header and footer shared by the landing page and the legal pages. The
// funnel pages (/activate, /download, /admin) keep their own WebShell.

// A hairline under the header fills as you read, like a session's elapsed ring.
function useReadingProgress(barRef) {
  useEffect(() => {
    const bar = barRef.current
    if (!bar) return undefined
    let frame = 0
    const update = () => {
      frame = 0
      const max = document.documentElement.scrollHeight - window.innerHeight
      bar.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`
    }
    const onScroll = () => { frame ||= requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [barRef])
}

export function SiteHeader() {
  const barRef = useRef(null)
  useReadingProgress(barRef)
  return (
    <header className="site-header">
      <span className="site-progress" ref={barRef} aria-hidden="true" />
      <div className="site-header-bar">
        <a className="site-brand" href="/">
          <img src="/apple-touch-icon.png" alt="" width="24" height="24" />
          <span className="site-word">Eudaimonai</span>
        </a>
        <a className="site-pill site-pill-sm" href="/#access">Request access</a>
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
