import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreLog } from '../scoring/scorer.js';
import { summarizePerformance } from './summary.js';

// 16 quarter notes at 120 BPM: the C major scale up twice. 4 bars of 4.
const scale = [60, 62, 64, 65, 67, 69, 71, 72];
const chart = {
  id: 'fixture16',
  title: 'Fixture',
  bpm: 120,
  register: { low: 60, high: 72 },
  lengthBeats: 16,
  notes: [...scale, ...scale].map((p, i) => ({ pitch: p, onset: i, duration: 1, velocity: 80 })),
};
const START = 20000;
const BEAT = 500;

function log(plan, source = 'midi') {
  // plan: array of [pitch, beatIndex, offsetMs, velocity] ; omit a note to miss it
  const out = [];
  for (const [pitch, beat, off, vel = 90] of plan) {
    const on = START + beat * BEAT + off;
    out.push({ type: 'noteon', note: pitch, velocity: vel, time: on, source });
    out.push({ type: 'noteoff', note: pitch, velocity: 0, time: on + 300, source });
  }
  return out;
}

test('rushing one bar and missing one pitch twice shows up as such', () => {
  const plan = [];
  chart.notes.forEach((n, i) => {
    if (n.pitch === 64) return; // never play E (bars 1 and 3)
    const bar = Math.floor(i / 4);
    const off = bar === 2 ? -95 : 5; // rush bar 3 by 95 ms
    plan.push([n.pitch, i, off]);
  });
  const r = scoreLog(chart, log(plan), { songStartMs: START, calibrationMs: 0 });
  const s = summarizePerformance(r, chart);

  assert.equal(s.problemPitches[0].pitch, 64);
  assert.equal(s.problemPitches[0].misses, 2);
  assert.equal(s.problemPitches[0].repeated, true);

  const bar3 = s.sections.bars.find((b) => b.bar === 3);
  assert.ok(bar3.meanOffsetMs <= -90, `bar 3 mean ${bar3.meanOffsetMs}`);
  assert.equal(bar3.tendency, 'rushing');
  assert.equal(s.sections.mostRushedBar, 3);

  // The missed E follows D both times.
  assert.equal(s.problemTransitions[0].label, 'D4 to E4');
  assert.equal(s.problemTransitions[0].count, 2);

  // Overall tendency: 16 notes, 3 rushed by 95 and the rest ~+5 -> mean around -17, still 'steady'.
  assert.equal(s.timing.tendency, 'steady');
  assert.equal(s.counts.miss, 2);
});

test('extras are classified as anticipated, repeated, or wrong key', () => {
  const plan = chart.notes.map((n, i) => [n.pitch, i, 0]);
  plan.push([67, 4, -220]); // G pressed 220 ms before its beat, then again on time
  plan.push([60, 0, 260]); // C pressed again 260 ms after beat 0
  plan.push([61, 2, 0]); // C# is not in the piece at all
  const r = scoreLog(chart, log(plan), { songStartMs: START, calibrationMs: 0 });
  const s = summarizePerformance(r, chart);
  const kinds = s.extras.map((e) => `${e.name}:${e.kind}`).sort();
  assert.deepEqual(kinds, ['C#4:wrong_key', 'C4:repeated_late', 'G4:anticipated']);
});

test('velocity is not informative on the keyboard fallback, and is on MIDI', () => {
  const plan = chart.notes.map((n, i) => [n.pitch, i, 0, 100]);
  const kb = summarizePerformance(scoreLog(chart, log(plan, 'keyboard'), { songStartMs: START, calibrationMs: 0 }), chart);
  assert.equal(kb.inputSource, 'keyboard');
  assert.equal(kb.velocity.informative, false);

  const varied = chart.notes.map((n, i) => [n.pitch, i, 0, i === 5 ? 30 : 90]);
  const midi = summarizePerformance(scoreLog(chart, log(varied, 'midi'), { songStartMs: START, calibrationMs: 0 }), chart);
  assert.equal(midi.velocity.informative, true);
  assert.equal(midi.velocity.outliers.length, 1);
  assert.equal(midi.velocity.outliers[0].index, 5);
});

test('drift: late in the first half, on time in the second', () => {
  const plan = chart.notes.map((n, i) => [n.pitch, i, i < 8 ? 80 : 0]);
  const s = summarizePerformance(scoreLog(chart, log(plan), { songStartMs: START, calibrationMs: 0 }), chart);
  assert.equal(s.timing.firstHalfMeanMs, 80);
  assert.equal(s.timing.secondHalfMeanMs, 0);
  assert.equal(s.timing.driftMs, -80);
});

test('summary is deterministic and JSON-safe', () => {
  const plan = chart.notes.map((n, i) => [n.pitch, i, (i % 3) * 40 - 40]);
  const r = scoreLog(chart, log(plan), { songStartMs: START, calibrationMs: 0 });
  const a = JSON.stringify(summarizePerformance(r, chart));
  const b = JSON.stringify(summarizePerformance(r, chart));
  assert.equal(a, b);
  assert.ok(!a.includes('NaN'));
});
