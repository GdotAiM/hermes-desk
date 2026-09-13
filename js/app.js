/**
 * HERMES Desk — wire UI toggles, timeframe, symbol header, right rail
 * Slice A: persist TF + overlay prefs in localStorage
 */

import { generateSeries, activeSessionLabel, SYMBOLS } from './data.js';
import { Chart } from './chart.js';
import { createOverlays } from './overlays.js';
import { ReplayController } from './replay.js';
import { loadCsv } from './adapters/csv.js';
import { loadHermesX, HermesXAdapter } from './adapters/hermesX.js';

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
// Slice G — optional CSV source (file path or URL); empty = synthetic fallback
let csvSource = '';
// Slice J — optional HERMES-X research artifact source; empty = no context
let hermesXSource = '';

// Slice F — replay controller
let replay = null;

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
  if (typeof prefs.csvSource === 'string' && prefs.csvSource) csvSource = prefs.csvSource;
  if (typeof prefs.hermesXSource === 'string' && prefs.hermesXSource) hermesXSource = prefs.hermesXSource;
  applyFlagsToDom(prefs.overlays);

  const canvas = $('#chart');
  const hud = $('#ohlcHud');
  chart = new Chart(canvas, hud);
  replay = new ReplayController(chart);

  let metaHolder = { meta: null };
  chart.setOverlays(createOverlays(() => metaHolder.meta));

  /**
   * Load bars from csvSource (if set) or fall back to synthetic.
   * Sets series, metaHolder, chart, replay, and updates header/status.
   */
  async function loadData() {
    const tf = currentTf;
    const sym = currentSymbol;
    if (csvSource) {
      try {
        const result = await loadCsv(csvSource);
        series = result;
        metaHolder.meta = result.meta;
        chart.setBars(result.bars);
        replay.setBars(result.bars);
        replay.setFrame(-1);
        updateHeader(result.meta);
        updateStatus(result.meta);
        // Update symbol desc when CSV loads (CSV may have its own symbol hint)
        const descEl = $('#symbolDesc');
        if (descEl) descEl.textContent = `CSV · ${result.meta.rowsParsed ?? result.bars.length} bars`;
        applySymbolChip(sym); // keep chip highlight
        savePrefs({ symbol: sym });
        updateReplayUI();
        return;
      } catch (err) {
        console.warn('CsvAdapter failed, falling back to synthetic:', err);
        csvSource = '';
        savePrefs({ csvSource: '' });
      }
    }
    series = generateSeries(sym, tf);
    metaHolder.meta = series.meta;
    chart.setBars(series.bars);
    replay.setBars(series.bars);
    replay.setFrame(-1);
    updateHeader(series.meta);
    updateStatus(series.meta);
    updateReplayUI();
  }

  function loadTf(tf) {
    currentTf = tf;
    loadData();
    applyTfChip(tf);
    savePrefs({ tf });
  }

  function loadSymbol(sym) {
    currentSymbol = sym;
    loadData();
    // Update symbol display from SYMBOLS registry (or CSV hint preserved above)
    const symEl = $('#symbolName');
    const descEl = $('#symbolDesc');
    if (symEl && !csvSource) symEl.textContent = SYMBOLS[sym].id;
    if (descEl && !csvSource) descEl.textContent = SYMBOLS[sym].name;
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

  // Slice G — CSV data source input
  const csvInput = $('#csvSourceInput');
  const btnLoadCsv = $('#btnLoadCsv');
  const btnClearCsv = $('#btnClearCsv');
  if (csvInput && csvSource) csvInput.value = csvSource;
  if (btnLoadCsv) {
    btnLoadCsv.addEventListener('click', () => {
      const url = csvInput.value.trim();
      if (url) {
        csvSource = url;
        savePrefs({ csvSource: url });
        loadData();
      }
    });
  }
  if (btnClearCsv) {
    btnClearCsv.addEventListener('click', () => {
      csvSource = '';
      if (csvInput) csvInput.value = '';
      savePrefs({ csvSource: '' });
      loadData();
    });
  }

  // Slice J — HERMES-X research source input
  const researchInput = $('#researchSourceInput');
  const btnLoadResearch = $('#btnLoadResearch');
  const btnClearResearch = $('#btnClearResearch');
  if (researchInput && hermesXSource) researchInput.value = hermesXSource;
  if (btnLoadResearch) {
    btnLoadResearch.addEventListener('click', async () => {
      const url = researchInput.value.trim();
      if (!url) return;
      const card = $('#researchCard');
      const body = $('#researchBody');
      if (card) card.hidden = false;
      if (body) body.innerHTML = '<span class="card-research-loading">Loading research…</span>';
      try {
        const result = await loadHermesX(url);
        if (result.ok && result.artifact) {
          hermesXSource = url;
          savePrefs({ hermesXSource: url });
          if (card) card.hidden = false;
          renderResearchCard(result.artifact, result.draft);
        } else {
          throw new Error(result.error || 'Invalid artifact');
        }
      } catch (err) {
        console.warn('HERMES-X adapter failed:', err);
        if (body) body.innerHTML = `<span style="color:var(--down);font-size:11px">Failed to load: ${err.message}</span>`;
        hermesXSource = '';
        savePrefs({ hermesXSource: '' });
      }
    });
  }
  if (btnClearResearch) {
    btnClearResearch.addEventListener('click', () => {
      hermesXSource = '';
      if (researchInput) researchInput.value = '';
      savePrefs({ hermesXSource: '' });
      const card = $('#researchCard');
      if (card) card.hidden = true;
    });
  }
  // Render existing research on init if pref is set
  if (hermesXSource) {
    const card = $('#researchCard');
    const body = $('#researchBody');
    if (card) card.hidden = false;
    if (body) body.innerHTML = '<span class="card-research-loading">Loading research…</span>';
    loadHermesX(hermesXSource).then((result) => {
      if (result.ok && result.artifact) {
        renderResearchCard(result.artifact, result.draft);
      } else {
        if (body) body.innerHTML = '';
        if (card) card.hidden = true;
        hermesXSource = '';
        savePrefs({ hermesXSource: '' });
      }
    }).catch(() => {
      if (body) body.innerHTML = '';
      if (card) card.hidden = true;
      hermesXSource = '';
      savePrefs({ hermesXSource: '' });
    });
  }

  // Slice C — PNG export
  const exportBtn = $('#btnExport');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const sym = ($('#symbolName')?.textContent || 'hermes-desk').trim();
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      chart.exportPng(`${sym}-${currentTf}m-${stamp}.png`);
    });
  }

  // Slice H — Paper ticket → MINT stub
  const btnPaperTicket = $('#btnPaperTicket');
  if (btnPaperTicket) {
    btnPaperTicket.addEventListener('click', () => openTicketModal());
  }

  function openTicketModal() {
    const meta = metaHolder.meta;
    const symEl = $('#ticketSymbol');
    const tfEl = $('#ticketTf');
    const lastEl = $('#ticketLastBar');
    if (symEl && meta?.symbol) symEl.textContent = meta.symbol;
    if (tfEl) tfEl.textContent = `${currentTf}m`;
    if (lastEl && meta?.last != null) lastEl.textContent = meta.last.toFixed(2);

    const deeplinkEl = $('#ticketDeeplink');
    const symId = meta?.symbol || currentSymbol;
    if (deeplinkEl) deeplinkEl.textContent = `mint-agent://desk?sym=${encodeURIComponent(symId)}&tf=${currentTf}m`;

    const modal = $('#ticketModal');
    if (modal) modal.hidden = false;
  }

  // Close modal on backdrop click or Escape
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeTicketModal();
  });

  function closeTicketModal() {
    const modal = $('#ticketModal');
    if (modal) modal.hidden = true;
  }

  const btnTicketClose = $('#btnTicketClose');
  if (btnTicketClose) {
    btnTicketClose.addEventListener('click', closeTicketModal);
  }
  const ticketModal = $('#ticketModal');
  if (ticketModal) {
    ticketModal.addEventListener('click', (e) => {
      if (e.target === ticketModal) closeTicketModal();
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

  // Slice E — Delete removes selected level
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/i.test(e.target.tagName)) return;
      chart.deleteSelected();
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

/**
 * Render a HERMES-X research artifact into the right-rail card.
 * @param {object} artifact — validated research contract
 * @param {boolean} [draft=false] — true if parsed from text fallback
 */
function renderResearchCard(artifact, draft = false) {
  const card = $('#researchCard');
  const body = $('#researchBody');
  const idEl = $('#researchId');
  const symEl = $('#researchSymbol');
  const tfEl = $('#researchTf');
  const sessEl = $('#researchSession');
  const badgeEl = $('#researchDraftBadge');

  if (!card || !body) return;

  // Header fields
  if (idEl) idEl.textContent = artifact.researchId || '—';
  if (symEl) symEl.textContent = artifact.symbol || '—';
  if (tfEl) tfEl.textContent = artifact.timeframe || '—';
  if (sessEl) sessEl.textContent = artifact.session || '—';
  if (badgeEl) badgeEl.hidden = !draft;

  // Update board status chip in topbar
  const statusChip = $('#boardStatusChip');
  if (statusChip) {
    const boardStatus = artifact.boardStatus;
    if (boardStatus) {
      statusChip.textContent = boardStatus;
      statusChip.title = `Board status: ${boardStatus}`;
      statusChip.hidden = false;
      statusChip.className = 'board-status-chip board-status-' + boardStatus.toLowerCase().replace(/\s+/g, '-');
    } else {
      statusChip.hidden = true;
    }
  }

  // Build body HTML
  const parts = [];

  // Hypothesis
  if (artifact.hypothesis) {
    parts.push(`<div class="research-section">
      <div class="research-section-title">Hypothesis</div>
      <div class="research-section-body">${escHtml(artifact.hypothesis)}</div>
    </div>`);
  }

  // Evidence
  const evidenceLines = HermesXAdapter.renderEvidence(artifact.evidence);
  if (evidenceLines && evidenceLines.length > 0) {
    const items = evidenceLines.map((e) => `<li>${escHtml(e)}</li>`).join('');
    parts.push(`<div class="research-section">
      <div class="research-section-title">Evidence</div>
      <ul class="research-evidence-list">${items}</ul>
    </div>`);
  }

  // Levels
  const levels = artifact.levels || {};
  if (levels.pdh != null || levels.pdl != null || levels.liquidity?.length || levels.pdArrays?.length) {
    const rows = [];
    if (levels.pdh != null) rows.push(`<div class="research-level-item"><span class="research-level-key">PDH</span><span class="research-level-val">${levels.pdh}</span></div>`);
    if (levels.pdl != null) rows.push(`<div class="research-level-item"><span class="research-level-key">PDL</span><span class="research-level-val">${levels.pdl}</span></div>`);
    if (levels.liquidity?.length) rows.push(`<div class="research-level-item" style="grid-column:1/-1"><span class="research-level-key">Liquidity</span><span class="research-level-val">${escHtml(levels.liquidity.join(', '))}</span></div>`);
    if (levels.pdArrays?.length) rows.push(`<div class="research-level-item" style="grid-column:1/-1"><span class="research-level-key">PD Arrays</span><span class="research-level-val">${escHtml(levels.pdArrays.join(', '))}</span></div>`);
    parts.push(`<div class="research-section">
      <div class="research-section-title">Levels</div>
      <div class="research-levels-grid">${rows.join('')}</div>
    </div>`);
  }

  // Market structure
  const msSummary = HermesXAdapter.renderMarketStructure(artifact.marketStructure);
  if (msSummary) {
    parts.push(`<div class="research-section">
      <div class="research-section-title">Market structure</div>
      <div class="research-section-body">${escHtml(msSummary)}</div>
    </div>`);
  }

  // Statistics
  const statsText = HermesXAdapter.formatStats(artifact.statistics);
  if (statsText) {
    parts.push(`<div class="research-section">
      <div class="research-section-title">Statistics</div>
      <div class="research-stats-inline">${escHtml(statsText)}</div>
    </div>`);
  }

  // Dataset info
  const ds = artifact.dataset || {};
  if (ds.name || ds.source || ds.oos != null) {
    const dsParts = [];
    if (ds.name) dsParts.push(`Dataset: ${escHtml(ds.name)}`);
    if (ds.source) dsParts.push(`Source: ${escHtml(ds.source)}`);
    if (ds.oos != null) dsParts.push(ds.oos ? 'OOS ✓' : 'In-sample');
    parts.push(`<div class="research-section">
      <div class="research-section-title">Dataset</div>
      <div class="research-section-body">${dsParts.join(' · ')}</div>
    </div>`);
  }

  body.innerHTML = parts.join('');
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// — Slice F — Replay / Scrubber UI wiring
function updateReplayUI() {
  const s = replay.state;
  const frameEl = $('#replayFrame');
  const playingEl = $('#replayPlaying');
  if (frameEl) frameEl.textContent = s.frame >= 0 ? `${s.frame + 1}/${s.barsCount}` : '—';
  if (playingEl) playingEl.textContent = s.playing ? '⏸' : '▶';
  // Highlight active speed button
  document.querySelectorAll('.replay-speed-btn').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.ms) === s.speed);
  });
  // Refresh chart redrawn via events — already handled by replay._setReplayFrame
  // but we also update frame display when replay fires
}

