/**
 * HERMES Desk — Canvas candlestick engine
 * DPR-aware, crosshair, OHLC HUD, pan/zoom, axes
 */

const COLORS = {
  bg: '#0b0e11',
  up: '#26a69a',
  down: '#ef5350',
  grid: '#1e2530',
  axis: '#8b93a7',
  crosshair: '#6ea8fe',
  text: '#e8eaed',
  muted: '#8b93a7',
};

export class Chart {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLElement} hudEl
   */
  constructor(canvas, hudEl) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hudEl = hudEl;
    this.bars = [];
    this.overlays = null;
    this.overlayFlags = {
      sessions: true,
      pdh: true,
      fvg: false,
      ce: false,
      or: true,
    };

    // Viewport: show last N bars, with offset
    this.visibleCount = 80;
    this.offset = 0; // bars scrolled left from end (0 = right-aligned to latest)
    this.padTop = 24;
    this.padBottom = 28;
    this.padLeft = 8;
    this.padRight = 64;

    this.minY = 0;
    this.maxY = 1;
    this.hoverIdx = -1;
    this.mouse = { x: 0, y: 0, inside: false };
    this.dragging = false;
    this.dragStartX = 0;
    this.dragStartOffset = 0;

    this._levels = []; // user long/short levels {price, type}
    this.tool = 'cursor';

    this._boundResize = () => this.resize();
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(canvas.parentElement || canvas);

    this._bindPointer();
    this.resize();
  }

  setBars(bars) {
    this.bars = bars || [];
    this.offset = 0;
    this.visibleCount = Math.min(80, Math.max(40, this.bars.length));
    this._autoscale();
    this.draw();
  }

  setOverlays(overlaysApi) {
    this.overlays = overlaysApi;
  }

  setOverlayFlags(flags) {
    Object.assign(this.overlayFlags, flags);
    this.draw();
  }

  /**
   * Slice C — export the current chart frame (candles + overlays + HUD) as a PNG.
   * Composites the canvas onto a white-free background with the OHLC HUD
   * burned in if it's currently visible, since the HUD is a DOM element and
   * canvas.toBlob() only captures the <canvas> pixels.
   */
  exportPng(filename) {
    const src = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const out = document.createElement('canvas');
    out.width = src.width;
    out.height = src.height;
    const octx = out.getContext('2d');
    octx.drawImage(src, 0, 0);

    if (this.hudEl && !this.hudEl.hidden) {
      octx.save();
      octx.scale(dpr, dpr);
      const left = parseFloat(this.hudEl.style.left) || 0;
      const top = parseFloat(this.hudEl.style.top) || 0;
      const rows = Array.from(this.hudEl.querySelectorAll('.hud-row')).map((r) => r.textContent.trim());
      const padX = 8;
      const padY = 6;
      const lineH = 15;
      const w = 132;
      const h = padY * 2 + rows.length * lineH;
      octx.fillStyle = 'rgba(11,14,17,0.92)';
      octx.strokeStyle = '#2a3140';
      octx.lineWidth = 1;
      octx.fillRect(left, top, w, h);
      octx.strokeRect(left, top, w, h);
      octx.fillStyle = '#e8eaed';
      octx.font = '11px system-ui, sans-serif';
      octx.textBaseline = 'top';
      rows.forEach((text, i) => {
        octx.fillText(text, left + padX, top + padY + i * lineH);
      });
      octx.restore();
    }

    out.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || `hermes-desk-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  }

  setTool(tool) {
    this.tool = tool;
    this.canvas.style.cursor = tool === 'cursor' ? 'crosshair' : 'cell';
  }

  addLevel(price, type) {
    this._levels.push({ price, type });
    this.draw();
  }

  clearLevels() {
    this._levels = [];
    this.draw();
  }

  resize() {
    const parent = this.canvas.parentElement || this.canvas;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.floor(w * dpr));
    this.canvas.height = Math.max(1, Math.floor(h * dpr));
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cssW = w;
    this.cssH = h;
    this._autoscale();
    this.draw();
  }

  _plotRect() {
    return {
      x: this.padLeft,
      y: this.padTop,
      w: this.cssW - this.padLeft - this.padRight,
      h: this.cssH - this.padTop - this.padBottom,
    };
  }

  _visibleRange() {
    const n = this.bars.length;
    const count = Math.min(this.visibleCount, n);
    const end = n - this.offset;
    const start = Math.max(0, end - count);
    return { start, end: Math.min(n, end), count: Math.min(n, end) - start };
  }

  _autoscale() {
    const { start, end } = this._visibleRange();
    if (end <= start) {
      this.minY = 0;
      this.maxY = 1;
      return;
    }
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = start; i < end; i++) {
      const b = this.bars[i];
      if (b.low < lo) lo = b.low;
      if (b.high > hi) hi = b.high;
    }
    // Include PDH/PDL / levels in scale if visible
    if (this.overlayFlags.pdh) {
      const last = this.bars[end - 1];
      if (last?.pdh != null) {
        hi = Math.max(hi, last.pdh);
        lo = Math.min(lo, last.pdh);
      }
      if (last?.pdl != null) {
        hi = Math.max(hi, last.pdl);
        lo = Math.min(lo, last.pdl);
      }
    }
    for (const lv of this._levels) {
      hi = Math.max(hi, lv.price);
      lo = Math.min(lo, lv.price);
    }
    const pad = (hi - lo) * 0.08 || 10;
    this.minY = lo - pad;
    this.maxY = hi + pad;
  }

  yToPrice(y) {
    const r = this._plotRect();
    const t = (y - r.y) / r.h;
    return this.maxY - t * (this.maxY - this.minY);
  }

  priceToY(price) {
    const r = this._plotRect();
    const t = (this.maxY - price) / (this.maxY - this.minY);
    return r.y + t * r.h;
  }

  idxToX(i) {
    const r = this._plotRect();
    const { start, count } = this._visibleRange();
    if (count <= 0) return r.x;
    const slot = r.w / count;
    return r.x + (i - start + 0.5) * slot;
  }

  xToIdx(x) {
    const r = this._plotRect();
    const { start, count } = this._visibleRange();
    if (count <= 0) return -1;
    const slot = r.w / count;
    const i = Math.floor((x - r.x) / slot) + start;
    if (i < start || i >= start + count) return -1;
    return i;
  }

  draw() {
    const ctx = this.ctx;
    const w = this.cssW;
    const h = this.cssH;
    if (!w || !h) return;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    this._autoscale();
    const plot = this._plotRect();
    const { start, end, count } = this._visibleRange();

    if (this.overlays) {
      this.overlays.draw(ctx, this, this.overlayFlags);
    }

    // Grid
    this._drawGrid(ctx, plot);

    // Candles
    if (count > 0) {
      const slot = plot.w / count;
      const bodyW = Math.max(1, Math.min(slot * 0.7, 14));
      for (let i = start; i < end; i++) {
        this._drawCandle(ctx, this.bars[i], this.idxToX(i), bodyW);
      }
    }

    // User levels
    for (const lv of this._levels) {
      const y = this.priceToY(lv.price);
      ctx.beginPath();
      ctx.strokeStyle = lv.type === 'long' ? COLORS.up : COLORS.down;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = lv.type === 'long' ? COLORS.up : COLORS.down;
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(
        (lv.type === 'long' ? 'Long ' : 'Short ') + lv.price.toFixed(2),
        plot.x + 4,
        y - 4
      );
    }

    // Price axis
    this._drawPriceAxis(ctx, plot);
    // Time axis
    this._drawTimeAxis(ctx, plot, start, end);

    // Crosshair
    if (this.mouse.inside) {
      this._drawCrosshair(ctx, plot);
    }
  }

  _drawGrid(ctx, plot) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    const steps = 6;
    for (let i = 0; i <= steps; i++) {
      const y = plot.y + (plot.h * i) / steps;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
  }

  _drawCandle(ctx, bar, x, bodyW) {
    const yO = this.priceToY(bar.open);
    const yC = this.priceToY(bar.close);
    const yH = this.priceToY(bar.high);
    const yL = this.priceToY(bar.low);
    const up = bar.close >= bar.open;
    const color = up ? COLORS.up : COLORS.down;

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1;

    // Wick
    ctx.beginPath();
    ctx.moveTo(x, yH);
    ctx.lineTo(x, yL);
    ctx.stroke();

    // Body
    const top = Math.min(yO, yC);
    const bot = Math.max(yO, yC);
    const bh = Math.max(1, bot - top);
    ctx.fillRect(x - bodyW / 2, top, bodyW, bh);
  }

  _drawPriceAxis(ctx, plot) {
    const steps = 6;
    ctx.fillStyle = COLORS.muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= steps; i++) {
      const price = this.maxY - ((this.maxY - this.minY) * i) / steps;
      const y = plot.y + (plot.h * i) / steps;
      ctx.fillText(price.toFixed(2), plot.x + plot.w + 8, y);
    }
  }

  _drawTimeAxis(ctx, plot, start, end) {
    const count = end - start;
    if (count <= 0) return;
    ctx.fillStyle = COLORS.muted;
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const labelEvery = Math.max(1, Math.floor(count / 6));
    for (let i = start; i < end; i += labelEvery) {
      const x = this.idxToX(i);
      const label = formatEt(this.bars[i].time);
      ctx.fillText(label, x, plot.y + plot.h + 8);
    }
  }

  _drawCrosshair(ctx, plot) {
    const { x, y } = this.mouse;
    if (x < plot.x || x > plot.x + plot.w || y < plot.y || y > plot.y + plot.h) {
      this._hideHud();
      return;
    }

    ctx.strokeStyle = COLORS.crosshair;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, plot.y);
    ctx.lineTo(x, plot.y + plot.h);
    ctx.moveTo(plot.x, y);
    ctx.lineTo(plot.x + plot.w, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Price label on axis
    const price = this.yToPrice(y);
    const label = price.toFixed(2);
    ctx.font = '11px system-ui, sans-serif';
    const tw = ctx.measureText(label).width + 10;
    const ly = y;
    ctx.fillStyle = COLORS.crosshair;
    ctx.fillRect(plot.x + plot.w + 2, ly - 9, tw, 18);
    ctx.fillStyle = '#0b0e11';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, plot.x + plot.w + 7, ly);

    const idx = this.xToIdx(x);
    this.hoverIdx = idx;
    if (idx >= 0 && this.bars[idx]) {
      this._showHud(this.bars[idx], x, y, plot);
    } else {
      this._hideHud();
    }
  }

  _showHud(bar, x, y, plot) {
    const el = this.hudEl;
    if (!el) return;
    const up = bar.close >= bar.open;
    const cls = up ? 'hud-up' : 'hud-down';
    el.hidden = false;
    el.innerHTML = `
      <div class="hud-row"><span class="hud-label">O</span><span class="${cls}">${bar.open.toFixed(2)}</span></div>
      <div class="hud-row"><span class="hud-label">H</span><span class="${cls}">${bar.high.toFixed(2)}</span></div>
      <div class="hud-row"><span class="hud-label">L</span><span class="${cls}">${bar.low.toFixed(2)}</span></div>
      <div class="hud-row"><span class="hud-label">C</span><span class="${cls}">${bar.close.toFixed(2)}</span></div>
      <div class="hud-row" style="margin-top:4px;color:#8b93a7">${formatEtFull(bar.time)} · ${bar.session}</div>
    `;
    // Position near cursor, keep inside plot
    let left = x + 16;
    let top = y + 16;
    const hw = 140;
    const hh = 90;
    if (left + hw > plot.x + plot.w) left = x - hw - 12;
    if (top + hh > plot.y + plot.h) top = y - hh - 8;
    el.style.left = left + 'px';
    el.style.top = top + 'px';
  }

  _hideHud() {
    if (this.hudEl) this.hudEl.hidden = true;
  }

  _bindPointer() {
    const c = this.canvas;

    c.addEventListener('pointerdown', (e) => {
      const rect = c.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (this.tool === 'long' || this.tool === 'short') {
        const price = this.yToPrice(y);
        this.addLevel(Math.round(price * 100) / 100, this.tool);
        return;
      }
      this.dragging = true;
      this.dragStartX = x;
      this.dragStartOffset = this.offset;
      c.setPointerCapture(e.pointerId);
    });

    c.addEventListener('pointermove', (e) => {
      const rect = c.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      this.mouse = { x, y, inside: true };

      if (this.dragging && this.tool === 'cursor') {
        const plot = this._plotRect();
        const { count } = this._visibleRange();
        const slot = count > 0 ? plot.w / count : 10;
        const dx = x - this.dragStartX;
        const dBars = Math.round(dx / slot);
        const maxOff = Math.max(0, this.bars.length - 10);
        this.offset = clamp(this.dragStartOffset + dBars, 0, maxOff);
      }
      this.draw();
    });

    c.addEventListener('pointerup', (e) => {
      this.dragging = false;
      try {
        c.releasePointerCapture(e.pointerId);
      } catch (_) {}
    });

    c.addEventListener('pointerleave', () => {
      this.mouse.inside = false;
      this.dragging = false;
      this._hideHud();
      this.draw();
    });

    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const dir = e.deltaY > 0 ? 1 : -1;
        const next = clamp(Math.round(this.visibleCount * (1 + dir * 0.12)), 20, Math.min(400, this.bars.length));
        this.visibleCount = next;
        const maxOff = Math.max(0, this.bars.length - 10);
        this.offset = clamp(this.offset, 0, maxOff);
        this.draw();
      },
      { passive: false }
    );
  }
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function formatEt(ms) {
  const d = new Date(ms - 4 * 3600 * 1000);
  const mo = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  return `${mo}/${day} ${pad(h)}:${pad(m)}`;
}

function formatEtFull(ms) {
  const d = new Date(ms - 4 * 3600 * 1000);
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  return `${y}-${pad(mo)}-${pad(day)} ${pad(h)}:${pad(m)} ET`;
}

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}
