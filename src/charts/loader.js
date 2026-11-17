// Charts are JSON data files in /charts. REQUIREMENT 6.
// Note: { pitch, onset (beats), duration (beats), velocity, hand? ("L"|"R"), finger? (1-5) }
// hand and finger are display-only; hand defaults to L below middle C, R otherwise.
// Chart: { id, title, source, bpm, difficulty, register:{low,high}, lengthBeats, notes[] }

export async function listCharts() {
  const res = await fetch('./charts/index.json');
  return res.json();
}

export async function loadChart(id) {
  const res = await fetch(`./charts/${id}.json`);
  if (!res.ok) throw new Error(`chart not found: ${id}`);
  return res.json();
}
