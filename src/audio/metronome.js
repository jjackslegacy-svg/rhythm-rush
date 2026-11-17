// Lookahead-scheduled metronome. Clicks are placed on the audio clock ahead
// of time, so their timing does not depend on when JS happens to run.
// Each scheduled click is reported with its performance-clock time so taps
// can be compared against it.

const LOOKAHEAD_SEC = 0.12; // schedule this far ahead
const TICK_MS = 25; // how often the scheduler wakes up

export class Metronome {
  /**
   * @param {import('./clock.js').AudioClock} clock
   * @param {{ bpm: number, onClick?: (info: {index:number, ctxTime:number, perfTime:number}) => void }} opts
   */
  constructor(clock, { bpm, onClick }) {
    this.clock = clock;
    this.bpm = bpm;
    this.onClick = onClick;
    this._timer = null;
    this._nextCtx = 0;
    this._index = 0;
    this.clicks = []; // every scheduled click, in order
  }

  get intervalSec() {
    return 60 / this.bpm;
  }

  start(startDelaySec = 0.3) {
    this.clicks = [];
    this._index = 0;
    this._nextCtx = this.clock.now() + startDelaySec;
    this._timer = setInterval(() => this._tick(), TICK_MS);
    this._tick();
  }

  stop() {
    clearInterval(this._timer);
    this._timer = null;
  }

  _tick() {
    this.clock.refreshPairing();
    const horizon = this.clock.now() + LOOKAHEAD_SEC;
    while (this._nextCtx < horizon) {
      this._scheduleClick(this._nextCtx, this._index);
      this._nextCtx += this.intervalSec;
      this._index++;
    }
  }

  _scheduleClick(ctxTime, index) {
    const ctx = this.clock.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = index % 4 === 0 ? 1200 : 900; // accent on the 1
    gain.gain.setValueAtTime(0.0001, ctxTime);
    gain.gain.exponentialRampToValueAtTime(0.4, ctxTime + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctxTime + 0.04);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctxTime);
    osc.stop(ctxTime + 0.05);

    const info = { index, ctxTime, perfTime: this.clock.ctxToPerf(ctxTime) };
    this.clicks.push(info);
    if (this.onClick) this.onClick(info);
  }
}
