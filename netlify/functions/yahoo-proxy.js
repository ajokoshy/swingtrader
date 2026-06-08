/**
 * Netlify Function: yahoo-proxy
 * Server-side proxy for Yahoo Finance API
 * Fixes CORS issues in production — all Yahoo Finance calls go through here
 */
export default async (req, context) => {
  const url = new URL(req.url)
  const symbol = url.searchParams.get('symbol')
  const range  = url.searchParams.get('range')  || '1y'
  const interval = url.searchParams.get('interval') || '1d'

  if (!symbol) {
    return new Response(JSON.stringify({ error: 'Missing symbol parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const sym = symbol.toUpperCase().endsWith('.NS') ? symbol.toUpperCase() : `${symbol.toUpperCase()}.NS`
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=${interval}&range=${range}&includePrePost=false`

  try {
    const res = await fetch(yahooUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    })

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Yahoo Finance returned ${res.status}` }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    const data = await res.json()
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=900', // 15 min cache
      }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to fetch from Yahoo Finance', details: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }
}

export const config = { path: '/.netlify/functions/yahoo-proxy' }
