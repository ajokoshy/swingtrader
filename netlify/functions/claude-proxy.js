/**
 * Netlify Function: claude-proxy
 * Server-side proxy for Anthropic Claude API.
 * Fixes "Failed to fetch" / CORS errors in production.
 *
 * Place at: netlify/functions/claude-proxy.js
 *
 * Set in Netlify Dashboard → Site Settings → Environment Variables:
 *   Key:   ANTHROPIC_API_KEY
 *   Value: sk-ant-...  (from console.anthropic.com)
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default async (req) => {
  // ── Handle CORS preflight FIRST (before any other check) ──
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  // ── Only allow POST ──
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed. Use POST.' }),
      { status: 405, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }

  // ── Check API key is configured ──
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: 'ANTHROPIC_API_KEY is not set. Go to Netlify Dashboard → Site Settings → Environment Variables and add it.'
      }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }

  // ── Parse request body ──
  let body
  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON in request body.' }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }

  if (!body.messages || !Array.isArray(body.messages)) {
    return new Response(
      JSON.stringify({ error: 'Missing or invalid messages array.' }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }

  // ── Forward to Anthropic ──
  let anthropicRes
  try {
    anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      body.model      || 'claude-sonnet-4-20250514',
        max_tokens: body.max_tokens || 1000,
        messages:   body.messages,
      }),
    })
  } catch (fetchErr) {
    return new Response(
      JSON.stringify({ error: `Could not reach Anthropic API: ${fetchErr.message}` }),
      { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }

  // ── Parse Anthropic response ──
  let data
  try {
    data = await anthropicRes.json()
  } catch {
    return new Response(
      JSON.stringify({ error: `Anthropic returned non-JSON response (status ${anthropicRes.status})` }),
      { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }

  // ── Return response (including error responses from Anthropic) ──
  return new Response(JSON.stringify(data), {
    status: anthropicRes.status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

export const config = { path: '/.netlify/functions/claude-proxy' }
