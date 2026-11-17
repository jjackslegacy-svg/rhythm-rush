import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scoreLog } from '../scoring/scorer.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'charts');
const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));

test('every chart in the index exists, is well-formed, and scores 100% on a perfect log', () => {
  for (const entry of index) {
    const chart = JSON.parse(readFileSync(join(dir, `${entry.id}.json`), 'utf8'));
    assert.equal(chart.id, entry.id);
    assert.ok(chart.bpm > 0);
    assert.ok(chart.notes.length > 0);
    let end = 0;
    for (const n of chart.notes) {
      assert.ok(n.pitch >= chart.register.low && n.pitch <= chart.register.high, `${chart.id}: pitch ${n.pitch} outside register`);
      assert.ok(n.duration > 0);
      end = Math.max(end, n.onset + n.duration);
    }
    assert.equal(end, chart.lengthBeats, `${chart.id}: lengthBeats mismatch`);

    const beat = 60000 / chart.bpm;
    const events = chart.notes.flatMap((n) => [
      { type: 'noteon', note: n.pitch, velocity: 80, time: 5000 + n.onset * beat, source: 'midi' },
      { type: 'noteoff', note: n.pitch, velocity: 0, time: 5000 + (n.onset + n.duration) * beat - 20, source: 'midi' },
    ]);
    const r = scoreLog(chart, events, { songStartMs: 5000, calibrationMs: 0 });
    assert.equal(r.accuracy, 1, `${chart.id}: perfect log did not score 100%`);
    assert.equal(r.counts.miss, 0);
  }
});

test('no chart file is missing from the index', () => {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json');
  assert.deepEqual(files.map((f) => f.replace('.json', '')).sort(), index.map((e) => e.id).sort());
});
