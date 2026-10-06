// The website's only door to the beta backend. Every call returns
// { data, error } where error is one of the stable codes below (or null), so
// pages render fixed copy instead of server text.
//
// Authorization never happens here: admin calls are plain RPCs that the
// database refuses for non-admins. This layer only translates.

const DATABASE_CODES = [
  'rate_limited', 'invalid_email', 'invalid_source', 'invalid_campaign',
  'already_activated', 'no_valid_invitation', 'email_not_verified', 'not_authenticated',
  'not_authorized', 'already_invited', 'invitations_paused', 'capacity_exhausted',
  'invitation_not_revocable', 'entitlement_not_revocable', 'entitlement_revoked',
  'entitlement_not_extendable', 'invalid_days', 'capacity_below_lifetime_allocations',
  'already_internal', 'user_not_found', 'entitlement_not_found',
]

const FUNCTION_CODES = ['invitation_not_found', 'invitation_not_live', 'email_failed', 'not_configured', 'invalid_invitation_id']

export function errorCode(error) {
  if (!error) return null
  const text = [error.code, error.error_code, error.message, error.error].filter(Boolean).join(' ')
  const known = [...DATABASE_CODES, ...FUNCTION_CODES].find(code => new RegExp(`\\b${code}\\b`).test(text))
  if (known) return known
  if (/invite-only/i.test(text)) return 'not_invited'
  if (error.status === 429 || /rate limit|over_email_send_rate_limit|too many/i.test(text)) return 'rate_limited'
  if (/otp_expired|expired or is invalid|token has expired|invalid otp/i.test(text)) return 'code_invalid'
  if (/signups not allowed|otp_disabled|user not found/i.test(text)) return 'no_account'
  // supabase-js reports both a dropped connection and a 5xx as a "retryable
  // fetch error"; only the first is the visitor's network.
  if (error.status >= 500) return 'unknown'
  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(text) || error.name === 'AuthRetryableFetchError') return 'network'
  return 'unknown'
}

async function settle(promise) {
  try {
    const { data, error } = await promise
    return { data: data ?? null, error: errorCode(error) }
  } catch (error) {
    return { data: null, error: errorCode(error) }
  }
}

// supabase-js reports a function's non-2xx body only through the response
// on the error's context.
async function settleFunction(promise) {
  try {
    const { data, error } = await promise
    if (!error) return { data, error: null }
    const body = await error.context?.json?.().catch(() => null)
    return { data: null, error: errorCode({ ...error, error: body?.error }) }
  } catch (error) {
    return { data: null, error: errorCode(error) }
  }
}

export function createBetaApi(client) {
  return {
    configured: Boolean(client),

    joinWaitlist: (email, { source, campaign } = {}) =>
      settle(client.rpc('join_waitlist', { p_email: email, p_source: source ?? null, p_campaign: campaign ?? null })),

    // createUser is true only on /activate: the database hook still refuses
    // any address without a live invitation.
    requestCode: (email, { createUser }) =>
      settle(client.auth.signInWithOtp({ email, options: { shouldCreateUser: createUser } })),
    verifyCode: (email, token) => settle(client.auth.verifyOtp({ email, token, type: 'email' })),
    session: async () => (await client.auth.getSession()).data.session,
    signOut: () => settle(client.auth.signOut({ scope: 'local' })),

    claimInvitation: () => settle(client.rpc('claim_beta_invitation')),
    myAccess: () => settle(client.rpc('get_my_access')),

    isAdmin: async userId => {
      const result = await settle(client.from('admin_users').select('user_id').eq('user_id', userId).maybeSingle())
      return { data: Boolean(result.data), error: result.error }
    },
    capacity: () => settle(client.from('beta_capacity').select('*').maybeSingle()),
    people: search => settle(client.rpc('admin_list_people', { p_search: search || null })),
    auditLog: (limit = 20) =>
      settle(client.from('admin_audit_log').select('id, action, target_type, target_id, created_at').order('id', { ascending: false }).limit(limit)),

    invite: email => settle(client.rpc('admin_invite', { p_email: email })),
    sendInvitationEmail: invitationId =>
      settleFunction(client.functions.invoke('send-invitation', { body: { invitation_id: invitationId } })),
    revokeInvitation: invitationId => settle(client.rpc('admin_revoke_invitation', { p_invitation_id: invitationId })),
    extendEntitlement: (entitlementId, days) =>
      settle(client.rpc('admin_extend_entitlement', { p_entitlement_id: entitlementId, p_days: days })),
    revokeEntitlement: (entitlementId, reason) =>
      settle(client.rpc('admin_revoke_entitlement', { p_entitlement_id: entitlementId, p_reason: reason ?? null })),
    updateConfig: ({ capacity, invitationsPaused }) =>
      settle(client.rpc('admin_update_beta_config', {
        p_capacity: capacity ?? null,
        p_invitations_paused: invitationsPaused ?? null,
      })),
  }
}
