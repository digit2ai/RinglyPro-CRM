'use strict';
/**
 * JobUp social cut, v2. Two changes from v1, both from watching v1 back:
 *
 *  - The four product lines carried 46 words and claimed 17.5s of a 33s ad,
 *    squeezing the story into 15.6s. They are now three lines, 31 words.
 *  - Those beats pointed at ONE static card held for 17.5 seconds, which read
 *    as a frozen video. Each now has its own animated card (demo/ui-cards.js),
 *    and its own scene name so the mapping is explicit rather than incidental.
 */
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

  { text: 'Two AI agents. One hunts real openings across eight platforms.',
    scene: 'ui hunter', source: 'screen_recording' },
  { text: 'The other builds your site so recruiters and their AI find you.',
    scene: 'ui presence', source: 'screen_recording' },
  { text: 'Every match ranked, scored, explained. Then tailored to the job.',
    scene: 'ui match', source: 'screen_recording' },

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

module.exports = { CHARACTER, BEATS, TARGET: 27, NAME: 'jobup-social-v2' };
