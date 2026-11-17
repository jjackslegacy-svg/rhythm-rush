import { setupInput } from './input/setup.js';
import { AudioClock } from './audio/clock.js';
import { CalibrationSession } from './calibration/session.js';
import { Metronome } from './audio/metronome.js';
import { CALIBRATION } from './calibration/calibration.js';
import { getCalibrationOffsetMs, setCalibrationOffsetMs, clearCalibration } from './storage.js';

const $ = (s) => document.querySelector(s);
const statusEl = $('#status');
const startBtn = $('#start');
const resetBtn = $('#reset');
const progressEl = $('#progress');
const liveEl = $('#live');
const resultEl = $('#result');
const storedEl = $('#stored');
const methodEl = $('#method');
const diagEl = $('#diag');

let clock = null;
let session = null;

function showStored() {
  const v = getCalibrationOffsetMs();
  storedEl.textContent = v === null ? 'none' : `${v.toFixed(1)} ms`;
}
showStored();

function showDiag() {
  const d = clock.diagnostics();
  methodEl.textContent = d.method;
  diagEl.textContent =
    `sampleRate ${d.sampleRate}  baseLatency ${d.baseLatencyMs.toFixed(1)}ms  ` +
    `outputLatency ${d.outputLatencyMs.toFixed(1)}ms  pairing-vs-fallback ${d.pairingMinusFallbackMs.toFixed(1)}ms`;
}

const input = await setupInput({ onStatus: (s) => (statusEl.textContent = s) });
input.onNote((ev) => session && session.tap(ev));

startBtn.addEventListener('click', async () => {
  if (!clock) clock = new AudioClock();
  await clock.resume();
  showDiag();
  resultEl.textContent = '';
  liveEl.textContent = '';
  startBtn.disabled = true;
  session = new CalibrationSession(new Metronome(clock, { bpm: CALIBRATION.bpm }), {
    onProgress: (p) => {
      progressEl.textContent = `${p.count} / ${p.total} taps${p.warmup ? ' (warm-up)' : ''}`;
      liveEl.textContent = p.count ? `mean ${p.meanMs.toFixed(1)} ms, spread ±${p.stdevMs.toFixed(1)} ms over ${p.count} taps` : '';
    },
    onDone: (r) => {
      setCalibrationOffsetMs(r.meanMs);
      showStored();
      showDiag();
      resultEl.textContent =
        `Measured offset: ${r.meanMs.toFixed(1)} ms (${r.meanMs >= 0 ? 'late' : 'early'}). Spread ±${r.stdevMs.toFixed(1)} ms. Saved.`;
      startBtn.textContent = 'Run again';
      startBtn.disabled = false;
    },
  });
  session.start();
});

resetBtn.addEventListener('click', () => {
  clearCalibration();
  showStored();
});
