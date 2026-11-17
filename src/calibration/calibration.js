// Pure calibration math. No DOM, no audio. Runs in Node for tests.
//
// offset = tapTime - clickTime, both on the performance clock, in ms.
//   positive = the player pressed AFTER the click was heard (late)
//   negative = before (early)
// The mean offset is what scoring subtracts from every input afterward.

/**
 * Match each tap to its nearest click and return the signed offsets.
 * Taps farther than half an interval from any click are discarded.
 * @param {number[]} clickTimes  performance ms, ascending
 * @param {number[]} tapTimes    performance ms
 * @param {number} intervalMs
 */
export function matchTaps(clickTimes, tapTimes, intervalMs) {
  const half = intervalMs / 2;
  const out = [];
  for (const tap of tapTimes) {
    let best = null;
    let bestAbs = Infinity;
    for (const click of clickTimes) {
      const d = tap - click;
      const a = Math.abs(d);
      if (a < bestAbs) {
        bestAbs = a;
        best = d;
      }
      if (click > tap + half) break; // clicks are ascending; no better match ahead
    }
    if (best !== null && bestAbs <= half) out.push(best);
  }
  return out;
}

/**
 * @param {number[]} offsets
 * @param {{ skip?: number }} opts  skip = warm-up taps to ignore at the start
 */
export function summarize(offsets, { skip = 0 } = {}) {
  const used = offsets.slice(skip);
  const n = used.length;
  if (n === 0) return { count: 0, meanMs: null, stdevMs: null };
  const mean = used.reduce((a, b) => a + b, 0) / n;
  const variance = used.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return { count: n, meanMs: mean, stdevMs: Math.sqrt(variance) };
}

export const CALIBRATION = Object.freeze({
  bpm: 90,
  warmupTaps: 4,
  measuredTaps: 16,
});
