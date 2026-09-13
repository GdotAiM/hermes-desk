# HERMES Desk — full build blueprint
**Owner:** ORION / human (Ntloso)  
**Repo:** https://github.com/GdotAiM/hermes-desk  
**Proto baseline:** `c0dc79b`  
**Rule:** build **one vertical slice at a time**, commit after each slice. If chat cuts off, resume from `STATUS.md`.

## Product north star
TradingView muscle memory + ICT-core overlays + composure UX. Honest lab language. No fake edges. Paper research until MINT allowlist SURVIVES.

## Architecture (current)
```
index.html          shell
styles.css          design system
js/data.js          synthetic OHLC + meta (FVG/OR/PDH)
js/chart.js         Canvas engine (candles, axes, crosshair, pan/zoom)
js/overlays.js      sessions / PDH-PDL / FVG / CE / OR
js/app.js           UI wiring
```

## Build order (do in sequence)

### Slice A — Persist prefs (v0.5.1)  ← START HERE
**Goal:** TF + overlay toggles + drawn levels survive refresh.  
**Files:** `js/app.js` (+ tiny helpers).  
**Acceptance:** reload page → same TF/overlays; no console errors.  
**Commit:** `feat(desk): persist TF and overlay prefs in localStorage`

### Slice B — Keyboard shortcuts (v0.5.2)
**Goal:** `1/2/3/4/5/6` → TFs; `c` crosshair lock; `s/l/n/f/e/o` toggle overlays.  
**Files:** `js/app.js`.  
**Commit:** `feat(desk): keyboard shortcuts for TF and overlays`

### Slice C — PNG export (v0.5.3)
**Goal:** button exports canvas (± HUD) as PNG.  
**Files:** `index.html`, `js/chart.js` or `app.js`.  
**Commit:** `feat(desk): export chart PNG`

### Slice D — Multi-symbol (v0.5.4)
**Goal:** NQ / ES / YM chips; `data.js` generators per symbol.  
**Commit:** `feat(desk): ES and YM synthetic symbols`

### Slice E — Sticky drawing tools (v1.0-pre)
**Goal:** long/short level tools place horizontal lines that persist (localStorage). Drag to move; Del to remove selected.  
**Files:** `js/chart.js`, `js/drawings.js` (new), `app.js`.  
**Commit:** `feat(desk): persistent user price levels`

### Slice F — Replay / scrub (v1)
**Goal:** playhead over session; space play/pause; scrubber. Study NY killzone without live tape.  
**Files:** `js/replay.js` (new), chart reveal-by-index API.  
**Commit:** `feat(desk): session replay scrubber`

### Slice G — Real tape adapter (v1)
**Goal:** read-only adapter interface + Yahoo/free or hermes-x CSV loader; synthetic remains fallback.  
**Files:** `js/adapters/readme.md`, `js/adapters/synthetic.js`, `js/adapters/csv.js`.  
**Never** auto-trade.  
**Commit:** `feat(desk): read-only market data adapter interface`

### Slice H — Paper ticket → MINT (v1+)
**Goal:** disabled until allowlist; opens journal stub / deep-link to mint-agent Path B.  
**Depends:** MINT allowlist SURVIVES or human pilot stamp.  
**Commit:** `feat(desk): paper ticket stub linked to MINT Path B`

### Slice I — Multi-chart 2-up (later)
**Goal:** optional split; default stays single stage.  
**Commit:** `feat(desk): optional 2-up layout`

## Cross-links
| System | Role |
|--------|------|
| hermes-x | Research SoT / board locks / lab rail copy |
| mint-agent | Execution; Desk never routes live |
| LOOM | Process; Desk is product surface |

## Resume checklist (after cutoff)
1. Open `STATUS.md` — next slice letter.  
2. `git pull` on hermes-desk.  
3. Implement only that slice.  
4. Manual check in browser (`python3 -m http.server 8765`).  
5. Commit with message from this blueprint.  
6. Update `STATUS.md` + push.  
7. Stop or continue to next letter.

## Out of scope (do not sneak in)
- Live broker routing from Desk  
- Indicator soup defaults  
- Claiming Wave-1 edges in UI copy  
