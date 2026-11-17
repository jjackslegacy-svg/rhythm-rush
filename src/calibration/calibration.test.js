import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchTaps, summarize } from './calibration.js';

const clicks = [1000, 1500, 2000, 2500, 3000];

test('taps are matched to nearest click with signed offset', () => {
  const taps = [1030, 1490, 2000, 2560];
  assert.deepEqual(matchTaps(clicks, taps, 500), [30, -10, 0, 60]);
});

test('a tap too far from any click is discarded', () => {
  const taps = [3400]; // 400ms past the last click, over half of 500
  assert.deepEqual(matchTaps(clicks, taps, 500), []);
});

test('summarize computes mean and stdev, skipping warm-up', () => {
  const s = summarize([100, 100, 20, 40, 60], { skip: 2 });
  assert.equal(s.count, 3);
  assert.equal(s.meanMs, 40);
  assert.ok(Math.abs(s.stdevMs - 16.3299) < 1e-3);
});

test('summarize with nothing to measure', () => {
  assert.deepEqual(summarize([1, 2], { skip: 4 }), { count: 0, meanMs: null, stdevMs: null });
});
