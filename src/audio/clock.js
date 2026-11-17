// The audio clock, and the bridge between it and the input clock.
//
// Two clocks exist:
//   ctx.currentTime     seconds, advances with the sound card. Everything we
//                       SCHEDULE (clicks, song playback) lives here.
//   performance.now()   ms. Every input event's timestamp lives here.
//
// To judge an input against a scheduled sound we must express both on one
// clock. ctxToPerf() converts a scheduled audio time into the performance
// time at which that audio actually leaves the output, using the browser's
// own pairing of the two clocks where available. REQUIREMENT 1: nothing
// downstream may use frame timing for this.
//
// Observed 2026-11-10 (Chrome, Windows): the pairing can differ by 100 ms or
// more between separate page loads, while staying stable within one
// AudioContext. So a calibration is only valid for the AudioContext it was
// measured in. Calibrate in the same clock you score with.

export class AudioClock {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this._pair = null;
    this.refreshPairing();
  }

  async resume() {
    if (this.ctx.state !== 'running') await this.ctx.resume();
    this.refreshPairing();
  }

  /** Re-sample the ctx<->perf pairing. Call it regularly; the clocks drift. */
  refreshPairing() {
    const ctx = this.ctx;
    if (typeof ctx.getOutputTimestamp === 'function') {
      const ts = ctx.getOutputTimestamp();
      if (ts && Number.isFinite(ts.contextTime) && Number.isFinite(ts.performanceTime) && ts.contextTime > 0) {
        this._pair = { ctx: ts.contextTime, perf: ts.performanceTime, method: 'getOutputTimestamp' };
        return;
      }
    }
    this._pair = this._fallbackPair();
  }

  _fallbackPair() {
    const ctx = this.ctx;
    const latencySec = ctx.outputLatency || ctx.baseLatency || 0;
    return {
      ctx: ctx.currentTime,
      perf: performance.now() + latencySec * 1000,
      method: 'currentTime+latency',
    };
  }

  /** seconds on the audio clock */
  now() {
    return this.ctx.currentTime;
  }

  /** @param {number} ctxTime seconds -> performance.now() ms when it is heard */
  ctxToPerf(ctxTime) {
    return this._pair.perf + (ctxTime - this._pair.ctx) * 1000;
  }

  get pairingMethod() {
    return this._pair.method;
  }

  /** What the browser claims about its own timing, for the diagnostics line. */
  diagnostics() {
    const ctx = this.ctx;
    const fb = this._fallbackPair();
    // How far the two pairing methods disagree about when "now" is heard.
    const nowCtx = ctx.currentTime;
    const viaPair = this.ctxToPerf(nowCtx);
    const viaFallback = fb.perf + (nowCtx - fb.ctx) * 1000;
    return {
      method: this._pair.method,
      sampleRate: ctx.sampleRate,
      baseLatencyMs: (ctx.baseLatency ?? 0) * 1000,
      outputLatencyMs: (ctx.outputLatency ?? 0) * 1000,
      pairingMinusFallbackMs: viaPair - viaFallback,
    };
  }
}
