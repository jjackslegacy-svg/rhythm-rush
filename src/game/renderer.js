import { noteName } from '../input/InputSource.js';

// Canvas renderer for the falling-note view. Display only. Every position is
// a function of (targetPerf - nowPerf), both on the performance clock, so the
// picture is locked to the audio schedule and never to frame count.
// REQUIREMENTS 1 and 8: only the chart's active register is drawn.

const BLACK = new Set([1, 3, 6, 8, 10]);
const COLORS = {
  bg: '#08080b',
  lane: '#161616',
  laneAlt: '#1b1b1b',
  hitLine: '#8cf',
  note: '#4da3ff',
  noteBlack: '#2c6fcf',
  noteHit: '#2a4',
  noteMiss: '#633',
  white: '#e8e8e8',
  whitePressed: '#6cf',
  black: '#15151a',
  blackPressed: '#39c',
  text: '#ddd',
  perfect: '#6f6',
  good: '#8cf',
  early: '#fc6',
  late: '#fc6',
  miss: '#f66',
  extra: '#f66',
};

// Hand colours: left = blue, right = orange.
const HAND = {
  L: { deep: '#2a4fd0', base: '#3d7bff', light: '#7fb2ff' },
  R: { deep: '#d9481f', base: '#ff6a2b', light: '#ffab66' },
};
const MARK = { perfect: '#cdbb7a', good: '#8fb4d9', early: '#d9a25e', late: '#d9a25e' };
const SPARK = { perfect: '#ffe08a', good: '#bfe0ff', early: '#ffb060', late: '#ffb060' };

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ approachMs?: number }} opts  approachMs = time a note takes from top to hit line
   */
  constructor(canvas, { approachMs = 2800 } = {}) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.approachMs = approachMs;
    this.chart = null;
    this.layout = null;
    this.sparks = [];
    this.marks = []; // small per-key hit marks
    this.ticks = []; // timing-meter ticks
    this._missSeen = new Set();
    this.showJudgments = true; // PERFECT / GOOD / ... pop-ups and sparks
    this.showScore = true; // score, combo, accuracy
    this._sparkedFor = null;
    this.keyLabels = null; // pitch -> computer key cap, or null to hide
  }

  setChart(chart) {
    this.chart = chart;
    this.marks = [];
    this.ticks = [];
    this._missSeen = new Set();
    // Always show at least two octaves starting on a C, so the keyboard
    // reads as a piano and bars stay slim even for five-note pieces.
    let low = chart.register.low - (chart.register.low % 12);
    let high = chart.register.high;
    while (high - low < 24) {
      if (low > 48) low -= 12;
      else high = low + 24;
    }
    if (BLACK.has(high % 12)) high += 1;
    // Geometry: white keys get equal width across the canvas; black keys sit
    // between them. Each pitch gets an x range (its lane).
    const whites = [];
    for (let n = low; n <= high; n++) if (!BLACK.has(n % 12)) whites.push(n);
    const W = this.canvas.width;
    const keyboardH = 110;
    const ww = W / whites.length;
    const bw = ww * 0.6;
    const lanes = new Map();
    let wi = 0;
    for (let n = low; n <= high; n++) {
      if (BLACK.has(n % 12)) {
        const x = wi * ww - bw / 2; // between previous white and next
        lanes.set(n, { x, w: bw, black: true });
      } else {
        lanes.set(n, { x: wi * ww, w: ww, black: false });
        wi++;
      }
    }
    this.layout = {
      W,
      H: this.canvas.height,
      keyboardH,
      hitY: this.canvas.height - keyboardH,
      lanes,
      whites,
      ww,
      bw,
    };
  }

  /**
   * @param {{ nowPerf:number, timing:object, scorer:object, pressed:Set<number>, lastJudgment:object|null, visualOffsetMs?:number }} s
   *
   * visualOffsetMs: the session calibration offset. The scorer treats an
   * input at time t as happening at (t - offset), so an input is "perfect"
   * when t = target + offset. The picture must put the block on the line at
   * that same instant, or "on the line" and "perfect" disagree.
   */
  draw({ nowPerf, timing, scorer, pressed, lastJudgment, visualOffsetMs = 0 }) {
    if (!this.chart || !this.layout) return;
    const g = this.g;
    const L = this.layout;
    const beatMs = 60000 / this.chart.bpm;
    const pxPerMs = L.hitY / this.approachMs;
    const nowV = nowPerf - visualOffsetMs; // "now" on the player's calibrated timeline

    g.fillStyle = COLORS.bg;
    g.fillRect(0, 0, L.W, L.H);

    // Dark stage with thin guide lines at each C and F, then faint beat lines.
    g.strokeStyle = '#1c1c22';
    g.lineWidth = 1;
    for (const n of L.whites) {
      if (n % 12 !== 0 && n % 12 !== 5) continue;
      const x = Math.round(L.lanes.get(n).x) + 0.5;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, L.hitY);
      g.stroke();
    }
    const tSong = nowV - timing.startPerf;
    const firstBeat = Math.ceil(tSong / beatMs);
    g.strokeStyle = '#17171c';
    for (let b = firstBeat; ; b++) {
      const y = L.hitY - (b * beatMs - tSong) * pxPerMs;
      if (y < 0) break;
      if (b < 0) continue;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(L.W, y);
      g.stroke();
    }

    // Notes: tall rounded bars, colour = hand, length = duration. Each bar is
    // clipped at the hit line so it drains into its key while it sounds.
    // keyState collects what each key should show this frame.
    const keyState = new Map(); // pitch -> { hand, sounding (0..1), soon (0..1) }
    g.save();
    g.beginPath();
    g.rect(0, 0, L.W, L.hitY);
    g.clip();
    for (const n of scorer.expected) {
      const lane = L.lanes.get(n.pitch);
      if (!lane) continue;
      const src = this.chart.notes[n.index] || {};
      const hand = src.hand || (n.pitch < 60 ? 'L' : 'R');
      const dt = n.targetMs - nowV; // ms until it should be hit, on the calibrated timeline
      const missed = n.judgment === 'miss';
      // Long note let go too early: the rest of the bar goes dim and the key
      // stops showing as sounding.
      const dropped = n.holdOk === false;

      // Key guide: tint the key as its note approaches (last beat), full
      // colour while the note is sounding.
      if (!missed && !dropped) {
        const ks = keyState.get(n.pitch) || { hand, sounding: 0, soon: 0 };
        if (dt <= 0 && dt > -n.durationMs) {
          ks.sounding = 1;
          ks.hand = hand;
        } else if (dt > 0 && dt < beatMs) {
          ks.soon = Math.max(ks.soon, 1 - dt / beatMs);
        }
        keyState.set(n.pitch, ks);
      }

      // Small gap at the top so back-to-back notes read as separate presses.
      const h = Math.max(10, n.durationMs * pxPerMs - 8);
      const yBottom = L.hitY - dt * pxPerMs;
      const yTop = yBottom - h;
      if (yTop > L.hitY || yBottom < -30) continue;
      const w = Math.max(8, lane.w * (lane.black ? 0.8 : 0.56));
      const x = lane.x + (lane.w - w) / 2;
      const c = HAND[hand];
      const grad = g.createLinearGradient(0, yTop, 0, yBottom);
      if (missed) {
        grad.addColorStop(0, '#3a3a40');
        grad.addColorStop(1, '#2c2c31');
      } else {
        grad.addColorStop(0, lane.black ? c.deep : c.base);
        grad.addColorStop(1, lane.black ? c.base : c.light);
      }
      g.fillStyle = grad;
      if (dropped) g.globalAlpha = 0.28;
      if (n.judgment && !missed && !dropped) {
        g.shadowColor = c.light;
        g.shadowBlur = 14;
      }
      roundRect(g, x, yTop, w, h, Math.min(w / 2, 7));
      g.fill();
      g.shadowBlur = 0;
      g.globalAlpha = 1;

      // Note letter inside the bottom of the bar, finger number (if the
      // chart gives one) just below it, like a fingering mark.
      if (h > 18 && yBottom < L.hitY + 16) {
        g.fillStyle = missed ? '#777' : '#1a0f08';
        g.font = 'bold 10px ui-monospace, monospace';
        g.textAlign = 'center';
        g.fillText(noteName(n.pitch).replace(/-?\d+$/, ''), x + w / 2, yBottom - 5);
      }
      if (src.finger && h > 32 && yBottom < L.hitY + 16) {
        g.fillStyle = '#1a0f08';
        g.font = '10px ui-monospace, monospace';
        g.textAlign = 'center';
        g.fillText(String(src.finger), x + w / 2, yBottom - 17);
      }
    }
    g.restore();

    // Hit line. It warms up as the combo grows.
    const heat = this.showScore ? Math.min(1, scorer.combo / 20) : 0;
    g.shadowColor = '#ffb060';
    g.shadowBlur = 4 + heat * 18;
    g.fillStyle = `rgb(${150 + heat * 105}, ${150 + heat * 40}, ${160 - heat * 60})`;
    g.fillRect(0, L.hitY - 2, L.W, 2);
    g.shadowBlur = 0;

    // New judgments since last frame. Hits arrive through lastJudgment;
    // misses are found by scanning, since several can land in one frame.
    if (lastJudgment && lastJudgment !== this._sparkedFor) {
      this._sparkedFor = lastJudgment;
      const j = lastJudgment;
      if (j.judgment !== 'miss') {
        this.marks.push({ pitch: j.pitch, judgment: j.judgment, born: nowPerf });
        if (j.deltaMs !== null) this.ticks.push({ deltaMs: j.deltaMs, judgment: j.judgment, born: nowPerf });
      }
      const lane = L.lanes.get(j.pitch);
      const col = SPARK[j.judgment];
      if (lane && col && this.showJudgments) {
        const count = j.judgment === 'perfect' ? 8 : 3;
        for (let i = 0; i < count; i++) {
          this.sparks.push({
            x: lane.x + lane.w / 2,
            y: L.hitY - 2,
            vx: (Math.random() - 0.5) * 0.16,
            vy: -(0.06 + Math.random() * 0.16),
            born: nowPerf,
            life: 260 + Math.random() * 200,
            col,
          });
        }
      }
    }
    for (const n of scorer.expected) {
      if (n.judgment !== 'miss' || this._missSeen.has(n.index)) continue;
      this._missSeen.add(n.index);
      this.marks.push({ pitch: n.pitch, judgment: 'miss', born: nowPerf });
    }
    this.sparks = this.sparks.filter((p) => nowPerf - p.born < p.life);
    for (const p of this.sparks) {
      const age = nowPerf - p.born;
      g.globalAlpha = 1 - age / p.life;
      g.fillStyle = p.col;
      g.fillRect(p.x + p.vx * age, p.y + p.vy * age + 0.0004 * age * age, 2.5, 2.5);
    }
    g.globalAlpha = 1;

    // Keyboard: the active register only. A key shows the hand colour while
    // its note sounds, a faint tint just before, and glows when the player
    // is actually holding it.
    const drawKey = (n, lane, h, idle) => {
      const ks = keyState.get(n);
      const down = pressed.has(n);
      const c = ks ? HAND[ks.hand] : null;
      const kx = lane.x + (lane.black ? 0 : 0.5);
      const kw = lane.w - (lane.black ? 0 : 1);
      g.fillStyle = idle;
      roundRect(g, kx, L.hitY + 2, kw, h, 3);
      g.fill();
      if (c && (ks.sounding || ks.soon)) {
        g.globalAlpha = ks.sounding ? (down ? 1 : 0.75) : ks.soon * 0.35;
        g.fillStyle = c.base;
        if (ks.sounding && down) {
          g.shadowColor = c.light;
          g.shadowBlur = 18;
        }
        roundRect(g, kx, L.hitY + 2, kw, h, 3);
        g.fill();
        g.shadowBlur = 0;
        g.globalAlpha = 1;
      } else if (down) {
        g.fillStyle = lane.black ? '#5a5a66' : '#b9bcc8';
        roundRect(g, kx, L.hitY + 2, kw, h, 3);
        g.fill();
      }
    };
    for (const n of L.whites) {
      const lane = L.lanes.get(n);
      drawKey(n, lane, L.keyboardH - 2, COLORS.white);
      g.textAlign = 'center';
      if (n % 12 === 0) {
        g.fillStyle = '#777';
        g.font = '10px ui-monospace, monospace';
        g.fillText(noteName(n), lane.x + lane.w / 2, L.H - 5);
      }
      const cap = this.keyLabels && this.keyLabels[n];
      if (cap) {
        g.fillStyle = '#33333a';
        g.font = 'bold 13px ui-monospace, monospace';
        g.fillText(cap, lane.x + lane.w / 2, L.H - 20);
      }
    }
    for (const [n, lane] of L.lanes) {
      if (!lane.black) continue;
      drawKey(n, lane, L.keyboardH * 0.62, COLORS.black);
      const cap = this.keyLabels && this.keyLabels[n];
      if (cap) {
        g.fillStyle = '#8a8a96';
        g.font = 'bold 11px ui-monospace, monospace';
        g.textAlign = 'center';
        g.fillText(cap, lane.x + lane.w / 2, L.hitY + L.keyboardH * 0.62 - 6);
      }
    }

    // Score HUD, kept small and in the corners. Can be hidden (showScore);
    // the run is still scored underneath so the tutor summary is unaffected.
    if (this.showScore) {
      g.textAlign = 'left';
      g.fillStyle = '#9a9aa6';
      g.font = '15px ui-monospace, monospace';
      g.fillText(String(scorer.score).padStart(6, '0'), 10, 22);
      const acc = liveAccuracy(scorer);
      g.font = '11px ui-monospace, monospace';
      g.fillStyle = '#666';
      g.fillText(acc === null ? '' : `${(acc * 100).toFixed(1)}%`, 10, 37);
      if (scorer.combo > 1) {
        g.textAlign = 'right';
        g.fillStyle = heat > 0.5 ? '#c98a55' : '#9a9aa6';
        g.font = '15px ui-monospace, monospace';
        g.fillText(`${scorer.combo}x`, L.W - 10, 22);
      }
    }
    g.textAlign = 'left';
    g.font = '11px ui-monospace, monospace';
    g.fillStyle = '#444';
    g.fillText(`visual offset ${visualOffsetMs.toFixed(0)} ms  ( [ and ] to nudge )`, 10, L.hitY - 6);
    if (tSong < 0) {
      g.fillStyle = COLORS.text;
      g.textAlign = 'center';
      g.font = '48px ui-monospace, monospace';
      g.fillText(String(Math.ceil(-tSong / beatMs)), L.W / 2, L.hitY / 2);
    }

    // Hit indicators. Deliberately quiet: small, dim marks at the key that
    // was played, never in the middle of the screen. A perfect hit shows no
    // text at all (the key glow and a few sparks are the reward); only the
    // hits worth noticing get a word, and a miss is a small red x.
    if (this.showJudgments) {
      this.marks = this.marks.filter((m) => nowPerf - m.born < 650);
      g.textAlign = 'center';
      for (const m of this.marks) {
        const age = nowPerf - m.born;
        const lane = L.lanes.get(m.pitch);
        if (!lane) continue;
        const cx = lane.x + lane.w / 2;
        const y = L.hitY - 12 - age * 0.02;
        g.globalAlpha = 0.7 * (1 - age / 650);
        if (m.judgment === 'miss' || m.judgment === 'extra') {
          g.strokeStyle = COLORS.miss;
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(cx - 5, y - 5);
          g.lineTo(cx + 5, y + 5);
          g.moveTo(cx + 5, y - 5);
          g.lineTo(cx - 5, y + 5);
          g.stroke();
        } else if (m.judgment !== 'perfect') {
          g.fillStyle = MARK[m.judgment];
          g.font = '11px ui-monospace, monospace';
          g.shadowColor = '#000';
          g.shadowBlur = 4;
          g.fillText(m.judgment, cx, y);
          g.shadowBlur = 0;
        }
      }
      g.globalAlpha = 1;

      // Timing meter: a thin strip under the score. Each hit leaves a tick,
      // left of centre = early, right = late. It shows rushing or dragging
      // at a glance without a word on screen.
      const mw = 150;
      const mx = L.W / 2;
      const my = 16;
      const win = scorer.cfg.windows;
      g.fillStyle = '#26262c';
      g.fillRect(mx - mw / 2, my, mw, 2);
      g.fillStyle = '#3a4a3a';
      const pw = (win.perfect / win.late) * (mw / 2);
      g.fillRect(mx - pw, my, pw * 2, 2);
      g.fillStyle = '#666';
      g.fillRect(mx - 0.5, my - 4, 1, 10);
      this.ticks = this.ticks.filter((t) => nowPerf - t.born < 4000);
      for (const t of this.ticks) {
        g.globalAlpha = 0.8 * (1 - (nowPerf - t.born) / 4000);
        g.fillStyle = MARK[t.judgment] || '#aaa';
        g.fillRect(mx + (t.deltaMs / win.late) * (mw / 2) - 1, my - 4, 2, 10);
      }
      g.globalAlpha = 1;
    } else {
      this.marks.length = 0;
      this.ticks.length = 0;
    }
  }
}


