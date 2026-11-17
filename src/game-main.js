import { setupInput } from './input/setup.js';
import { GameRunner } from './game/runner.js';
import { Renderer } from './game/renderer.js';
import { SCORING } from './scoring/config.js';
import { formatResult } from './scoring/report.js';
import { summarizePerformance } from './analysis/summary.js';
import { saveLastSummary } from './storage.js';
import { listCharts, loadChart } from './charts/loader.js';
import { NOTE_TO_KEY } from './input/KeyboardInput.js';

const $ = (s) => document.querySelector(s);
const statusEl = $('#status');
const calEl = $('#cal');
const visEl = $('#vis');
const diagEl = $('#diag');
const chartSel = $('#chart');
const syncBtn = $('#sync');
const syncVisBtn = $('#syncvis');
const startBtn = $('#start');
const phaseEl = $('#phase');
const resultEl = $('#result');
const summaryEl = $('#summary');
const canvas = $('#game');

$('#windows').textContent = `perfect ±${SCORING.windows.perfect}  good ±${SCORING.windows.good}  early/late ±${SCORING.windows.late} ms`;

const charts = await listCharts();
for (const c of charts) {
  const o = document.createElement('option');
  o.value = c.id;
  o.textContent = `${c.title} (level ${c.difficulty}, ${c.bpm} bpm)`;
  chartSel.appendChild(o);
}

const renderer = new Renderer(canvas);

// Display toggles, remembered between visits. Display only: runs are scored
// the same either way.
for (const [id, prop] of [['#optJudge', 'showJudgments'], ['#optScore', 'showScore']]) {
  const box = $(id);
  const key = `rr.${prop}`;
  let saved = null;
  try { saved = localStorage.getItem(key); } catch {}
  if (saved !== null) box.checked = saved === '1';
  renderer[prop] = box.checked;
  box.addEventListener('change', () => {
    renderer[prop] = box.checked;
    try { localStorage.setItem(key, box.checked ? '1' : '0'); } catch {}
  });
}
const input = await setupInput({ onStatus: (s) => (statusEl.textContent = s) });

// Computer-key labels on the piano keys, until a real MIDI keyboard is played.
renderer.keyLabels = NOTE_TO_KEY;
input.onNote((ev) => {
  if (ev.source === 'midi') renderer.keyLabels = null;
});

const runner = new GameRunner({
  input,
  onSyncProgress: (p) => {
    phaseEl.textContent =
      `audio sync: tap any key on each click. ${p.count} / ${p.total}${p.warmup ? ' (warm-up)' : ''}` +
      (p.count ? `   mean ${p.meanMs.toFixed(0)} ms, spread ±${p.stdevMs.toFixed(0)} ms` : '');
  },
  onSynced: (r) => {
    phaseEl.textContent = 'audio synced.' + (runner.visualLag === null ? ' now press Sync visual.' : ' pick a piece and press Start.');
    showCal();
    showDiag();
    syncBtn.textContent = 'Re-sync audio';
    setButtons();
  },
  onVisualFrame: (nowPerf, beats, progress) => renderer.drawVisualSync({ nowPerf, beats, progress }),
  onVisualSynced: (r) => {
    phaseEl.textContent = 'visual synced. pick a piece and press Start.';
    showCal();
    syncVisBtn.textContent = 'Re-sync visual';
    setButtons();
  },
  onFrame: (nowPerf) => {
    renderer.draw({
      nowPerf,
      timing: runner.timing,
      scorer: runner.scorer,
      pressed: runner.pressed,
      lastJudgment: runner.lastJudgment,
      visualOffsetMs: runner.visualOffsetMs,
    });
  },
  onFinish: (result) => {
    const summary = summarizePerformance(result, runner.chart);
    saveLastSummary(summary);
    resultEl.textContent = formatResult(result, runner.chart.title);
    summaryEl.textContent = JSON.stringify(summary, null, 2);
    phaseEl.textContent = 'done';
    setButtons();
  },
});

function showCal() {
  calEl.textContent = runner.audioCal === null ? 'not synced' : `${runner.audioCal.toFixed(0)} ms`;
  visEl.textContent =
    (runner.visualLag === null ? 'not synced' : `${runner.visualLag.toFixed(0)} ms`) +
    (runner.visualTrim ? ` (trim ${runner.visualTrim > 0 ? '+' : ''}${runner.visualTrim} ms)` : '');
}
function showDiag() {
  const d = runner.diagnostics();
  if (!d) return;
  diagEl.textContent =
    `${d.method}  baseLatency ${d.baseLatencyMs.toFixed(1)}ms  outputLatency ${d.outputLatencyMs.toFixed(1)}ms  ` +
    `pairing-vs-fallback ${d.pairingMinusFallbackMs.toFixed(1)}ms`;
}
function setButtons() {
  const busy = runner.busy;
  syncBtn.disabled = busy;
  syncVisBtn.disabled = busy;
  startBtn.disabled = busy || !runner.ready;
}
showCal();
setButtons();

syncBtn.addEventListener('click', async () => {
  resultEl.textContent = '';
  summaryEl.textContent = '';
  const p = runner.sync();
  setButtons();
  await p;
});
syncVisBtn.addEventListener('click', async () => {
  resultEl.textContent = '';
  summaryEl.textContent = '';
  phaseEl.textContent = '';
  const p = runner.syncVisual();
  setButtons();
  await p;
});
startBtn.addEventListener('click', async () => {
  const chart = await loadChart(chartSel.value);
  renderer.setChart(chart);
  resultEl.textContent = '';
  summaryEl.textContent = '';
  phaseEl.textContent = '';
  const p = runner.start(chart);
  setButtons();
  await p;
});

// Manual nudge of the picture only. Never touches judgment.
window.addEventListener('keydown', (e) => {
  if (e.key === '[') runner.nudgeVisual(-5);
  else if (e.key === ']') runner.nudgeVisual(5);
  else return;
  showCal();
});
