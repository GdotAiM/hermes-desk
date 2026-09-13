/**
 * HERMES Desk — wire UI toggles, timeframe, symbol header, right rail
 */

import { generateSeries, activeSessionLabel } from './data.js';
import { Chart } from './chart.js';
import { createOverlays } from './overlays.js';

let series = null;
let chart = null;
let currentTf = 15;

function $(sel) {
  return document.querySelector(sel);
}

function init() {
  const canvas = $('#chart');
  const hud = $('#ohlcHud');
  chart = new Chart(canvas, hud);

  let metaHolder = { meta: null };
  chart.setOverlays(
    createOverlays(() => metaHolder.meta)
  );

  function loadTf(tf) {
    currentTf = tf;
    series = generateSeries(tf);
    metaHolder.meta = series.meta;
    chart.setBars(series.bars);
    updateHeader(series.meta);
    updateStatus(series.meta);
  }

  // Timeframe chips
  document.querySelectorAll('.tf-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tf-chip').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      loadTf(Number(btn.dataset.tf));
    });
  });

  // Tools
  document.querySelectorAll('.tool-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tool-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      chart.setTool(btn.dataset.tool);
    });
  });

  // Overlay toggles
  const flagMap = [
    ['togSessions', 'sessions'],
    ['togPDH', 'pdh'],
    ['togFVG', 'fvg'],
    ['togCE', 'ce'],
    ['togOR', 'or'],
  ];

  function syncFlags() {
    const flags = {};
    for (const [id, key] of flagMap) {
      const el = document.getElementById(id);
      flags[key] = !!(el && el.checked);
    }
    chart.setOverlayFlags(flags);
  }

  for (const [id] of flagMap) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', syncFlags);
  }

  loadTf(currentTf);
  syncFlags();

  window.addEventListener('resize', () => chart.resize());
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
