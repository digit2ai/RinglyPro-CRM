# Build With AI: event kit (DIGIT2AI)

Static site. No build step, no server code. Drop this folder in as `public/conference/` so it serves at
https://aiagent.ringlypro.com/conference/

## Pages
- /conference/            Overview hub
- /conference/program/    Run of show for ONE HOUR (clock times computed from startTime in config.js)
- /conference/keynote/    22-slide deck, 60 minutes. Arrows or space to move, P presenter view (second window, synced), N notes overlay, F full screen, T start timer, C show or hide the time bar, L language
- /conference/script/     Word-for-word speaker script with timing and cut versions (printable)
- /conference/build/      Live build guide for the presenter: record, choose, the build prompt, what to do if it fails
- /conference/join/       Audience page behind the QR code: the app built live (once appUrl is set), the hour, a prompt builder
- /conference/signup/     Form behind the QR on the LAST slide: join the Visionarium AI Engineering Solutions team. Posts to /api/conference/signup, which saves a contact under CRM client 15 (src/routes/conference-signup.js). Under 18 needs a parent or guardian and their consent; under 13 is refused.
- /conference/checklist/  Pre-event checklist (saved per device)
- /conference/qr/         Printable QR card

## Edit before the event
`assets/config.js`: date, startTime, venue, agentCount. After the live build, set `appUrl` and push so the audience page shows the app.
Slide text and the script share one source: `assets/slides.js`.
If the join URL changes, regenerate `assets/qr-join.svg` (python: `segno.make(URL, error="m").save("assets/qr-join.svg", scale=10, border=2, dark="#0C1150", omitsize=True)`).

## Deploy (for ringlypro-architect)
1. Copy this folder to `public/conference/` in the aiagent.ringlypro.com repo.
2. Confirm Express serves `public/` statically with directory index (default `express.static` does).
3. Commit "Add Build With AI conference kit", push to main, wait for Render auto-deploy.
4. Verify live: every page returns 200, /conference/sw.js returns 200, the QR resolves to /conference/join/, keynote arrows work, presenter view syncs, Spanish toggle works on every page.

## Format (changed 2026-10-06)
One hour, one app built with the whole room. No teams and no workshop. The idea session is recorded (AutoDev + Fieldy), the AI proposes the best idea and the room decides, RinglyPro Architect builds it in VS Code with Claude while the talk continues (minutes 17 to 40), and the room opens and tests it before the close. Slide minutes in `assets/slides.js` must add up to 60.

Slide 12 embeds the animated MCP brain from digit2ai.com (`/ringlypro-architect-factory.html?embed=stage`), loaded only when that slide is shown. It needs a connection.
If the sign-up URL changes, regenerate `assets/qr-signup.svg` and update `signupUrl` in config.js.
