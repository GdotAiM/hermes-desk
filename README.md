# HERMES Desk

Premium dark-terminal charting prototype for ICT / SMC traders. Vanilla HTML/CSS/JS — no build step, no npm.

## Open locally

From this directory:

```bash
cd /workspace/hermes-desk
python3 -m http.server 8765
```

Then open [http://localhost:8765](http://localhost:8765) in a browser.

Any static server works (`npx serve`, VS Code Live Server, etc.). Opening `index.html` via `file://` may work in some browsers but a local server is preferred for module scripts.

## Layout

| Path | Role |
|------|------|
| `index.html` | Shell layout |
| `styles.css` | Design system |
| `js/data.js` | Synthetic NQ-like OHLC |
| `js/chart.js` | Canvas candlestick engine |
| `js/overlays.js` | ICT session / PDH / FVG overlays |
| `js/app.js` | UI wiring |
| `DESIGN.md` | Product principles & roadmap |

## Notes

- Connection pill shows **Paper research** — this is not a live broker.
- Paper ticket button is intentionally disabled.
- Data is synthetic and session-aware (Asia / London / NY), for UI research only.
