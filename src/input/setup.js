import { MidiInput } from './MidiInput.js';
import { KeyboardInput } from './KeyboardInput.js';

// Starts both input sources and fans their NoteEvents out to subscribers.
// Returns { onNote, status } where status is a live string for the UI.
export async function setupInput({ onStatus } = {}) {
  const listeners = new Set();
  const emit = (ev) => {
    for (const fn of listeners) fn(ev);
  };

  const keyboard = new KeyboardInput();
  keyboard.onNote(emit);
  await keyboard.start();

  let status;
  if (MidiInput.supported) {
    const midi = new MidiInput();
    midi.onNote(emit);
    midi.onStatus((s) => onStatus && onStatus(s));
    try {
      await midi.start();
      status = midi.status;
    } catch (err) {
      status = `MIDI: failed to start (${err.message})`;
    }
  } else {
    status = 'Web MIDI: NOT supported in this browser. Use Chrome or Edge. Keyboard fallback only.';
  }
  if (onStatus) onStatus(status);

  return {
    onNote(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    status,
  };
}
