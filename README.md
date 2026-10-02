# stamp the ticket boi 🎫

this is a little card you can spin around, stamp, and ride. I had this idea after stumbling across https://ramp.design/

it started as the first three panels of my portfolio, a manga-style train journey, and i wanted to see if i could pick them up and hold them. so i turned the panels into a 3D card:

1. **get your ticket stamped.** hover the ticket to scan it, then click to stamp it anywhere you like.
2. **catch the train.** the ink wipes across and the train slides into the platform.
3. **enjoy the ride.** flip the card over for the view from inside the train.

all the art is drawn by me (the panels from my portfolio). the card itself is three.js, and everything else is plain JavaScript.

**live:**  · **my portfolio:** https://www.elaineyu.design/

## play with it

- **drag** to spin the card any direction (it keeps its momentum)
- **scroll / pinch** to zoom
- **hover + click the ticket** to stamp it
- **space** flips · **r** resets · **n** starts over
- turn the sound on for the stamp and the train

## run it yourself

```bash
npm install
npm run dev
```

the interactive card is at `/`. the scripted 9:16 version i made for reels is at `/reel.html`.

to export that reel as an mp4:

```bash
npx playwright install chromium   # once
npm run export                    # needs ffmpeg
```

options: `?record=1` hides all the buttons for screen-recording, `?t=3.2` freezes the reel on one frame, `npm run export -- --w 720` for a quick test render.

## how it's put together

| file | what it does |
|---|---|
| `src/scene.js` | the 3D card, lighting and glossy finish |
| `src/faces.js` | paints the three panels onto the card's two faces |
| `src/interactive.js` | drag + momentum, hover/scan, stamping, flipping |
| `src/reel.js` | the scripted reel version |
| `src/sfx.js`, `src/audio.js` | all the sounds, synthesized in code (no audio files) |
| `src/config.js` | text and timing for every beat |
| `public/assets/` | the artwork |

## a note on the art

the code is free to learn from. the illustrations in `public/assets/` are mine, all rights reserved. please don't reuse them without asking.

made by yours truly :)[elaine yu](https://elaineyu.design)
