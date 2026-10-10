/** @vitest-environment jsdom */
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import Website from './Website'

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
    expect(screen.getByRole('button', { name: 'Request beta access' })).toBeInTheDocument()
    expect(screen.queryByText('Download for Apple Silicon')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Activate your access' })).toHaveAttribute('href', '/activate')
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
      // The landing page is only ever rendered by the website chunk.
      .filter(path => !path.endsWith('components/LandingPage.jsx'))
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
