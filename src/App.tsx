import { useState, useCallback, useRef } from 'react';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

// ═══════════════════════════════════════════════════════
// DATA FETCHING
// ═══════════════════════════════════════════════════════
async function fetchOHLCV(symbol, range = '6mo', interval = '1d') {
  const sym = symbol.toUpperCase().endsWith('.NS')
    ? symbol.toUpperCase()
    : `${symbol.toUpperCase()}.NS`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=${interval}&range=${range}`;
  const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
  const res = await fetch(proxy);
  if (!res.ok) throw new Error('Network error');
  const json = await res.json();
  const r = json?.chart?.result?.[0];
  if (!r) throw new Error(`No data for ${symbol}. Check symbol name.`);
  const {
    timestamp,
    indicators: {
      quote: [q],
    },
  } = r;
  return timestamp
    .map((t, i) => ({
      ts: t,
      date: new Date(t * 1000).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
      }),
      open: q.open[i],
      high: q.high[i],
      low: q.low[i],
      close: q.close[i],
      volume: q.volume[i] || 0,
    }))
    .filter((d) => d.close != null && d.high != null && d.low != null);
}

// ═══════════════════════════════════════════════════════
// TECHNICAL INDICATORS
// ═══════════════════════════════════════════════════════
const ema = (arr, p) => {
  const k = 2 / (p + 1);
  let e = arr[0];
  return arr.map((v) => (e = v * k + e * (1 - k)));
};

const rsi = (closes, p = 14) => {
  let g = 0,
    l = 0;
  for (let i = 1; i <= p; i++) {
    const d = closes[i] - closes[i - 1];
    d > 0 ? (g += d) : (l -= d);
  }
  let ag = g / p,
    al = l / p;
  const out = new Array(p).fill(null);
  out.push(parseFloat((100 - 100 / (1 + ag / (al || 0.0001))).toFixed(2)));
  for (let i = p + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (p - 1) + Math.max(d, 0)) / p;
    al = (al * (p - 1) + Math.max(-d, 0)) / p;
    out.push(parseFloat((100 - 100 / (1 + ag / (al || 0.0001))).toFixed(2)));
  }
  return out;
};

const macd = (closes) => {
  const e12 = ema(closes, 12),
    e26 = ema(closes, 26);
  const ml = e12.map((v, i) => v - e26[i]);
  const sl = [...new Array(26).fill(null), ...ema(ml.slice(26), 9)];
  return {
    ml,
    sl,
    hist: ml.map((v, i) =>
      sl[i] != null ? parseFloat((v - sl[i]).toFixed(3)) : null
    ),
  };
};

const bollinger = (closes, p = 20) =>
  closes.map((_, i) => {
    if (i < p - 1) return { mid: null, upper: null, lower: null };
    const sl = closes.slice(i - p + 1, i + 1),
      mean = sl.reduce((a, b) => a + b, 0) / p;
    const std = Math.sqrt(sl.reduce((a, b) => a + (b - mean) ** 2, 0) / p);
    return {
      mid: +mean.toFixed(2),
      upper: +(mean + 2 * std).toFixed(2),
      lower: +(mean - 2 * std).toFixed(2),
    };
  });

const vwap = (data) => {
  let cv = 0,
    ctp = 0;
  return data.map((d) => {
    const tp = (d.high + d.low + d.close) / 3;
    ctp += tp * d.volume;
    cv += d.volume;
    return +(ctp / cv).toFixed(2);
  });
};

const obv = (data) => {
  let o = 0;
  return data.map((d, i) => {
    if (i === 0) return 0;
    o +=
      d.close > data[i - 1].close
        ? d.volume
        : d.close < data[i - 1].close
        ? -d.volume
        : 0;
    return o;
  });
};

const atr = (data, p = 14) => {
  const trs = data.map((d, i) =>
    i === 0
      ? d.high - d.low
      : Math.max(
          d.high - d.low,
          Math.abs(d.high - data[i - 1].close),
          Math.abs(d.low - data[i - 1].close)
        )
  );
  return trs.map((_, i) =>
    i < p - 1
      ? null
      : +(trs.slice(i - p + 1, i + 1).reduce((a, b) => a + b, 0) / p).toFixed(2)
  );
};

const adx = (data, p = 14) => {
  const dms = data.map((d, i) => {
    if (i === 0) return { plus: 0, minus: 0, tr: d.high - d.low };
    const ph = d.high - data[i - 1].high,
      pl = data[i - 1].low - d.low;
    return {
      plus: ph > pl && ph > 0 ? ph : 0,
      minus: pl > ph && pl > 0 ? pl : 0,
      tr: Math.max(
        d.high - d.low,
        Math.abs(d.high - data[i - 1].close),
        Math.abs(d.low - data[i - 1].close)
      ),
    };
  });
  const smooth = (arr, p) => {
    let s = arr.slice(0, p).reduce((a, b) => a + b, 0);
    const out = new Array(p - 1).fill(null);
    out.push(s);
    for (let i = p; i < arr.length; i++) {
      s = s - s / p + arr[i];
      out.push(s);
    }
    return out;
  };
  const sTR = smooth(
    dms.map((d) => d.tr),
    p
  );
  const sDMp = smooth(
    dms.map((d) => d.plus),
    p
  );
  const sDMm = smooth(
    dms.map((d) => d.minus),
    p
  );
  const DIp = sTR.map((v, i) => (v ? +((100 * sDMp[i]) / v).toFixed(2) : null));
  const DIm = sTR.map((v, i) => (v ? +((100 * sDMm[i]) / v).toFixed(2) : null));
  const DX = DIp.map((v, i) =>
    v != null && DIm[i] != null
      ? +((100 * Math.abs(v - DIm[i])) / (v + DIm[i] || 1)).toFixed(2)
      : null
  );
  const validDX = DX.filter((v) => v != null);
  const adxVals = new Array(DX.indexOf(validDX[0])).fill(null);
  let adxSmooth = validDX.slice(0, p).reduce((a, b) => a + b, 0) / p;
  adxVals.push(...new Array(p - 1).fill(null), +adxSmooth.toFixed(2));
  for (let i = p; i < validDX.length; i++) {
    adxSmooth = (adxSmooth * (p - 1) + validDX[i]) / p;
    adxVals.push(+adxSmooth.toFixed(2));
  }
  return { adx: adxVals, dip: DIp, dim: DIm };
};

const supertrend = (data, p = 14, mult = 3) => {
  const atrs = atr(data, p);
  const result = data.map((_, i) => {
    if (atrs[i] == null) return { st: null, dir: null };
    const hl2 = (data[i].high + data[i].low) / 2;
    return {
      hl2,
      atr: atrs[i],
      upper: +(hl2 + mult * atrs[i]).toFixed(2),
      lower: +(hl2 - mult * atrs[i]).toFixed(2),
    };
  });
  let dir = 1,
    prevST = result.find((r) => r.lower != null)?.lower || 0;
  return result.map((r, i) => {
    if (r.lower == null) return { st: null, dir: null, bull: null };
    const close = data[i].close;
    if (dir === 1) {
      const st = Math.max(r.lower, prevST);
      if (close < st) {
        dir = -1;
        prevST = r.upper;
      } else prevST = st;
    } else {
      const st = Math.min(r.upper, prevST);
      if (close > st) {
        dir = 1;
        prevST = r.lower;
      } else prevST = st;
    }
    return { st: +prevST.toFixed(2), dir, bull: dir === 1 };
  });
};

// ═══════════════════════════════════════════════════════
// CANDLESTICK PATTERNS
// ═══════════════════════════════════════════════════════
const detectPatterns = (data) => {
  const patterns = [];
  const n = data.length;
  if (n < 3) return patterns;
  const [c3, c2, c1] = [data[n - 3], data[n - 2], data[n - 1]];
  const body = (d) => Math.abs(d.close - d.open);
  const isGreen = (d) => d.close > d.open;
  const isRed = (d) => d.close < d.open;
  const range = (d) => d.high - d.low;

  // Bullish Engulfing
  if (isRed(c2) && isGreen(c1) && c1.open < c2.close && c1.close > c2.open)
    patterns.push({
      name: 'Bullish Engulfing',
      type: 'bullish',
      reliability: 72,
    });

  // Bearish Engulfing
  if (isGreen(c2) && isRed(c1) && c1.open > c2.close && c1.close < c2.open)
    patterns.push({
      name: 'Bearish Engulfing',
      type: 'bearish',
      reliability: 71,
    });

  // Hammer
  const lShadow1 = c1.open < c1.close ? c1.open - c1.low : c1.close - c1.low;
  const uShadow1 = c1.high - Math.max(c1.open, c1.close);
  if (lShadow1 > 2 * body(c1) && uShadow1 < 0.3 * body(c1) && body(c1) > 0)
    patterns.push({ name: 'Hammer', type: 'bullish', reliability: 65 });

  // Shooting Star
  const uShadow1ss = c1.high - Math.max(c1.open, c1.close);
  const lShadow1ss = Math.min(c1.open, c1.close) - c1.low;
  if (uShadow1ss > 2 * body(c1) && lShadow1ss < 0.3 * body(c1) && body(c1) > 0)
    patterns.push({ name: 'Shooting Star', type: 'bearish', reliability: 64 });

  // Morning Star
  if (
    isRed(c3) &&
    body(c2) < 0.3 * body(c3) &&
    isGreen(c1) &&
    c1.close > (c3.open + c3.close) / 2
  )
    patterns.push({ name: 'Morning Star', type: 'bullish', reliability: 68 });

  // Evening Star
  if (
    isGreen(c3) &&
    body(c2) < 0.3 * body(c3) &&
    isRed(c1) &&
    c1.close < (c3.open + c3.close) / 2
  )
    patterns.push({ name: 'Evening Star', type: 'bearish', reliability: 67 });

  // Doji
  if (range(c1) > 0 && body(c1) < 0.05 * range(c1))
    patterns.push({
      name: 'Doji (Indecision)',
      type: 'neutral',
      reliability: 55,
    });

  return patterns;
};

// ═══════════════════════════════════════════════════════
// MULTI-TIMEFRAME TREND
// ═══════════════════════════════════════════════════════
const getTrend = (data) => {
  if (data.length < 50) return 'insufficient';
  const closes = data.map((d) => d.close);
  const e20 = ema(closes, 20),
    e50 = ema(closes, 50);
  const n = closes.length - 1;
  if (e20[n] > e50[n] && closes[n] > e20[n]) return 'bullish';
  if (e20[n] < e50[n] && closes[n] < e20[n]) return 'bearish';
  return 'neutral';
};

// ═══════════════════════════════════════════════════════
// MASTER SIGNAL ENGINE
// ═══════════════════════════════════════════════════════
const runAnalysis = (daily, weekly, hourly4) => {
  const closes = daily.map((d) => d.close);
  const n = closes.length - 1;

  // All indicators on daily
  const ema20 = ema(closes, 20),
    ema50 = ema(closes, 50);
  const ema200 = closes.length >= 200 ? ema(closes, 200) : null;
  const rsiVals = rsi(closes);
  const { ml, sl, hist } = macd(closes);
  const bb = bollinger(closes);
  const vwapVals = vwap(daily);
  const obvVals = obv(daily);
  const atrVals = atr(daily);
  const { adx: adxVals, dip, dim } = adx(daily);
  const stVals = supertrend(daily);
  const patterns = detectPatterns(daily);

  // Multi-timeframe trends
  const weeklyTrend = getTrend(weekly);
  const daily4hTrend = getTrend(hourly4);
  const dailyTrend = getTrend(daily);

  // ── Scoring (out of 100 total weight) ──
  let score = 0;
  const signals = [];

  // 1. ADX gate — if ADX < 20, market is ranging, no trade
  const lastADX = adxVals[n];
  const adxAvailable = lastADX != null;
  const adxStrong = !adxAvailable || lastADX > 20;
  if (adxAvailable && lastADX <= 20) {
    return {
      noTrade: true,
      reason: `ADX is ${lastADX?.toFixed(
        1
      )} (below 20) — Market is sideways/ranging. No reliable trade signal.`,
      adx: lastADX,
    };
  }
  if (adxAvailable && lastADX > 25) {
    score += 10;
    signals.push({
      txt: `🟢 ADX ${lastADX?.toFixed(1)} — Strong trend confirmed`,
      side: 'bull',
    });
  }

  // 2. Multi-timeframe confluence (weight: 25)
  const tfBull = [weeklyTrend, dailyTrend, daily4hTrend].filter(
    (t) => t === 'bullish'
  ).length;
  const tfBear = [weeklyTrend, dailyTrend, daily4hTrend].filter(
    (t) => t === 'bearish'
  ).length;
  if (tfBull === 3) {
    score += 25;
    signals.push({
      txt: '🟢 All 3 timeframes bullish (Weekly+Daily+4H)',
      side: 'bull',
    });
  } else if (tfBull === 2) {
    score += 15;
    signals.push({ txt: `🟡 2/3 timeframes bullish`, side: 'bull' });
  } else if (tfBear === 3) {
    score -= 25;
    signals.push({ txt: '🔴 All 3 timeframes bearish', side: 'bear' });
  } else if (tfBear === 2) {
    score -= 15;
    signals.push({ txt: `🟡 2/3 timeframes bearish`, side: 'bear' });
  } else
    signals.push({
      txt: '🟡 Mixed timeframe signals — proceed with caution',
      side: 'neutral',
    });

  // 3. Supertrend (weight: 20)
  const st = stVals[n];
  if (st?.bull) {
    score += 20;
    signals.push({
      txt: `🟢 Supertrend BULLISH — Price above ₹${st.st}`,
      side: 'bull',
    });
  } else if (st?.bull === false) {
    score -= 20;
    signals.push({
      txt: `🔴 Supertrend BEARISH — Price below ₹${st.st}`,
      side: 'bear',
    });
  }

  // 4. EMA crossover (weight: 15)
  const emaCrossUp = ema20[n - 1] < ema50[n - 1] && ema20[n] >= ema50[n];
  const emaCrossDown = ema20[n - 1] > ema50[n - 1] && ema20[n] <= ema50[n];
  if (emaCrossUp) {
    score += 15;
    signals.push({
      txt: '🟢 Golden Cross — EMA20 crossed above EMA50',
      side: 'bull',
    });
  } else if (emaCrossDown) {
    score -= 15;
    signals.push({
      txt: '🔴 Death Cross — EMA20 crossed below EMA50',
      side: 'bear',
    });
  } else if (ema20[n] > ema50[n]) {
    score += 8;
    signals.push({ txt: `🟢 EMA20 above EMA50 (bullish trend)`, side: 'bull' });
  } else {
    score -= 8;
    signals.push({ txt: '🔴 EMA20 below EMA50 (bearish trend)', side: 'bear' });
  }

  // 5. RSI (weight: 12)
  const lastRSI = rsiVals[n];
  if (lastRSI < 35) {
    score += 12;
    signals.push({
      txt: `🟢 RSI ${lastRSI} — Oversold, reversal zone`,
      side: 'bull',
    });
  } else if (lastRSI > 65) {
    score -= 12;
    signals.push({
      txt: `🔴 RSI ${lastRSI} — Overbought, pullback risk`,
      side: 'bear',
    });
  } else if (lastRSI >= 50) {
    score += 5;
    signals.push({ txt: `🟡 RSI ${lastRSI} — Bullish momentum`, side: 'bull' });
  } else signals.push({ txt: `🟡 RSI ${lastRSI} — Neutral`, side: 'neutral' });

  // 6. MACD (weight: 12)
  const mBullX = hist[n] > 0 && hist[n - 1] <= 0;
  const mBearX = hist[n] < 0 && hist[n - 1] >= 0;
  if (mBullX) {
    score += 12;
    signals.push({
      txt: '🟢 MACD Bullish Crossover — Strong momentum',
      side: 'bull',
    });
  } else if (mBearX) {
    score -= 12;
    signals.push({
      txt: '🔴 MACD Bearish Crossover — Momentum shift',
      side: 'bear',
    });
  } else if (hist[n] > 0) {
    score += 5;
    signals.push({ txt: '🟢 MACD histogram positive', side: 'bull' });
  } else {
    score -= 5;
    signals.push({ txt: '🔴 MACD histogram negative', side: 'bear' });
  }

  // 7. Bollinger Bands (weight: 8)
  const bbl = bb[n];
  if (bbl.lower && closes[n] <= bbl.lower) {
    score += 8;
    signals.push({
      txt: '🟢 Price at lower Bollinger Band — Bounce zone',
      side: 'bull',
    });
  } else if (bbl.upper && closes[n] >= bbl.upper) {
    score -= 8;
    signals.push({
      txt: '🔴 Price at upper Bollinger Band — Resistance',
      side: 'bear',
    });
  } else if (bbl.mid && closes[n] > bbl.mid) {
    score += 3;
    signals.push({ txt: '🟡 Price above Bollinger midline', side: 'bull' });
  }

  // 8. VWAP (weight: 5)
  if (closes[n] > vwapVals[n]) {
    score += 5;
    signals.push({
      txt: '🟢 Price above VWAP — Institutional bias bullish',
      side: 'bull',
    });
  } else {
    score -= 5;
    signals.push({
      txt: '🔴 Price below VWAP — Institutional bias bearish',
      side: 'bear',
    });
  }

  // 9. OBV trend (weight: 5)
  const obvSlice = obvVals.slice(-10);
  const obvTrend =
    obvSlice.length >= 2 ? obvSlice[obvSlice.length - 1] - obvSlice[0] : 0;
  if (obvTrend > 0 && closes[n] > closes[n - 5]) {
    score += 5;
    signals.push({
      txt: '🟢 OBV rising — Smart money accumulating',
      side: 'bull',
    });
  } else if (obvTrend < 0 && closes[n] < closes[n - 5]) {
    score -= 5;
    signals.push({
      txt: '🔴 OBV falling — Distribution detected',
      side: 'bear',
    });
  }

  // 10. Volume spike
  const avgVol = daily.slice(-20).reduce((a, d) => a + d.volume, 0) / 20;
  if (daily[n].volume > avgVol * 1.5) {
    score += 5;
    signals.push({
      txt: '🟢 Volume spike — Strong participation',
      side: 'bull',
    });
  }

  // 11. Candlestick patterns bonus
  for (const p of patterns) {
    if (p.type === 'bullish') {
      score += 5;
      signals.push({
        txt: `🟢 Pattern: ${p.name} (${p.reliability}% reliability)`,
        side: 'bull',
      });
    } else if (p.type === 'bearish') {
      score -= 5;
      signals.push({
        txt: `🔴 Pattern: ${p.name} (${p.reliability}% reliability)`,
        side: 'bear',
      });
    } else signals.push({ txt: `🟡 Pattern: ${p.name}`, side: 'neutral' });
  }

  // ── Signal output ──
  let signal, color, bgColor;
  if (score >= 50) {
    signal = 'STRONG BUY';
    color = '#00e676';
    bgColor = 'rgba(0,230,118,0.1)';
  } else if (score >= 20) {
    signal = 'BUY';
    color = '#69f0ae';
    bgColor = 'rgba(105,240,174,0.08)';
  } else if (score <= -50) {
    signal = 'STRONG SELL';
    color = '#ff1744';
    bgColor = 'rgba(255,23,68,0.1)';
  } else if (score <= -20) {
    signal = 'SELL';
    color = '#ff6e6e';
    bgColor = 'rgba(255,110,110,0.08)';
  } else {
    signal = 'HOLD / WAIT';
    color = '#ffd740';
    bgColor = 'rgba(255,215,64,0.08)';
  }

  const bullCount = signals.filter((s) => s.side === 'bull').length;
  const bearCount = signals.filter((s) => s.side === 'bear').length;
  const totalSigs = bullCount + bearCount;
  const confidence =
    Math.min(Math.round((Math.abs(score) / 90) * 100), 82) + 10;

  const price = closes[n];
  const lastATR =
    atrVals[n] ||
    daily.slice(-14).reduce((a, d) => a + (d.high - d.low), 0) / 14;
  const isBull = score > 0;
  const sl_ = isBull
    ? +(price - lastATR * 1.5).toFixed(2)
    : +(price + lastATR * 1.5).toFixed(2);
  const t1 = isBull
    ? +(price + lastATR * 2).toFixed(2)
    : +(price - lastATR * 2).toFixed(2);
  const t2 = isBull
    ? +(price + lastATR * 3.5).toFixed(2)
    : +(price - lastATR * 3.5).toFixed(2);
  const rr = +(Math.abs(t1 - price) / Math.abs(price - sl_)).toFixed(2);

  // Chart data (last 60 daily bars)
  const stData = supertrend(daily);
  const chartSlice = daily.length >= 60 ? daily.slice(-60) : daily;
  const chartOffset = daily.length >= 60 ? daily.length - 60 : 0;
  const chartData = chartSlice.map((d, i) => {
    const gi = chartOffset + i;
    return {
      date: d.date,
      close: +d.close.toFixed(2),
      high: +d.high.toFixed(2),
      low: +d.low.toFixed(2),
      volume: d.volume,
      ema20: +ema20[gi].toFixed(2),
      ema50: +ema50[gi].toFixed(2),
      bbUpper: bb[gi].upper,
      bbLower: bb[gi].lower,
      bbMid: bb[gi].mid,
      rsi: rsiVals[gi],
      macdHist: hist[gi],
      obv: Math.round(obvVals[gi] / 1000),
      adxVal: adxVals[gi],
      st: stData[gi]?.st,
      stBull: stData[gi]?.bull,
    };
  });

  return {
    signal,
    color,
    bgColor,
    score,
    confidence,
    signals,
    patterns,
    price,
    stopLoss: sl_,
    target1: t1,
    target2: t2,
    rrRatio: rr,
    indicators: {
      rsi: lastRSI,
      macd: hist[n]?.toFixed(3),
      ema20: ema20[n]?.toFixed(2),
      ema50: ema50[n]?.toFixed(2),
      ema200: ema200 ? ema200[n]?.toFixed(2) : 'N/A',
      vwap: vwapVals[n]?.toFixed(2),
      adx: lastADX?.toFixed(1),
      supertrend: stVals[n]?.st,
      stBull: stVals[n]?.bull,
      obvTrend: obvTrend > 0 ? 'Rising' : 'Falling',
    },
    timeframes: { weekly: weeklyTrend, daily: dailyTrend, h4: daily4hTrend },
    bullCount,
    bearCount,
    totalSigs,
    chartData,
    noTrade: false,
  };
};

// ═══════════════════════════════════════════════════════
// AI SUMMARY
// ═══════════════════════════════════════════════════════
const getAISummary = async (symbol, a) => {
  const prompt = `You are a precise NSE swing trading analyst. In exactly 4 sentences, analyse this data for ${symbol}:

Signal: ${a.signal} | Score: ${a.score} | Confidence: ${a.confidence}%
Timeframes: Weekly=${a.timeframes.weekly}, Daily=${a.timeframes.daily}, 4H=${
    a.timeframes.h4
  }
RSI=${a.indicators.rsi} | MACD=${a.indicators.macd} | ADX=${a.indicators.adx}
Supertrend=${a.indicators.stBull ? 'BULLISH' : 'BEARISH'} | OBV=${
    a.indicators.obvTrend
  }
Price=₹${a.price} | SL=₹${a.stopLoss} | T1=₹${a.target1} | T2=₹${
    a.target2
  } | R:R=1:${a.rrRatio}
Patterns: ${a.patterns.map((p) => p.name).join(', ') || 'None detected'}
Bull signals: ${a.bullCount}/${a.totalSigs} | Bear signals: ${a.bearCount}/${
    a.totalSigs
  }

Sentence 1: State the overall signal and why (mention 2 key indicators).
Sentence 2: Mention multi-timeframe alignment or divergence.
Sentence 3: State exact entry, stop loss and target levels.
Sentence 4: Name the ONE biggest risk to this trade.
Plain text only. No markdown. No disclaimer.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await res.json();
  return data.content?.[0]?.text || 'AI summary unavailable.';
};

