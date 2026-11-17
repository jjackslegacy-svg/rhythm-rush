// A silent beat source on the performance clock, for visual calibration.
// Landing times are fixed up front; the renderer draws a bar falling to the
// hit line at each one. No audio clock is involved, so the result does not
// depend on the AudioContext and can be kept across page loads.

export class VisualBeats {
  constructor({ bpm, count = 40, leadInMs = 1200 }) {
    this.intervalMs = (60 / bpm) * 1000;
    this.count = count;
    this.leadInMs = leadInMs;
    this.clicks = [];
  }

  start() {
    const t0 = performance.now() + this.leadInMs;
    this.clicks = Array.from({ length: this.count }, (_, i) => ({ index: i, perfTime: t0 + i * this.intervalMs }));
  }

  stop() {}
}
