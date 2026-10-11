import { DATENSCHUTZ, IMPRESSUM } from '../components/LegalModal'
import { SiteFooter, SiteHeader } from './landing/SiteChrome'
import './landing/landing.css'

// Linkable Legal Notice and Privacy Policy. The text is the same constant the
// app's LegalModal shows, so the two can never drift; edit it there, and only
// after checking the code still supports it (see the note in LegalModal.jsx).
const DOCUMENTS = {
  '/legal': { title: 'Legal Notice', sections: IMPRESSUM },
  '/privacy': { title: 'Privacy Policy', sections: DATENSCHUTZ },
}

export default function LegalPage({ route }) {
  const document = DOCUMENTS[route] ?? DOCUMENTS['/legal']
  return (
    <div className="site">
      <SiteHeader />
      <main className="site-legal site-wrap">
        <h1>{document.title}</h1>
        {document.sections.map(section => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            <p>{section.body}</p>
          </section>
        ))}
      </main>
      <SiteFooter />
    </div>
  )
}
