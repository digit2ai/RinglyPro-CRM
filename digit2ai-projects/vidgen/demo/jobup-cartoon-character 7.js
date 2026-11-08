'use strict';
/**
 * The JobUp cartoon character — generated once, then kept.
 *
 * A different creature from the Orb: this ad needs a face that can look
 * defeated and then delighted, which a faceless glowing figure cannot do.
 */
const CHARACTER = {
  description:
    'a friendly cartoon man in his late twenties, modern 3D animated feature-film style. '
    + 'Warm medium skin tone, short dark tousled hair, light stubble, expressive large eyes, '
    + 'thick eyebrows that carry the emotion. Wearing a simple teal button-up shirt with the '
    + 'sleeves rolled up. Slightly stylised proportions with a large head and expressive hands, '
    + 'like a modern animated comedy',
  styleTokens:
    '3D animated cartoon in the style of a modern animated feature, bright saturated colours, '
    + 'clean soft studio lighting, gentle rim light, smooth subsurface skin shading, shallow '
    + 'depth of field, cheerful contemporary home-office setting, no text, no logos, no words',
};

const ANGLES = [
  'seated at a laptop on a desk, medium shot from the front, head in hands, defeated',
  'medium close-up on his face and shoulders, looking up and to the side, hopeful',
  'medium shot, standing, holding a phone up in one hand and looking at it, delighted',
  'medium wide shot, seated at the desk turned toward the camera, arms open',
];

module.exports = { CHARACTER, ANGLES };
