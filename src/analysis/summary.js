import { noteName } from '../input/InputSource.js';

// Structured performance summary. Pure function of a scorer result plus its
// chart. No prose, no AI, no DOM. This is the ONLY thing the tutor will be
// allowed to see later, so everything the tutor might say has to be a field
// here first.
//
// Everything is derived from MIDI note events: pitch, timing, velocity,
// duration. Nothing here knows about posture, fingering or hand position.

const BEATS_PER_BAR = 4;

export function summarizePerformance(result, chart) {
  const beatMs = 60000 / chart.bpm;
  const notes = result.notes;
  const hits = notes.filter((n) => n.deltaMs !== null);

  return {
    chartId: chart.id,
    title: chart.title,
    bpm: chart.bpm,
    score: result.score,
    accuracy: round(result.accuracy, 3),
    maxCombo: result.maxCombo,
    counts: { ...result.counts },
    timing: timingSummary(hits, notes),
    sections: sectionSummary(notes, result.extras, result.songStartMs, beatMs),
    problemPitches: problemPitches(notes, result.extras),
    problemTransitions: problemTransitions(notes),
    extras: classifyExtras(result.extras, notes, beatMs),
    holds: holdSummary(notes),
    velocity: velocitySummary(hits, result.events),
    inputSource: dominantSource(result.events),
  };
}

function round(x, d = 1) {
  if (x === null || x === undefined || Number.isNaN(x)) return null;
  const f = 10 ** d;
  return Math.round(x * f) / f;
}

function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}
function stdev(xs) {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}

function timingSummary(hits, notes) {
  const deltas = hits.map((n) => n.deltaMs);
  const m = mean(deltas);
  const half = Math.floor(hits.length / 2);
  const first = mean(hits.slice(0, half).map((n) => n.deltaMs));
  const second = mean(hits.slice(half).map((n) => n.deltaMs));
  let tendency = 'steady';
  if (m !== null && m <= -30) tendency = 'rushing';
  else if (m !== null && m >= 30) tendency = 'dragging';
  return {
    meanOffsetMs: round(m),
    stdevMs: round(stdev(deltas)),
    tendency,
    earlyCount: notes.filter((n) => n.judgment === 'early').length,
    lateCount: notes.filter((n) => n.judgment === 'late').length,
    firstHalfMeanMs: round(first),
    secondHalfMeanMs: round(second),
    // positive = got later as the piece went on
    driftMs: first === null || second === null ? null : round(second - first),
    hitCount: hits.length,
  };
}

function sectionSummary(notes, extras, songStartMs, beatMs) {
  const barMs = BEATS_PER_BAR * beatMs;
  const byBar = new Map();
  const barOf = (ms) => Math.floor((ms - songStartMs) / barMs);
  for (const n of notes) {
    const b = barOf(n.targetMs);
    if (!byBar.has(b)) byBar.set(b, { bar: b + 1, notes: [], extras: 0 });
    byBar.get(b).notes.push(n);
  }
  for (const e of extras) {
    const b = barOf(e.timeMs);
    if (!byBar.has(b)) byBar.set(b, { bar: b + 1, notes: [], extras: 0 });
    byBar.get(b).extras++;
  }
  const sections = [...byBar.values()]
    .sort((a, b) => a.bar - b.bar)
    .map((s) => {
      const hits = s.notes.filter((n) => n.deltaMs !== null);
      const misses = s.notes.filter((n) => n.judgment === 'miss').length;
      const offs = s.notes.filter((n) => n.judgment === 'early' || n.judgment === 'late').length;
      const problems = misses + offs + s.extras;
      const m = mean(hits.map((n) => n.deltaMs));
      return {
        bar: s.bar,
        startBeat: (s.bar - 1) * BEATS_PER_BAR,
        noteCount: s.notes.length,
        perfect: s.notes.filter((n) => n.judgment === 'perfect').length,
        good: s.notes.filter((n) => n.judgment === 'good').length,
        early: s.notes.filter((n) => n.judgment === 'early').length,
        late: s.notes.filter((n) => n.judgment === 'late').length,
        misses,
        extras: s.extras,
        problems,
        problemRate: s.notes.length ? round(problems / s.notes.length, 2) : null,
        meanOffsetMs: round(m),
        tendency: m === null ? null : m <= -30 ? 'rushing' : m >= 30 ? 'dragging' : 'steady',
      };
    });
  const worst = sections.reduce((w, s) => (w === null || s.problems > w.problems ? s : w), null);
  const bestOffsetAbs = sections.filter((s) => s.meanOffsetMs !== null);
  const mostRushed = bestOffsetAbs.reduce((w, s) => (w === null || s.meanOffsetMs < w.meanOffsetMs ? s : w), null);
  return {
    beatsPerBar: BEATS_PER_BAR,
    bars: sections,
    worstBar: worst && worst.problems > 0 ? worst.bar : null,
    mostRushedBar: mostRushed && mostRushed.meanOffsetMs <= -30 ? mostRushed.bar : null,
  };
}

