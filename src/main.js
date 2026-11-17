import { setupInput } from './input/setup.js';
import { createReadout } from './ui/readout.js';

const statusEl = document.querySelector('#status');
const supportEl = document.querySelector('#support');
const readout = createReadout(document);

supportEl.textContent = 'requestMIDIAccess' in navigator ? 'Web MIDI: supported' : 'Web MIDI: not supported';

const input = await setupInput({ onStatus: (s) => (statusEl.textContent = s) });
input.onNote(readout.onNote);
