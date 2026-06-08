/**
 * indicators.js
 * Pure JavaScript technical analysis functions.
 * No TypeScript, no external dependencies.
 */

export const ema = (arr, period) => {
  if (!arr || arr.length === 0) return []
  const k = 2 / (period + 1)
  let e = arr[0]
  return arr.map(v => (e = v * k + e * (1 - k)))
}

export const rsi = (closes, period = 14) => {
  if (!closes || closes.length < period + 1) return new Array(closes?.length || 0).fill(null)
  let g = 0, l = 0
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1]
    d > 0 ? (g += d) : (l -= d)
  }
  let ag = g / period, al = l / period
  const out = new Array(period).fill(null)
  out.push(parseFloat((100 - 100 / (1 + ag / (al || 0.0001))).toFixed(2)))
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    ag = (ag * (period - 1) + Math.max(d, 0)) / period
    al = (al * (period - 1) + Math.max(-d, 0)) / period
    out.push(parseFloat((100 - 100 / (1 + ag / (al || 0.0001))).toFixed(2)))
  }
  return out
}

export const macd = (closes) => {
  if (!closes || closes.length < 35) {
    const empty = new Array(closes?.length || 0).fill(null)
    return { ml: empty, sl: empty, hist: empty }
  }
  const e12 = ema(closes, 12)
  const e26 = ema(closes, 26)
  const ml = e12.map((v, i) => v - e26[i])
  const signalArr = ema(ml.slice(26), 9)
  const sl = [...new Array(26).fill(null), ...signalArr]
  const hist = ml.map((v, i) => sl[i] != null ? parseFloat((v - sl[i]).toFixed(3)) : null)
  return { ml, sl, hist }
}

export const bollinger = (closes, period = 20) => {
  if (!closes) return []
  return closes.map((_, i) => {
    if (i < period - 1) return { mid: null, upper: null, lower: null }
    const slice = closes.slice(i - period + 1, i + 1)
    const mean = slice.reduce((a, b) => a + b, 0) / period
    const std = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period)
    return {
      mid: +mean.toFixed(2),
      upper: +(mean + 2 * std).toFixed(2),
      lower: +(mean - 2 * std).toFixed(2)
    }
  })
}

export const vwap = (data) => {
  if (!data || data.length === 0) return []
  let cv = 0, ctp = 0
  return data.map(d => {
    const tp = (d.high + d.low + d.close) / 3
    ctp += tp * d.volume
    cv += d.volume
    return cv > 0 ? +(ctp / cv).toFixed(2) : 0
  })
}

export const obv = (data) => {
  if (!data || data.length === 0) return []
  let o = 0
  return data.map((d, i) => {
    if (i === 0) return 0
    o += d.close > data[i - 1].close ? d.volume
       : d.close < data[i - 1].close ? -d.volume : 0
    return o
  })
}

export const atr = (data, period = 14) => {
  if (!data || data.length < 2) return new Array(data?.length || 0).fill(null)
  const trs = data.map((d, i) =>
    i === 0 ? d.high - d.low
    : Math.max(d.high - d.low, Math.abs(d.high - data[i-1].close), Math.abs(d.low - data[i-1].close))
  )
  return trs.map((_, i) =>
    i < period - 1 ? null
    : +(trs.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period).toFixed(2)
  )
}

export const adx = (data, period = 14) => {
  if (!data || data.length < period * 2) {
    const empty = new Array(data?.length || 0).fill(null)
    return { adx: empty, dip: empty, dim: empty }
  }
  const dms = data.map((d, i) => {
    if (i === 0) return { plus: 0, minus: 0, tr: d.high - d.low }
    const ph = d.high - data[i-1].high
    const pl = data[i-1].low - d.low
    return {
      plus:  ph > pl && ph > 0 ? ph : 0,
      minus: pl > ph && pl > 0 ? pl : 0,
      tr: Math.max(d.high - d.low, Math.abs(d.high - data[i-1].close), Math.abs(d.low - data[i-1].close))
    }
  })

  const smooth = (arr, p) => {
    let s = arr.slice(0, p).reduce((a, b) => a + b, 0)
    const out = new Array(p - 1).fill(null)
    out.push(s)
    for (let i = p; i < arr.length; i++) { s = s - s / p + arr[i]; out.push(s) }
    return out
  }

  const sTR  = smooth(dms.map(d => d.tr),    period)
  const sDMp = smooth(dms.map(d => d.plus),  period)
  const sDMm = smooth(dms.map(d => d.minus), period)

  const DIp = sTR.map((v, i) => v ? +(100 * sDMp[i] / v).toFixed(2) : null)
  const DIm = sTR.map((v, i) => v ? +(100 * sDMm[i] / v).toFixed(2) : null)
  const DX  = DIp.map((v, i) =>
    v != null && DIm[i] != null
    ? +(100 * Math.abs(v - DIm[i]) / ((v + DIm[i]) || 1)).toFixed(2)
    : null
  )

  const validDX = DX.filter(v => v != null)
  if (validDX.length < period) return { adx: new Array(data.length).fill(null), dip: DIp, dim: DIm }

  const firstValidIdx = DX.findIndex(v => v != null)
  const adxVals = new Array(firstValidIdx + period - 1).fill(null)
  let adxSmooth = validDX.slice(0, period).reduce((a, b) => a + b, 0) / period
  adxVals.push(+adxSmooth.toFixed(2))
  for (let i = period; i < validDX.length; i++) {
    adxSmooth = (adxSmooth * (period - 1) + validDX[i]) / period
    adxVals.push(+adxSmooth.toFixed(2))
  }

  return { adx: adxVals, dip: DIp, dim: DIm }
}

