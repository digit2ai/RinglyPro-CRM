# Build With AI: event kit (DIGIT2AI)

Static site. No build step, no server code. Drop this folder in as `public/conference/` so it serves at
https://aiagent.ringlypro.com/conference/

## Pages
- /conference/            Overview hub
- /conference/program/    Run of show (clock times computed from startTime in config.js)
- /conference/keynote/    18-slide deck. Arrows or space to move, P presenter view (second window, synced), N notes overlay, F full screen, T start timer, L language
- /conference/script/     Word-for-word speaker script with timing and cut versions (printable)
- /conference/workshop/   Facilitator and participant guide
- /conference/join/       Mobile page behind the QR code: team picker, prompt builder, Factory and SpeakUp links
- /conference/checklist/  Pre-event checklist (saved per device)
- /conference/qr/         Printable QR card

## Edit before the event
`assets/config.js`: date, startTime, venue, factoryUrl, agentCount.
Slide text and the script share one source: `assets/slides.js`.
If the join URL changes, regenerate `assets/qr-join.svg` (python: `segno.make(URL, error="m").save("assets/qr-join.svg", scale=10, border=2, dark="#0C1150", omitsize=True)`).

## Deploy (for ringlypro-architect)
1. Copy this folder to `public/conference/` in the aiagent.ringlypro.com repo.
2. Confirm Express serves `public/` statically with directory index (default `express.static` does).
3. Commit "Add Build With AI conference kit", push to main, wait for Render auto-deploy.
4. Verify live: every page returns 200, /conference/sw.js returns 200, the QR resolves to /conference/join/, keynote arrows work, presenter view syncs, Spanish toggle works on every page.
