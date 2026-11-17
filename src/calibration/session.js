import { matchTaps, summarize, CALIBRATION } from './calibration.js';

// Runs one calibration pass against a BEAT SOURCE: anything with start(),
// stop() and a `clicks` array of { perfTime } on the performance clock.
//   Metronome   (audio/metronome.js)   -> measures input vs sound
//   VisualBeats (calibration/visualBeats.js) -> measures input vs screen
// Both the calibration page and the game runner use this.
//
//   const s = new CalibrationSession(beats, { onProgress, onDone });
//   s.start();  input.onNote(ev => s.tap(ev));

export class CalibrationSession {
  constructor(beats, { onProgress, onDone, config = CALIBRATION } = {}) {
    this.beats = beats;
    this.cfg = config;
    this.onProgress = onProgress;
    this.onDone = onDone;
    this.total = config.warmupTaps + config.measuredTaps;
    this.intervalMs = (60 / config.bpm) * 1000;
    this.taps = [];
    this.running = false;
    this.result = null;
  }

  start() {
    this.taps = [];
    this.result = null;
    this.running = true;
    this.beats.start();
    this._progress();
  }

  stop() {
    this.running = false;
    this.beats.stop();
  }

  tap(ev) {
    if (!this.running || ev.type !== 'noteon') return;
    this.taps.push(ev.time); // the event's own timestamp
    this._progress();
  }

  _progress() {
    const clickTimes = this.beats.clicks.map((c) => c.perfTime);
    const offsets = matchTaps(clickTimes, this.taps, this.intervalMs);
    const n = Math.min(offsets.length, this.total);
    const s = summarize(offsets.slice(0, this.total), { skip: this.cfg.warmupTaps });
    if (this.onProgress) this.onProgress({ count: n, total: this.total, warmup: n < this.cfg.warmupTaps, ...s });
    if (n >= this.total) {
      this.stop();
      this.result = { meanMs: s.meanMs, stdevMs: s.stdevMs, count: s.count };
      if (this.onDone) this.onDone(this.result);
    }
  }
}
