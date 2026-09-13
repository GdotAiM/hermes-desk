/**
 * HERMES Desk — ICT overlays
 * Asia / London / NY session shading, PDH/PDL, FVG, CE mid, opening range
 */

const SESSION_FILL = {
  Asia: 'rgba(110, 168, 254, 0.04)',
  London: 'rgba(201, 162, 39, 0.05)',
  NY: 'rgba(38, 166, 154, 0.05)',
};

const SESSION_EDGE = {
  Asia: 'rgba(110, 168, 254, 0.12)',
  London: 'rgba(201, 162, 39, 0.14)',
  NY: 'rgba(38, 166, 154, 0.14)',
};

export function createOverlays(metaRef) {
  return {
    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {import('./chart.js').Chart} chart
     * @param {object} flags
     */
    draw(ctx, chart, flags) {
      const meta = typeof metaRef === 'function' ? metaRef() : metaRef;
      const plot = chart._plotRect();
      const { start, end, count } = chart._visibleRange();
      if (count <= 0) return;

      if (flags.sessions) {
        drawSessionShades(ctx, chart, start, end, plot);
      }
      if (flags.or && meta?.openingRanges) {
        drawOpeningRanges(ctx, chart, meta.openingRanges, start, end, plot);
      }
      if (flags.fvg && meta?.fvgs) {
        drawFVGs(ctx, chart, meta.fvgs, start, end, plot, false);
      }
      if (flags.ce && meta?.fvgs) {
        drawFVGs(ctx, chart, meta.fvgs, start, end, plot, true);
      }
      if (flags.pdh) {
        drawPDHPDL(ctx, chart, start, end, plot);
      }
    },
  };
}

function drawSessionShades(ctx, chart, start, end, plot) {
  let i = start;
  while (i < end) {
    const sess = chart.bars[i].session;
    let j = i + 1;
    while (j < end && chart.bars[j].session === sess) j++;
    const x0 = chart.idxToX(i) - (plot.w / (end - start)) * 0.5;
    const x1 = chart.idxToX(j - 1) + (plot.w / (end - start)) * 0.5;
    ctx.fillStyle = SESSION_FILL[sess] || SESSION_FILL.Asia;
    ctx.fillRect(x0, plot.y, Math.max(1, x1 - x0), plot.h);

    // Subtle top tag on session start
    if (i === start || chart.bars[i - 1]?.session !== sess) {
      ctx.fillStyle = SESSION_EDGE[sess] || SESSION_EDGE.Asia;
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = sess === 'NY' ? 'rgba(38,166,154,0.55)' : sess === 'London' ? 'rgba(201,162,39,0.55)' : 'rgba(110,168,254,0.5)';
      ctx.fillText(sess, x0 + 4, plot.y + 4);
    }
    i = j;
  }
}

function drawPDHPDL(ctx, chart, start, end, plot) {
  // Use latest visible bar's pdh/pdl (prior day relative to that bar's day)
  const last = chart.bars[end - 1];
  if (!last) return;

  // Prefer continuous lines for the most recent PDH/PDL values in view
  let pdh = null;
  let pdl = null;
  for (let i = end - 1; i >= start; i--) {
    if (chart.bars[i].pdh != null) {
      pdh = chart.bars[i].pdh;
      pdl = chart.bars[i].pdl;
      break;
    }
  }
  if (pdh == null && pdl == null) return;

  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 1;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';

  if (pdh != null) {
    const y = chart.priceToY(pdh);
    ctx.strokeStyle = 'rgba(110, 168, 254, 0.65)';
    ctx.beginPath();
    ctx.moveTo(plot.x, y);
    ctx.lineTo(plot.x + plot.w, y);
    ctx.stroke();
    ctx.fillStyle = 'rgba(110, 168, 254, 0.85)';
    ctx.fillText('PDH ' + pdh.toFixed(2), plot.x + 6, y - 2);
  }
  if (pdl != null) {
    const y = chart.priceToY(pdl);
    ctx.strokeStyle = 'rgba(239, 83, 80, 0.55)';
    ctx.beginPath();
    ctx.moveTo(plot.x, y);
    ctx.lineTo(plot.x + plot.w, y);
    ctx.stroke();
    ctx.fillStyle = 'rgba(239, 83, 80, 0.8)';
    ctx.textBaseline = 'top';
    ctx.fillText('PDL ' + pdl.toFixed(2), plot.x + 6, y + 2);
  }
  ctx.setLineDash([]);
}

