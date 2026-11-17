import { InputSource } from './InputSource.js';

// Real MIDI via the Web MIDI API (Chrome / Edge; needs localhost or https).
// We listen on every connected input so the user does not have to pick one.
export class MidiInput extends InputSource {
  constructor() {
    super();
    this._access = null;
    this._devices = new Map(); // id -> MIDIInput
  }

  static get supported() {
    return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
  }

  get status() {
    if (!this._access) return 'MIDI: not started';
    const names = [...this._devices.values()].map((d) => d.name || d.id);
    return names.length ? `MIDI: ${names.join(', ')}` : 'MIDI: no device connected';
  }

  async start() {
    if (!MidiInput.supported) throw new Error('Web MIDI not supported in this browser');
    this._access = await navigator.requestMIDIAccess({ sysex: false });
    this._access.onstatechange = () => this._syncDevices();
    this._syncDevices();
  }

  stop() {
    for (const d of this._devices.values()) d.onmidimessage = null;
    this._devices.clear();
    if (this._access) this._access.onstatechange = null;
    this._access = null;
  }

  _syncDevices() {
    const seen = new Set();
    for (const input of this._access.inputs.values()) {
      seen.add(input.id);
      if (!this._devices.has(input.id)) {
        input.onmidimessage = (e) => this._onMessage(e);
        this._devices.set(input.id, input);
      }
    }
    for (const id of [...this._devices.keys()]) {
      if (!seen.has(id)) {
        this._devices.get(id).onmidimessage = null;
        this._devices.delete(id);
      }
    }
    this._emitStatus();
  }

  _onMessage(e) {
    const [status, d1, d2] = e.data;
    const kind = status & 0xf0; // strip channel
    if (kind !== 0x90 && kind !== 0x80) return; // only note on/off for now
    const velocity = d2 ?? 0;
    // Note-on with velocity 0 is note-off by MIDI convention.
    const type = kind === 0x90 && velocity > 0 ? 'noteon' : 'noteoff';
    this._emit({
      type,
      note: d1,
      velocity: type === 'noteon' ? velocity : 0,
      time: e.timeStamp, // the event's own timestamp, not performance.now()
      source: 'midi',
    });
  }

  // Status changes are not notes; surface them through a separate hook so
  // the UI can refresh its device label.
  onStatus(fn) {
    this._statusFn = fn;
  }
  _emitStatus() {
    if (this._statusFn) this._statusFn(this.status);
  }
}
