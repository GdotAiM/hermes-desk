/**
 * HERMES Desk — CSV Adapter (Slice G)
 *
 * Reads OHLCV data from a plain-text CSV file and serves it as bars.
 * Tries to detect column layout from headers; falls back to positional
 * detection when headers are absent. Only read — never routes orders.
 *
 * Expected CSV columns (named or positional):
 *   time, open, high, low, close [, volume]
 *
 * Usage:
 *   const csv = new CsvAdapter(fileOrUrl);
 *   const result = await csv.load();
 *   // result = { bars: [...], meta: {...} }
 */

// Column keywords recognised in the first-row header (case-insensitive).
const KNOWN_HEADERS = ['time', 'date', 'open', 'high', 'low', 'close', 'volume', 'v', 'ts'];
const REQUIRED_POSITIONAL = 4; // time, o, h, l, c minimum

export class CsvAdapter {
  /**
   * @param {string} source — file path (local server) or http(s) URL
   * @param {object} [opts]
   * @param {boolean} [opts.hasHeader=true] — skip first row as header
   * @param {number[]} [opts.positions] — force column indices [time,open,high,low,close]
   */
  constructor(source, opts = {}) {
    this.source = source;
    this.hasHeader = opts.hasHeader !== undefined ? opts.hasHeader : true;
    this.positions = opts.positions || null;
  }

  /**
   * Fetch and parse the CSV. Returns { bars, meta, source, rowsParsed }.
   */
  async load() {
    const text = await this._fetch(this.source);
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) throw new Error('CsvAdapter: not enough data rows');

    let headers = null;
    let dataStart = 0;
    if (this.hasHeader) {
      headers = this._parseLine(lines[0]);
      dataStart = 1;
    }

    const cols = this._detectColumns(headers, lines[dataStart]);
    const bars = [];
    let prevDayHigh = null;
    let prevDayLow = null;
    let lastDayKey = '';

    for (let i = dataStart; i < lines.length; i++) {
      const vals = this._parseLine(lines[i]);
      if (!vals || vals.length < REQUIRED_POSITIONAL) continue;

      const time = this._parseTime(vals[cols.time], i);
      const open = parseFloat(vals[cols.open]);
      const high = parseFloat(vals[cols.high]);
      const low = parseFloat(vals[cols.low]);
      const close = parseFloat(vals[cols.close]);
      const volume = this.positions && vals[cols.volume] != null ? parseFloat(vals[cols.volume]) : null;

      if ([open, high, low, close].some(isNaN)) continue;
      if (high < low || open <= 0 || high <= 0) continue;
      if (!time || Number.isNaN(time)) continue;

      const dayKey = this._dayKey(time);
      if (dayKey !== lastDayKey) {
        prevDayHigh = null;
        prevDayLow = null;
        lastDayKey = dayKey;
      }

      const bar = {
        time,
        open,
        high,
        low,
        close,
        volume,
        session: this._classifySession(time),
        dayKey,
        pdh: prevDayHigh != null ? prevDayHigh : null,
        pdl: prevDayLow != null ? prevDayLow : null,
      };
      // Track prior-day high/low for next row
      // (In a full adapter we'd do two passes; here we use the previous bar's
      // high/low as a proxy for PDH/PDL, which is good enough for research.)
      prevDayHigh = high;
      prevDayLow = low;

      bars.push(bar);
    }

    if (bars.length === 0) throw new Error('CsvAdapter: no valid bars parsed');

    const tfMinutes = this._inferTf(bars);
    const last = bars[bars.length - 1];
    const firstOfDay = bars.find((b) => b.dayKey === last.dayKey);
    const dayChg = firstOfDay ? last.close - firstOfDay.open : 0;

    // Compute simple FVGs on loaded data (lightweight version)
    const fvgs = this._detectFVGs(bars);
    const openingRanges = []; // TODO: two-pass once we have multi-day data

