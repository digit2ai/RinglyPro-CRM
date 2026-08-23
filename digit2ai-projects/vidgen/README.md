# JobUp video pipeline

Generates the RYZE-style 3D animated promo: one locked character, many short
shots, burned captions, cut to a single continuous voiceover. 53 tests green,
including real ffmpeg assembly.

    npm test              # 17 tests
    node demo/render-demo.js   # renders a real 60s video with placeholder visuals

## The two things this enforces

**Continuity lock.** The character sheet is generated once, at four angles.
Every shot animates one of those frames — no shot is ever generated from a bare
text prompt. That is the difference between one character across forty shots and
forty different people. Tested.

**Budget guard.** Cost is estimated before the first API call and enforced during.
A 60-second video is ~12 generations; the ceiling stops one bad run from costing
more than a month of a user's plan. Tested: an over-budget script makes zero API calls.

## The order matters

Voiceover first, then measure it, then cut shots to the measured duration.
Planning from a words-per-second estimate and muxing real audio afterwards means
the two disagree and whichever is shorter truncates the other. The read is the
spine of the edit.

Downstream of that, the planner auto-fits: a short read produces fewer, longer
shots rather than overflowing, because N shots can never total less than
N x MIN_SHOT.

## Providers

Swappable, all with injected HTTP so nothing here needs network to test.

| Stage | Default | Why |
|---|---|---|
| Voice | Fish Audio | ~$15/M chars vs ElevenLabs ~$165. Video VO is batch, so latency is irrelevant |
| Voice (alt) | ElevenLabs | RinglyPro already has the integration and the Rachel/Ana/Lina voice IDs |
| Character sheet | any image API | one call, four angles, then locked |
| Shots | any image-to-video API | rejects a length the model cannot produce before anything is paid for |

Keep ElevenLabs for Rachel — that is realtime phone and the latency premium is
worth it there. It is not worth it for a batch voiceover.

## Screen recordings are free

### Clips are decoupled from caption cuts

Captions cut at ~1.5s; the camera does not. Image-to-video APIs bill in fixed
quanta — Runway gen4_turbo produces only 5s or 10s clips — so one generation
per caption cut means paying for 5s to use 1.5s. A 60s video is ~12 clips of
5s with 3-4 caption cues playing over each: $3.00 of video instead of $9.00,
and the same cut rhythm, which comes from the edit rather than from
re-generating footage. `assertGeneratable()` rejects any length the model
cannot produce, and any clip whose edit length outruns what was generated
(that one does not error at render time — it freezes on the last frame).

Beats tagged `source: 'screen_recording'` consume no generation budget. Real
JobUp UI footage is both cheaper and more honest than asking a video model to
render an interface — models produce convincing-looking gibberish text.
In the demo, 4 of 12 clips are screen recordings.

## Not built

- The `gpt-image-1` adapter is confirmed live as of 2026-08-22. It returns
  `data[0].b64_json` and NO url; there is no seed, so a character sheet is
  **not reproducible** — it is a saved asset, persisted by the runner and
  reused, because regenerating invents a different person. Frames are
  recompressed to 720x1280 JPEG data uris (26x smaller than the raw PNG, and
  720p is what Runway consumes anyway). `quality: 'medium'` measured 1584
  output tokens vs `high`'s 6240 — 75% cheaper, 2x faster, no visible
  difference after recompression.
- The Runway `gen4_turbo` adapter is confirmed live as of 2026-08-22. It is
  ASYNC: the submit returns only a task id, and the clip url arrives from
  `GET /v1/tasks/{id}` as `output[0]`. That url is signed and expires (~1.6
  days observed), so it must be downloaded immediately, not stored. Output is
  720x1280 h264 24fps; 25 credits for 5s (5 credits/s).
- The Fish Audio adapter is confirmed live as of 2026-08-22: a 200 returns raw
  `audio/mpeg` bytes (decodable mp3), errors return JSON plus
  `x-fish-error-code`, and `reference_id` genuinely selects the voice (verified
  by pitch against a control call). Still unproven: whether the body's `model`
  and `format` fields are read or silently ignored — both return 200 either
  way. See the notes on `fishAudio` in `src/providers/index.js`.
- Synthesis is not deterministic: the same request returns different audio each
  time, so a re-render of an unchanged script produces a different edit.
- The ElevenLabs adapter has never been called at all.
- No music bed selection. `assemble()` accepts one and ducks it to 18%.
- No retry on a failed shot generation.
