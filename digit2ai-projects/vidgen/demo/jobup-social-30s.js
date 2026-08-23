'use strict';
/**
 * JobUp — 30s social cut for Facebook / Instagram Reels, 9:16.
 *
 * Arc: end of the month, the bills stack up, no job yet -> JobUp's two agents
 * work while you don't -> matches ranked and explained -> resume tailored to
 * one posting -> YOU send it -> the replies start.
 *
 * GROUNDED IN THE REAL PRODUCT (verticals/jobup/public/index.html):
 *   - Two agents: Opportunity Hunter, Professional Presence
 *   - Real openings from eight ATS platforms, scored and EXPLAINED, never invented
 *   - Per-job tailoring using only what the user already wrote
 *   - Free tier, no card. Search $29/mo, Landed $99/mo.
 *
 * THE ONE THING THIS AD MUST NEVER SAY: that JobUp applies for you. The
 * product states the opposite in four places in its own source, including on
 * the pricing card: "JobUp never applies on your behalf; you review and submit
 * every application yourself." The beat below says "you hit send" on purpose.
 */

// Lighting and style live in the CHARACTER SHEET prompt, never in a beat —
// a live generation proved the reference frame overrides prompt lighting.
const CHARACTER = {
  description: 'a man in his early thirties, olive skin, short dark hair, light stubble, plain grey henley shirt',
  styleTokens: '3d animated feature film style, warm evening kitchen light from a window, soft volumetric lighting, shallow depth of field, saturated warm palette'
};

const BEATS = [
  { text: 'Rent is due Friday.',
    scene: 'medium wide', emotion: 'weary',
    pose: 'he stands at a kitchen table looking down at a tall stack of unopened envelopes, both arms hanging straight at his sides, shoulders dropping' },

  { text: 'And the pile got taller again.',
    scene: 'close-up on his hands', emotion: 'defeated',
    pose: 'one of his hands sets another envelope flat on top of the stack, fingers releasing it slowly' },

  { text: 'You have applied everywhere. Nothing comes back.',
    scene: 'close-up on his face', emotion: 'exhausted',
    pose: 'he sits down heavily into a chair and rests his forehead against one open palm, elbow planted on the table' },

  { text: 'JobUp works the days you cannot.',
    scene: 'three-quarter view', emotion: 'steady',
    pose: 'he lifts his head, turns toward an open laptop on the table and places both hands flat on either side of it' },

  { text: 'Two AI agents. One hunts real openings across eight job platforms, every day.',
    scene: 'app interface', source: 'screen_recording' },

  { text: 'The other builds your site so recruiters and their AI can find you.',
    scene: 'app interface', source: 'screen_recording' },

  { text: 'Every match ranked, scored, and explained. Never invented.',
    scene: 'app interface', source: 'screen_recording' },

  { text: 'Your resume rewritten for that one posting, using only what you wrote.',
    scene: 'app interface', source: 'screen_recording' },

  { text: 'You read it. You hit send.',
    scene: 'three-quarter view', emotion: 'resolved',
    pose: 'he sits upright with his chin lifted, one index finger pressing down on the laptop trackpad, eyes on the screen' },

  { text: 'Then the replies start.',
    scene: 'close-up on his face', emotion: 'hopeful',
    pose: 'he holds a phone flat in his open palm at chest height with his elbow bent at his side, looking down at the screen, mouth beginning to curve into a closed-lip smile' },

  { text: 'JobUp dot dev. Start free. No card.',
    scene: 'medium wide', emotion: 'confident',
    pose: 'he stands and pulls a jacket onto one shoulder, turning to walk forward toward the camera' }
];

module.exports = { CHARACTER, BEATS, TARGET: 33, NAME: 'jobup-social-30s' };
