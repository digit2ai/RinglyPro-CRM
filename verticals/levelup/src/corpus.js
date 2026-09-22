'use strict';

/**
 * LevelUp corpus — every named entity the product depends on, held in code.
 *
 * The model writes prose. It never decides what the statuses are, which
 * editing rules exist, what counts as a red flag, or which agents there are.
 * Those come from here, and the UI, the Brain, the MCP listing and the SIT all
 * read this one file, so they cannot disagree.
 */

const AGENTS = [
  { id: 'lider', name: 'Andrea', team: 'management', job: { en: 'Your single point of contact. Routes your request to the right specialist and reports back.', es: 'Tu único punto de contacto. Envía cada pedido al especialista correcto y te reporta.' } },
  { id: 'strategist', name: 'Creative Strategist', team: 'core', job: { en: 'Finds your niche, content pillars and offer from your own words.', es: 'Encuentra tu nicho, pilares de contenido y oferta a partir de tus palabras.' } },
  { id: 'ideas', name: 'Ideas', team: 'core', job: { en: 'Ideas built around your pillars, or from your own thoughts.', es: 'Ideas alrededor de tus pilares o de tus propias notas.' } },
  { id: 'scripts', name: 'Scripts', team: 'core', job: { en: 'Scripts from proven structures, written fresh in your voice.', es: 'Guiones con estructuras probadas, escritos desde cero con tu voz.' } },
  { id: 'calendar', name: 'Calendar', team: 'core', job: { en: 'Your plan, statuses and batching suggestions.', es: 'Tu plan, estados y sugerencias para grabar en lote.' } },
  { id: 'editor', name: 'Video Editor', team: 'core', job: { en: 'Base cleanup and style layer in Descript, by your editing rules.', es: 'Limpieza base y capa de estilo en Descript, con tus reglas de edición.' } },
  { id: 'publisher', name: 'Publisher', team: 'core', job: { en: 'Prepares a platform-ready draft for each post. You publish.', es: 'Prepara un borrador listo para cada red. Tú publicas.' } },
  { id: 'business', name: 'Business Assistant', team: 'addon', job: { en: 'Reads brand emails, flags fake leads, drafts rate replies you approve.', es: 'Lee correos de marcas, marca contactos falsos y redacta respuestas que tú apruebas.' } },
  { id: 'research', name: 'Product Research', team: 'addon', job: { en: 'Breaks down the structure of top-selling videos.', es: 'Desarma la estructura de los videos que más venden.' } },
  { id: 'picks', name: 'Top Picks', team: 'addon', job: { en: 'Shoppable lists of your favorite products with a public page.', es: 'Listas comprables de tus productos favoritos con una página pública.' } },
  { id: 'trainer', name: 'Trainer', team: 'platform', job: { en: 'Holds the knowledge and rules every agent reads.', es: 'Guarda el conocimiento y las reglas que lee cada agente.' } }
];
const AGENT_IDS = AGENTS.map((a) => a.id);

const POST_STATUSES = ['idea', 'script', 'filmed', 'editing', 'edited', 'approved', 'posted'];
// Dashboard pipeline columns (the mockup's Planned / Filmed / Editing / Ready to Post).
const PIPELINE = [
  { id: 'planned', label: { en: 'Planned', es: 'Planeado' }, statuses: ['idea', 'script'] },
  { id: 'filmed', label: { en: 'Filmed', es: 'Grabado' }, statuses: ['filmed'] },
  { id: 'editing', label: { en: 'Editing', es: 'En edición' }, statuses: ['editing', 'edited'] },
  { id: 'ready', label: { en: 'Ready to Post', es: 'Listo para publicar' }, statuses: ['approved'] }
];
const PURPOSES = ['grow', 'connect', 'sell'];
const EFFORTS = ['low', 'medium', 'high'];
const FORMATS = ['talking_head', 'screen_record', 'voiceover', 'grwm', 'haul', 'tutorial', 'story', 'other'];
const DESTINATIONS = ['tiktok', 'instagram', 'facebook', 'youtube'];

