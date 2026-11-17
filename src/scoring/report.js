import { noteName } from '../input/InputSource.js';

// Plain-text rendering of a scorer result. Display only; nothing here judges.

export function describeExtras(result) {
  return result.extras.map((e) => {
    // Nearest expected note of the same pitch, so we can tell "pressed early
    // for the next note" apart from "wrong key".
    let nearest = null;
    let best = Infinity;
    for (const n of result.notes) {
      if (n.pitch !== e.pitch) continue;
      const d = e.timeMs - n.targetMs;
      if (Math.abs(d) < best) {
        best = Math.abs(d);
        nearest = { index: n.index, deltaMs: d };
      }
    }
    if (!nearest) return `${noteName(e.pitch)} (not in this piece)`;
    return `${noteName(e.pitch)} ${nearest.deltaMs >= 0 ? '+' : ''}${nearest.deltaMs.toFixed(0)}ms from note ${nearest.index + 1}`;
  });
}

export function formatResult(result, chartTitle) {
  const c = result.counts;
  return [
    `${chartTitle}: score ${result.score}, accuracy ${(result.accuracy * 100).toFixed(1)}%, max combo ${result.maxCombo}`,
    `perfect ${c.perfect}  good ${c.good}  early ${c.early}  late ${c.late}  miss ${c.miss}  extra ${c.extra}`,
    `mean offset ${result.meanOffsetMs === null ? '-' : result.meanOffsetMs.toFixed(0) + ' ms'} (after calibration ${result.calibrationMs.toFixed(0)} ms)`,
    '',
    ...result.notes.map(
      (n) =>
        `${String(n.index + 1).padStart(2)}. ${noteName(n.pitch).padEnd(3)} ${n.judgment.padEnd(7)}` +
        (n.deltaMs === null ? '' : ` ${n.deltaMs >= 0 ? '+' : ''}${n.deltaMs.toFixed(0)}ms`) +
        (n.holdOk === null ? '' : n.holdOk ? '  held' : '  released early'),
    ),
    ...(result.extras.length ? ['', 'extra notes:', ...describeExtras(result).map((s) => '  ' + s)] : []),
  ].join('\n');
}
