/**
 * HERMES Desk — Session Replay / Scrubber (Slice F)
 *
 * Controls a visible playhead over the candlestick chart and optional
 * frame-by-frame playback at configurable speeds. Designed to study
 * a session (e.g. NY killzone) offline using synthetic or loaded bars.
 *
 * Public API:
 *   replay.setBars(bars)        – attach or swap the bar series
 *   replay.setFrame(i)          – jump to a frame index (0..bars.length-1)
 *   replay.togglePlay()         – play or pause
 *   replay.setSpeed(msPerBar)   – milliseconds per bar; default 300
 *   replay.state                – { playing, frame, speed, barsCount }
 *
 * Events emitted on window:
 *   'replay:state'  – fired after every state mutation or frame tick
 *   'replay:frame'  – fired when the visible frame changes (for side UI)
 */

const SPEED_PRESETS = [500, 300, 150, 50]; // ms per bar: slow → fast

export class ReplayController {
  /** @param {import('./chart.js').Chart} chart */
  constructor(chart) {
    this.chart = chart;
    this.bars = [];
    this.frame = -1;
    this.speed = 300; // ms per bar
    this.playing = false;
    this._timer = null;
  }

  /** Attach or replace the bar series. Call after loadSymbol/loadTf. */
  setBars(bars) {
    this.bars = bars || [];
    this.frame = Math.min(this.frame, this.bars.length - 1);
    if (this.frame < 0) this.frame = 0;
    // Inform chart of the current frame so it can draw the playhead
    this.chart._setReplayFrame(this.frame);
    this._emit();
  }

  /** Move the playhead to index i. Clamps to valid range. */
  setFrame(i) {
    this.frame = clamp(Math.round(i), 0, Math.max(0, this.bars.length - 1));
    this.chart._setReplayFrame(this.frame);
    this._emit();
  }

  /** Toggle play/pause. */
  togglePlay() {
    this.playing = !this.playing;
    if (this.playing) {
      this._startTimer();
    } else {
      this._stopTimer();
    }
    this._emit();
  }

  /** Set speed in ms per bar. Picks nearest preset if one matches within 10%. */
  setSpeed(ms) {
    this.speed = Math.max(20, Number(ms) || 300);
    const nearest = SPEED_PRESETS.reduce((prev, curr) =>
      Math.abs(curr - this.speed) < Math.abs(prev - this.speed) ? curr : prev
    );
    if (Math.abs(nearest - this.speed) < this.speed * 0.1) this.speed = nearest;
    this._emit();
  }

  get state() {
    return {
      playing: this.playing,
      frame: this.frame,
      speed: this.speed,
      barsCount: this.bars.length,
    };
  }

  // -- private --

  _startTimer() {
    this._stopTimer();
    this._timer = setInterval(() => this._tick(), this.speed);
  }

  _stopTimer() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  _tick() {
    if (!this.playing || this.frame >= this.bars.length - 1) {
      this.playing = false;
      this._stopTimer();
      this._emit();
      return;
    }
    this.frame += 1;
    this.chart._setReplayFrame(this.frame);
    this._emit();
  }

  _emit() {
    window.dispatchEvent(new CustomEvent('replay:state', { detail: this.state }));
    window.dispatchEvent(new CustomEvent('replay:frame', { detail: { frame: this.frame, barsCount: this.bars.length } }));
  }
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