(function setupReplayUI() {
  const playBtn = $('#replayPlay');
  const prevBtn = $('#replayPrev');
  const nextBtn = $('#replayNext');
  const scrubber = $('#replayScrub');

  if (playBtn) playBtn.addEventListener('click', () => replay.togglePlay());
  if (prevBtn) prevBtn.addEventListener('click', () => {
    replay.setFrame(Math.max(0, replay.frame - 1));
  });
  if (nextBtn) nextBtn.addEventListener('click', () => {
    replay.setFrame(Math.min(replay.bars.length - 1, replay.frame + 1));
  });
  if (scrubber) {
    scrubber.addEventListener('input', () => {
      replay.setFrame(Number(scrubber.value));
    });
  }
  document.querySelectorAll('.replay-speed-btn').forEach((btn) => {
    btn.addEventListener('click', () => replay.setSpeed(Number(btn.dataset.ms)));
  });

  window.addEventListener('replay:frame', () => {
    updateReplayUI();
    if (scrubber) {
      scrubber.min = '0';
      scrubber.max = String(replay.bars.length - 1);
      scrubber.value = String(replay.frame);
    }
  });

  window.addEventListener('replay:state', () => updateReplayUI());

  // Space = play/pause
  window.addEventListener('keydown', (e) => {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/i.test(e.target.tagName)) return;
    if (e.key === ' ') {
      e.preventDefault();
      replay.togglePlay();
    }
  });

  updateReplayUI();
})();

