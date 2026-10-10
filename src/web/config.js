// Public website → beta backend configuration. Both values are public by
// design (Supabase URL + publishable key); access is enforced by RLS and the
// database functions, never by keeping these secret.
//
// A privileged key here would be a serious leak, so it is refused outright
// rather than trusted.

export function readBackendConfig(env) {
  const url = String(env.VITE_SUPABASE_URL ?? '').trim()
  const key = String(env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim()
  const environment = String(env.VITE_BETA_ENVIRONMENT ?? '').trim()
  if (isPrivilegedKey(key)) {
    throw new Error('Refusing a privileged Supabase key in the website build. Use the publishable key.')
  }
  return { url, key, environment, configured: Boolean(url && key) }
}

export function isPrivilegedKey(key) {
  if (key.startsWith('sb_secret_')) return true
  const payload = key.split('.')[1]
  if (!payload) return false
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return json.role === 'service_role'
  } catch {
    return false
  }
}

export const backendConfig = readBackendConfig(import.meta.env)
