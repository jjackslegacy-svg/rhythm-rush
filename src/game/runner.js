import { AudioClock } from '../audio/clock.js';
import { SongPlayer } from '../audio/songPlayer.js';
import { Metronome } from '../audio/metronome.js';
import { CalibrationSession } from '../calibration/session.js';
import { VisualBeats } from '../calibration/visualBeats.js';
import { CALIBRATION } from '../calibration/calibration.js';
import { Scorer } from '../scoring/scorer.js';
import { SCORING } from '../scoring/config.js';
import {
  setCalibrationOffsetMs,
  getVisualLagMs,
  setVisualLagMs,
  getVisualTrimMs,
  setVisualTrimMs,
  saveLastRun,
} from '../storage.js';

// Owns the audio clock, the two calibrations, and one run at a time.
// Pages plug in rendering through callbacks. All judgment goes through the
// Scorer; the frame callbacks are display only.
//
// Three timelines meet here:
//   sound   when a scheduled note is heard
//   input   when the player presses (MIDI/keyboard event timestamps)
//   screen  when a drawn frame is actually seen
// audioCal  = mean(input - sound)  measured per AudioContext (sync())
// visualLag = mean(input - screen) measured per machine (syncVisual())
// The scorer calls an input "perfect" at  input = target + audioCal.
// The renderer must therefore land the block at  target + audioCal - visualLag
// (+ manual trim), so that on-the-line, perfect and the sound coincide.

export class GameRunner {
  constructor({ input, onSyncProgress, onSynced, onVisualFrame, onVisualSynced, onJudgment, onFrame, onFinish }) {
    this.cb = { onSyncProgress, onSynced, onVisualFrame, onVisualSynced, onJudgment, onFrame, onFinish };
    this.clock = null;
    this.player = null;
    this.session = null;
    this.visualBeats = null;
    this.scorer = null;
    this.chart = null;
    this.timing = null;
    this.audioCal = null; // measured in THIS AudioContext; never loaded from storage
    this.visualLag = getVisualLagMs(); // stable per machine; loaded if present
    this.visualTrim = getVisualTrimMs();
    this.pressed = new Set();
    this.lastJudgment = null;
    this._raf = 0;

    input.onNote((ev) => this._onNote(ev));
  }

  get busy() {
    return !!this.session || (!!this.scorer && !this.scorer.finished);
  }

  get ready() {
    return this.audioCal !== null;
  }

  /** What the renderer shifts the picture by. */
  get visualOffsetMs() {
    return (this.audioCal ?? 0) - (this.visualLag ?? 0) + this.visualTrim;
  }

  nudgeVisual(deltaMs) {
    this.visualTrim += deltaMs;
    setVisualTrimMs(this.visualTrim);
  }

  async _ensureClock() {
    if (!this.clock) {
      this.clock = new AudioClock();
      this.player = new SongPlayer(this.clock);
    }
    await this.clock.resume();
  }

  _onNote(ev) {
    if (ev.type === 'noteon') this.pressed.add(ev.note);
    else this.pressed.delete(ev.note);
    if (this.session) return this.session.tap(ev);
    if (!this.scorer || this.scorer.finished) return;
    const j = this.scorer.feed(ev);
    if (j) this._judged(j);
  }

  _judged(j) {
    this.lastJudgment = { ...j, atMs: performance.now() };
    if (this.cb.onJudgment) this.cb.onJudgment(j);
  }

  /** Audio sync: tap to an audible click. Must be redone per page load. */
  async sync() {
    if (this.busy) return;
    await this._ensureClock();
    const beats = new Metronome(this.clock, { bpm: CALIBRATION.bpm });
    return new Promise((resolve) => {
      this.session = new CalibrationSession(beats, {
        onProgress: (p) => this.cb.onSyncProgress && this.cb.onSyncProgress(p),
        onDone: (r) => {
          this.session = null;
          this.audioCal = r.meanMs;
          setCalibrationOffsetMs(r.meanMs);
          if (this.cb.onSynced) this.cb.onSynced(r);
          resolve(r);
        },
      });
      this.session.start();
    });
  }

  /** Visual sync: tap when a silent falling bar reaches the line. */
  async syncVisual() {
    if (this.busy) return;
    const beats = new VisualBeats({ bpm: CALIBRATION.bpm });
    this.visualBeats = beats;
    return new Promise((resolve) => {
      let progress = null;
      this.session = new CalibrationSession(beats, {
        onProgress: (p) => {
          progress = p;
        },
        onDone: (r) => {
          this.session = null;
          this.visualBeats = null;
          this.visualLag = r.meanMs;
          setVisualLagMs(r.meanMs);
          if (this.cb.onVisualSynced) this.cb.onVisualSynced(r);
          resolve(r);
        },
      });
      this.session.start();
      const loop = () => {
        if (!this.visualBeats) return;
        if (this.cb.onVisualFrame) this.cb.onVisualFrame(performance.now(), beats, progress);
        requestAnimationFrame(loop);
      };
      loop();
    });
  }

  async start(chart, { click = true, melody = true } = {}) {
    if (this.busy || !this.ready) return;
    await this._ensureClock();
    this.chart = chart;
    this.lastJudgment = null;
    this.timing = this.player.play(chart, { click, melody });
    this.scorer = new Scorer(chart, { songStartMs: this.timing.startPerf, calibrationMs: this.audioCal });
    this._loop();
  }

  _loop() {
    const nowPerf = performance.now();
    if (nowPerf >= this.timing.startPerf) {
      for (const m of this.scorer.tick(nowPerf)) this._judged(m);
    }
    if (this.cb.onFrame) this.cb.onFrame(nowPerf);
    if (nowPerf > this.timing.endPerf + SCORING.windows.late + 50) return this._finish();
    this._raf = requestAnimationFrame(() => this._loop());
  }

  _finish() {
    const result = this.scorer.finish();
    saveLastRun(result);
    if (this.cb.onFinish) this.cb.onFinish(result);
  }

  diagnostics() {
    return this.clock ? this.clock.diagnostics() : null;
  }
}
