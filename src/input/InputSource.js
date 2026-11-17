// The one input interface. Everything downstream (readout, scoring, replay)
// consumes NoteEvents and never cares where they came from.
//
// NoteEvent shape:
//   {
//     type:     'noteon' | 'noteoff'
//     note:     MIDI note number, 0..127 (60 = middle C)
//     velocity: 0..127 (fallback source reports a fixed value)
//     time:     DOMHighResTimeStamp in ms, same clock as performance.now().
//               This is the timestamp carried BY THE EVENT, never the time
//               our handler ran. See REQUIREMENT 2.
//     source:   'midi' | 'keyboard'
//   }

export class InputSource {
  constructor() {
    this._listeners = new Set();
  }

  /** @param {(ev: NoteEvent) => void} fn */
  onNote(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit(ev) {
    for (const fn of this._listeners) fn(ev);
  }

  /** Human-readable status for the UI, e.g. device name. */
  get status() {
    return 'unknown';
  }

  async start() {}
  stop() {}
}

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function noteName(n) {
  return NOTE_NAMES[n % 12] + (Math.floor(n / 12) - 1);
}
