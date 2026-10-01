# ticket-reel

A 3D card for a reel: **ticket → stamp → platform (train slides in) → card flips → train interior with parallax buildings.**
Built with Vite + three.js. The art is your own panel layers from `portfolio2026-7` (nothing generated).

The card faces are painted on 2D canvases (so your hand-drawn layers stay untouched) and mapped onto a
glossy three.js card. Every animation is a pure function of time, so playback, scrubbing and export all match.

## Run

```bash
npm install
npm run dev          # open the printed URL, click or press Space to play
```

URL options (combine freely):

| param | what it does |
|---|---|
| `?record=1` | hides the UI + cursor, no pointer tilt. Press **Space** to start, then screen-record |
| `?autoplay=1` | starts immediately (browsers block sound without a click) |
| `?t=2.3` | freeze on one frame (great for tweaking) |
| `?w=1080` | canvas pixel width (height = w × 16/9) |
| `?speed=0.5` | slow-mo playback |
| `?sound=0` | mute |

Keys: **Space** replay · **H** hide/show the hint pill.

## Export an MP4 (no screen recording needed)

```bash
npx playwright install chromium    # once
npm run export                      # → reel.mp4, 1080x1920, 30 fps, sound included
npm run export -- --fps 60 --out reel-60.mp4
npm run export -- --w 720           # quick test render
npm run export -- --no-audio
```

Needs `ffmpeg` on your PATH. Frames are rendered one at a time at exact timestamps, so it never drops frames.
`npm run shots -- 2.3 6.6` writes still PNGs of any timestamps into `./shots`.

## Edit it

| file | what's in it |
|---|---|
| `src/config.js` | all text (top label, step captions, site URL) and the **timeline** (seconds for every beat) |
| `src/faces.js` | the three panels: ticket + stamp + splatter, platform + train, interior + parallax. Panel caption text is `CAP_PLATFORM` / `CAP_TRAIN` |
| `src/timeline.js` | card motion, camera moves, impact shake |
| `src/audio.js` | synthesized sound design (same sounds as your site's beep/thud, plus whooshes, chime, rail clacks) |
| `src/main.js` | scene, lighting, glossy card material, overlays, playback API |
| `public/assets/` | your layers, downscaled (3000×2250). Swap files in place to restyle |

Timeline (seconds): card in 0–0.85 · scan 0.95 · stamp lands **2.25** · ink wipe 3.2 · train 3.7–5.3 · flip 6.0–7.25 · outro 10.4 · total 12.0

## Notes

- Fonts (Space Mono, Caveat) come from `@fontsource`, so it works offline. Noto Serif JP isn't used.
- No GPU (CI, some Linux boxes)? `SOFTWARE_GL=1 npm run export` forces CPU rendering. It works but is slow.
- Fresh `npm install` pulls current `three`; if a future version changes `scene.environmentIntensity`, pin to the version in `package-lock.json`.
