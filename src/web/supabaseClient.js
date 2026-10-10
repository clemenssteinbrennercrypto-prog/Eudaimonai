import { createClient } from '@supabase/supabase-js'
import { backendConfig } from './config'

let client = null

// One client per page load. The session lives in this browser's localStorage
// under its own key; /activate signs out right after activating, so only an
// admin stays signed in.
export function getSupabase() {
  if (!backendConfig.configured) return null
  client ??= createClient(backendConfig.url, backendConfig.key, {
    auth: {
      storageKey: 'eudaimonai-web-auth',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  })
  return client
}