// Visual calibration view: silent bars fall to the line; the player taps as
// each one lands. Uses the canvas size only, no chart needed.
Renderer.prototype.drawVisualSync = function ({ nowPerf, beats, progress }) {
  const g = this.g;
  const W = this.canvas.width;
  const H = this.canvas.height;
  const hitY = H - 110;
  const pxPerMs = hitY / this.approachMs;
  g.fillStyle = COLORS.bg;
  g.fillRect(0, 0, W, H);
  g.fillStyle = COLORS.lane;
  g.fillRect(W / 2 - 60, 0, 120, hitY);
  for (const c of beats.clicks) {
    const dt = c.perfTime - nowPerf;
    const yBottom = hitY - dt * pxPerMs;
    if (yBottom < -40 || yBottom - 18 > H) continue;
    g.fillStyle = dt < 0 ? COLORS.noteHit : COLORS.note;
    g.fillRect(W / 2 - 50, yBottom - 18, 100, 18);
  }
  g.fillStyle = COLORS.hitLine;
  g.fillRect(0, hitY - 2, W, 3);
  g.fillStyle = COLORS.white;
  g.fillRect(W / 2 - 60, hitY + 2, 120, 108);
  g.fillStyle = COLORS.text;
  g.font = '16px ui-monospace, monospace';
  g.textAlign = 'center';
  g.fillText('visual sync: tap any key exactly as each bar touches the tile (no sound)', W / 2, 24);
  if (progress) {
    g.fillText(
      `${progress.count} / ${progress.total}${progress.warmup ? ' (warm-up)' : ''}` +
        (progress.count ? `   mean ${progress.meanMs.toFixed(0)} ms, spread ±${progress.stdevMs.toFixed(0)} ms` : ''),
      W / 2,
      48,
    );
  }
};

function liveAccuracy(scorer) {
  const pts = scorer.cfg.points;
  let base = 0;
  let judged = 0;
  for (const n of scorer.expected) {
    if (n.judgment === null) continue;
    base += pts[n.judgment];
    judged++;
  }
  const total = judged + scorer.extras.length;
  return total === 0 ? null : base / (pts.perfect * total);
}
