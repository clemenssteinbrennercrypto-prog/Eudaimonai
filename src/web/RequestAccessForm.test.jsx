/** @vitest-environment jsdom */
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RequestAccessForm from './RequestAccessForm'

afterEach(cleanup)

const apiReturning = result => ({ configured: true, joinWaitlist: vi.fn().mockResolvedValue(result) })

function submit(email) {
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: email } })
  fireEvent.click(screen.getByRole('button', { name: 'Request beta access' }))
}

describe('RequestAccessForm', () => {
  it('joins the waitlist with link attribution and says it is not an account', async () => {
    const api = apiReturning({ data: null, error: null })
    render(<RequestAccessForm api={api} search="?utm_source=reddit&utm_campaign=launch" />)
    submit(' ada@example.com ')
    expect(await screen.findByText(/You’re on the list/)).toBeInTheDocument()
    expect(screen.getByText(/Joining doesn’t create an account/)).toBeInTheDocument()
    expect(api.joinWaitlist).toHaveBeenCalledWith('ada@example.com', { source: 'reddit', campaign: 'launch' })
  })

  it('shows the rate-limit message', async () => {
    render(<RequestAccessForm api={apiReturning({ data: null, error: 'rate_limited' })} search="" />)
    submit('ada@example.com')
    expect(await screen.findByRole('alert')).toHaveTextContent('try again in an hour')
  })

  // The browser's own check already stops "ada@"; the server catches what it lets
  // through, such as an address without a domain dot.
  it('shows an invalid-email message and keeps the form', async () => {
    render(<RequestAccessForm api={apiReturning({ data: null, error: 'invalid_email' })} search="" />)
    submit('ada@localhost')
    expect(await screen.findByRole('alert')).toHaveTextContent('complete email address')
    expect(screen.getByRole('button', { name: 'Request beta access' })).toBeInTheDocument()
  })

  it('never shows server text for unexpected errors', async () => {
    render(<RequestAccessForm api={apiReturning({ data: null, error: 'already_invited' })} search="" />)
    submit('ada@example.com')
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on our side')
  })

  it('pretends success to a bot that fills the hidden field, without calling the server', async () => {
    const api = apiReturning({ data: null, error: null })
    const { container } = render(<RequestAccessForm api={api} search="" />)
    fireEvent.change(container.querySelector('input[name="company"]'), { target: { value: 'Acme' } })
    submit('bot@example.com')
    await waitFor(() => expect(screen.getByText(/You’re on the list/)).toBeInTheDocument())
    expect(api.joinWaitlist).not.toHaveBeenCalled()
  })

  it('says requests open soon when the backend is not configured', () => {
    render(<RequestAccessForm api={{ configured: false }} search="" />)
    expect(screen.getByText('Beta requests open soon.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Request beta access' })).not.toBeInTheDocument()
  })
})
