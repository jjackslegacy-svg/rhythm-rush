import { InputSource } from './InputSource.js';

// DEVELOPMENT-ONLY fallback: computer keyboard. Home row = C4..E5 (black
// keys on the row above), bottom row = C3..B3 white keys for the left hand.
// Velocity is fixed because a computer keyboard cannot measure it.
// Never validate scoring or latency on this source.

export const KEY_TO_NOTE = {
  a: 60, // C4
  w: 61, // C#4
  s: 62, // D4
  e: 63, // D#4
  d: 64, // E4
  f: 65, // F4
  t: 66, // F#4
  g: 67, // G4
  y: 68, // G#4
  h: 69, // A4
  u: 70, // A#4
  j: 71, // B4
  k: 72, // C5
  l: 74, // D5
  ';': 76, // E5
  z: 48, // C3
  x: 50, // D3
  c: 52, // E3
  v: 53, // F3
  b: 55, // G3
  n: 57, // A3
  m: 59, // B3
};

// pitch -> key cap, for on-screen labels while no MIDI keyboard is in use.
export const NOTE_TO_KEY = Object.fromEntries(Object.entries(KEY_TO_NOTE).map(([k, n]) => [n, k.toUpperCase()]));

const FIXED_VELOCITY = 100;

export class KeyboardInput extends InputSource {
  constructor(target = window) {
    super();
    this._target = target;
    this._down = new Set();
    this._onDown = (e) => this._handle(e, 'noteon');
    this._onUp = (e) => this._handle(e, 'noteoff');
  }

  get status() {
    return 'Keyboard fallback: a s d f g h j k l ; = C4..E5 (w e t y u = sharps), z x c v b n m = C3..B3';
  }

  async start() {
    this._target.addEventListener('keydown', this._onDown);
    this._target.addEventListener('keyup', this._onUp);
  }

  stop() {
    this._target.removeEventListener('keydown', this._onDown);
    this._target.removeEventListener('keyup', this._onUp);
    this._down.clear();
  }

  _handle(e, type) {
    const note = KEY_TO_NOTE[e.key.toLowerCase()];
    if (note === undefined) return;
    if (e.repeat) return; // OS key-repeat is not a new note
    if (type === 'noteon') {
      if (this._down.has(note)) return;
      this._down.add(note);
    } else {
      if (!this._down.has(note)) return;
      this._down.delete(note);
    }
    e.preventDefault();
    this._emit({
      type,
      note,
      velocity: type === 'noteon' ? FIXED_VELOCITY : 0,
      time: e.timeStamp, // the event's own timestamp
      source: 'keyboard',
    });
  }
}
