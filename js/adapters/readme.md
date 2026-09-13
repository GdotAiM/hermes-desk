# HERMES Desk — Market Data Adapters (Slice G)

Read-only adapters feed bar data into the chart. **Never** route orders or
pretend they connect to a live broker. This is paper-research infrastructure.

## Interface

Every adapter exposes the same contract:

```js
const result = await adapter.load();
// result = {
//   bars: [{ time, open, high, low, close, volume?, session, dayKey, pdh, pdl }, ...],
//   tfMinutes: number,
//   meta: {
//     symbol: string,
//     source?: string,
//     last, chg, chgPct, session, pdh, pdl,
//     openingRanges: [],
//     fvgs: [{ type, startIdx, endIdx, top, bot, mid, mitigated }, ...],
//     rowsParsed?: number
//   }
// }
```

Wire it into the chart like this:

```js
import { Chart } from '../chart.js';
import { loadCsv } from './adapters/csv.js';

const chart = new Chart(canvas, hud);
const result = await loadCsv('data/NQ-2024-09.csv');
chart.setBars(result.bars);
chart.setOverlays(createOverlays(() => result.meta));
updateHeader(result.meta);
```

## Adapters

### `synthetic.js` — built-in PRNG bars
Generates NQ / ES / YM synthetic series with ET session-aware volatility.
Used as the default when no real data source is configured.

```js
import { generateSynthetic } from './adapters/synthetic.js';
const result = generateSynthetic('ES', 15, 400);
```

### `csv.js` — local file or HTTP-hosted CSV
Reads OHLCV from a comma- or tab-separated file. Auto-detects column layout
from headers; falls back to positional (`time, open, high, low, close`).

**Supported timestamps:**
- ISO 8601: `2024-09-13T14:30:00Z`, `2024-09-13T14:30:00-04:00`
- Epoch ms: `1726292400000`
- US format: `9/13/2024 14:30`

**Minimal required columns:** time, open, high, low, close  
**Optional:** volume

Example CSV:
```
time,open,high,low,close,volume
2024-09-13T09:30:00-04:00,5620.25,5622.00,5619.50,5621.00,12345
2024-09-13T09:35:00-04:00,5621.00,5623.50,5620.00,5622.75,9876
```

Server it from your dev server and point the adapter at the URL.

## Notes

- No Yahoo Finance or API key plumbing in this slice — that comes later (Slice G+).
- FVG and opening-range detection runs on whatever bars the adapter produces.
- The adapter is purely research-grade. There is zero trade-routing code here.
