'use strict';
/**
 * The Orb — the character sheet, generated once from the operator's own
 * description and then KEPT. gpt-image-1 has no seed, so regenerating invents a
 * different creature; this file is the character, not a cache of it.
 *
 * Angles are named so a beat can ask for one by name rather than having the
 * runner guess from the framing.
 */
const CHARACTER = {
  description:
    'a luminous humanoid entity called Orb. Smooth spherical head-core, emissive from within '
    + 'with a pink-to-orange gradient. NO FACE, no mouth, no eyes — a single soft horizontal '
    + 'light band across the core reads as attention and direction. Translucent frosted-glass '
    + 'limbs, even taper, no clothing, no texture, no seams. Hands and feet brighter than the '
    + 'limbs with a warm inner glow at the palms and soles. The head-core is roughly one fifth '
    + 'of total height. Full anatomy: head-core, torso, two arms with hands, two legs with feet',
  styleTokens:
    '3D animated digital character render, deep space void background with faint drifting '
    + 'particulate, warm pink-orange key light coming from the core itself, cool cyan rim light '
    + 'from behind for separation, volumetric glow, soft reflection on an unseen dark floor, '
    + 'cinematic shallow depth of field, modern premium tech aesthetic, no text, no logos',
};

// Named so beats can select them explicitly.
const ANGLES = [
  'full body head to toe, wide shot, mid-stride walking, seen from the side',
  'three-quarter view, medium shot from the waist up, facing the camera',
  'extreme close-up on the hands only, palms open, fingers spread',
  'close-up on the head-core and shoulders, the light band facing the camera',
];

module.exports = { CHARACTER, ANGLES };
