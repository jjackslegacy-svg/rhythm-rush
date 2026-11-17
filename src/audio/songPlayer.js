// Plays a chart as simple tones, scheduled on the audio clock, with a
// count-in and an optional click through the song. Returns the song's
// start time on BOTH clocks so the scorer can place every target note.

const COUNT_IN_BEATS = 4;

function midiToHz(n) {
  return 440 * Math.pow(2, (n - 69) / 12);
}

export class SongPlayer {
  /** @param {import('./clock.js').AudioClock} clock */
  constructor(clock) {
    this.clock = clock;
    this._nodes = [];
  }

  /**
   * Schedule the whole chart. Returns { startCtx, startPerf, endCtx, endPerf }.
   * @param {object} chart
   * @param {{ click?: boolean, melody?: boolean, leadInSec?: number }} opts
   */
  play(chart, { click = true, melody = true, leadInSec = 0.25 } = {}) {
    this.stop();
    this.clock.refreshPairing();
    const ctx = this.clock.ctx;
    const beat = 60 / chart.bpm;
    const countInStart = this.clock.now() + leadInSec;
    const startCtx = countInStart + COUNT_IN_BEATS * beat;
    const endCtx = startCtx + chart.lengthBeats * beat;

    // Count-in clicks, then clicks on every beat of the song.
    const totalBeats = COUNT_IN_BEATS + Math.ceil(chart.lengthBeats);
    for (let i = 0; i < totalBeats; i++) {
      const t = countInStart + i * beat;
      const accent = i < COUNT_IN_BEATS || (i - COUNT_IN_BEATS) % 4 === 0;
      if (click || i < COUNT_IN_BEATS) this._click(t, accent, i < COUNT_IN_BEATS ? 0.5 : 0.18);
    }

    if (melody) {
      for (const n of chart.notes) {
        const t = startCtx + n.onset * beat;
        const d = Math.max(0.08, n.duration * beat * 0.9);
        this._tone(t, d, midiToHz(n.pitch), (n.velocity ?? 80) / 127);
      }
    }

    return {
      startCtx,
      startPerf: this.clock.ctxToPerf(startCtx),
      endCtx,
      endPerf: this.clock.ctxToPerf(endCtx),
      countInBeats: COUNT_IN_BEATS,
    };
  }

  stop() {
    for (const n of this._nodes) {
      try {
        n.stop();
      } catch {}
    }
    this._nodes = [];
  }

  _click(t, accent, vol) {
    const ctx = this.clock.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = accent ? 1200 : 900;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.05);
    this._nodes.push(osc);
  }

  _tone(t, dur, hz, vol) {
    const ctx = this.clock.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = hz;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35 * vol, t + 0.01);
    g.gain.setValueAtTime(0.35 * vol, t + dur - 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.01);
    this._nodes.push(osc);
  }
}
