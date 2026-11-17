import { noteName } from '../input/InputSource.js';

// Bare readout for step 2: a strip of keys that light up, and an event log.
// Draws C3..C6 (37 keys) so most of what a real keyboard plays is visible.
// Exercises later will declare their own, narrower active register.

const LOW = 48; // C3
const HIGH = 84; // C6
const BLACK = new Set([1, 3, 6, 8, 10]);

export function createReadout(root) {
  const keysEl = root.querySelector('#keys');
  const logEl = root.querySelector('#log');
  const countEl = root.querySelector('#count');

  const keyEls = new Map();
  let whiteIndex = 0;
  for (let n = LOW; n <= HIGH; n++) {
    const isBlack = BLACK.has(n % 12);
    const el = document.createElement('div');
    el.className = isBlack ? 'key black' : 'key white';
    el.dataset.note = n;
    el.title = `${noteName(n)} (${n})`;
    if (isBlack) {
      // Black keys sit over the gap after the previous white key.
      el.style.left = `calc(${whiteIndex} * var(--w) - var(--bw) / 2)`;
    } else {
      el.style.left = `calc(${whiteIndex} * var(--w))`;
      el.textContent = n % 12 === 0 ? noteName(n) : '';
      whiteIndex++;
    }
    keysEl.appendChild(el);
    keyEls.set(n, el);
  }
  keysEl.style.setProperty('--white-count', whiteIndex);

  let count = 0;
  let lastTime = null;
  const MAX_LINES = 40;

  function onNote(ev) {
    const handledAt = performance.now();
    count++;
    countEl.textContent = count;

    const el = keyEls.get(ev.note);
    if (el) el.classList.toggle('on', ev.type === 'noteon');

    const dt = lastTime === null ? '' : `+${(ev.time - lastTime).toFixed(1)}ms`;
    lastTime = ev.time;
    // processing = how long after the event's own timestamp our code ran.
    // This is the gap REQUIREMENT 2 exists to keep out of the scoring.
    const processing = (handledAt - ev.time).toFixed(2);

    const line = document.createElement('div');
    line.className = `line ${ev.type}`;
    line.textContent =
      `${ev.type.padEnd(7)} ${noteName(ev.note).padEnd(4)} #${String(ev.note).padStart(3)} ` +
      `vel ${String(ev.velocity).padStart(3)}  t=${ev.time.toFixed(2)}ms ${dt.padStart(10)}  ` +
      `(handled ${processing}ms after event)  [${ev.source}]`;
    logEl.prepend(line);
    while (logEl.childElementCount > MAX_LINES) logEl.lastElementChild.remove();
  }

  return { onNote };
}