    return {
      bars,
      tfMinutes,
      meta: {
        symbol: this._symbolHint(),
        source: this.source,
        last: last.close,
        chg: dayChg,
        chgPct: firstOfDay ? (dayChg / firstOfDay.open) * 100 : 0,
        session: last.session,
        pdh: last.pdh,
        pdl: last.pdl,
        openingRanges,
        fvgs,
        rowsParsed: bars.length,
      },
    };
  }

  // -- private helpers --

  async _fetch(source) {
    if (source.startsWith('http://') || source.startsWith('https://')) {
      const resp = await fetch(source);
      if (!resp.ok) throw new Error(`CsvAdapter: HTTP ${resp.status} for ${source}`);
      return await resp.text();
    }
    // Local file — assume dev server serves it at the given path
    const resp = await fetch(source);
    if (!resp.ok) throw new Error(`CsvAdapter: HTTP ${resp.status} for ${source}`);
    return await resp.text();
  }

  _parseLine(line) {
    // Handle both comma and tab delimiters; ignore quoted fields with embedded commas
    const parts = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; }
      else if ((ch === ',' || ch === '\t') && !inQuotes) { parts.push(current.trim()); current = ''; }
      else { current += ch; }
    }
    parts.push(current.trim());
    return parts;
  }

  _detectColumns(headers, sampleRow) {
    if (this.positions) return { time: this.positions[0], open: this.positions[1], high: this.positions[2], low: this.positions[3], close: this.positions[4], volume: this.positions[5] ?? -1 };
    if (!headers || headers.length === 0) return { time: 0, open: 1, high: 2, low: 3, close: 4, volume: 5 };
    const lower = headers.map((h) => h.toLowerCase().replace(/[^a-z]/g, ''));
    const map = {};
    for (const kw of ['time', 'date', 'ts']) {
      const idx = lower.findIndex((h) => h === kw);
      if (idx >= 0) { map.time = idx; break; }
    }
    for (const kw of ['open']) {
      const idx = lower.findIndex((h) => h === kw);
      if (idx >= 0) { map.open = idx; break; }
    }
    for (const kw of ['high', 'highs']) {
      const idx = lower.findIndex((h) => h === kw);
      if (idx >= 0) { map.high = idx; break; }
    }
    for (const kw of ['low', 'lows']) {
      const idx = lower.findIndex((h) => h === kw);
      if (idx >= 0) { map.low = idx; break; }
    }
    for (const kw of ['close', 'closes']) {
      const idx = lower.findIndex((h) => h === kw);
      if (idx >= 0) { map.close = idx; break; }
    }
    for (const kw of ['volume', 'vol', 'v']) {
      const idx = lower.findIndex((h) => h === kw);
      if (idx >= 0) { map.volume = idx; }
    }
    // Fallback: positional
    if (map.time == null) map.time = 0;
    if (map.open == null) map.open = 1;
    if (map.high == null) map.high = 2;
    if (map.low == null) map.low = 3;
    if (map.close == null) map.close = 4;
    if (map.volume == null) map.volume = 5;
    return map;
  }

  _parseTime(val, rowIdx) {
    // Try ISO string first
    let d = new Date(val);
    if (!isNaN(d.getTime())) return d.getTime();
    // Try epoch ms
    const n = Number(val);
    if (!isNaN(n) && n > 1e12) return n;
    // Try MM/DD/YYYY HH:MM
    const m = String(val).match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})\s*(\d{1,2}):(\d{2})$/);
    if (m) {
      const [, mo, day, yr, hh, mm] = m;
      const year = Number(yr) > 99 ? Number(yr) : Number(yr) + 2000;
      d = new Date(Date.UTC(year, Number(mo) - 1, Number(day), Number(hh), Number(mm)));
      if (!isNaN(d.getTime())) return d.getTime();
    }
    console.warn(`CsvAdapter: unparseable timestamp at row ${rowIdx}: "${val}"`);
    return NaN;
  }

  _dayKey(ms) {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
  }

  _classifySession(ms) {
    const h = new Date(ms - 4 * 3600 * 1000).getUTCHours();
    if (h >= 18 || h < 2) return 'Asia';
    if (h >= 2 && h < 8) return 'London';
    if (h >= 8 && h < 17) return 'NY';
    return 'Asia';
  }

  _inferTf(bars) {
    if (bars.length < 2) return 15;
    const diff = bars[1].time - bars[0].time;
    return Math.round(diff / 60000);
  }

  _symbolHint() {
    // Derive a hint from the filename
    const parts = this.source.split('/').pop()?.split('.');
    return parts && parts[0] ? parts[0].toUpperCase() : 'CSV';
  }

  _detectFVGs(bars) {
    const out = [];
    for (let i = 2; i < bars.length; i++) {
      const a = bars[i - 2], c = bars[i];
      if (c.low > a.high) {
        const top = c.low, bot = a.high, mid = (top + bot) / 2;
        out.push({ type: 'bull', startIdx: i - 2, endIdx: i, top, bot, mid, mitigated: false });
      }
      if (c.high < a.low) {
        const top = a.low, bot = c.high, mid = (top + bot) / 2;
        out.push({ type: 'bear', startIdx: i - 2, endIdx: i, top, bot, mid, mitigated: false });
      }
    }
    return out.slice(-24);
  }
}

/**
 * Convenience: instantiate and immediately load.
 * @param {string} source
 * @param {object} [opts]
 */
export async function loadCsv(source, opts) {
  const adapter = new CsvAdapter(source, opts);
  return adapter.load();
}
