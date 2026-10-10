/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { accessMessage, sendSignInCode, useBetaAccess, verifySignInCode } from './betaAccess'

afterEach(() => { delete window.__TAURI__ })

describe('beta access bridge', () => {
  it('passes input to Rust and returns its status', async () => {
    const invoke = vi.fn().mockResolvedValue({ phase: 'signed_out' })
    window.__TAURI__ = { core: { invoke } }
    expect(await sendSignInCode('friend@example.com')).toEqual({ status: { phase: 'signed_out' }, error: null })
    expect(invoke).toHaveBeenCalledWith('access_send_code', { email: 'friend@example.com' })
    await verifySignInCode('friend@example.com', '12345678')
    expect(invoke).toHaveBeenLastCalledWith('access_verify_code', { email: 'friend@example.com', code: '12345678' })
  })

  it('turns a Rust error into a known code, and anything else into "unknown"', async () => {
    window.__TAURI__ = { core: { invoke: vi.fn().mockRejectedValue('not_invited') } }
    expect((await sendSignInCode('x@example.com')).error).toBe('not_invited')
    window.__TAURI__ = { core: { invoke: vi.fn().mockRejectedValue(new Error('Supabase said: secret detail')) } }
    expect((await sendSignInCode('x@example.com')).error).toBe('unknown')
  })

  it('never shows raw server text', () => {
    expect(accessMessage('network')).toMatch(/can’t reach the server/)
    expect(accessMessage('something-else')).toBe('Something went wrong. Please try again.')
  })
})

describe('useBetaAccess', () => {
  it('is never gated outside the native app', () => {
    const { result } = renderHook(() => useBetaAccess())
    expect(result.current.native).toBe(false)
    expect(result.current.status.mayStartSessions).toBe(true)
  })

  it('loads the status from Rust and follows its events', async () => {
    let emit
    window.__TAURI__ = {
      core: { invoke: vi.fn().mockResolvedValue({ phase: 'signed_out', mayStartSessions: false }) },
      event: { listen: vi.fn(async (_name, handler) => { emit = handler; return () => {} }) },
    }
    const { result } = renderHook(() => useBetaAccess())
    await waitFor(() => expect(result.current.status?.phase).toBe('signed_out'))
    act(() => emit({ payload: { phase: 'active', mayStartSessions: true } }))
    expect(result.current.status.phase).toBe('active')
  })
})
