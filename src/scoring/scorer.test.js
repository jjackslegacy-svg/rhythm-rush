import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scorer, scoreLog } from './scorer.js';
import { SCORING } from './config.js';

// A small fixture chart: 8 quarter notes at 120 BPM (500 ms per beat),
// C D E F G A B C, each 1 beat, plus a final held C of 2 beats.
const chart = {
  id: 'fixture',
  bpm: 120,
  register: { low: 60, high: 72 },
  notes: [
    { pitch: 60, onset: 0, duration: 1 },
    { pitch: 62, onset: 1, duration: 1 },
    { pitch: 64, onset: 2, duration: 1 },
    { pitch: 65, onset: 3, duration: 1 },
    { pitch: 67, onset: 4, duration: 1 },
    { pitch: 69, onset: 5, duration: 1 },
    { pitch: 71, onset: 6, duration: 1 },
    { pitch: 72, onset: 7, duration: 2 },
  ],
};
const START = 10000;
const BEAT = 500;
const CAL = -130; // pretend the player was measured 130 ms early

// Build an event log from (pitch, onsetOffsetMs, heldMs) triples. Times are
// RAW clock times, so the calibration offset is added back in.
function log(hits, { cal = CAL } = {}) {
  const out = [];
  for (const [pitch, beatIndex, offsetMs, heldMs = 400] of hits) {
    const on = START + beatIndex * BEAT + offsetMs + cal;
    out.push({ type: 'noteon', note: pitch, velocity: 90, time: on, source: 'midi' });
    out.push({ type: 'noteoff', note: pitch, velocity: 0, time: on + heldMs, source: 'midi' });
  }
  return out;
}
const PITCHES = [60, 62, 64, 65, 67, 69, 71, 72];
const perfectHits = PITCHES.map((p, i) => [p, i, 0, i === 7 ? 900 : 400]);

test('perfect run: all perfect, full combo, 100% accuracy, hold ok', () => {
  const r = scoreLog(chart, log(perfectHits), { songStartMs: START, calibrationMs: CAL });
  assert.deepEqual(r.counts, { perfect: 8, good: 0, early: 0, late: 0, miss: 0, extra: 0 });
  assert.equal(r.maxCombo, 8);
  assert.equal(r.accuracy, 1);
  assert.equal(r.meanOffsetMs, 0);
  assert.equal(r.notes[7].holdOk, true);
  assert.equal(r.notes[0].holdOk, null); // notes under holdMinBeats are not hold-judged
});

test('all late by 120 ms: every note judged late, mean offset +120', () => {
  const hits = PITCHES.map((p, i) => [p, i, 120]);
  const r = scoreLog(chart, log(hits), { songStartMs: START, calibrationMs: CAL });
  assert.deepEqual(r.counts, { perfect: 0, good: 0, early: 0, late: 8, miss: 0, extra: 0 });
  assert.ok(Math.abs(r.meanOffsetMs - 120) < 1e-9);
  assert.equal(r.maxCombo, 8); // late still keeps combo
});

test('wrong pitch: expected note missed, played note is extra, combo breaks', () => {
  const hits = perfectHits.map((h) => (h[0] === 65 ? [66, 3, 0] : h)); // F# instead of F
  const r = scoreLog(chart, log(hits), { songStartMs: START, calibrationMs: CAL });
  assert.deepEqual(r.counts, { perfect: 7, good: 0, early: 0, late: 0, miss: 1, extra: 1 });
  assert.equal(r.notes[3].judgment, 'miss');
  assert.equal(r.extras[0].pitch, 66);
  assert.equal(r.maxCombo, 4); // 3 hits, then the miss/extra at beat 3, then 4 hits
  // accuracy counts the extra as a zero-point expected note: 7*300 / (9*300)
  assert.ok(Math.abs(r.accuracy - 7 / 9) < 1e-9);
});

test('extra notes between beats: judged extra, do not steal matches', () => {
  const hits = [...perfectHits, [64, 2, 250, 50]]; // an E halfway between beats 2 and 3
  const r = scoreLog(chart, log(hits), { songStartMs: START, calibrationMs: CAL });
  assert.deepEqual(r.counts, { perfect: 8, good: 0, early: 0, late: 0, miss: 0, extra: 1 });
});

test('dropped note: judged miss, combo breaks at that point', () => {
  const hits = perfectHits.filter((h) => h[0] !== 67); // never play G
  const r = scoreLog(chart, log(hits), { songStartMs: START, calibrationMs: CAL });
  assert.equal(r.counts.miss, 1);
  assert.equal(r.notes[4].judgment, 'miss');
  assert.equal(r.maxCombo, 4);
});

test('held too short: holdOk false on the long note', () => {
  const hits = perfectHits.map((h) => (h[0] === 72 ? [72, 7, 0, 200] : h)); // 200 of 1000 ms
  const r = scoreLog(chart, log(hits), { songStartMs: START, calibrationMs: CAL });
  assert.equal(r.notes[7].holdOk, false);
});

test('window boundaries follow config exactly', () => {
  const w = SCORING.windows;
  const mk = (off) => scoreLog(chart, log([[60, 0, off]]), { songStartMs: START, calibrationMs: CAL }).notes[0].judgment;
  assert.equal(mk(w.perfect), 'perfect');
  assert.equal(mk(w.perfect + 0.001), 'good');
  assert.equal(mk(w.good), 'good');
  assert.equal(mk(-(w.good + 0.001)), 'early');
  assert.equal(mk(w.late), 'late');
  assert.equal(mk(w.late + 0.001), 'miss');
});

test('determinism: same log scored twice is byte-identical', () => {
  const hits = [[60, 0, 10], [62, 1, -60], [66, 2, 0], [65, 3, 130], [67, 4, 0], [71, 6, 0], [72, 7, -20, 300]];
  const events = log(hits);
  const a = JSON.stringify(scoreLog(chart, events, { songStartMs: START, calibrationMs: CAL }));
  const b = JSON.stringify(scoreLog(chart, events, { songStartMs: START, calibrationMs: CAL }));
  assert.equal(a, b);
});

test('live path (feed + tick) matches batch path exactly', () => {
  const hits = [[60, 0, 10], [62, 1, -60], [66, 2, 0], [65, 3, 130], [67, 4, 0], [71, 6, 0], [72, 7, -20, 300]];
  const events = log(hits).sort((a, b) => a.time - b.time);
  const batch = scoreLog(chart, events, { songStartMs: START, calibrationMs: CAL });

  const live = new Scorer(chart, { songStartMs: START, calibrationMs: CAL });
  let i = 0;
  // Simulate a 10 ms tick loop interleaved with events arriving.
  for (let now = START - 1000; now < START + 6000; now += 10) {
    while (i < events.length && events[i].time <= now) live.feed(events[i++]);
    live.tick(now);
  }
  const liveResult = live.finish();
  assert.equal(JSON.stringify(liveResult), JSON.stringify(batch));
});

test('calibration offset is applied: identical raw timing, different cal, different judgment', () => {
  const events = log([[60, 0, 0]], { cal: 0 }); // raw hit exactly on target
  const a = scoreLog(chart, events, { songStartMs: START, calibrationMs: 0 }).notes[0].judgment;
  const b = scoreLog(chart, events, { songStartMs: START, calibrationMs: -100 }).notes[0].judgment;
  assert.equal(a, 'perfect');
  assert.equal(b, 'late'); // subtracting -100 pushes it 100 ms late
});