export const supertrend = (data, period = 14, mult = 3) => {
  if (!data || data.length < period + 1) return new Array(data?.length || 0).fill({ st: null, dir: null, bull: null })
  const atrs = atr(data, period)
  const bands = data.map((_, i) => {
    if (atrs[i] == null) return { upper: null, lower: null }
    const hl2 = (data[i].high + data[i].low) / 2
    return {
      upper: +(hl2 + mult * atrs[i]).toFixed(2),
      lower: +(hl2 - mult * atrs[i]).toFixed(2)
    }
  })

  let dir = 1
  const firstValid = bands.findIndex(b => b.lower != null)
  let prevST = bands[firstValid]?.lower || 0

  return bands.map((b, i) => {
    if (b.lower == null) return { st: null, dir: null, bull: null }
    const close = data[i].close
    if (dir === 1) {
      const st = Math.max(b.lower, prevST)
      if (close < st) { dir = -1; prevST = b.upper }
      else prevST = st
    } else {
      const st = Math.min(b.upper, prevST)
      if (close > st) { dir = 1; prevST = b.lower }
      else prevST = st
    }
    return { st: +prevST.toFixed(2), dir, bull: dir === 1 }
  })
}

export const detectPatterns = (data) => {
  const patterns = []
  if (!data || data.length < 3) return patterns
  const [c3, c2, c1] = [data[data.length - 3], data[data.length - 2], data[data.length - 1]]
  if (!c1 || !c2 || !c3) return patterns

  const body  = d => Math.abs(d.close - d.open)
  const range = d => d.high - d.low
  const isGreen = d => d.close > d.open
  const isRed   = d => d.close < d.open

  // Bullish Engulfing
  if (isRed(c2) && isGreen(c1) && c1.open < c2.close && c1.close > c2.open)
    patterns.push({ name: 'Bullish Engulfing', type: 'bullish', reliability: 72 })

  // Bearish Engulfing
  if (isGreen(c2) && isRed(c1) && c1.open > c2.close && c1.close < c2.open)
    patterns.push({ name: 'Bearish Engulfing', type: 'bearish', reliability: 71 })

  // Hammer
  const lShadow = (c1.open < c1.close ? c1.open : c1.close) - c1.low
  const uShadow = c1.high - (c1.open > c1.close ? c1.open : c1.close)
  if (body(c1) > 0 && lShadow > 2 * body(c1) && uShadow < 0.3 * body(c1))
    patterns.push({ name: 'Hammer', type: 'bullish', reliability: 65 })

  // Shooting Star
  const uShadowSS = c1.high - Math.max(c1.open, c1.close)
  const lShadowSS = Math.min(c1.open, c1.close) - c1.low
  if (body(c1) > 0 && uShadowSS > 2 * body(c1) && lShadowSS < 0.3 * body(c1))
    patterns.push({ name: 'Shooting Star', type: 'bearish', reliability: 64 })

  // Morning Star
  if (isRed(c3) && body(c2) < 0.3 * body(c3) && isGreen(c1) && c1.close > (c3.open + c3.close) / 2)
    patterns.push({ name: 'Morning Star', type: 'bullish', reliability: 68 })

  // Evening Star
  if (isGreen(c3) && body(c2) < 0.3 * body(c3) && isRed(c1) && c1.close < (c3.open + c3.close) / 2)
    patterns.push({ name: 'Evening Star', type: 'bearish', reliability: 67 })

  // Doji
  if (range(c1) > 0 && body(c1) < 0.05 * range(c1))
    patterns.push({ name: 'Doji (Indecision)', type: 'neutral', reliability: 55 })

  return patterns
}

export const getTrend = (data) => {
  if (!data || data.length < 50) return 'insufficient'
  const closes = data.map(d => d.close)
  const e20 = ema(closes, 20)
  const e50 = ema(closes, 50)
  const n = closes.length - 1
  if (e20[n] > e50[n] && closes[n] > e20[n]) return 'bullish'
  if (e20[n] < e50[n] && closes[n] < e20[n]) return 'bearish'
  return 'neutral'
}
