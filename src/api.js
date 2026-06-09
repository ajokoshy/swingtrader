/**
 * api.js
 * All external API calls routed through Netlify Function proxies.
 * No direct browser-to-API calls = no CORS errors in production.
 */

const YAHOO_PROXY  = '/.netlify/functions/yahoo-proxy'
const CLAUDE_PROXY = '/.netlify/functions/claude-proxy'

// ─────────────────────────────────────────────────────────
// Helper: safely extract a readable error string from anything
// ─────────────────────────────────────────────────────────
function extractError(err) {
  if (!err) return 'Unknown error'
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message
  if (typeof err === 'object') {
    // Anthropic API error shape: { error: { message: '...' } }
    if (err.error?.message) return err.error.message
    if (err.error && typeof err.error === 'string') return err.error
    if (err.message) return err.message
    // Last resort: serialize so it's readable
    try { return JSON.stringify(err) } catch { return 'Unknown error' }
  }
  return String(err)
}

// ─────────────────────────────────────────────────────────
// Yahoo Finance — proxied server-side (CORS fix)
// ─────────────────────────────────────────────────────────
export async function fetchOHLCV(symbol, range = '1y', interval = '1d') {
  const sym = symbol.toUpperCase().endsWith('.NS')
    ? symbol.toUpperCase()
    : `${symbol.toUpperCase()}.NS`

  const url = `${YAHOO_PROXY}?${new URLSearchParams({ symbol: sym, range, interval })}`

  let response
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(15000) })
  } catch (err) {
    const name = err?.name || ''
    if (name === 'AbortError' || name === 'TimeoutError') {
      throw new Error('Request timed out. Check your internet connection and try again.')
    }
    throw new Error(`Network error: ${extractError(err)}`)
  }

  if (!response.ok) {
    let msg = `Data fetch failed (HTTP ${response.status}).`
    try {
      const body = await response.json()
      if (body?.error) msg = extractError(body.error)
    } catch { /* ignore parse error */ }
    throw new Error(msg)
  }

  let json
  try {
    json = await response.json()
  } catch {
    throw new Error('Invalid response from data source. Please try again.')
  }

  const result = json?.chart?.result?.[0]
  if (!result) {
    const errMsg = json?.chart?.error?.description || 'No data found.'
    throw new Error(`${sym}: ${errMsg} — Verify the NSE symbol is correct.`)
  }

  const { timestamp, indicators: { quote: [q] } } = result
  if (!timestamp || !q) throw new Error('Incomplete data received. Please try again.')

  const data = timestamp.map((t, i) => ({
    ts:     t,
    date:   new Date(t * 1000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
    open:   q.open?.[i]   ?? null,
    high:   q.high?.[i]   ?? null,
    low:    q.low?.[i]    ?? null,
    close:  q.close?.[i]  ?? null,
    volume: q.volume?.[i] ?? 0,
  })).filter(d => d.close != null && d.high != null && d.low != null && d.open != null)

  if (data.length === 0) throw new Error(`No valid price data returned for ${sym}.`)
  return data
}

// ─────────────────────────────────────────────────────────
// Claude AI — proxied server-side (CORS fix)
// Requires ANTHROPIC_API_KEY in Netlify environment variables
// ─────────────────────────────────────────────────────────
export async function getAISummary(symbol, analysis) {
  const prompt = `You are a precise NSE swing trading analyst for Indian equities. In exactly 4 sentences, analyse this technical data for ${symbol}:

Signal: ${analysis.signal} | Score: ${analysis.score} | Confidence: ${analysis.confidence}%
Timeframes: Weekly=${analysis.timeframes.weekly}, Daily=${analysis.timeframes.daily}, 4H=${analysis.timeframes.h4}
RSI=${analysis.indicators.rsi} | MACD=${analysis.indicators.macd} | ADX=${analysis.indicators.adx}
Supertrend=${analysis.indicators.stBull ? 'BULLISH' : 'BEARISH'} | OBV=${analysis.indicators.obvTrend}
Price=₹${analysis.price} | SL=₹${analysis.stopLoss} | T1=₹${analysis.target1} | T2=₹${analysis.target2} | R:R=1:${analysis.rrRatio}
Patterns: ${analysis.patterns.map(p => p.name).join(', ') || 'None detected'}
Bull signals: ${analysis.bullCount}/${analysis.totalSigs} | Bear signals: ${analysis.bearCount}/${analysis.totalSigs}

Sentence 1: State the overall signal and why (mention 2 key indicators).
Sentence 2: Comment on multi-timeframe alignment or divergence.
Sentence 3: State exact entry, stop loss and target levels.
Sentence 4: Name the single biggest risk to this trade setup.
Plain text only. No markdown. No disclaimers. No bullet points.`

  // ── Call proxy ──
  let response
  try {
    response = await fetch(CLAUDE_PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(25000),
    })
  } catch (err) {
    const name = err?.name || ''
    if (name === 'AbortError' || name === 'TimeoutError') {
      throw new Error('AI request timed out. Please try again.')
    }
    throw new Error(`AI request failed: ${extractError(err)}`)
  }

  // ── Parse response ──
  let data
  try {
    data = await response.json()
  } catch {
    throw new Error(`AI service returned invalid response (HTTP ${response.status}).`)
  }

  // ── Handle Anthropic-level errors (e.g. invalid API key, quota exceeded) ──
  if (!response.ok) {
    // Anthropic error shape: { type: 'error', error: { type: '...', message: '...' } }
    const msg = data?.error?.message || data?.error || `AI service error (HTTP ${response.status})`
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }

  // ── Extract text ──
  const text = data?.content?.[0]?.text
  if (!text) {
    throw new Error('AI returned an empty response. Please try again.')
  }

  return text
}
