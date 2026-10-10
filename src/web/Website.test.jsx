/** @vitest-environment jsdom */
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import Website from './Website'
import { DATENSCHUTZ } from '../components/LegalModal'

afterEach(cleanup)

const api = { configured: true, session: vi.fn().mockResolvedValue(null) }

describe('Website routes', () => {
  it('renders each page by path and keeps activation and admin out of search engines', async () => {
    render(<Website api={api} pathname="/download" />)
    expect(screen.getByRole('heading', { name: 'Get Eudaimonai for your Mac' })).toBeInTheDocument()
    expect(document.querySelector('meta[name="robots"]')).toBeNull()
    cleanup()

    render(<Website api={api} pathname="/admin" />)
    expect(await screen.findByRole('heading', { name: 'Admin sign-in' })).toBeInTheDocument()
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow')
    cleanup()

    render(<Website api={api} pathname="/activate" />)
    expect(screen.getByRole('heading', { name: 'Activate your beta access' })).toBeInTheDocument()
  })

  it('leads the landing page with requesting access, not a download', () => {
    render(<Website api={{ configured: true, joinWaitlist: vi.fn() }} pathname="/" />)
    expect(screen.getAllByRole('button', { name: 'Request beta access' }).length).toBeGreaterThan(0)
    expect(screen.queryByText('Download for Apple Silicon')).not.toBeInTheDocument()
    expect(document.querySelector('a[href$=".dmg"]')).toBeNull()
    for (const link of screen.getAllByRole('link', { name: 'Activate your access' })) {
      expect(link).toHaveAttribute('href', '/activate')
    }
    // Each copy of the form needs its own input, or the labels point at one.
    const ids = [...document.querySelectorAll('input[type="email"]')].map(input => input.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('serves the legal texts at their own addresses, from the same source as the app', () => {
    render(<Website api={api} pathname="/privacy" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument()
    for (const section of DATENSCHUTZ) {
      expect(screen.getByRole('heading', { level: 2, name: section.heading })).toBeInTheDocument()
    }
    expect(document.querySelector('meta[name="robots"]')).toBeNull()
    cleanup()

    render(<Website api={api} pathname="/legal" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Legal Notice' })).toBeInTheDocument()
    expect(screen.getByText(/Heinrich-Casper-Gasse 17, 8010 Graz, Austria/)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Privacy Policy' })[0]).toHaveAttribute('href', '/privacy')
  })
})

// The landing copy may say what is measured and where it stays, never more
// (AGENTS.md §5). Account and access data is server-side, so a blanket
// "nothing leaves" promise would be false, and the score is not a validated
// measure of cognition.
describe('landing copy stays inside what the product supports', () => {
  it('makes no blanket privacy promise and no scientific claim', () => {
    render(<Website api={{ configured: true, joinWaitlist: vi.fn() }} pathname="/" />)
    const text = document.body.textContent
    for (const phrase of [
      /nothing (ever )?leaves/i, /never leaves/i, /scientifically/i, /proven/i, /neuroscience/i,
      /really are/i, /true (cognitive )?focus/i, /AI-powered/i, /unlock/i, /potential/i,
    ]) {
      expect(text).not.toMatch(phrase)
    }
    expect(text).toMatch(/focus data stays on your Mac/i)
    expect(text).toMatch(/sample data/i)
  })
})

describe('the app and the website stay separate', () => {
  const src = join(import.meta.dirname, '..')
  const files = dir => readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : [path]
  })

  it('no app module imports the Supabase client or the web funnel', () => {
    const offenders = files(src)
      .filter(path => /\.(js|jsx)$/.test(path) && !/\.test\./.test(path))
      .filter(path => !relative(src, path).startsWith('web/'))
      .filter(path => {
        const text = readFileSync(path, 'utf8')
        return /@supabase\/supabase-js/.test(text) || /from '\.\/web\/(?!routes')|from '\.\.\/web\//.test(text)
      })
      .map(path => relative(src, path))
    expect(offenders).toEqual([])
  })

  it('loads the website lazily from main.jsx', () => {
    const main = readFileSync(join(src, 'main.jsx'), 'utf8')
    expect(main).toMatch(/lazy\(\(\) => import\('\.\/web\/Website'\)\)/)
    expect(main).not.toMatch(/import Website from/)
  })
})
