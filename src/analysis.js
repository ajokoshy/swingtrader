/**
 * analysis.js
 * Master signal engine.
 * Takes daily, weekly, and 4H OHLCV arrays.
 * Returns a complete analysis object for the UI.
 */

import {
  ema, rsi, macd, bollinger, vwap, obv, atr, adx,
  supertrend, detectPatterns, getTrend
} from './indicators.js'

export function runAnalysis(daily, weekly, hourly4) {
  const closes = daily.map(d => d.close)
  const n = closes.length - 1

  // ── Compute all indicators ──
  const ema20   = ema(closes, 20)
  const ema50   = ema(closes, 50)
  const ema200  = closes.length >= 200 ? ema(closes, 200) : null
  const rsiVals = rsi(closes)
  const { hist } = macd(closes)
  const bb       = bollinger(closes)
  const vwapVals = vwap(daily)
  const obvVals  = obv(daily)
  const atrVals  = atr(daily)
  const { adx: adxVals } = adx(daily)
  const stVals   = supertrend(daily)
  const patterns = detectPatterns(daily)

  // ── Multi-timeframe trends ──
  const weeklyTrend = getTrend(weekly)
  const dailyTrend  = getTrend(daily)
  const h4Trend     = getTrend(hourly4.length >= 50 ? hourly4 : daily.slice(-60))

  // ── ADX gate ──
  const lastADX = adxVals[n] ?? null
  if (lastADX != null && lastADX <= 20) {
    return {
      noTrade: true,
      reason: `ADX is ${lastADX.toFixed(1)} (below 20) — Market is sideways/ranging. No reliable trade signal. Wait for ADX > 25.`,
      adx: lastADX,
    }
  }

  // ── Scoring system ──
  let score = 0
  const signals = []

  // 1. ADX strength (weight: 10)
  if (lastADX != null && lastADX > 25) {
    score += 10
    signals.push({ txt: `🟢 ADX ${lastADX.toFixed(1)} — Strong trend confirmed`, side: 'bull' })
  }

  // 2. Multi-timeframe confluence (weight: 25)
  const tfs = [weeklyTrend, dailyTrend, h4Trend]
  const tfBull = tfs.filter(t => t === 'bullish').length
  const tfBear = tfs.filter(t => t === 'bearish').length
  if (tfBull === 3)      { score += 25; signals.push({ txt: '🟢 All 3 timeframes bullish (Weekly + Daily + 4H)', side: 'bull' }) }
  else if (tfBull === 2) { score += 15; signals.push({ txt: '🟡 2/3 timeframes bullish — good setup', side: 'bull' }) }
  else if (tfBear === 3) { score -= 25; signals.push({ txt: '🔴 All 3 timeframes bearish', side: 'bear' }) }
  else if (tfBear === 2) { score -= 15; signals.push({ txt: '🟡 2/3 timeframes bearish', side: 'bear' }) }
  else                   { signals.push({ txt: '🟡 Mixed timeframe signals — trade with caution', side: 'neutral' }) }

  // 3. Supertrend (weight: 20)
  const st = stVals[n]
  if (st?.bull === true)  { score += 20; signals.push({ txt: `🟢 Supertrend BULLISH — support at ₹${st.st}`, side: 'bull' }) }
  else if (st?.bull === false) { score -= 20; signals.push({ txt: `🔴 Supertrend BEARISH — resistance at ₹${st.st}`, side: 'bear' }) }

  // 4. EMA crossover (weight: 15)
  const emaCrossUp   = ema20[n-1] < ema50[n-1] && ema20[n] >= ema50[n]
  const emaCrossDown = ema20[n-1] > ema50[n-1] && ema20[n] <= ema50[n]
  if (emaCrossUp)        { score += 15; signals.push({ txt: '🟢 Golden Cross — EMA20 crossed above EMA50', side: 'bull' }) }
  else if (emaCrossDown) { score -= 15; signals.push({ txt: '🔴 Death Cross — EMA20 crossed below EMA50', side: 'bear' }) }
  else if (ema20[n] > ema50[n]) { score += 8; signals.push({ txt: '🟢 EMA20 above EMA50 (bullish structure)', side: 'bull' }) }
  else                   { score -= 8;  signals.push({ txt: '🔴 EMA20 below EMA50 (bearish structure)', side: 'bear' }) }

  // 5. RSI (weight: 12)
  const lastRSI = rsiVals[n]
  if (lastRSI != null) {
    if (lastRSI < 35)       { score += 12; signals.push({ txt: `🟢 RSI ${lastRSI} — Oversold, bounce zone`, side: 'bull' }) }
    else if (lastRSI > 65)  { score -= 12; signals.push({ txt: `🔴 RSI ${lastRSI} — Overbought, pullback risk`, side: 'bear' }) }
    else if (lastRSI >= 50) { score += 5;  signals.push({ txt: `🟡 RSI ${lastRSI} — Bullish momentum zone`, side: 'bull' }) }
    else                    { signals.push({ txt: `🟡 RSI ${lastRSI} — Neutral`, side: 'neutral' }) }
  }

  // 6. MACD (weight: 12)
  const hN  = hist[n]
  const hN1 = hist[n-1]
  if (hN != null && hN1 != null) {
    const mBullX = hN > 0 && hN1 <= 0
    const mBearX = hN < 0 && hN1 >= 0
    if (mBullX)      { score += 12; signals.push({ txt: '🟢 MACD bullish crossover — momentum shifting up', side: 'bull' }) }
    else if (mBearX) { score -= 12; signals.push({ txt: '🔴 MACD bearish crossover — momentum shifting down', side: 'bear' }) }
    else if (hN > 0) { score += 5;  signals.push({ txt: '🟢 MACD histogram positive', side: 'bull' }) }
    else             { score -= 5;  signals.push({ txt: '🔴 MACD histogram negative', side: 'bear' }) }
  }

  // 7. Bollinger Bands (weight: 8)
  const bbl = bb[n]
  if (bbl?.lower && closes[n] <= bbl.lower) { score += 8; signals.push({ txt: '🟢 Price at lower Bollinger Band — oversold bounce zone', side: 'bull' }) }
  else if (bbl?.upper && closes[n] >= bbl.upper) { score -= 8; signals.push({ txt: '🔴 Price at upper Bollinger Band — resistance zone', side: 'bear' }) }
  else if (bbl?.mid && closes[n] > bbl.mid) { score += 3; signals.push({ txt: '🟡 Price above Bollinger midline — mild bullish', side: 'bull' }) }

  // 8. VWAP (weight: 5)
  if (vwapVals[n]) {
    if (closes[n] > vwapVals[n]) { score += 5; signals.push({ txt: '🟢 Price above VWAP — institutional buying bias', side: 'bull' }) }
    else                         { score -= 5; signals.push({ txt: '🔴 Price below VWAP — institutional selling bias', side: 'bear' }) }
  }

  // 9. OBV trend (weight: 5)
  const obvSlice = obvVals.slice(-10)
  if (obvSlice.length >= 2) {
    const obvTrendVal = obvSlice[obvSlice.length - 1] - obvSlice[0]
    if (obvTrendVal > 0 && closes[n] > closes[n - 5])      { score += 5; signals.push({ txt: '🟢 OBV rising — smart money accumulating', side: 'bull' }) }
    else if (obvTrendVal < 0 && closes[n] < closes[n - 5]) { score -= 5; signals.push({ txt: '🔴 OBV falling — distribution detected', side: 'bear' }) }
  }

  // 10. Volume spike (weight: 5)
  const avgVol = daily.slice(-20).reduce((a, d) => a + d.volume, 0) / 20
  if (daily[n].volume > avgVol * 1.5) {
    score += 5
    signals.push({ txt: '🟢 Volume spike — strong market participation', side: 'bull' })
  }

  // 11. Candlestick patterns (bonus weight: 5 each)
  for (const p of patterns) {
    if (p.type === 'bullish')      { score += 5; signals.push({ txt: `🟢 Pattern: ${p.name} (${p.reliability}% reliability)`, side: 'bull' }) }
    else if (p.type === 'bearish') { score -= 5; signals.push({ txt: `🔴 Pattern: ${p.name} (${p.reliability}% reliability)`, side: 'bear' }) }
    else                           { signals.push({ txt: `🟡 Pattern: ${p.name} (indecision)`, side: 'neutral' }) }
  }

  // ── Signal determination ──
  let signal, color, bgColor
  if (score >= 50)      { signal = 'STRONG BUY';  color = '#00e676'; bgColor = 'rgba(0,230,118,0.10)' }
  else if (score >= 20) { signal = 'BUY';          color = '#69f0ae'; bgColor = 'rgba(105,240,174,0.08)' }
  else if (score <= -50){ signal = 'STRONG SELL';  color = '#ff1744'; bgColor = 'rgba(255,23,68,0.10)' }
  else if (score <= -20){ signal = 'SELL';          color = '#ff6e6e'; bgColor = 'rgba(255,110,110,0.08)' }
  else                  { signal = 'HOLD / WAIT';  color = '#ffd740'; bgColor = 'rgba(255,215,64,0.08)' }

  const bullCount  = signals.filter(s => s.side === 'bull').length
  const bearCount  = signals.filter(s => s.side === 'bear').length
  const totalSigs  = bullCount + bearCount
  const confidence = Math.min(Math.round((Math.abs(score) / 90) * 100), 82) + 10

  // ── Trade levels ──
  const price   = closes[n]
  const lastATR = atrVals[n] ?? (daily.slice(-14).reduce((a, d) => a + (d.high - d.low), 0) / 14)
  const isBull  = score > 0
  const stopLoss = isBull ? +(price - lastATR * 1.5).toFixed(2) : +(price + lastATR * 1.5).toFixed(2)
  const target1  = isBull ? +(price + lastATR * 2.0).toFixed(2) : +(price - lastATR * 2.0).toFixed(2)
  const target2  = isBull ? +(price + lastATR * 3.5).toFixed(2) : +(price - lastATR * 3.5).toFixed(2)
  const rrRatio  = +(Math.abs(target1 - price) / (Math.abs(price - stopLoss) || 1)).toFixed(2)

  // ── OBV trend label ──
  const obvSliceFull = obvVals.slice(-10)
  const obvTrendLabel = obvSliceFull.length >= 2
    ? (obvSliceFull[obvSliceFull.length - 1] > obvSliceFull[0] ? 'Rising' : 'Falling')
    : 'N/A'

  // ── Chart data (last 60 bars) ──
  const stData    = supertrend(daily)
  const slice60   = daily.length >= 60 ? daily.slice(-60) : daily
  const offset    = daily.length >= 60 ? daily.length - 60 : 0
  const chartData = slice60.map((d, i) => {
    const gi = offset + i
    return {
      date:     d.date,
      close:    +d.close.toFixed(2),
      high:     +d.high.toFixed(2),
      low:      +d.low.toFixed(2),
      volume:   d.volume,
      ema20:    ema20[gi] != null  ? +ema20[gi].toFixed(2)  : null,
      ema50:    ema50[gi] != null  ? +ema50[gi].toFixed(2)  : null,
      bbUpper:  bb[gi]?.upper      ?? null,
      bbLower:  bb[gi]?.lower      ?? null,
      rsiVal:   rsiVals[gi]        ?? null,
      macdHist: hist[gi]           ?? null,
      obvK:     obvVals[gi] != null ? Math.round(obvVals[gi] / 1000) : null,
      adxVal:   adxVals[gi]        ?? null,
      stLine:   stData[gi]?.st     ?? null,
    }
  })

  return {
    noTrade: false,
    signal, color, bgColor, score, confidence,
    signals, patterns,
    price, stopLoss, target1, target2, rrRatio,
    bullCount, bearCount, totalSigs,
    chartData,
    indicators: {
      rsi:       lastRSI,
      macd:      hist[n]?.toFixed(3) ?? 'N/A',
      ema20:     ema20[n]?.toFixed(2) ?? 'N/A',
      ema50:     ema50[n]?.toFixed(2) ?? 'N/A',
      ema200:    ema200 ? ema200[n]?.toFixed(2) : 'N/A',
      vwap:      vwapVals[n]?.toFixed(2) ?? 'N/A',
      adx:       lastADX?.toFixed(1) ?? 'N/A',
      stBull:    stVals[n]?.bull ?? null,
      stLevel:   stVals[n]?.st   ?? null,
      obvTrend:  obvTrendLabel,
    },
    timeframes: {
      weekly: weeklyTrend,
      daily:  dailyTrend,
      h4:     h4Trend,
    },
  }
}
