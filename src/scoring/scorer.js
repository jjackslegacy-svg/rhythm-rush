import { SCORING } from './config.js';

// Deterministic judgment. REQUIREMENT 5.
//
// Pure function of: the chart, the song's start time on the performance
// clock, the calibration offset, the config, and the ordered input events.
// No Date, no randomness, no frame timing. The same event log always
// produces the same result. The live game and the batch test both go
// through this exact class; nothing is judged anywhere else.
//
// Usage:
//   const s = new Scorer(chart, { songStartMs, calibrationMs });
//   for (const ev of events) s.feed(ev);   // returns a live judgment or null
//   const result = s.finish();
// or
//   scoreLog(chart, events, { songStartMs, calibrationMs })

export class Scorer {
  constructor(chart, { songStartMs, calibrationMs = 0, config = SCORING }) {
    this.chart = chart;
    this.cfg = config;
    this.songStartMs = songStartMs;
    this.calibrationMs = calibrationMs;
    const beatMs = 60000 / chart.bpm;
    this.beatMs = beatMs;

    this.expected = chart.notes
      .map((n, i) => ({
        index: i,
        pitch: n.pitch,
        targetMs: songStartMs + n.onset * beatMs,
        durationMs: n.duration * beatMs,
        durationBeats: n.duration,
        chartVelocity: n.velocity ?? null,
        judgment: null,
        deltaMs: null,
        hitMs: null,
        hitVelocity: null,
        releaseMs: null,
        heldMs: null,
        holdOk: null,
      }))
      .sort((a, b) => a.targetMs - b.targetMs || a.pitch - b.pitch);

    this.extras = [];
    this.events = [];
    this.combo = 0;
    this.maxCombo = 0;
    this.score = 0;
    this._open = new Map(); // pitch -> expected note currently held down
    this.finished = false;
  }

  /** Feed one NoteEvent. Returns a live judgment object or null. */
  feed(ev) {
    if (this.finished) throw new Error('Scorer already finished');
    this.events.push(ev);
    const t = ev.time - this.calibrationMs;
    // Any expected note whose window closed before this event can never be
    // matched now. Marking it here, in event order, is what makes the live
    // and batch paths produce identical combo histories.
    this._expireBefore(t);
    if (ev.type === 'noteon') return this._noteOn(ev, t);
    if (ev.type === 'noteoff') return this._noteOff(ev, t);
    return null;
  }

  /** Live only: mark misses whose window has closed as of nowMs (raw clock). */
  tick(nowMs) {
    return this._expireBefore(nowMs - this.calibrationMs);
  }

  _expireBefore(t) {
    const out = [];
    for (const n of this.expected) {
      if (n.judgment === null && t > n.targetMs + this.cfg.windows.late) {
        n.judgment = 'miss';
        this._breakCombo();
        out.push({ judgment: 'miss', pitch: n.pitch, index: n.index, deltaMs: null });
      }
    }
    return out;
  }

  _noteOn(ev, t) {
    const w = this.cfg.windows;
    let best = null;
    let bestAbs = Infinity;
    for (const n of this.expected) {
      if (n.judgment !== null || n.pitch !== ev.note) continue;
      const a = Math.abs(t - n.targetMs);
      if (a <= w.late && a < bestAbs) {
        best = n;
        bestAbs = a;
      }
    }
    if (!best) {
      this.extras.push({ pitch: ev.note, timeMs: t, velocity: ev.velocity });
      this._breakCombo();
      return { judgment: 'extra', pitch: ev.note, index: null, deltaMs: null };
    }
    const d = t - best.targetMs;
    const a = Math.abs(d);
    const j = a <= w.perfect ? 'perfect' : a <= w.good ? 'good' : d < 0 ? 'early' : 'late';
    best.judgment = j;
    best.deltaMs = d;
    best.hitMs = t;
    best.hitVelocity = ev.velocity;
    this._open.set(ev.note, best);
    this._hit(j);
    return { judgment: j, pitch: ev.note, index: best.index, deltaMs: d };
  }

  _noteOff(ev, t) {
    const n = this._open.get(ev.note);
    if (!n) return null;
    this._open.delete(ev.note);
    n.releaseMs = t;
    n.heldMs = t - n.hitMs;
    if (n.durationBeats >= this.cfg.holdMinBeats) {
      n.holdOk = n.heldMs >= n.durationMs * this.cfg.holdMinRatio;
    }
    return null;
  }

  _hit(j) {
    this.combo += 1;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    const mult = 1 + Math.min(this.combo, this.cfg.comboCap) / this.cfg.comboCap;
    this.score += Math.round(this.cfg.points[j] * mult);
  }

  _breakCombo() {
    this.combo = 0;
  }

  /** Close out: everything still unjudged is a miss. Returns the result. */
  finish() {
    if (this.finished) throw new Error('Scorer already finished');
    for (const n of this.expected) {
      if (n.judgment === null) {
        n.judgment = 'miss';
        this._breakCombo();
      }
    }
    this.finished = true;

    const counts = { perfect: 0, good: 0, early: 0, late: 0, miss: 0, extra: this.extras.length };
    let base = 0;
    let offsetSum = 0;
    let hits = 0;
    for (const n of this.expected) {
      counts[n.judgment]++;
      base += this.cfg.points[n.judgment];
      if (n.deltaMs !== null) {
        offsetSum += n.deltaMs;
        hits++;
      }
    }
    const maxBase = this.cfg.points.perfect * (this.expected.length + this.extras.length);
    const accuracy = maxBase === 0 ? 1 : base / maxBase;

    return {
      chartId: this.chart.id,
      songStartMs: this.songStartMs,
      calibrationMs: this.calibrationMs,
      counts,
      score: this.score,
      maxCombo: this.maxCombo,
      accuracy,
      meanOffsetMs: hits ? offsetSum / hits : null,
      notes: this.expected.map((n) => ({ ...n })),
      extras: this.extras.map((e) => ({ ...e })),
      events: this.events.map((e) => ({ ...e })),
    };
  }
}

/** Batch: score a whole recorded event log. */
export function scoreLog(chart, events, opts) {
  const s = new Scorer(chart, opts);
  const sorted = [...events].sort((a, b) => a.time - b.time);
  for (const ev of sorted) s.feed(ev);
  return s.finish();
}