// The nine default editing rules, verbatim in meaning from the brief.
const EDIT_RULES = [
  { code: 'hook', en: 'Start on the hook: the video begins on the first word of the hook, no dead space, never cutting off the first word.', es: 'Empieza en el gancho: el video arranca en la primera palabra del gancho, sin espacio muerto y sin cortar esa palabra.' },
  { code: 'takes', en: 'Mistakes and repeated takes: keep the clearest version, remove failed attempts and comments like "again", keep repetition meant for emphasis.', es: 'Errores y tomas repetidas: deja la versión más clara, quita los intentos fallidos y frases como "otra vez", conserva la repetición intencional.' },
  { code: 'filler', en: 'Filler words: remove uh, ah and um when it can be done naturally; keep words that add meaning, emotion or personality.', es: 'Muletillas: quita eh, ah y em cuando se pueda de forma natural; conserva lo que aporta sentido, emoción o personalidad.' },
  { code: 'pacing', en: 'Pauses and pacing: trim long silences, keep breaths and short pauses that help the message land.', es: 'Pausas y ritmo: recorta silencios largos, conserva respiraciones y pausas cortas que ayudan al mensaje.' },
  { code: 'cuts', en: 'Smooth cuts: never cut words, syllables or sentence endings; choose smoothness over removing a filler.', es: 'Cortes suaves: nunca cortes palabras, sílabas ni finales de frase; prefiere la suavidad a quitar una muletilla.' },
  { code: 'message', en: 'Respect the message: no invented sentences, generated voice, replaced words, sped-up voice or changed tone.', es: 'Respeta el mensaje: sin frases inventadas, voz generada, palabras reemplazadas, voz acelerada ni cambio de tono.' },
  { code: 'base_only', en: 'Base edit only by default: captions, music, zooms, effects, overlays and B-roll only when requested or in the style profile.', es: 'Solo edición base por defecto: subtítulos, música, zooms, efectos y B-roll solo si se piden o están en tu perfil de estilo.' },
  { code: 'ending', en: 'Ending: keep the full final sentence and call to action; remove extra time after you finish.', es: 'Final: conserva la última frase completa y el llamado a la acción; quita el tiempo sobrante.' },
  { code: 'review', en: 'Review before export: hook, best takes, cut-off words, audio flow, full message, audio and video sync.', es: 'Revisa antes de exportar: gancho, mejores tomas, palabras cortadas, flujo de audio, mensaje completo y sincronía.' }
];

// The five-second review checklist, as issue codes for "this keeps happening".
const REVIEW_ISSUES = [
  { code: 'hook_late', en: 'The hook does not start immediately', es: 'El gancho no empieza de inmediato', rule_en: 'All videos must begin on the first word of the hook, with zero dead space.', rule_es: 'Todos los videos deben empezar en la primera palabra del gancho, sin espacio muerto.' },
  { code: 'pause_left', en: 'A strange pause was left in', es: 'Quedó una pausa rara', rule_en: 'Trim every silence longer than a natural breath.', rule_es: 'Recorta todo silencio más largo que una respiración natural.' },
  { code: 'filler_left', en: 'An obvious filler word remains', es: 'Quedó una muletilla evidente', rule_en: 'Remove every uh, ah and um unless removing it makes an abrupt cut.', rule_es: 'Quita cada eh, ah y em salvo que quitarla deje un corte brusco.' },
  { code: 'wrong_take', en: 'The best take was not chosen', es: 'No se eligió la mejor toma', rule_en: 'When a line is repeated, always keep the last complete take unless it is clearly worse.', rule_es: 'Cuando una frase se repite, deja siempre la última toma completa salvo que sea claramente peor.' },
  { code: 'rough_cut', en: 'A cut does not feel natural', es: 'Un corte no se siente natural', rule_en: 'Never cut inside a word or a sentence ending; prefer a slightly longer clip.', rule_es: 'Nunca cortes dentro de una palabra o un final de frase; prefiere un clip un poco más largo.' }
];
const ISSUE_RULE_THRESHOLD = 3;

// Lead-filtering red flags from the brief, detected deterministically.
const RED_FLAGS = [
  { code: 'unverified_sender', en: 'Brand or sender cannot be verified', es: 'No se puede verificar la marca o el remitente' },
  { code: 'vague_offer', en: 'Vague offer with no clear deliverables or budget', es: 'Oferta vaga sin entregables ni presupuesto claros' },
  { code: 'upfront_payment', en: 'Asks you to pay something upfront', es: 'Te pide pagar algo por adelantado' },
  { code: 'domain_mismatch', en: 'Sender email domain does not match the brand', es: 'El dominio del correo no coincide con la marca' }
];

// Caption limits per platform (characters), used to trim — never rewrite — a caption.
const CAPTION_LIMITS = { tiktok: 2200, instagram: 2200, facebook: 5000, youtube: 5000 };

const ADDONS = ['research', 'business', 'picks', 'course'];

module.exports = {
  AGENTS, AGENT_IDS, POST_STATUSES, PIPELINE, PURPOSES, EFFORTS, FORMATS, DESTINATIONS,
  EDIT_RULES, REVIEW_ISSUES, ISSUE_RULE_THRESHOLD, RED_FLAGS, CAPTION_LIMITS, ADDONS
};
