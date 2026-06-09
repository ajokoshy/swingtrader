import { useState, useCallback, useRef } from 'react'
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { fetchOHLCV, getAISummary } from './api.js'
import { runAnalysis } from './analysis.js'
import { StatPill, TFBadge, ChartTooltip, Spinner, ErrorBanner, NoTradeCard } from './components.jsx'

const QUICK_STOCKS = [
  'RELIANCE','TCS','INFY','HDFCBANK','ICICIBANK',
  'WIPRO','SBIN','BAJFINANCE','HINDUNILVR',
  'ADANIENT','AXISBANK','KOTAKBANK',
]

const CHART_TABS = [
  ['price', 'Price + Supertrend'],
  ['rsi',   'RSI'],
  ['macd',  'MACD'],
  ['adx',   'ADX'],
  ['obv',   'OBV'],
]

// ── Main App ───────────────────────────────────────────
export default function App() {
  const [symbol,    setSymbol]    = useState('')
  const [loading,   setLoading]   = useState(false)
  const [loadMsg,   setLoadMsg]   = useState('')
  const [error,     setError]     = useState('')
  const [result,    setResult]    = useState(null)
  const [aiText,    setAiText]    = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError,   setAiError]   = useState('')
  const [tab,       setTab]       = useState('price')
  const inputRef = useRef(null)

  const analyse = useCallback(async (sym) => {
    const s = (sym || symbol).trim().toUpperCase()
    if (!s) return

    setLoading(true)
    setError('')
    setResult(null)
    setAiText('')
    setAiError('')
    setAiLoading(false)
    setTab('price')

    try {
      setLoadMsg('Fetching daily data...')
      const daily = await fetchOHLCV(s, '1y', '1d')
      if (daily.length < 80) throw new Error(`Not enough data for ${s}. Use a Nifty 500 stock.`)

      setLoadMsg('Fetching weekly data...')
      const weekly = await fetchOHLCV(s, '5y', '1wk')

      setLoadMsg('Fetching 4-hour data...')
      let h4 = []
      try { h4 = await fetchOHLCV(s, '60d', '1h') } catch { h4 = [] }

      setLoadMsg('Running multi-timeframe analysis...')
      await new Promise(r => setTimeout(r, 200))

      const analysis = runAnalysis(daily, weekly, h4)
      setResult({ symbol: s, ...analysis })
      setLoading(false)

      if (!analysis.noTrade) {
        setAiLoading(true)
        getAISummary(s, analysis)
          .then(text => { setAiText(text); setAiLoading(false) })
          .catch(err => {
            let msg = 'AI summary unavailable. Please try again.'
            if (err instanceof Error) msg = err.message
            else if (typeof err === 'string') msg = err
            else if (err && typeof err === 'object') msg = err.message || err.error?.message || JSON.stringify(err)
            setAiError(msg)
            setAiLoading(false)
          })
      }

    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
      setLoading(false)
    }
  }, [symbol])

  const sc  = result?.color    || '#6366f1'
  const cd  = result?.chartData || []

  return (
    <div style={{
      minHeight: '100vh',
      background: '#09090f',
      color: '#e2e2ee',
      fontFamily: "'DM Mono','Courier New',monospace",
      backgroundImage: 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(99,102,241,0.1), transparent)',
    }}>
      <link
        href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:wght@400;500&family=Outfit:wght@400;600;800&display=swap"
        rel="stylesheet"
      />

      {/* ── HEADER ── */}
      <header style={{
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        padding: '14px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backdropFilter: 'blur(10px)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: 'rgba(9,9,15,0.92)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32,
            background: 'linear-gradient(135deg,#6366f1 0%,#06b6d4 100%)',
            borderRadius: 8, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 16,
          }}>⚡</div>
          <div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, letterSpacing: 2, lineHeight: 1 }}>
              SWING<span style={{ color: '#6366f1' }}>EDGE</span>{' '}
              <span style={{ color: '#06b6d4', fontSize: 14 }}>PRO</span>
            </div>
            <div style={{ fontSize: 8, color: '#444', letterSpacing: 2 }}>
              MULTI-TIMEFRAME · NSE INDIA
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e', display: 'inline-block', animation: 'blink 1.5s infinite' }} />
            NSE LIVE
          </div>
          <div style={{ fontSize: 9, color: '#444', marginTop: 1 }}>
            {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>

        {/* ── SEARCH ── */}
        <section style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 16, padding: 20, marginBottom: 20,
        }}>
          <div style={{ fontSize: 10, color: '#555', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 }}>
            NSE Stock Symbol
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              ref={inputRef}
              value={symbol}
              onChange={e => setSymbol(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && analyse()}
              placeholder="e.g. RELIANCE, TCS, INFY, SBIN..."
              aria-label="Stock symbol input"
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10, padding: '12px 16px',
                color: '#fff', fontSize: 16,
                fontFamily: "'Bebas Neue',sans-serif",
                letterSpacing: 2, outline: 'none',
              }}
            />
            <button
              onClick={() => analyse()}
              disabled={loading || !symbol}
              aria-label="Analyse stock"
              style={{
                background: loading ? '#1a1a2e' : 'linear-gradient(135deg,#6366f1,#06b6d4)',
                border: 'none', borderRadius: 10,
                padding: '12px 22px', color: '#fff',
                fontWeight: 800, fontSize: 13,
                cursor: loading || !symbol ? 'not-allowed' : 'pointer',
                fontFamily: "'Outfit',sans-serif",
                letterSpacing: 1,
                boxShadow: loading ? 'none' : '0 0 30px rgba(99,102,241,0.35)',
                whiteSpace: 'nowrap', transition: 'all .2s',
                opacity: !symbol ? 0.5 : 1,
              }}
            >
              {loading ? 'ANALYSING...' : 'ANALYSE ⚡'}
            </button>
          </div>

          {/* Quick picks */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
            {QUICK_STOCKS.map(s => (
              <button
                key={s}
                onClick={() => { setSymbol(s); analyse(s) }}
                disabled={loading}
                style={{
                  background: 'rgba(99,102,241,0.08)',
                  border: '1px solid rgba(99,102,241,0.2)',
                  borderRadius: 20, padding: '3px 10px',
                  fontSize: 9, color: '#818cf8',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontFamily: "'Bebas Neue',sans-serif",
                  letterSpacing: 1,
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </section>

        {/* ── ERROR ── */}
        {error && <ErrorBanner message={error} />}

        {/* ── LOADING ── */}
        {loading && <Spinner message={loadMsg} />}

        {/* ── NO TRADE ── */}
        {result?.noTrade && <NoTradeCard reason={result.reason} />}

        {/* ── RESULTS ── */}
        {result && !result.noTrade && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Signal card */}
            <div style={{
              background: result.bgColor,
              border: `1px solid ${sc}30`,
              borderRadius: 18, padding: 24,
              boxShadow: `0 0 80px ${sc}0d`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
                <div>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 36, letterSpacing: 2, lineHeight: 1 }}>
                    {result.symbol}
                    <span style={{ fontSize: 14, color: '#444', fontFamily: "'DM Mono',monospace", marginLeft: 6 }}>.NS</span>
                  </div>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 44, color: sc, letterSpacing: 1, lineHeight: 1 }}>
                    ₹{result.price}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{
                    background: `${sc}18`, border: `2px solid ${sc}`,
                    borderRadius: 14, padding: '14px 28px',
                    boxShadow: `0 0 40px ${sc}25`,
                  }}>
                    <div style={{ fontSize: 9, color: '#888', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>Signal</div>
                    <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 30, color: sc, letterSpacing: 2 }}>
                      {result.signal}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', marginTop: 10 }}>
                    <span style={{ fontSize: 10, color: '#555' }}>Confidence</span>
                    <div style={{ width: 100, height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${result.confidence}%`, height: '100%', background: `linear-gradient(90deg,${sc}80,${sc})`, borderRadius: 3, transition: 'width 1.2s ease' }} />
                    </div>
                    <span style={{ fontSize: 11, color: sc, fontWeight: 700 }}>{result.confidence}%</span>
                  </div>
                  <div style={{ fontSize: 10, color: '#555', marginTop: 4 }}>
                    {result.bullCount} bull · {result.bearCount} bear · {result.totalSigs} signals
                  </div>
                </div>
              </div>

              {/* Trade levels */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <StatPill label="Entry"     value={`₹${result.price}`}    color="#fff" />
                <StatPill label="Stop Loss" value={`₹${result.stopLoss}`} color="#ff6e6e" />
                <StatPill label="Target 1"  value={`₹${result.target1}`}  color="#00e676" />
                <StatPill label="Target 2"  value={`₹${result.target2}`}  color="#06b6d4" />
                <StatPill label="R : R"     value={`1 : ${result.rrRatio}`} color="#ffd740" />
              </div>
            </div>

            {/* Multi-timeframe */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: 9, color: '#555', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14 }}>
                Multi-Timeframe Confluence
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                <TFBadge label="Weekly (Macro)"  trend={result.timeframes.weekly} />
                <TFBadge label="Daily (Signal)"  trend={result.timeframes.daily}  />
                <TFBadge label="4-Hour (Entry)"  trend={result.timeframes.h4}     />
              </div>
              <div style={{ marginTop: 12, fontSize: 11, color: '#555', textAlign: 'center' }}>
                {(() => {
                  const tfs = [result.timeframes.weekly, result.timeframes.daily, result.timeframes.h4]
                  if (tfs.every(t => t === 'bullish')) return '✅ All 3 timeframes aligned — highest confidence setup'
                  if (tfs.every(t => t === 'bearish')) return '🔴 All 3 timeframes bearish — strong downtrend'
                  return '⚠️ Mixed timeframes — trade smaller, use tighter stop loss'
                })()}
              </div>
            </div>

            {/* Indicators row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(100px,1fr))', gap: 10 }}>
              <StatPill small label="RSI 14"     value={result.indicators.rsi}   color={result.indicators.rsi < 35 ? '#00e676' : result.indicators.rsi > 65 ? '#ff6e6e' : '#ffd740'} />
              <StatPill small label="ADX"        value={result.indicators.adx}   color={parseFloat(result.indicators.adx) > 25 ? '#00e676' : '#ffd740'} />
              <StatPill small label="MACD"       value={result.indicators.macd}  color={parseFloat(result.indicators.macd) > 0 ? '#00e676' : '#ff6e6e'} />
              <StatPill small label="Supertrend" value={result.indicators.stBull ? 'BULL' : 'BEAR'} color={result.indicators.stBull ? '#00e676' : '#ff6e6e'} />
              <StatPill small label="OBV"        value={result.indicators.obvTrend} color={result.indicators.obvTrend === 'Rising' ? '#00e676' : '#ff6e6e'} />
              <StatPill small label="EMA 20"     value={`₹${result.indicators.ema20}`} color="#818cf8" />
              <StatPill small label="EMA 50"     value={`₹${result.indicators.ema50}`} color="#c084fc" />
              <StatPill small label="VWAP"       value={`₹${result.indicators.vwap}`}  color="#06b6d4" />
            </div>

            {/* Charts */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 18 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                {CHART_TABS.map(([k, v]) => (
                  <button
                    key={k}
                    onClick={() => setTab(k)}
                    style={{
                      background: tab === k ? 'rgba(99,102,241,0.2)' : 'transparent',
                      border: tab === k ? '1px solid #6366f1' : '1px solid rgba(255,255,255,0.07)',
                      borderRadius: 7, padding: '5px 13px',
                      color: tab === k ? '#a5b4fc' : '#444',
                      fontSize: 10, cursor: 'pointer',
                      letterSpacing: 1, fontFamily: "'Outfit',sans-serif", fontWeight: 600,
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>

              {tab === 'price' && (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={cd} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={sc} stopOpacity={0.18} />
                        <stop offset="95%" stopColor={sc} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fill: '#444', fontSize: 9 }} tickLine={false} interval={9} />
                    <YAxis tick={{ fill: '#444', fontSize: 9 }} tickLine={false} tickFormatter={v => `₹${v}`} width={65} domain={['auto', 'auto']} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area     type="monotone" dataKey="close"   stroke={sc}       fill="url(#priceGrad)" strokeWidth={2} dot={false} name="Close" />
                    <Line     type="monotone" dataKey="ema20"   stroke="#6366f1"  strokeWidth={1.5} dot={false} name="EMA20" />
                    <Line     type="monotone" dataKey="ema50"   stroke="#c084fc"  strokeWidth={1.5} dot={false} name="EMA50" />
                    <Line     type="monotone" dataKey="stLine"  stroke="#ffd740"  strokeWidth={1.5} dot={false} name="Supertrend" strokeDasharray="4 2" />
                    <ReferenceLine y={result.stopLoss} stroke="#ff6e6e" strokeDasharray="3 3" label={{ value: 'SL', fill: '#ff6e6e', fontSize: 9 }} />
                    <ReferenceLine y={result.target1}  stroke="#00e676" strokeDasharray="3 3" label={{ value: 'T1', fill: '#00e676', fontSize: 9 }} />
                    <ReferenceLine y={result.target2}  stroke="#06b6d4" strokeDasharray="3 3" label={{ value: 'T2', fill: '#06b6d4', fontSize: 9 }} />
                  </AreaChart>
                </ResponsiveContainer>
              )}

              {tab === 'rsi' && (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={cd.filter(d => d.rsiVal != null)} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="rsiGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fill: '#444', fontSize: 9 }} tickLine={false} interval={9} />
                    <YAxis tick={{ fill: '#444', fontSize: 9 }} tickLine={false} domain={[0, 100]} width={30} />
                    <Tooltip content={<ChartTooltip />} />
                    <ReferenceLine y={70} stroke="#ff6e6e" strokeDasharray="3 3" label={{ value: '70', fill: '#ff6e6e', fontSize: 9 }} />
                    <ReferenceLine y={30} stroke="#00e676" strokeDasharray="3 3" label={{ value: '30', fill: '#00e676', fontSize: 9 }} />
                    <ReferenceLine y={50} stroke="#444"    strokeDasharray="2 2" />
                    <Area type="monotone" dataKey="rsiVal" stroke="#6366f1" fill="url(#rsiGrad)" strokeWidth={2} dot={false} name="RSI" />
                  </AreaChart>
                </ResponsiveContainer>
              )}

              {tab === 'macd' && (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={cd.filter(d => d.macdHist != null)} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <XAxis dataKey="date" tick={{ fill: '#444', fontSize: 9 }} tickLine={false} interval={9} />
                    <YAxis tick={{ fill: '#444', fontSize: 9 }} tickLine={false} width={45} />
                    <Tooltip content={<ChartTooltip />} />
                    <ReferenceLine y={0} stroke="#333" />
                    <Bar dataKey="macdHist" name="MACD Histogram" fill="#6366f1" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}

              {tab === 'adx' && (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={cd.filter(d => d.adxVal != null)} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <XAxis dataKey="date" tick={{ fill: '#444', fontSize: 9 }} tickLine={false} interval={9} />
                    <YAxis tick={{ fill: '#444', fontSize: 9 }} tickLine={false} width={30} domain={[0, 80]} />
                    <Tooltip content={<ChartTooltip />} />
                    <ReferenceLine y={25} stroke="#ffd740" strokeDasharray="3 3" label={{ value: '25 Trend', fill: '#ffd740', fontSize: 9 }} />
                    <ReferenceLine y={20} stroke="#ff6e6e" strokeDasharray="3 3" label={{ value: '20 No-Trade', fill: '#ff6e6e', fontSize: 9 }} />
                    <Line type="monotone" dataKey="adxVal" stroke="#06b6d4" strokeWidth={2} dot={false} name="ADX" />
                  </LineChart>
                </ResponsiveContainer>
              )}

              {tab === 'obv' && (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={cd.filter(d => d.obvK != null)} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="obvGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#06b6d4" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fill: '#444', fontSize: 9 }} tickLine={false} interval={9} />
                    <YAxis tick={{ fill: '#444', fontSize: 9 }} tickLine={false} width={52} tickFormatter={v => `${v}K`} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="obvK" stroke="#06b6d4" fill="url(#obvGrad)" strokeWidth={2} dot={false} name="OBV" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* AI Summary */}
            <div style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.18)', borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: 9, color: '#6366f1', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10, fontWeight: 700 }}>
                🤖 AI Trade Summary
              </div>
              {aiLoading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#444', fontSize: 12 }}>
                  <div style={{ width: 14, height: 14, border: '2px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  Generating AI analysis...
                </div>
              )}
              {aiError && (
                <div style={{ color: '#ff6e6e', fontSize: 12, lineHeight: 1.6 }}>
                  <div style={{ marginBottom: 4 }}>⚠️ {aiError}</div>
                  <div style={{ color: '#555', fontSize: 11 }}>
                    Check: ANTHROPIC_API_KEY is set in Netlify → Site Settings → Environment Variables
                  </div>
                </div>
              )}
              {aiText && (
                <div style={{ fontSize: 13, lineHeight: 1.8, color: '#bbb', fontFamily: "'Outfit',sans-serif" }}>
                  {aiText}
                </div>
              )}
            </div>

            {/* Rule-Based Plain English Explanation */}
            {(() => {
              const r = result
              const ind = r.indicators
              const isBull = r.score > 0
              const signalColor = r.color

              // ── What the signal means ──
              const signalMeaning = {
                'STRONG BUY':  { emoji: '🚀', short: 'Strong Buy', explain: 'Multiple indicators are strongly aligned for an upward move. This is the highest confidence bullish setup.' },
                'BUY':         { emoji: '✅', short: 'Buy',         explain: 'Most indicators point upward. A good setup for a swing trade entry with proper stop loss.' },
                'HOLD / WAIT': { emoji: '⏸',  short: 'Hold/Wait',  explain: 'Signals are mixed — some bullish, some bearish. Best to wait for a clearer setup before entering.' },
                'SELL':        { emoji: '⚠️', short: 'Sell',        explain: 'Most indicators point downward. Avoid buying. If you hold this stock, consider reducing your position.' },
                'STRONG SELL': { emoji: '🔴', short: 'Strong Sell', explain: 'Strong bearish alignment across indicators. High risk of further downside. Avoid entry.' },
              }[r.signal] || { emoji: '❓', short: r.signal, explain: '' }

              // ── Why this signal ──
              const reasons = []
              const tfs = [r.timeframes.weekly, r.timeframes.daily, r.timeframes.h4]
              const tfBull = tfs.filter(t => t === 'bullish').length
              const tfBear = tfs.filter(t => t === 'bearish').length
              if (tfBull === 3) reasons.push({ icon: '🔀', text: 'All 3 timeframes (Weekly, Daily, 4-Hour) are in an uptrend — this is the strongest alignment possible.', good: true })
              else if (tfBull === 2) reasons.push({ icon: '🔀', text: '2 out of 3 timeframes are bullish. The trend is mostly up but not fully confirmed.', good: true })
              else if (tfBear === 3) reasons.push({ icon: '🔀', text: 'All 3 timeframes are bearish — the stock is in a clear downtrend across all time horizons.', good: false })
              else reasons.push({ icon: '🔀', text: 'Timeframes are giving mixed signals. This reduces confidence in the trade.', good: null })

              const rsiNum = parseFloat(ind.rsi)
              if (rsiNum < 35) reasons.push({ icon: '📉', text: `RSI is ${ind.rsi} — the stock is oversold. This means it has fallen too far too fast and a bounce is likely. Good time to look for a buy entry.`, good: true })
              else if (rsiNum > 65) reasons.push({ icon: '📈', text: `RSI is ${ind.rsi} — the stock is overbought. It has risen a lot recently and may pull back. Not ideal for a fresh buy entry.`, good: false })
              else if (rsiNum >= 50) reasons.push({ icon: '📊', text: `RSI is ${ind.rsi} — in the bullish momentum zone (above 50). The stock has buying pressure behind it.`, good: true })
              else reasons.push({ icon: '📊', text: `RSI is ${ind.rsi} — below 50, indicating mild bearish momentum. No strong buying pressure yet.`, good: false })

              const adxNum = parseFloat(ind.adx)
              if (adxNum >= 25) reasons.push({ icon: '💪', text: `ADX is ${ind.adx} — a strong trend is in place. This means the move is likely to continue and is not just noise.`, good: isBull })
              else reasons.push({ icon: '😴', text: `ADX is ${ind.adx} — the trend is weak. The stock may be going sideways. Be cautious.`, good: false })

              if (ind.stBull) reasons.push({ icon: '⚡', text: `Supertrend is BULLISH — price is above the dynamic support line ₹${ind.stLevel}. This is a key confirmation that the trend is up.`, good: true })
              else reasons.push({ icon: '⚡', text: `Supertrend is BEARISH — price is below the resistance line ₹${ind.stLevel}. The trend direction is currently down.`, good: false })

              const macdNum = parseFloat(ind.macd)
              if (macdNum > 0) reasons.push({ icon: '📶', text: `MACD is positive (${ind.macd}) — buying momentum is stronger than selling momentum right now.`, good: true })
              else reasons.push({ icon: '📶', text: `MACD is negative (${ind.macd}) — selling momentum is currently dominant. Watch for a crossover before entering.`, good: false })

              if (ind.obvTrend === 'Rising') reasons.push({ icon: '🏦', text: 'OBV (On Balance Volume) is rising — big institutions and smart money are quietly accumulating this stock. This is a positive sign.', good: true })
              else reasons.push({ icon: '🏦', text: 'OBV is falling — institutional money may be quietly selling this stock. This is a warning sign.', good: false })

              // ── Trade plan in plain English ──
              const riskAmt = Math.abs(r.price - r.stopLoss).toFixed(2)
              const rewardAmt = Math.abs(r.target1 - r.price).toFixed(2)
              const pctSL = Math.abs(((r.stopLoss - r.price) / r.price) * 100).toFixed(1)
              const pctT1 = Math.abs(((r.target1 - r.price) / r.price) * 100).toFixed(1)
              const pctT2 = Math.abs(((r.target2 - r.price) / r.price) * 100).toFixed(1)

              // ── Newbie tips based on signal ──
              const tips = []
              if (isBull) {
                tips.push({ icon: '🎯', title: 'When to Enter', text: `Buy near the current price of ₹${r.price}. Ideally enter when the price is stable or slightly dipping — do not chase if it jumps up suddenly.` })
                tips.push({ icon: '🛑', title: 'Stop Loss (Must Set)', text: `Place your stop loss at ₹${r.stopLoss} — that is ${pctSL}% below current price. If the stock falls to this level, exit immediately. This protects you from big losses.` })
                tips.push({ icon: '🎁', title: 'Profit Targets', text: `Target 1 is ₹${r.target1} (+${pctT1}%). Book at least 50% of your position here. Target 2 is ₹${r.target2} (+${pctT2}%) for the remaining position. Do not be greedy — partial booking locks in profit.` })
              } else {
                tips.push({ icon: '🚫', title: 'Do Not Buy', text: `The signal is ${r.signal}. This is not the right time to enter a long position. Wait for the signal to turn BUY before investing.` })
                tips.push({ icon: '⏳', title: 'When to Watch Again', text: `Re-check this stock when RSI drops below 35 (oversold) or when Supertrend flips to Bullish. That would signal a potential reversal.` })
              }
              tips.push({ icon: '💰', title: 'How Much to Invest', text: `As a beginner, never risk more than 2% of your total capital on one trade. Example: if you have ₹1,00,000, risk only ₹2,000. Calculate your position size as: Risk Amount ÷ (Entry Price − Stop Loss) = Number of shares.` })
              tips.push({ icon: '⏱️', title: 'Swing Trade Timeframe', text: `This is a swing trade signal — expected to play out in 3 to 15 trading days. Check the stock once daily after market close. Do not watch it minute by minute.` })
              tips.push({ icon: '📰', title: 'Check for News', text: `Before entering, do a quick Google search for "${r.symbol} news today". If there is any negative news (bad earnings, promoter selling, regulatory issue), skip this trade regardless of the signal.` })

              return (
                <div style={{ background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.18)', borderRadius: 14, padding: 18 }}>
                  {/* Header */}
                  <div style={{ fontSize: 9, color: '#10b981', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14, fontWeight: 700 }}>
                    📖 Plain English Explanation — For Beginners
                  </div>

                  {/* What does this signal mean */}
                  <div style={{ background: `${signalColor}10`, border: `1px solid ${signalColor}30`, borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
                    <div style={{ fontSize: 11, color: '#666', marginBottom: 6, fontFamily: "'Outfit',sans-serif" }}>WHAT THIS SIGNAL MEANS</div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <span style={{ fontSize: 24 }}>{signalMeaning.emoji}</span>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: signalColor, fontFamily: "'Outfit',sans-serif", marginBottom: 4 }}>
                          {signalMeaning.short} — {r.bullCount} out of {r.totalSigs} indicators are bullish
                        </div>
                        <div style={{ fontSize: 12, color: '#aaa', lineHeight: 1.7, fontFamily: "'Outfit',sans-serif" }}>
                          {signalMeaning.explain}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Why this signal */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, color: '#666', marginBottom: 10, fontFamily: "'Outfit',sans-serif" }}>WHY THE APP GAVE THIS SIGNAL</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {reasons.map((reason, i) => {
                        const bc = reason.good === true ? '#00e676' : reason.good === false ? '#ff6e6e' : '#ffd740'
                        return (
                          <div key={i} style={{ display: 'flex', gap: 10, padding: '9px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, borderLeft: `3px solid ${bc}` }}>
                            <span style={{ fontSize: 16, flexShrink: 0 }}>{reason.icon}</span>
                            <div style={{ fontSize: 12, color: '#bbb', lineHeight: 1.65, fontFamily: "'Outfit',sans-serif" }}>{reason.text}</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Trade plan */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, color: '#666', marginBottom: 10, fontFamily: "'Outfit',sans-serif" }}>YOUR TRADE PLAN IN SIMPLE NUMBERS</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                      {[
                        { label: 'Buy At',          value: `₹${r.price}`,       sub: 'Entry price',          color: '#fff' },
                        { label: 'Exit If Wrong',   value: `₹${r.stopLoss}`,    sub: `−${pctSL}% from entry`, color: '#ff6e6e' },
                        { label: 'Book Profit 1',   value: `₹${r.target1}`,     sub: `+${pctT1}% gain`,       color: '#00e676' },
                        { label: 'Book Profit 2',   value: `₹${r.target2}`,     sub: `+${pctT2}% gain`,       color: '#06b6d4' },
                        { label: 'Risk vs Reward',  value: `1 : ${r.rrRatio}`,  sub: `Risk ₹${riskAmt} → Earn ₹${rewardAmt}`, color: '#ffd740' },
                      ].map((item, i) => (
                        <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '10px 14px' }}>
                          <div style={{ fontSize: 9, color: '#555', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{item.label}</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: item.color, fontFamily: "'JetBrains Mono','Courier New',monospace", marginBottom: 3 }}>{item.value}</div>
                          <div style={{ fontSize: 10, color: '#555' }}>{item.sub}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Newbie tips */}
                  <div>
                    <div style={{ fontSize: 11, color: '#666', marginBottom: 10, fontFamily: "'Outfit',sans-serif" }}>STEP-BY-STEP GUIDE FOR YOU</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {tips.map((tip, i) => (
                        <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 14px', background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.1)', borderRadius: 10 }}>
                          <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>{tip.icon}</span>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#10b981', fontFamily: "'Outfit',sans-serif", marginBottom: 4 }}>{tip.title}</div>
                            <div style={{ fontSize: 12, color: '#999', lineHeight: 1.7, fontFamily: "'Outfit',sans-serif" }}>{tip.text}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Score bar */}
                  <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 10, color: '#555', fontFamily: "'Outfit',sans-serif" }}>Overall Signal Strength</span>
                      <span style={{ fontSize: 10, color: signalColor, fontWeight: 700, fontFamily: "'Outfit',sans-serif" }}>{r.confidence}% confident</span>
                    </div>
                    <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${r.confidence}%`, height: '100%', background: `linear-gradient(90deg, ${signalColor}60, ${signalColor})`, borderRadius: 3, transition: 'width 1s ease' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: '#444', fontFamily: "'Outfit',sans-serif" }}>
                      <span>🔴 {r.bearCount} bearish signals</span>
                      <span>Score: {r.score > 0 ? '+' : ''}{r.score}</span>
                      <span>🟢 {r.bullCount} bullish signals</span>
                    </div>
                  </div>

                </div>
              )
            })()}

            {/* Candlestick Patterns */}
            {result.patterns.length > 0 && (
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 18 }}>
                <div style={{ fontSize: 9, color: '#555', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>
                  Candlestick Patterns Detected
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {result.patterns.map((p, i) => {
                    const c = p.type === 'bullish' ? '#00e676' : p.type === 'bearish' ? '#ff6e6e' : '#ffd740'
                    return (
                      <div key={i} style={{ background: `${c}0d`, border: `1px solid ${c}30`, borderRadius: 10, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{p.type === 'bullish' ? '🟢' : p.type === 'bearish' ? '🔴' : '🟡'}</span>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: c, fontFamily: "'Outfit',sans-serif" }}>{p.name}</div>
                          <div style={{ fontSize: 9, color: '#555' }}>{p.reliability}% historical reliability</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Signal breakdown */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: 9, color: '#555', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>
                Full Signal Breakdown ({result.signals.length} signals)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
                {result.signals.map((s, i) => {
                  const cl = s.side === 'bull' ? '#00e676' : s.side === 'bear' ? '#ff6e6e' : '#ffd740'
                  return (
                    <div key={i} style={{
                      fontSize: 12, color: '#bbb',
                      padding: '7px 12px',
                      background: 'rgba(255,255,255,0.02)',
                      borderRadius: 8,
                      borderLeft: `3px solid ${cl}`,
                      fontFamily: "'Outfit',sans-serif",
                    }}>
                      {s.txt}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Broker links */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: 9, color: '#555', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>
                Open Trade on Broker
              </div>
              <div style={{ fontSize: 11, color: '#444', marginBottom: 12 }}>
                Entry ₹{result.price} · Stop Loss ₹{result.stopLoss} · Target 1 ₹{result.target1}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {[
                  { name: 'Zerodha Kite', url: 'https://kite.zerodha.com',      c: '#387ed1' },
                  { name: 'Upstox',       url: 'https://upstox.com',            c: '#6c47ff' },
                  { name: 'Angel One',    url: 'https://www.angelone.in',        c: '#e8501a' },
                  { name: 'Groww',        url: 'https://groww.in/stocks',        c: '#00c187' },
                ].map(b => (
                  <a
                    key={b.name}
                    href={b.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      background: `${b.c}12`, border: `1px solid ${b.c}40`,
                      borderRadius: 9, padding: '9px 16px',
                      color: b.c, fontSize: 12, fontWeight: 700,
                      textDecoration: 'none',
                      fontFamily: "'Outfit',sans-serif",
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}
                  >
                    {b.name} ↗
                  </a>
                ))}
              </div>
            </div>

            {/* Disclaimer */}
            <p style={{ fontSize: 10, color: '#333', textAlign: 'center', lineHeight: 1.8, padding: '0 20px' }}>
              ⚠️ Educational purposes only · Not SEBI-registered investment advice · Past signals ≠ future returns · Always use stop loss · Trade at your own risk
            </p>

          </div>
        )}

        {/* Empty state */}
        {!result && !loading && !error && (
          <div style={{ textAlign: 'center', padding: '70px 20px' }}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, letterSpacing: 4, color: '#333', marginBottom: 32 }}>
              INCLUDED FEATURES
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12, maxWidth: 720, margin: '0 auto 40px', textAlign: 'left' }}>
              {[
                { icon: '🔀', title: 'Multi-Timeframe',     desc: 'Weekly + Daily + 4H confluence' },
                { icon: '📊', title: 'ADX Filter',          desc: 'No trade when market is sideways' },
                { icon: '⚡', title: 'Supertrend',          desc: 'Dynamic ATR-based trend bands' },
                { icon: '🕯️', title: '6 Candlestick Patterns', desc: 'Engulfing, Hammer, Stars, Doji' },
                { icon: '📈', title: 'OBV Analysis',        desc: 'Smart money accumulation / distribution' },
                { icon: '🤖', title: 'AI Summary',          desc: 'Claude analyses every signal' },
              ].map(f => (
                <div key={f.title} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>{f.icon}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#818cf8', fontFamily: "'Outfit',sans-serif", marginBottom: 3 }}>{f.title}</div>
                  <div style={{ fontSize: 10, color: '#444', lineHeight: 1.5 }}>{f.desc}</div>
                </div>
              ))}
            </div>
            <div style={{ color: '#333', fontSize: 12 }}>Enter any NSE symbol above to begin →</div>
          </div>
        )}

      </main>
    </div>
  )
}
