# HERMES Desk — Design

## Product principles

1. **Composure over dopamine.** Dark terminal that feels like a desk, not a casino. Soft accent, readable type, no neon spam.
2. **ICT / SMC first.** Sessions, PDH/PDL, FVG, CE, opening range — the map traders actually use. Indicators as optional overlays, never the default soup.
3. **Honest language.** No “guaranteed,” no “70% edge,” no prophecy. Priors and demotions live in the Lab card with VERIFY tags.
4. **You are in control.** Toggles are explicit. Chart is the stage. Right rail is a calm read, not a signal firehose.
5. **TradingView feel, simpler soul.** Familiar candle colors and crosshair habits; fewer chrome distractions.

## Information architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Top bar: logo · symbol · last/chg · Paper research · acct   │
├──────┬──────────────────────────────────────┬───────────────┤
│ TF   │                                      │ Market read   │
│ chips│           Canvas chart               │ Lab clears    │
│      │                                      │ Focus list    │
│ tools│                                      │               │
├──────┴──────────────────────────────────────┴───────────────┤
│ Status: ET · session · zoom hint                            │
└─────────────────────────────────────────────────────────────┘
```

- **Top bar** — identity, symbol state, connection honesty (“Paper research”), account chip.
- **Left slim** — timeframe chips (1m–D) and drawing tools (cursor, long/short level).
- **Center** — main Canvas stage: candles, crosshair, overlays.
- **Right rail (320px)** — Market read, Lab clears, Focus checklist.
- **Bottom** — timezone, active session, interaction hint.

## ICT-core feature set (v0)

| Feature | Behavior |
|---------|----------|
| Session shading | Asia / London / NY fills at very low alpha |
| PDH / PDL | Prior day high/low horizontal lines |
| FVG rectangles | Optional fair value gap boxes (bullish/bearish) |
| CE / mid gap | Midpoint of selected FVG |
| Opening range | First N bars of NY (or configurable) as a box |
| Crosshair + OHLC HUD | Floating near cursor |
| Pan / wheel zoom | Drag pan, wheel zoom, DPR-aware Canvas |

## What we refuse

- Indicator soup and default RSI/MACD stacks.
- Fake certainty: “guaranteed setups,” fabricated win-rate claims without VERIFY.
- Live order buttons that pretend to route to a broker in this prototype.
- Casino neon, pulsing badges, “YOLO” CTAs.
- Academic gray mush that hides hierarchy.

## Tone of copy

- Humble structure language: “liquidity above PDH,” “session still forming.”
- Lab: priors with VERIFY, demotions called out plainly.
- Primary feel: clarity and composure — not urgency theater.

## Roadmap

### v0 (this prototype)
- Synthetic NQ-like OHLC, session-aware
- Canvas candles, axes, crosshair, pan/zoom
- ICT overlays toggled from UI
- Right rail with sample Market read / Lab / Focus
- Paper research pill; disabled Paper ticket ghost button

### v0.5
- Persist overlay + TF preferences (localStorage)
- More symbols (ES, YM) with same engine
- Keyboard shortcuts (TF, crosshair lock)
- Export chart snapshot (PNG)

### v1
- Real market data adapter (read-only)
- User-drawn levels with labels
- Replay / scrub mode for session study
- Optional broker paper ticket (explicit sandbox, never silent live)
- Multi-chart layouts (2-up) without cluttering default

## Success metrics (qualitative)

- Trader can read session + PDH/PDL in under 3 seconds.
- Lab card never feels like a signal salesperson.
- Chart remains legible at 1280px and scales cleanly on DPR displays.
