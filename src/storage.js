// Minimal persistence.
const CAL_KEY = 'calibrationOffsetMs'; // audio: input vs sound. Per-AudioContext; stored only as a default.
const VISUAL_LAG_KEY = 'visualLagMs'; // input vs screen. Stable per machine; reused across page loads.
const VISUAL_TRIM_KEY = 'visualTrimMs'; // manual nudge on top of the measured visual lag.
const LAST_RUN_KEY = 'lastRun';
const LAST_SUMMARY_KEY = 'lastSummary';

function num(key) {
  const v = localStorage.getItem(key);
  return v === null ? null : Number(v);
}

export function getCalibrationOffsetMs() {
  return num(CAL_KEY);
}
export function setCalibrationOffsetMs(ms) {
  localStorage.setItem(CAL_KEY, String(ms));
}
export function clearCalibration() {
  localStorage.removeItem(CAL_KEY);
}

export function getVisualLagMs() {
  return num(VISUAL_LAG_KEY);
}
export function setVisualLagMs(ms) {
  localStorage.setItem(VISUAL_LAG_KEY, String(ms));
}

export function getVisualTrimMs() {
  return num(VISUAL_TRIM_KEY) ?? 0;
}
export function setVisualTrimMs(ms) {
  localStorage.setItem(VISUAL_TRIM_KEY, String(ms));
}

/** The full scorer result of the most recent run, including its raw event log. */
export function saveLastRun(result) {
  localStorage.setItem(LAST_RUN_KEY, JSON.stringify(result));
}
export function getLastRun() {
  const v = localStorage.getItem(LAST_RUN_KEY);
  return v === null ? null : JSON.parse(v);
}

export function saveLastSummary(summary) {
  localStorage.setItem(LAST_SUMMARY_KEY, JSON.stringify(summary));
}
export function getLastSummary() {
  const v = localStorage.getItem(LAST_SUMMARY_KEY);
  return v === null ? null : JSON.parse(v);
}
