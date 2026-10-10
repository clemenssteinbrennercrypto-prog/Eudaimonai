// Where a waitlist request came from, as a short slug. Only campaign labels
// from the link itself (utm_source / ref, utm_campaign): no referrer, no
// cookies, nothing about the visitor. The database accepts [a-z0-9_.-]{1,64}.

function slug(value) {
  const text = String(value ?? '').toLowerCase().trim()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return text || null
}

export function attributionFromSearch(search = '') {
  const params = new URLSearchParams(search)
  return {
    source: slug(params.get('utm_source') ?? params.get('ref')) ?? 'direct',
    campaign: slug(params.get('utm_campaign')),
  }
}