function problemPitches(notes, extras) {
  const by = new Map();
  for (const n of notes) {
    if (!by.has(n.pitch)) by.set(n.pitch, { pitch: n.pitch, name: noteName(n.pitch), expected: 0, misses: 0, early: 0, late: 0, worstDeltaMs: 0 });
    const p = by.get(n.pitch);
    p.expected++;
    if (n.judgment === 'miss') p.misses++;
    if (n.judgment === 'early') p.early++;
    if (n.judgment === 'late') p.late++;
    if (n.deltaMs !== null && Math.abs(n.deltaMs) > Math.abs(p.worstDeltaMs)) p.worstDeltaMs = round(n.deltaMs);
  }
  return [...by.values()]
    .map((p) => ({ ...p, problems: p.misses + p.early + p.late, repeated: p.misses + p.early + p.late >= 2 }))
    .filter((p) => p.problems > 0)
    .sort((a, b) => b.problems - a.problems || b.misses - a.misses)
    .slice(0, 5);
}

function problemTransitions(notes) {
  const by = new Map();
  for (let i = 1; i < notes.length; i++) {
    const n = notes[i];
    if (n.judgment === 'perfect' || n.judgment === 'good') continue;
    const from = notes[i - 1].pitch;
    const key = `${from}>${n.pitch}`;
    if (!by.has(key)) by.set(key, { from, to: n.pitch, label: `${noteName(from)} to ${noteName(n.pitch)}`, interval: n.pitch - from, count: 0, misses: 0 });
    const t = by.get(key);
    t.count++;
    if (n.judgment === 'miss') t.misses++;
  }
  return [...by.values()].sort((a, b) => b.count - a.count).slice(0, 5);
}

function classifyExtras(extras, notes, beatMs) {
  return extras.map((e) => {
    let nearest = null;
    let best = Infinity;
    for (const n of notes) {
      if (n.pitch !== e.pitch) continue;
      const d = e.timeMs - n.targetMs;
      if (Math.abs(d) < best) {
        best = Math.abs(d);
        nearest = { index: n.index, deltaMs: round(d) };
      }
    }
    let kind = 'wrong_key';
    if (nearest && nearest.deltaMs < 0 && -nearest.deltaMs <= beatMs) kind = 'anticipated';
    else if (nearest && nearest.deltaMs > 0 && nearest.deltaMs <= beatMs) kind = 'repeated_late';
    return { pitch: e.pitch, name: noteName(e.pitch), kind, nearestNoteIndex: nearest ? nearest.index : null, deltaMs: nearest ? nearest.deltaMs : null };
  });
}

function holdSummary(notes) {
  const evaluated = notes.filter((n) => n.holdOk !== null);
  return {
    evaluated: evaluated.length,
    releasedEarly: evaluated.filter((n) => n.holdOk === false).map((n) => ({ index: n.index, name: noteName(n.pitch), heldMs: round(n.heldMs, 0), expectedMs: round(n.durationMs, 0) })),
  };
}

function velocitySummary(hits, events) {
  const vs = hits.map((n) => n.hitVelocity).filter((v) => v !== null && v !== undefined);
  const informative = dominantSource(events) === 'midi' && new Set(vs).size > 1;
  const m = mean(vs);
  const sd = stdev(vs);
  return {
    informative, // false on the keyboard fallback (fixed velocity)
    mean: round(m, 0),
    stdev: round(sd, 0),
    min: vs.length ? Math.min(...vs) : null,
    max: vs.length ? Math.max(...vs) : null,
    // notes far from the player's own average, only when velocity means something
    outliers: informative
      ? hits.filter((n) => Math.abs(n.hitVelocity - m) > 2 * sd).map((n) => ({ index: n.index, name: noteName(n.pitch), velocity: n.hitVelocity }))
      : [],
  };
}

function dominantSource(events) {
  const c = { midi: 0, keyboard: 0 };
  for (const e of events) if (e.source in c) c[e.source]++;
  return c.midi >= c.keyboard ? 'midi' : 'keyboard';
}
