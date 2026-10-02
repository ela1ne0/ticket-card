// ─── Edit me ────────────────────────────────────────────────────────────────
// Text, timing and look of the reel. Everything else reads from here.

export const TEXT = {
  topLabel: 'PLT-01  ·  ELAINE YU',
  site: 'elaineyu.design',
  // bottom captions: [startSec, endSec, text]
  // (the typed boxes *inside* panels 02 and 03 use the exact lines from your site;
  //  edit those in src/faces.js → CAP_PLATFORM / CAP_TRAIN)
  captions: [
    [1.0, 2.9, 'step 1: get your ticket stamped'],
    [3.9, 6.1, 'step 2: catch the train'],
    [7.9, 10.2, 'step 3: enjoy the ride'],
  ],
  outroStart: 10.4, // site URL pill fades in here
};

export const COLORS = {
  blue: '#1a52d4',
  blueDark: '#153fb0',
  ink: '#1a2744',
  stamp: '#c8001e',
  cream: '#f5f0e6',
};

// Timeline (seconds). Total reel length is TL.total.
export const TL = {
  total: 12.0,
  intro: [0.0, 0.85], // card flies in
  scan: [0.95, 1.75], // scan line sweeps the ticket
  stampIn: [1.65, 2.25], // stamp sprite arrives
  impact: 2.25, // thud + ink + splatter + screen shake
  stampOut: [2.38, 2.9], // stamp lifts away
  wipe: [3.2, 3.8], // diagonal ink-wipe: panel 1 -> panel 2
  train: [3.7, 5.3], // train slides in (same easing as your site)
  flip: [6.0, 7.25], // card flips to panel 3
  passenger: [7.7, 8.5], // passenger fades in on the train
  scrollStart: 7.2, // buildings start moving outside the windows
};