function drawOpeningRanges(ctx, chart, ranges, start, end, plot) {
  const t0 = chart.bars[start]?.time;
  const t1 = chart.bars[end - 1]?.time;
  if (t0 == null) return;

  for (const or of ranges) {
    // Visible if OR overlaps viewport time
    if (or.endTime < t0 || or.startTime > t1) continue;

    // Map times to x via nearest bar indices
    const i0 = findIdxNear(chart.bars, or.startTime, start, end);
    const i1 = findIdxNear(chart.bars, or.endTime, start, end);
    if (i0 < 0 || i1 < 0) continue;

    const slot = plot.w / (end - start);
    const x0 = chart.idxToX(i0) - slot * 0.45;
    const x1 = chart.idxToX(Math.max(i1, i0)) + slot * 0.45;
    const yH = chart.priceToY(or.high);
    const yL = chart.priceToY(or.low);

    ctx.fillStyle = 'rgba(110, 168, 254, 0.07)';
    ctx.strokeStyle = 'rgba(110, 168, 254, 0.35)';
    ctx.lineWidth = 1;
    ctx.fillRect(x0, yH, Math.max(2, x1 - x0), yL - yH);
    ctx.strokeRect(x0, yH, Math.max(2, x1 - x0), yL - yH);

    ctx.fillStyle = 'rgba(110, 168, 254, 0.7)';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('OR', x0 + 3, yH - 2);
  }
}

/**
 * @param {boolean} ceOnly - if true, draw midpoint only; if false draw rect (and mid if both flags typically separate)
 */
function drawFVGs(ctx, chart, fvgs, start, end, plot, ceOnly) {
  const t0 = chart.bars[start]?.time;
  const t1 = chart.bars[end - 1]?.time;

  for (const f of fvgs) {
    if (f.endTime < t0 || f.startTime > t1 + 7 * 86400000) {
      // extend FVG forward visually a bit past creation
    }
    // Show FVG from creation through viewport end (or mitigation)
    const iStart = Math.max(start, f.endIdx);
    let iEnd = end - 1;
    if (f.mitigated && f.mitigateIdx != null) {
      iEnd = Math.min(iEnd, f.mitigateIdx);
    }
    if (iStart > iEnd || iStart >= end || iEnd < start) continue;

    const slot = plot.w / (end - start);
    const x0 = chart.idxToX(iStart) - slot * 0.4;
    const x1 = chart.idxToX(iEnd) + slot * 0.4;
    const yTop = chart.priceToY(f.top);
    const yBot = chart.priceToY(f.bot);
    const yMid = chart.priceToY(f.mid);

    if (!ceOnly) {
      ctx.fillStyle =
        f.type === 'bull' ? 'rgba(38, 166, 154, 0.12)' : 'rgba(239, 83, 80, 0.12)';
      ctx.strokeStyle =
        f.type === 'bull' ? 'rgba(38, 166, 154, 0.3)' : 'rgba(239, 83, 80, 0.3)';
      ctx.lineWidth = 1;
      ctx.fillRect(x0, yTop, Math.max(2, x1 - x0), yBot - yTop);
      ctx.strokeRect(x0, yTop, Math.max(2, x1 - x0), yBot - yTop);
    }

    if (ceOnly) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(232, 234, 237, 0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.moveTo(x0, yMid);
      ctx.lineTo(x1, yMid);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(232, 234, 237, 0.55)';
      ctx.font = '9px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('CE', x0 + 2, yMid - 1);
    }
  }
}

function findIdxNear(bars, time, start, end) {
  let best = -1;
  let bestD = Infinity;
  for (let i = start; i < end; i++) {
    const d = Math.abs(bars[i].time - time);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
