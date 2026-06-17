'use strict';

/**
 * MÓDULO RIZAL — section content (RZ.1–RZ.5).
 *
 * Reading texts are PUBLIC-DOMAIN Spanish originals (Noli Me Tángere 1887,
 * El Filibusterismo 1891, Mi último adiós 1896) or app-generated GRADED
 * ADAPTATIONS, each labeled with `provenance`. No third-party copyrighted
 * editions/translations. Explanations are in en/fil; the Spanish target text
 * stays Spanish (wrapped in ⟦es⟧…⟦es⟧ for TTS smart-split).
 */

module.exports = [
  {
    key: 'rz1',
    cefr: 'B1',
    title_en: 'Life & Historical Context',
    title_fil: 'Buhay at Konteksto sa Kasaysayan',
    intro_en: 'José Rizal (1861–1896) was a Filipino polymath — physician, novelist, and reformist — whose Spanish-language writing helped awaken a national consciousness. Read graded Spanish about his life.',
    intro_fil: 'Si José Rizal (1861–1896) ay isang Pilipinong polymath — manggagamot, nobelista, at repormista — na ang mga akdang Espanyol ay tumulong gisingin ang kamalayang pambansa. Basahin ang gradadong Espanyol tungkol sa kanyang buhay.',
    reading: {
      provenance: 'graded_adaptation',
      text_es: '⟦es⟧José Rizal nació en Calamba en 1861. Estudió en Manila y en Europa, donde aprendió muchos idiomas. Escribió en español para defender a su pueblo. Con sus libros, despertó la conciencia de los filipinos.⟦es⟧',
      note_en: 'Graded adaptation written for B1 learners.',
      note_fil: 'Gradadong adaptasyon para sa mga mag-aaral na B1.',
    },
  },
  {
    key: 'rz2',
    cefr: 'B1-B2',
    title_en: 'Noli Me Tángere (graded excerpts)',
    title_fil: 'Noli Me Tángere (gradadong sipi)',
    intro_en: 'Rizal\'s 1887 novel exposed colonial abuses. Below: the public-domain Spanish opening, then a graded adaptation.',
    intro_fil: 'Inilantad ng nobelang ito (1887) ang mga pang-aabuso. Sa ibaba: ang Espanyol na pambungad (public domain), at isang gradadong adaptasyon.',
    reading: {
      provenance: 'public_domain_original',
      source: 'Noli Me Tángere, José Rizal, 1887 (dominio público)',
      text_es: '⟦es⟧Reuníase a fines de octubre don Santiago de los Santos, conocido popularmente bajo el nombre de Capitán Tiago, a dar una cena que, aunque anunciada aquella tarde tan sólo, era ya el tema de todas las conversaciones.⟦es⟧',
      adaptation_es: '⟦es⟧A finales de octubre, el Capitán Tiago dio una cena. Aunque la anunció esa misma tarde, ya todos hablaban de ella.⟦es⟧',
      note_en: 'First the 1887 original (public domain), then a simplified graded version.',
      note_fil: 'Una ang orihinal na 1887 (public domain), pagkatapos ang pinasimpleng bersyon.',
    },
  },
  {
    key: 'rz3',
    cefr: 'B2',
    title_en: 'El Filibusterismo (graded excerpts)',
    title_fil: 'El Filibusterismo (gradadong sipi)',
    intro_en: 'The 1891 sequel is darker and more political. Read the public-domain opening, then a graded adaptation.',
    intro_fil: 'Mas madilim at mas politikal ang sumunod na nobela (1891). Basahin ang pambungad (public domain), at ang gradadong adaptasyon.',
    reading: {
      provenance: 'public_domain_original',
      source: 'El Filibusterismo, José Rizal, 1891 (dominio público)',
      text_es: '⟦es⟧Una mañana de diciembre el vapor Tabo subía penosamente el tortuoso curso del Pásig, llevando numerosos pasajeros hacia la provincia de la Laguna.⟦es⟧',
      adaptation_es: '⟦es⟧Una mañana de diciembre, el vapor Tabo subía despacio por el río Pásig. Llevaba muchos pasajeros hacia la Laguna.⟦es⟧',
      note_en: 'First the 1891 original (public domain), then a simplified graded version.',
      note_fil: 'Una ang orihinal na 1891 (public domain), pagkatapos ang pinasimpleng bersyon.',
    },
  },
  {
    key: 'rz4',
    cefr: 'B1',
    title_en: 'Rizal the Polyglot & the Five-Roots Method',
    title_fil: 'Si Rizal na Polyglot at ang Limang-Ugat na Pamamaraan',
    intro_en: 'Rizal reportedly learned languages by studying a handful of root words each night — the very method this app uses (five roots a night → ~1,800 a year).',
    intro_fil: 'Natuto raw si Rizal ng mga wika sa pamamagitan ng ilang salitang-ugat bawat gabi — ang mismong pamamaraan ng app na ito (limang ugat bawat gabi → ~1,800 bawat taon).',
    reading: {
      provenance: 'graded_adaptation',
      text_es: '⟦es⟧Rizal hablaba muchos idiomas. Cada noche aprendía algunas palabras nuevas. Poco a poco, con paciencia, llegó a dominar muchas lenguas. Así también aprendes tú: cinco raíces cada noche.⟦es⟧',
      note_en: 'Meta-lesson connecting Rizal\'s method to the Cinco Raíces engine.',
      note_fil: 'Aralin na nag-uugnay sa pamamaraan ni Rizal sa makinang Cinco Raíces.',
    },
  },
  {
    key: 'rz5',
    cefr: 'B1-B2',
    title_en: 'Legacy & National Significance',
    title_fil: 'Pamana at Kahalagahang Pambansa',
    intro_en: 'Executed in 1896, Rizal became the Philippines\' national hero. His farewell poem, Mi último adiós, is public domain.',
    intro_fil: 'Binitay noong 1896, naging pambansang bayani ng Pilipinas si Rizal. Ang kanyang huling tula, Mi último adiós, ay public domain.',
    reading: {
      provenance: 'public_domain_original',
      source: 'Mi último adiós, José Rizal, 1896 (dominio público)',
      text_es: '⟦es⟧Adiós, Patria adorada, región del sol querida, perla del mar de oriente, nuestro perdido Edén.⟦es⟧',
      note_en: 'Opening lines of Rizal\'s farewell poem (public domain).',
      note_fil: 'Pambungad na taludtod ng huling tula ni Rizal (public domain).',
    },
  },
];
