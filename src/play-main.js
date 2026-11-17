// Text-only play page. Same runner and scorer as game.html, no canvas.
import { setupInput } from './input/setup.js';
import { noteName } from './input/InputSource.js';
import { GameRunner } from './game/runner.js';
import { SCORING } from './scoring/config.js';
import { formatResult } from './scoring/report.js';
import { listCharts, loadChart } from './charts/loader.js';

const $ = (s) => document.querySelector(s);
const statusEl = $('#status');
const calEl = $('#cal');
const diagEl = $('#diag');
const chartSel = $('#chart');
const syncBtn = $('#sync');
const startBtn = $('#start');
const phaseEl = $('#phase');
const nextEl = $('#next');
const judgeEl = $('#judge');
const comboEl = $('#combo');
const resultEl = $('#result');

$('#windows').textContent = `perfect ±${SCORING.windows.perfect}  good ±${SCORING.windows.good}  early/late ±${SCORING.windows.late}  (ms)`;

const charts = await listCharts();
for (const c of charts) {
  const o = document.createElement('option');
  o.value = c.id;
  o.textContent = `${c.title} (level ${c.difficulty}, ${c.bpm} bpm)`;
  chartSel.appendChild(o);
}

let judgeTimer = 0;
function showJudgment(j) {
  judgeEl.textContent =
    j.judgment.toUpperCase() + (j.deltaMs !== null ? ` ${j.deltaMs >= 0 ? '+' : ''}${j.deltaMs.toFixed(0)}ms` : ` ${noteName(j.pitch)}`);
  judgeEl.className = j.judgment;
  clearTimeout(judgeTimer);
  judgeTimer = setTimeout(() => (judgeEl.textContent = ''), 500);
}

const input = await setupInput({ onStatus: (s) => (statusEl.textContent = s) });
const runner = new GameRunner({
  input,
  onSyncProgress: (p) => {
    phaseEl.textContent = `sync: tap on each click. ${p.count} / ${p.total}${p.warmup ? ' (warm-up)' : ''}`;
    comboEl.textContent = p.count ? `mean ${p.meanMs.toFixed(0)} ms, spread ±${p.stdevMs.toFixed(0)} ms` : '';
  },
  onSynced: (r) => {
    calEl.textContent = `${r.meanMs.toFixed(1)} ms (this session)`;
    phaseEl.textContent = `synced: ${r.meanMs.toFixed(0)} ms (spread ±${r.stdevMs.toFixed(0)} ms)`;
    comboEl.textContent = '';
    const d = runner.diagnostics();
    diagEl.textContent = `${d.method}  baseLatency ${d.baseLatencyMs.toFixed(1)}ms  outputLatency ${d.outputLatencyMs.toFixed(1)}ms  pairing-vs-fallback ${d.pairingMinusFallbackMs.toFixed(1)}ms`;
    syncBtn.textContent = 'Re-sync';
    syncBtn.disabled = false;
    startBtn.disabled = false;
  },
  onJudgment: (j) => {
    showJudgment(j);
    comboEl.textContent = `combo ${runner.scorer.combo}`;
  },
  onFrame: (nowPerf) => {
    const chart = runner.chart;
    const beat = 60000 / chart.bpm;
    const t = nowPerf - runner.timing.startPerf;
    if (t < 0) {
      phaseEl.textContent = `count-in ${Math.ceil(-t / beat)}`;
      nextEl.textContent = noteName(chart.notes[0].pitch);
    } else {
      phaseEl.textContent = `beat ${Math.floor(t / beat) + 1}`;
      const upcoming = chart.notes.find((n) => n.onset * beat >= t - SCORING.windows.late);
      nextEl.textContent = upcoming ? noteName(upcoming.pitch) : '';
    }
  },
  onFinish: (result) => {
    resultEl.textContent = formatResult(result, runner.chart.title);
    phaseEl.textContent = 'done';
    nextEl.textContent = '';
    startBtn.disabled = false;
    syncBtn.disabled = false;
  },
});

syncBtn.addEventListener('click', async () => {
  resultEl.textContent = '';
  judgeEl.textContent = '';
  nextEl.textContent = '';
  syncBtn.disabled = true;
  startBtn.disabled = true;
  await runner.sync();
});

startBtn.addEventListener('click', async () => {
  const chart = await loadChart(chartSel.value);
  resultEl.textContent = '';
  judgeEl.textContent = '';
  startBtn.disabled = true;
  syncBtn.disabled = true;
  comboEl.textContent = 'combo 0';
  await runner.start(chart);
});
