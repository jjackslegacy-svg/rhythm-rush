// Every tunable number for judgment lives here. REQUIREMENT 4.
// Starting values are deliberately forgiving: this is a beginner learning
// tool, not osu!. Tune by feel on a real MIDI keyboard.

export const SCORING = Object.freeze({
  // Absolute timing windows in ms, after calibration offset is removed.
  //   |delta| <= perfect  -> 'perfect'
  //   |delta| <= good     -> 'good'
  //   |delta| <= late     -> 'early' or 'late' by sign
  //   beyond              -> not matched; the expected note becomes 'miss',
  //                          the input becomes 'extra'
  windows: Object.freeze({
    perfect: 45,
    good: 90,
    late: 150,
  }),

  // Base points per judgment. Accuracy is base points earned over the
  // maximum possible, counting extras as zero-point expected notes.
  points: Object.freeze({
    perfect: 300,
    good: 200,
    early: 100,
    late: 100,
    miss: 0,
    extra: 0,
  }),

  // Score multiplier grows with combo up to comboCap: 1x .. 2x.
  comboCap: 50,

  // A held note counts as held if it lasted at least this fraction of the
  // chart's written duration.
  holdMinRatio: 0.6,

  // Chart notes shorter than this (in beats) are not evaluated for hold.
  holdMinBeats: 1.5,
});
