/**
 * HERMES Desk — HERMES-X Research Context Adapter (Slice J)
 *
 * Read-only adapter that consumes structured research artifacts from HERMES-X.
 * Accepts a JSON file via URL or local path. Validates against the research
 * contract schema and exposes parsed fields for rendering.
 *
 * Contract schema (what Desk expects from HERMES-X):
 * {
 *   schemaVersion: "1",
 *   researchId: "...",
 *   symbol: "NQ1!",
 *   timeframe: "15m",
 *   session: "NY AM",
 *   asOf: "...",
 *   hypothesis: "...",
 *   evidence: [{ type, description, source }],
 *   levels: { pdh, pdl, liquidity: [], pdArrays: [] },
 *   marketStructure: { bias, events: [] },
 *   statistics: { sampleSize, winRate, reachRate },
 *   dataset: { name, source, oos }
 * }
 *
 * Fields are optional — missing keys render as "—".
 */

export class HermesXAdapter {
  /**
   * @param {string} source — HTTP(S) URL or relative file path
   */
  constructor(source) {
    this.source = source;
  }

  /**
   * Load and parse a HERMES-X research artifact.
   * @returns {Promise<{ ok: boolean, artifact: object|null, error: string|null, draft: boolean }>}
   */
  async load() {
    try {
      const text = await this._fetch(this.source);
      const raw = JSON.parse(text);
      const artifact = this._validate(raw);
      return { ok: true, artifact, error: null, draft: false };
    } catch (err) {
      // Try treating as a draft (partial JSON) with more forgiving parsing
      const draft = this._parseDraft(text);
      if (draft) {
        return { ok: true, artifact: draft, error: null, draft: true };
      }
      return {
        ok: false,
        artifact: null,
        error: err instanceof Error ? err.message : String(err),
        draft: false,
      };
    }
  }

  /** Validate against contract schema — returns normalized artifact. */
  _validate(raw) {
    const artifact = { ...raw };

    // Fill defaults for missing fields
    artifact.schemaVersion = artifact.schemaVersion || '1';
    artifact.researchId = artifact.researchId || raw.researchId || 'unknown';
    artifact.symbol = artifact.symbol || '—';
    artifact.timeframe = artifact.timeframe || '—';
    artifact.session = artifact.session || '—';
    artifact.asOf = artifact.asOf || this._now();
    artifact.hypothesis = artifact.hypothesis || '';

    artifact.evidence = Array.isArray(artifact.evidence) ? artifact.evidence : [];
    artifact.levels = artifact.levels || {};
    artifact.levels.pdh = artifact.levels.pdh ?? null;
    artifact.levels.pdl = artifact.levels.pdl ?? null;
    artifact.levels.liquidity = artifact.levels.liquidity || [];
    artifact.levels.pdArrays = artifact.levels.pdArrays || [];

    artifact.marketStructure = artifact.marketStructure || {};
    artifact.marketStructure.bias = artifact.marketStructure.bias || null;
    artifact.marketStructure.events = artifact.marketStructure.events || [];

    artifact.statistics = artifact.statistics || {};
    artifact.statistics.sampleSize = artifact.statistics.sampleSize ?? null;
    artifact.statistics.winRate = artifact.statistics.winRate ?? null;
    artifact.statistics.reachRate = artifact.statistics.reachRate ?? null;

    artifact.dataset = artifact.dataset || {};
    artifact.dataset.name = artifact.dataset.name || '';
    artifact.dataset.source = artifact.dataset.source || '';
    artifact.dataset.oos = !!artifact.dataset.oos;

    return artifact;
  }

  /**
   * Attempt to parse a draft/incomplete JSON artifact.
   * Tries to recover useful fields from partial data.
   */
  _parseDraft(text) {
    if (!text || typeof text !== 'string') return null;
    try {
      // Try strict parse first
      return this._validate(JSON.parse(text));
    } catch {
      // Fallback: try to extract key-value pairs from text
      const result = { hypothesis: '', evidence: [], levels: {}, marketStructure: {}, statistics: {}, dataset: {} };
      const proto = { ...result, ...this._extractFields(text) };
      return this._validate(proto);
    }
  }

  /** Extract recognizable fields from raw text when JSON parsing fails. */
  _extractFields(text) {
    const fields = {};
    const lines = text.split('\n');
    for (const line of lines) {
      const m = line.match(/^\s*(researchId|symbol|timeframe|session|hypothesis|bias|source|name)\s*[:\-]\s*(.+)$/i);
      if (m) {
        const key = m[1].toLowerCase().replace(/\s/g, '');
        const val = m[2].trim();
        if (key === 'researchid') fields.researchId = val;
        else if (key === 'symbol') fields.symbol = val;
        else if (key === 'timeframe') fields.timeframe = val;
        else if (key === 'session') fields.session = val;
        else if (key === 'hypothesis') fields.hypothesis = val;
        else if (key === 'bias') fields.bias = val;
        else if (key === 'source' || key === 'datasetname') fields.source = val;
      }
    }
    return fields;
  }

  /** Render evidence array as plain-text summary lines. */
  static renderEvidence(evidence) {
    if (!Array.isArray(evidence) || evidence.length === 0) return null;
    return evidence.map((e) => {
      const type = e.type ? `[${e.type}] ` : '';
      return `${type}${e.description || ''}`;
    }).filter(Boolean);
  }

  /** Render market structure summary. */
  static renderMarketStructure(marketStructure) {
    if (!marketStructure) return null;
    const parts = [];
    if (marketStructure.bias) parts.push(`Bias: ${marketStructure.bias}`);
    if (Array.isArray(marketStructure.events) && marketStructure.events.length > 0) {
      parts.push('Events: ' + marketStructure.events.join(', '));
    }
    return parts.length > 0 ? parts.join(' · ') : null;
  }

  /** Get status label from hypothesis text (extracts SURVIVES/FAILS etc.). */
  static getBoardStatus(hypothesis) {
    if (!hypothesis) return null;
    const match = hypothesis.match(/\b(SURVIVES|FAILS|VERIFY COMPLETE|INCONCLUSIVE|OPEN|HOLD)\b/i);
    return match ? match[1].toUpperCase() : null;
  }

  /** Format statistics for display. */
  static formatStats(stats) {
    const parts = [];
    if (stats?.sampleSize != null) parts.push(`N=${stats.sampleSize}`);
    if (stats?.winRate != null) parts.push(`WR=${Math.round(stats.winRate * 100)}%`);
    if (stats?.reachRate != null) parts.push(`RR=${Math.round(stats.reachRate * 100)}%`);
    return parts.join(' · ');
  }

  // -- private --

  async _fetch(source) {
    if (source.startsWith('http://') || source.startsWith('https://')) {
      const resp = await fetch(source);
      if (!resp.ok) throw new Error(`HTTP ${resp.status} loading ${source}`);
      return await resp.text();
    }
    const resp = await fetch(source);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} loading ${source}`);
    return await resp.text();
  }

  _now() {
    return new Date().toISOString().slice(0, 19).replace('T', ' ');
  }
}

/** Convenience: instantiate and immediately load. */
export async function loadHermesX(source) {
  const adapter = new HermesXAdapter(source);
  return adapter.load();
}