// ═══════════════════════════════════════════════════════
// UI COMPONENTS
// ═══════════════════════════════════════════════════════
const TFBadge = ({ label, trend }) => {
  const c =
    trend === 'bullish'
      ? '#00e676'
      : trend === 'bearish'
      ? '#ff6e6e'
      : '#ffd740';
  const bg =
    trend === 'bullish'
      ? 'rgba(0,230,118,0.1)'
      : trend === 'bearish'
      ? 'rgba(255,110,110,0.1)'
      : 'rgba(255,215,64,0.1)';
  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${c}40`,
        borderRadius: 8,
        padding: '6px 12px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontSize: 9,
          color: '#666',
          letterSpacing: 1,
          textTransform: 'uppercase',
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 800,
          color: c,
          fontFamily: "'JetBrains Mono',monospace",
          textTransform: 'uppercase',
        }}
      >
        {trend}
      </div>
    </div>
  );
};

const StatPill = ({ label, value, color, small }) => (
  <div
    style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 10,
      padding: small ? '8px 12px' : '11px 15px',
      minWidth: small ? 70 : 90,
    }}
  >
    <div
      style={{
        fontSize: 9,
        color: '#666',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 3,
      }}
    >
      {label}
    </div>
    <div
      style={{
        fontSize: small ? 13 : 15,
        fontWeight: 800,
        color: color || '#e8e8f0',
        fontFamily: "'JetBrains Mono',monospace",
      }}
    >
      {value}
    </div>
  </div>
);

const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: '#141420',
        border: '1px solid #2a2a3a',
        borderRadius: 8,
        padding: '10px 14px',
        fontSize: 11,
      }}
    >
      <div style={{ color: '#666', marginBottom: 5, fontWeight: 600 }}>
        {label}
      </div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || '#aaa', marginBottom: 2 }}>
          {p.name}:{' '}
          <b style={{ color: '#fff' }}>
            {typeof p.value === 'number' &&
            p.name !== 'Volume' &&
            p.name !== 'OBV'
              ? `₹${p.value}`
              : p.value}
          </b>
        </div>
      ))}
    </div>
  );
};

const NIFTY50 = [
  'RELIANCE',
  'TCS',
  'INFY',
  'HDFCBANK',
  'ICICIBANK',
  'WIPRO',
  'SBIN',
  'TATAMOTORS',
  'BAJFINANCE',
  'HINDUNILVR',
  'ADANIENT',
  'LTIM',
  'AXISBANK',
  'KOTAKBANK',
  'MARUTI',
];

// ═══════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════
export default function App() {
  const [symbol, setSymbol] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [tab, setTab] = useState('price');
  const inputRef = useRef();

  const analyse = useCallback(
    async (sym) => {
      const s = (sym || symbol).trim().toUpperCase();
      if (!s) return;
      setLoading(true);
      setError('');
      setResult(null);
      setAiText('');
      setAiLoading(false);

      try {
        setLoadMsg('Fetching daily data...');
        const daily = await fetchOHLCV(s, '1y', '1d');
        if (daily.length < 80)
          throw new Error('Insufficient data. Use a Nifty 500 stock.');

        setLoadMsg('Fetching weekly data...');
        const weekly = await fetchOHLCV(s, '5y', '1wk');

        setLoadMsg('Fetching 4-hour data...');
        let h4 = [];
        try {
          h4 = await fetchOHLCV(s, '60d', '1h');
        } catch (_) {
          h4 = daily.slice(-30);
        }

        setLoadMsg('Running multi-timeframe analysis...');
        await new Promise((r) => setTimeout(r, 300));

        const analysis = runAnalysis(daily, weekly, h4);
        setResult({ symbol: s, ...analysis });
        setLoading(false);

        if (!analysis.noTrade) {
          setAiLoading(true);
          getAISummary(s, analysis)
            .then((t) => {
              setAiText(t);
              setAiLoading(false);
            })
            .catch(() => {
              setAiLoading(false);
            });
        }
      } catch (e) {
        setError(e.message || 'Error fetching data. Check symbol.');
        setLoading(false);
      }
    },
    [symbol]
  );

  const sc = result?.color || '#6366f1';
  const cd = result?.chartData || [];

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#09090f',
        color: '#e2e2ee',
        fontFamily: "'DM Mono',monospace",
        backgroundImage:
          'radial-gradient(ellipse 80% 50% at 50% -20%,rgba(99,102,241,0.1),transparent)',
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:wght@400;500&family=Outfit:wght@400;600;800&display=swap"
        rel="stylesheet"
      />

      {/* ── HEADER ── */}
      <div
        style={{
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
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              background: 'linear-gradient(135deg,#6366f1 0%,#06b6d4 100%)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
            }}
          >
            ⚡
          </div>
          <div>
            <div
              style={{
                fontFamily: "'Bebas Neue',sans-serif",
                fontSize: 20,
                letterSpacing: 2,
                lineHeight: 1,
              }}
            >
              SWING<span style={{ color: '#6366f1' }}>EDGE</span>{' '}
              <span style={{ color: '#06b6d4', fontSize: 14 }}>PRO</span>
            </div>
            <div style={{ fontSize: 8, color: '#444', letterSpacing: 2 }}>
              MULTI-TIMEFRAME · NSE INDIA
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              fontSize: 10,
              color: '#22c55e',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              justifyContent: 'flex-end',
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: '#22c55e',
                display: 'inline-block',
                animation: 'blink 1.5s infinite',
              }}
            />
            NSE LIVE
          </div>
          <div style={{ fontSize: 9, color: '#444', marginTop: 1 }}>
            {new Date().toLocaleDateString('en-IN', {
              weekday: 'short',
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
        {/* ── SEARCH ── */}
        <div
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 16,
            padding: 20,
            marginBottom: 20,
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: '#555',
              letterSpacing: 2,
              textTransform: 'uppercase',
              marginBottom: 10,
            }}
          >
            NSE Stock Symbol
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              ref={inputRef}
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && analyse()}
              placeholder="e.g. RELIANCE, TCS, INFY, SBIN..."
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10,
                padding: '12px 16px',
                color: '#fff',
                fontSize: 16,
                fontFamily: "'Bebas Neue',sans-serif",
                letterSpacing: 2,
                outline: 'none',
              }}
            />
            <button
              onClick={() => analyse()}
              disabled={loading || !symbol}
              style={{
                background: loading
                  ? '#1a1a2e'
                  : 'linear-gradient(135deg,#6366f1,#06b6d4)',
                border: 'none',
                borderRadius: 10,
                padding: '12px 22px',
                color: '#fff',
                fontWeight: 800,
                fontSize: 13,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: "'Outfit',sans-serif",
                letterSpacing: 1,
                boxShadow: loading ? 'none' : '0 0 30px rgba(99,102,241,0.35)',
                whiteSpace: 'nowrap',
                transition: 'all .2s',
              }}
            >
              {loading ? 'ANALYSING...' : 'ANALYSE ⚡'}
            </button>
          </div>
          <div
            style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}
          >
            {NIFTY50.slice(0, 12).map((s) => (
              <button
                key={s}
                onClick={() => {
                  setSymbol(s);
                  analyse(s);
                }}
                style={{
                  background: 'rgba(99,102,241,0.08)',
                  border: '1px solid rgba(99,102,241,0.2)',
                  borderRadius: 20,
                  padding: '3px 10px',
                  fontSize: 9,
                  color: '#818cf8',
                  cursor: 'pointer',
                  fontFamily: "'Bebas Neue',sans-serif",
                  letterSpacing: 1,
                  transition: 'all .15s',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* ── ERROR ── */}
        {error && (
          <div
            style={{
              background: 'rgba(255,23,68,0.08)',
              border: '1px solid rgba(255,23,68,0.25)',
              borderRadius: 12,
              padding: '13px 18px',
              marginBottom: 16,
              color: '#ff6e6e',
              fontSize: 13,
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {/* ── LOADING ── */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div
              style={{
                width: 48,
                height: 48,
                border: '3px solid rgba(99,102,241,0.2)',
                borderTop: '3px solid #6366f1',
                borderRadius: '50%',
                margin: '0 auto 20px',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <div
              style={{
                color: '#6366f1',
                fontWeight: 700,
                fontSize: 14,
                fontFamily: "'Outfit',sans-serif",
                marginBottom: 4,
              }}
            >
              {loadMsg}
            </div>
            <div style={{ color: '#333', fontSize: 11, letterSpacing: 1 }}>
              WEEKLY · DAILY · 4-HOUR · ADX · SUPERTREND · PATTERNS
            </div>
          </div>
        )}

        {/* ── NO TRADE ── */}
        {result?.noTrade && (
          <div
            style={{
              background: 'rgba(255,215,64,0.06)',
              border: '1px solid rgba(255,215,64,0.25)',
              borderRadius: 16,
              padding: 28,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 12 }}>⏸</div>
            <div
              style={{
                fontFamily: "'Bebas Neue',sans-serif",
                fontSize: 28,
                letterSpacing: 2,
                color: '#ffd740',
                marginBottom: 8,
              }}
            >
              NO TRADE — SIDEWAYS MARKET
            </div>
            <div
              style={{
                color: '#aaa',
                fontSize: 13,
                maxWidth: 480,
                margin: '0 auto',
                lineHeight: 1.7,
              }}
            >
              {result.reason}
            </div>
            <div style={{ marginTop: 16, fontSize: 11, color: '#555' }}>
              ADX below 20 = No directional trend = False signals likely. Wait
              for ADX &gt; 25 before trading.
            </div>
          </div>
        )}

        {/* ── RESULTS ── */}
        {result && !result.noTrade && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* ── SIGNAL CARD ── */}
            <div
              style={{
                background: result.bgColor,
                border: `1px solid ${sc}30`,
                borderRadius: 18,
                padding: 24,
                boxShadow: `0 0 80px ${sc}0d`,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: 16,
                  marginBottom: 20,
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: "'Bebas Neue',sans-serif",
                      fontSize: 36,
                      letterSpacing: 2,
                      lineHeight: 1,
                    }}
                  >
                    {result.symbol}
                    <span
                      style={{
                        fontSize: 14,
                        color: '#444',
                        fontFamily: "'DM Mono',monospace",
                        marginLeft: 6,
                      }}
                    >
                      .NS
                    </span>
                  </div>
                  <div
                    style={{
                      fontFamily: "'Bebas Neue',sans-serif",
                      fontSize: 44,
                      color: sc,
                      letterSpacing: 1,
                      lineHeight: 1,
                    }}
                  >
                    ₹{result.price}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      background: `${sc}18`,
                      border: `2px solid ${sc}`,
                      borderRadius: 14,
                      padding: '14px 28px',
                      boxShadow: `0 0 40px ${sc}25`,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 9,
                        color: '#888',
                        letterSpacing: 3,
                        textTransform: 'uppercase',
                        marginBottom: 4,
                      }}
                    >
                      Signal
                    </div>
                    <div
                      style={{
                        fontFamily: "'Bebas Neue',sans-serif",
                        fontSize: 30,
                        color: sc,
                        letterSpacing: 2,
                      }}
                    >
                      {result.signal}
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      justifyContent: 'center',
                      marginTop: 10,
                    }}
                  >
                    <div style={{ fontSize: 10, color: '#555' }}>
                      Confidence
                    </div>
                    <div
                      style={{
                        width: 100,
                        height: 5,
                        background: 'rgba(255,255,255,0.06)',
                        borderRadius: 3,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${result.confidence}%`,
                          height: '100%',
                          background: `linear-gradient(90deg,${sc}80,${sc})`,
                          borderRadius: 3,
                          transition: 'width 1.2s ease',
                        }}
                      />
                    </div>
                    <div style={{ fontSize: 11, color: sc, fontWeight: 700 }}>
                      {result.confidence}%
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: '#555', marginTop: 4 }}>
                    {result.bullCount} bull · {result.bearCount} bear out of{' '}
                    {result.totalSigs} signals
                  </div>
                </div>
              </div>

              {/* Trade levels */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <StatPill
                  label="Entry"
                  value={`₹${result.price}`}
                  color="#fff"
                />
                <StatPill
                  label="Stop Loss"
                  value={`₹${result.stopLoss}`}
                  color="#ff6e6e"
                />
                <StatPill
                  label="Target 1"
                  value={`₹${result.target1}`}
                  color="#00e676"
                />
                <StatPill
                  label="Target 2"
                  value={`₹${result.target2}`}
                  color="#06b6d4"
                />
                <StatPill
                  label="R : R"
                  value={`1 : ${result.rrRatio}`}
                  color="#ffd740"
                />
              </div>
            </div>

            {/* ── MULTI-TIMEFRAME ── */}
            <div
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 14,
                padding: 18,
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  color: '#555',
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  marginBottom: 14,
                }}
              >
                Multi-Timeframe Confluence
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3,1fr)',
                  gap: 10,
                }}
              >
                <TFBadge
                  label="Weekly (Macro)"
                  trend={result.timeframes.weekly}
                />
                <TFBadge
                  label="Daily (Signal)"
                  trend={result.timeframes.daily}
                />
                <TFBadge label="4-Hour (Entry)" trend={result.timeframes.h4} />
              </div>
              <div
                style={{
                  marginTop: 12,
                  fontSize: 11,
                  color: '#555',
                  textAlign: 'center',
                }}
              >
                {(() => {
                  const tfs = [
                    result.timeframes.weekly,
                    result.timeframes.daily,
                    result.timeframes.h4,
                  ];
                  const allBull = tfs.every((t) => t === 'bullish');
                  const allBear = tfs.every((t) => t === 'bearish');
                  if (allBull)
                    return '✅ All 3 timeframes aligned — Highest confidence setup';
                  if (allBear)
                    return '🔴 All 3 timeframes bearish — Strong downtrend';
                  return '⚠️ Mixed timeframes — Trade with caution, reduce position size';
                })()}
              </div>
            </div>

            {/* ── INDICATORS ROW ── */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill,minmax(100px,1fr))',
                gap: 10,
              }}
            >
              <StatPill
                small
                label="RSI 14"
                value={result.indicators.rsi}
                color={
                  result.indicators.rsi < 35
                    ? '#00e676'
                    : result.indicators.rsi > 65
                    ? '#ff6e6e'
                    : '#ffd740'
                }
              />
              <StatPill
                small
                label="ADX"
                value={result.indicators.adx}
                color={
                  parseFloat(result.indicators.adx) > 25 ? '#00e676' : '#ffd740'
                }
              />
              <StatPill
                small
                label="MACD"
                value={result.indicators.macd}
                color={
                  parseFloat(result.indicators.macd) > 0 ? '#00e676' : '#ff6e6e'
                }
              />
              <StatPill
                small
                label="Supertrend"
                value={result.indicators.stBull ? 'BULL' : 'BEAR'}
                color={result.indicators.stBull ? '#00e676' : '#ff6e6e'}
              />
              <StatPill
                small
                label="OBV"
                value={result.indicators.obvTrend}
                color={
                  result.indicators.obvTrend === 'Rising'
                    ? '#00e676'
                    : '#ff6e6e'
                }
              />
              <StatPill
                small
                label="EMA 20"
                value={`₹${result.indicators.ema20}`}
                color="#818cf8"
              />
              <StatPill
                small
                label="EMA 50"
                value={`₹${result.indicators.ema50}`}
                color="#c084fc"
              />
              <StatPill
                small
                label="VWAP"
                value={`₹${result.indicators.vwap}`}
                color="#06b6d4"
              />
            </div>

            {/* ── CHARTS ── */}
            <div
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 14,
                padding: 18,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  marginBottom: 16,
                  flexWrap: 'wrap',
                }}
              >
                {[
                  ['price', 'Price + Supertrend'],
                  ['rsi', 'RSI'],
                  ['macd', 'MACD'],
                  ['adx', 'ADX'],
                  ['obv', 'OBV'],
                ].map(([k, v]) => (
                  <button
                    key={k}
                    onClick={() => setTab(k)}
                    style={{
                      background:
                        tab === k ? 'rgba(99,102,241,0.2)' : 'transparent',
                      border:
                        tab === k
                          ? '1px solid #6366f1'
                          : '1px solid rgba(255,255,255,0.07)',
                      borderRadius: 7,
                      padding: '5px 13px',
                      color: tab === k ? '#a5b4fc' : '#444',
                      fontSize: 10,
                      cursor: 'pointer',
                      letterSpacing: 1,
                      fontFamily: "'Outfit',sans-serif",
                      fontWeight: 600,
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>

              {tab === 'price' && (
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={cd}>
                    <defs>
                      <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={sc} stopOpacity={0.18} />
                        <stop offset="95%" stopColor={sc} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tick={{ fill: '#444', fontSize: 9 }}
                      tickLine={false}
                      interval={9}
                    />
                    <YAxis
                      tick={{ fill: '#444', fontSize: 9 }}
                      tickLine={false}
                      tickFormatter={(v) => `₹${v}`}
                      width={62}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip content={<ChartTip />} />
                    <Area
                      type="monotone"
                      dataKey="close"
                      stroke={sc}
                      fill="url(#pg)"
                      strokeWidth={2}
                      dot={false}
                      name="Close"
                    />
                    <Line
                      type="monotone"
                      dataKey="ema20"
                      stroke="#6366f1"
                      strokeWidth={1.5}
                      dot={false}
                      name="EMA20"
                    />
                    <Line
                      type="monotone"
                      dataKey="ema50"
                      stroke="#c084fc"
                      strokeWidth={1.5}
                      dot={false}
                      name="EMA50"
                    />
                    <Line
                      type="monotone"
                      dataKey="st"
                      stroke="#ffd740"
                      strokeWidth={1.5}
                      dot={false}
                      name="Supertrend"
                      strokeDasharray="4 2"
                    />
                    <ReferenceLine
                      y={result.stopLoss}
                      stroke="#ff6e6e"
                      strokeDasharray="3 3"
                      label={{ value: 'SL', fill: '#ff6e6e', fontSize: 9 }}
                    />
                    <ReferenceLine
                      y={result.target1}
                      stroke="#00e676"
                      strokeDasharray="3 3"
                      label={{ value: 'T1', fill: '#00e676', fontSize: 9 }}
                    />
                    <ReferenceLine
                      y={result.target2}
                      stroke="#06b6d4"
                      strokeDasharray="3 3"
                      label={{ value: 'T2', fill: '#06b6d4', fontSize: 9 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
              {tab === 'rsi' && (
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={cd.filter((d) => d.rsi != null)}>
                    <defs>
                      <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor="#6366f1"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="#6366f1"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tick={{ fill: '#444', fontSize: 9 }}
                      tickLine={false}
                      interval={9}
                    />
                    <YAxis
                      tick={{ fill: '#444', fontSize: 9 }}
                      tickLine={false}
                      domain={[0, 100]}
                      width={30}
                    />
                    <Tooltip content={<ChartTip />} />
                    <ReferenceLine
                      y={70}
                      stroke="#ff6e6e"
                      strokeDasharray="3 3"
                      label={{ value: '70', fill: '#ff6e6e', fontSize: 9 }}
                    />
                    <ReferenceLine
                      y={30}
                      stroke="#00e676"
                      strokeDasharray="3 3"
                      label={{ value: '30', fill: '#00e676', fontSize: 9 }}
                    />
                    <ReferenceLine y={50} stroke="#444" strokeDasharray="2 2" />
                    <Area
                      type="monotone"
                      dataKey="rsi"
                      stroke="#6366f1"
                      fill="url(#rg)"
                      strokeWidth={2}
                      dot={false}
                      name="RSI"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
              {tab === 'macd' && (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={cd.filter((d) => d.macdHist != null)}>
                    <XAxis
                      dataKey="date"
                      tick={{ fill: '#444', fontSize: 9 }}
                      tickLine={false}
                      interval={9}
                    />
                    <YAxis
                      tick={{ fill: '#444', fontSize: 9 }}
                      tickLine={false}
                      width={45}
                    />
                    <Tooltip content={<ChartTip />} />
                    <ReferenceLine y={0} stroke="#333" />
                    <Bar
                      dataKey="macdHist"
                      name="MACD Histogram"
                      radius={[2, 2, 0, 0]}
                      fill="#6366f1"
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
              {tab === 'adx' && (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={cd.filter((d) => d.adxVal != null)}>
                    <XAxis
                      dataKey="date"
                      tick={{ fill: '#444', fontSize: 9 }}
                      tickLine={false}
                      interval={9}
                    />
                    <YAxis
                      tick={{ fill: '#444', fontSize: 9 }}
                      tickLine={false}
                      width={30}
                      domain={[0, 80]}
                    />
                    <Tooltip content={<ChartTip />} />
                    <ReferenceLine
                      y={25}
                      stroke="#ffd740"
                      strokeDasharray="3 3"
                      label={{
                        value: '25 — Trend',
                        fill: '#ffd740',
                        fontSize: 9,
                      }}
                    />
                    <ReferenceLine
                      y={20}
                      stroke="#ff6e6e"
                      strokeDasharray="3 3"
                      label={{
                        value: '20 — No Trade',
                        fill: '#ff6e6e',
                        fontSize: 9,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="adxVal"
                      stroke="#06b6d4"
                      strokeWidth={2}
                      dot={false}
                      name="ADX"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
              {tab === 'obv' && (
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={cd}>
                    <defs>
                      <linearGradient id="og" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor="#06b6d4"
                          stopOpacity={0.25}
                        />
                        <stop
                          offset="95%"
                          stopColor="#06b6d4"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tick={{ fill: '#444', fontSize: 9 }}
                      tickLine={false}
                      interval={9}
                    />
                    <YAxis
                      tick={{ fill: '#444', fontSize: 9 }}
                      tickLine={false}
                      width={50}
                      tickFormatter={(v) => `${v}K`}
                    />
                    <Tooltip content={<ChartTip />} />
                    <Area
                      type="monotone"
                      dataKey="obv"
                      stroke="#06b6d4"
                      fill="url(#og)"
                      strokeWidth={2}
                      dot={false}
                      name="OBV (K)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* ── AI SUMMARY ── */}
            <div
              style={{
                background: 'rgba(99,102,241,0.05)',
                border: '1px solid rgba(99,102,241,0.18)',
                borderRadius: 14,
                padding: 18,
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  color: '#6366f1',
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  marginBottom: 10,
                  fontWeight: 700,
                }}
              >
                🤖 AI Trade Summary
              </div>
              {aiLoading ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    color: '#444',
                    fontSize: 12,
                  }}
                >
                  <div
                    style={{
                      width: 14,
                      height: 14,
                      border: '2px solid #6366f1',
                      borderTopColor: 'transparent',
                      borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite',
                    }}
                  />{' '}
                  Generating AI analysis...
                </div>
              ) : aiText ? (
                <div
                  style={{
                    fontSize: 13,
                    lineHeight: 1.8,
                    color: '#bbb',
                    fontFamily: "'Outfit',sans-serif",
                  }}
                >
                  {aiText}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#444' }}>
                  AI summary will appear here after analysis completes.
                </div>
              )}
            </div>

            {/* ── CANDLESTICK PATTERNS ── */}
            {result.patterns.length > 0 && (
              <div
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 14,
                  padding: 18,
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    color: '#555',
                    letterSpacing: 2,
                    textTransform: 'uppercase',
                    marginBottom: 12,
                  }}
                >
                  Candlestick Patterns Detected
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {result.patterns.map((p, i) => {
                    const c =
                      p.type === 'bullish'
                        ? '#00e676'
                        : p.type === 'bearish'
                        ? '#ff6e6e'
                        : '#ffd740';
                    return (
                      <div
                        key={i}
                        style={{
                          background: `${c}0d`,
                          border: `1px solid ${c}30`,
                          borderRadius: 10,
                          padding: '8px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <span>
                          {p.type === 'bullish'
                            ? '🟢'
                            : p.type === 'bearish'
                            ? '🔴'
                            : '🟡'}
                        </span>
                        <div>
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                              color: c,
                              fontFamily: "'Outfit',sans-serif",
                            }}
                          >
                            {p.name}
                          </div>
                          <div style={{ fontSize: 9, color: '#555' }}>
                            {p.reliability}% historical reliability
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── SIGNAL BREAKDOWN ── */}
            <div
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 14,
                padding: 18,
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  color: '#555',
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  marginBottom: 12,
                }}
              >
                Full Signal Breakdown ({result.signals.length} signals)
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  maxHeight: 320,
                  overflowY: 'auto',
                }}
              >
                {result.signals.map((s, i) => {
                  const cl =
                    s.side === 'bull'
                      ? '#00e676'
                      : s.side === 'bear'
                      ? '#ff6e6e'
                      : '#ffd740';
                  return (
                    <div
                      key={i}
                      style={{
                        fontSize: 12,
                        color: '#bbb',
                        padding: '7px 12px',
                        background: 'rgba(255,255,255,0.02)',
                        borderRadius: 8,
                        borderLeft: `3px solid ${cl}`,
                        fontFamily: "'Outfit',sans-serif",
                      }}
                    >
                      {s.txt}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── BROKER LINKS ── */}
            <div
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 14,
                padding: 18,
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  color: '#555',
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  marginBottom: 6,
                }}
              >
                Open Trade on Broker
              </div>
              <div style={{ fontSize: 11, color: '#444', marginBottom: 12 }}>
                Pre-filled: Entry ₹{result.price} · SL ₹{result.stopLoss} · T1 ₹
                {result.target1}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {[
                  {
                    name: 'Zerodha Kite',
                    url: 'https://kite.zerodha.com',
                    c: '#387ed1',
                  },
                  { name: 'Upstox', url: 'https://upstox.com', c: '#6c47ff' },
                  {
                    name: 'Angel One',
                    url: 'https://www.angelone.in',
                    c: '#e8501a',
                  },
                  {
                    name: 'Groww',
                    url: 'https://groww.in/stocks',
                    c: '#00c187',
                  },
                ].map((b) => (
                  <a
                    key={b.name}
                    href={b.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      background: `${b.c}12`,
                      border: `1px solid ${b.c}40`,
                      borderRadius: 9,
                      padding: '9px 16px',
                      color: b.c,
                      fontSize: 12,
                      fontWeight: 700,
                      textDecoration: 'none',
                      fontFamily: "'Outfit',sans-serif",
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    {b.name} ↗
                  </a>
                ))}
              </div>
            </div>

            {/* disclaimer */}
            <div
              style={{
                fontSize: 10,
                color: '#333',
                textAlign: 'center',
                lineHeight: 1.8,
                padding: '0 20px',
              }}
            >
              ⚠️ Educational purposes only · Not SEBI-registered investment
              advice · Past signals ≠ future returns · Always use stop loss ·
              Trade at your own risk
            </div>
          </div>
        )}

        {/* ── EMPTY STATE ── */}
        {!result && !loading && !error && (
          <div style={{ textAlign: 'center', padding: '70px 20px' }}>
            <div
              style={{
                fontFamily: "'Bebas Neue',sans-serif",
                fontSize: 18,
                letterSpacing: 4,
                color: '#333',
                marginBottom: 32,
              }}
            >
              PHASE 2 + 3 UPGRADES ACTIVE
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))',
                gap: 12,
                maxWidth: 720,
                margin: '0 auto 40px',
                textAlign: 'left',
              }}
            >
              {[
                {
                  icon: '🔀',
                  title: 'Multi-Timeframe',
                  desc: 'Weekly + Daily + 4H confluence',
                },
                {
                  icon: '📊',
                  title: 'ADX Filter',
                  desc: 'No trade when market is sideways',
                },
                {
                  icon: '⚡',
                  title: 'Supertrend',
                  desc: 'Dynamic trend with ATR bands',
                },
                {
                  icon: '🕯️',
                  title: '6 Candlestick Patterns',
                  desc: 'Engulfing, Hammer, Stars, Doji',
                },
                {
                  icon: '📈',
                  title: 'OBV Analysis',
                  desc: 'Smart money accumulation/distribution',
                },
                {
                  icon: '🤖',
                  title: 'AI Summary',
                  desc: 'Claude analyses every signal',
                },
              ].map((f) => (
                <div
                  key={f.title}
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 12,
                    padding: '14px 16px',
                  }}
                >
                  <div style={{ fontSize: 22, marginBottom: 6 }}>{f.icon}</div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#818cf8',
                      fontFamily: "'Outfit',sans-serif",
                      marginBottom: 3,
                    }}
                  >
                    {f.title}
                  </div>
                  <div style={{ fontSize: 10, color: '#444', lineHeight: 1.5 }}>
                    {f.desc}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ color: '#333', fontSize: 12 }}>
              Enter any NSE symbol above to begin →
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.3} }
        * { box-sizing: border-box; }
        input::placeholder { color: #333; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #111; }
        ::-webkit-scrollbar-thumb { background: #2a2a3a; border-radius: 2px; }
      `}</style>
    </div>
  );
}