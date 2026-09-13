/**
 * HERMES Desk — wire UI toggles, timeframe, symbol header, right rail
 * Slice A: persist TF + overlay prefs in localStorage
 */

import { generateSeries, activeSessionLabel, SYMBOLS } from './data.js';
import { Chart } from './chart.js';
import { createOverlays } from './overlays.js';

const PREFS_KEY = 'hermes-desk:prefs:v1';

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function savePrefs(partial) {
  const next = { ...loadPrefs(), ...partial, updatedAt: Date.now() };
  localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  return next;
}

let series = null;
let chart = null;
let currentTf = 15;
let currentSymbol = 'NQ';

function $(sel) {
  return document.querySelector(sel);
}

const FLAG_MAP = [
  ['togSessions', 'sessions'],
  ['togPDH', 'pdh'],
  ['togFVG', 'fvg'],
  ['togCE', 'ce'],
  ['togOR', 'or'],
];

function readFlagsFromDom() {
  const flags = {};
  for (const [id, key] of FLAG_MAP) {
    const el = document.getElementById(id);
    flags[key] = !!(el && el.checked);
  }
  return flags;
}

function applyFlagsToDom(flags) {
  if (!flags) return;
  for (const [id, key] of FLAG_MAP) {
    const el = document.getElementById(id);
    if (el && typeof flags[key] === 'boolean') el.checked = flags[key];
  }
}

function applyTfChip(tf) {
  document.querySelectorAll('.tf-chip').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.tf) === tf);
  });
}

function init() {
  const prefs = loadPrefs();
  if (typeof prefs.tf === 'number') currentTf = prefs.tf;
  if (prefs.symbol && SYMBOLS[prefs.symbol]) currentSymbol = prefs.symbol;
  applyFlagsToDom(prefs.overlays);

  const canvas = $('#chart');
  const hud = $('#ohlcHud');
  chart = new Chart(canvas, hud);

  let metaHolder = { meta: null };
  chart.setOverlays(createOverlays(() => metaHolder.meta));

  function loadTf(tf) {
    currentTf = tf;
    series = generateSeries(currentSymbol, tf);
    metaHolder.meta = series.meta;
    chart.setBars(series.bars);
    updateHeader(series.meta);
    updateStatus(series.meta);
    applyTfChip(tf);
    savePrefs({ tf });
  }

  function loadSymbol(sym) {
    currentSymbol = sym;
    series = generateSeries(sym, currentTf);
    metaHolder.meta = series.meta;
    chart.setBars(series.bars);
    updateHeader(series.meta);
    updateStatus(series.meta);
    // Update symbol display
    const symEl = $('#symbolName');
    const descEl = $('#symbolDesc');
    if (symEl) symEl.textContent = SYMBOLS[sym].id;
    if (descEl) descEl.textContent = SYMBOLS[sym].name;
    applySymbolChip(sym);
    savePrefs({ symbol: sym });
  }

  function applySymbolChip(sym) {
    document.querySelectorAll('.sym-chip').forEach((b) => {
      b.classList.toggle('active', b.dataset.sym === sym);
    });
  }

  function applyTfChip(tf) {
    document.querySelectorAll('.tf-chip').forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.tf) === tf);
    });
  }

  // Slice D — symbol chips
  document.querySelectorAll('.sym-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      loadSymbol(btn.dataset.sym);
    });
  });

  document.querySelectorAll('.tf-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      loadTf(Number(btn.dataset.tf));
    });
  });

  document.querySelectorAll('.tool-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tool-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      chart.setTool(btn.dataset.tool);
      savePrefs({ tool: btn.dataset.tool });
    });
  });

  if (prefs.tool) {
    document.querySelectorAll('.tool-btn').forEach((b) => {
      const on = b.dataset.tool === prefs.tool;
      b.classList.toggle('active', on);
      if (on) chart.setTool(prefs.tool);
    });
  }

  function syncFlags() {
    const flags = readFlagsFromDom();
    chart.setOverlayFlags(flags);
    savePrefs({ overlays: flags });
  }

  for (const [id] of FLAG_MAP) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', syncFlags);
  }

  loadTf(currentTf);
  syncFlags();

  // Slice C — PNG export
  const exportBtn = $('#btnExport');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const sym = ($('#symbolName')?.textContent || 'hermes-desk').trim();
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      chart.exportPng(`${sym}-${currentTf}m-${stamp}.png`);
    });
  }

  window.addEventListener('resize', () => chart.resize());

  // Slice B — keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/i.test(e.target.tagName)) return;
    const tfKeys = { '1': 1, '2': 5, '3': 15, '4': 60, '5': 240, '6': 1440 };
    if (tfKeys[e.key] != null) {
      e.preventDefault();
      loadTf(tfKeys[e.key]);
      return;
    }
    const overlayKeys = {
      s: 'togSessions',
      l: 'togPDH',
      f: 'togFVG',
      e: 'togCE',
      o: 'togOR',
    };
    if (overlayKeys[e.key]) {
      e.preventDefault();
      const el = document.getElementById(overlayKeys[e.key]);
      if (el) {
        el.checked = !el.checked;
        syncFlags();
      }
      return;
    }
    if (e.key === 'c' || e.key === 'C') {
      e.preventDefault();
      const cursorBtn = document.querySelector('.tool-btn[data-tool="cursor"]');
      if (cursorBtn) cursorBtn.click();
    }
  });

}

function updateHeader(meta) {
  const last = $('#lastPrice');
  const chg = $('#priceChg');
  if (!meta || !last) return;
  last.textContent = meta.last.toFixed(2);
  const sign = meta.chg >= 0 ? '+' : '';
  chg.textContent = `${sign}${meta.chg.toFixed(2)} (${sign}${meta.chgPct.toFixed(2)}%)`;
  chg.classList.toggle('up', meta.chg >= 0);
  chg.classList.toggle('down', meta.chg < 0);
}

function updateStatus(meta) {
  const sessEl = $('#statusSession');
  if (!sessEl) return;
  const live = activeSessionLabel(Date.now());
  const chartSess = meta?.session || live;
  sessEl.textContent = `Session: ${live} (chart last bar: ${chartSess})`;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
