# Rhythm Rush (prototype)

An early prototype of a piano-learning game. You play a real keyboard, notes fall toward the keys like a rhythm game, and the software scores what you actually played. The long-term idea is an AI teacher that finds your repeated mistakes and gives you a short exercise for them, then sends you back into the game.

**Stage: ideation and early prototype.** Built by one founder (Justin Jackson, Morehouse College). No customers, no sales, and no user-testing results yet.

## Try it

**Live demo:** ADD-YOUR-GITHUB-PAGES-LINK-HERE (open in Chrome or Edge)

No MIDI keyboard needed. The piano keys on screen show which computer key to press:

- Home row (A S D F G H J K L ;) plays the right hand, C4 to E5
- Bottom row (Z X C V B N M) plays the left hand, C3 to B3
- W E T Y U play the black keys

Steps:

1. Click **1. Sync audio** and follow the clicks, then **2. Sync visual**. This lines up sound, screen and key presses for your computer. (You can skip it to just look around, but scoring will be off.)
2. Pick a song and click **Start**.
3. Press the key when the bar reaches the line. Hold the key for as long as the bar is long.

Songs: C Major Steps, Mary Had a Little Lamb, Ode to Joy, Skips and Runs, and a two-hand Ode to Joy. All are public-domain tunes in our own arrangements.

If you have a MIDI keyboard, plug it in over USB before opening the page and it is used automatically.

## What works today

- Falling-note view with note length, left hand (blue) and right hand (orange)
- Real-time scoring of pitch, timing and held length, with combo and accuracy
- Quiet hit indicators and a timing meter, which can be turned off
- Latency calibration so the judgments are fair
- A structured summary of each run (the data the AI teacher will read)
- Automated tests for the scoring and calibration (`npm test`)

## What is not built yet

- The AI tutor, Skill Lab practice exercises, and the replay-without-falling-notes test
- Results screen, song select, saved progress
- Any testing with real users, or confirmed demand
- The portable keyboard (that is a later hardware plan; this prototype uses any existing MIDI keyboard)

Tested so far on a computer keyboard only. Timing windows still need tuning on a real MIDI keyboard.

## Run it yourself

    python3 -m http.server 8000

Open http://localhost:8000 in Chrome or Edge (Web MIDI needs localhost or https). Tests: `npm test`.

## Layout

    index.html          the game
    readout.html        raw MIDI readout
    calibrate.html      latency calibration page
    src/scoring/        deterministic scorer and timing windows
    src/analysis/       structured run summary
    src/game/           falling-note renderer and game loop
    src/input/          MIDI and computer-keyboard input
    charts/             the song charts (JSON)
