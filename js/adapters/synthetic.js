/**
 * HERMES Desk — Synthetic adapter (Slice G)
 *
 * Standalone module for generating synthetic OHLC bars.
 * Ported from the old data.js generateSeries so other adapters can share
 * the same volatility / FVG / opening-range logic without circular imports.
 */

const SESSION = {
  ASIA:  { start: 18, end: 0,   name: 'Asia' },
  LONDON: { start: 2,  end: 5,  name: 'London' },
  NY:    { start: 9,  end: 12,  name: 'NY' },
};

export { SESSION };

function etParts(ms) {
  const d = new Date(ms - 4 * 3600 * 1000);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth(),
    day: d.getUTCDate(),
    h: d.getUTCHours(),
    min: d.getUTCMinutes(),
    dow: d.getUTCDay(),
  };
}

function classifySession(ms) {
  const { h } = etParts(ms);
  if (h >= 18 || h < 2) return 'Asia';
  if (h >= 2 && h < 8) return 'London';
  if (h >= 8 && h < 17) return 'NY';
  return 'Asia';
}

function isWeekday(ms) {
  const { dow } = etParts(ms);
  return dow >= 1 && dow <= 5;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function roundPx(x) {
  return Math.round(x * 100) / 100;
}

function computeOpeningRanges(bars, nBars) {
  const byDay = new Map();
  for (const b of bars) {
    if (b.session !== 'NY') continue;
    if (!byDay.has(b.dayKey)) byDay.set(b.dayKey, []);
    const arr = byDay.get(b.dayKey);
    if (arr.length < nBars) arr.push(b);
  }
  const ranges = [];
  for (const [dayKey, arr] of byDay) {
    if (arr.length === 0) continue;
    ranges.push({
      dayKey,
      startTime: arr[0].time,
      endTime: arr[arr.length - 1].time,
      high: Math.max(...arr.map((x) => x.high)),
      low: Math.min(...arr.map((x) => x.low)),
    });
  }
  return ranges;
}

function detectFVGs(bars) {
  const out = [];
  for (let i = 2; i < bars.length; i++) {
    const a = bars[i - 2];
    const c = bars[i];
    if (c.low > a.high) {
      const top = c.low;
      const bot = a.high;
      const mid = (top + bot) / 2;
      out.push({
        type: 'bull',
        startIdx: i - 2, endIdx: i,
        startTime: a.time, endTime: c.time,
        top: roundPx(top), bot: roundPx(bot), mid: roundPx(mid),
        mitigated: false,
      });
    }
    if (c.high < a.low) {
      const top = a.low;
      const bot = c.high;
      const mid = (top + bot) / 2;
      out.push({
        type: 'bear',
        startIdx: i - 2, endIdx: i,
        startTime: a.time, endTime: c.time,
        top: roundPx(top), bot: roundPx(bot), mid: roundPx(mid),
        mitigated: false,
      });
    }
  }
  for (const f of out) {
    for (let j = f.endIdx + 1; j < bars.length; j++) {
      const b = bars[j];
      if (f.type === 'bull' && b.low <= f.bot) { f.mitigated = true; f.mitigateIdx = j; break; }
      if (f.type === 'bear' && b.high >= f.top) { f.mitigated = true; f.mitigateIdx = j; break; }
    }
  }
  return out.filter((f) => !f.mitigated || f.endIdx > bars.length - 80).slice(-24);
}

/**
 * Generate synthetic bars for a given symbol + timeframe.
 * @param {string} symbol - 'NQ' | 'ES' | 'YM'
 * @param {number} tfMinutes
 * @param {number} [count]
 * @returns {{ bars: Array, meta: object }}
 */
export function generateSynthetic(symbol = 'NQ', tfMinutes = 15, count = null) {
  const SYMS = {
    NQ: { id: 'NQ1!', name: 'Nasdaq 100 Continuous', basePrice: 19850, seed: 0x4e51000 },
    ES: { id: 'ES1!', name: 'S&P 500 E-mini Continuous', basePrice: 5620, seed: 0x7a2c300 },
    YM: { id: 'YM1!', name: 'Dow Futures Continuous', basePrice: 42100, seed: 0x1f8e500 },
  };
  const sym = SYMS[symbol] || SYMS.NQ;
  const defaults = { 1: 780, 5: 600, 15: 480, 60: 320, 240: 180, 1440: 120 };
  const n = count ?? defaults[tfMinutes] ?? 400;
  const step = tfMinutes * 60 * 1000;
  const rand = mulberry32(sym.seed + tfMinutes);

  let end = Date.now();
  end = end - (end % step);

  const bars = [];
  let price = sym.basePrice + rand() * sym.basePrice * 0.005;

  const raw = [];
  while (raw.length < n) {
    if (isWeekday(end - raw.length * step)) raw.push(end - raw.length * step);
  }
  // Simpler: just walk backward
  raw.length = 0;
  for (let k = 0; k < n * 2; k++) {
    const t = end - k * step;
    if (isWeekday(t)) raw.push(t);
    if (raw.length >= n) break;
  }
  raw.reverse();

  function volFor(ms) {
    const s = classifySession(ms);
    const base = tfMinutes <= 5 ? 4.5 : tfMinutes <= 15 ? 8 : tfMinutes <= 60 ? 18 : tfMinutes <= 240 ? 35 : 90;
    if (s === 'NY') return base * 1.35;
    if (s === 'London') return base * 1.1;
    return base * 0.75;
  }

  let dayOpen = null;
  let dayHigh = -Infinity;
  let dayLow = Infinity;
  let prevDayHigh = null;
  let prevDayLow = null;
  let lastDayKey = '';

  for (let idx = 0; idx < raw.length; idx++) {
    const time = raw[idx];
    const p = etParts(time);
    const dayKey = `${p.y}-${p.m}-${p.day}`;
    if (dayKey !== lastDayKey) {
      if (lastDayKey && dayHigh !== -Infinity) {
        prevDayHigh = dayHigh;
        prevDayLow = dayLow;
      }
      lastDayKey = dayKey;
      dayOpen = price;
      dayHigh = price;
      dayLow = price;
    }
    const vol = volFor(time);
    const drift = (rand() - 0.48) * vol * 0.15;
    const open = price;
    let close = open + drift + (rand() - 0.5) * vol;
    if (classifySession(time) === 'NY' && rand() < 0.04) {
      close += (rand() < 0.5 ? -1 : 1) * vol * (1.5 + rand());
    }
    const wickUp = rand() * vol * 0.55;
    const wickDn = rand() * vol * 0.55;
    const high = Math.max(open, close) + wickUp;
    const low = Math.min(open, close) - wickDn;
    dayHigh = Math.max(dayHigh, high);
    dayLow = Math.min(dayLow, low);
    price = close;
    bars.push({
      time,
      open: roundPx(open), high: roundPx(high), low: roundPx(low), close: roundPx(close),
      session: classifySession(time),
      dayKey,
      pdh: prevDayHigh != null ? roundPx(prevDayHigh) : null,
      pdl: prevDayLow != null ? roundPx(prevDayLow) : null,
    });
  }

  const openingRanges = computeOpeningRanges(bars, 4);
  const fvgs = detectFVGs(bars);
  const last = bars[bars.length - 1];
  const firstOfDay = bars.find((b) => b.dayKey === last.dayKey);
  const dayChg = firstOfDay ? last.close - firstOfDay.open : 0;

  return {
    bars,
    tfMinutes,
    meta: {
      symbol: sym.id,
      last: last.close,
      chg: roundPx(dayChg),
      chgPct: firstOfDay ? roundPx((dayChg / firstOfDay.open) * 100) : 0,
      session: last.session,
      pdh: last.pdh,
      pdl: last.pdl,
      openingRanges,
      fvgs,
    },
  };
}
