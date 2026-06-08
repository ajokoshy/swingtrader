/**
 * components.jsx
 * Reusable UI components — pure JSX, zero TypeScript.
 */

// ── Stat pill ──────────────────────────────────────────
export function StatPill({ label, value, color, small = false }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 10,
      padding: small ? '8px 12px' : '11px 15px',
      minWidth: small ? 70 : 90,
    }}>
      <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>
        {label}
      </div>
      <div style={{
        fontSize: small ? 13 : 15,
        fontWeight: 800,
        color: color || '#e8e8f0',
        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
        whiteSpace: 'nowrap',
      }}>
        {value}
      </div>
    </div>
  )
}

// ── Timeframe badge ────────────────────────────────────
export function TFBadge({ label, trend }) {
  const c  = trend === 'bullish' ? '#00e676' : trend === 'bearish' ? '#ff6e6e' : '#ffd740'
  const bg = trend === 'bullish' ? 'rgba(0,230,118,0.1)' : trend === 'bearish' ? 'rgba(255,110,110,0.1)' : 'rgba(255,215,64,0.1)'
  return (
    <div style={{ background: bg, border: `1px solid ${c}40`, borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
      <div style={{ fontSize: 9, color: '#666', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 800, color: c, fontFamily: "'JetBrains Mono','Courier New',monospace", textTransform: 'uppercase' }}>
        {trend}
      </div>
    </div>
  )
}

// ── Chart tooltip ──────────────────────────────────────
export function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#141420', border: '1px solid #2a2a3a',
      borderRadius: 8, padding: '10px 14px', fontSize: 11,
    }}>
      <div style={{ color: '#666', marginBottom: 5, fontWeight: 600 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || '#aaa', marginBottom: 2 }}>
          {p.name}:{' '}
          <b style={{ color: '#fff' }}>
            {typeof p.value === 'number' && !['OBV','Volume'].includes(p.name)
              ? `₹${p.value}`
              : p.value}
          </b>
        </div>
      ))}
    </div>
  )
}

// ── Loading spinner ────────────────────────────────────
export function Spinner({ message }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <div style={{
        width: 48, height: 48,
        border: '3px solid rgba(99,102,241,0.2)',
        borderTop: '3px solid #6366f1',
        borderRadius: '50%',
        margin: '0 auto 20px',
        animation: 'spin 0.8s linear infinite',
      }} />
      <div style={{ color: '#6366f1', fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
        {message}
      </div>
      <div style={{ color: '#333', fontSize: 11, letterSpacing: 1 }}>
        WEEKLY · DAILY · 4-HOUR · ADX · SUPERTREND · PATTERNS
      </div>
    </div>
  )
}

// ── Error banner ───────────────────────────────────────
export function ErrorBanner({ message }) {
  return (
    <div style={{
      background: 'rgba(255,23,68,0.08)',
      border: '1px solid rgba(255,23,68,0.25)',
      borderRadius: 12, padding: '13px 18px',
      marginBottom: 16, color: '#ff6e6e', fontSize: 13,
      lineHeight: 1.6,
    }}>
      ⚠️ {message}
    </div>
  )
}

// ── No-trade card ──────────────────────────────────────
export function NoTradeCard({ reason }) {
  return (
    <div style={{
      background: 'rgba(255,215,64,0.06)',
      border: '1px solid rgba(255,215,64,0.25)',
      borderRadius: 16, padding: 28, textAlign: 'center',
    }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>⏸</div>
      <div style={{
        fontFamily: "'Bebas Neue', sans-serif",
        fontSize: 28, letterSpacing: 2,
        color: '#ffd740', marginBottom: 8,
      }}>
        NO TRADE — SIDEWAYS MARKET
      </div>
      <div style={{ color: '#aaa', fontSize: 13, maxWidth: 480, margin: '0 auto', lineHeight: 1.7 }}>
        {reason}
      </div>
      <div style={{ marginTop: 16, fontSize: 11, color: '#555' }}>
        ADX below 20 means no directional trend. False signals are common. Wait for ADX &gt; 25 before trading.
      </div>
    </div>
  )
}
