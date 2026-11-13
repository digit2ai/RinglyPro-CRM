#!/usr/bin/env node
'use strict';

/**
 * PACC-CFL guided-tour narration — Spanish + Tagalog.
 *
 * The English segments (public/pacccfl/audio/lina-*.mp3) were generated once via
 * ElevenLabs and are LEFT UNTOUCHED by this script. Spanish and Tagalog are
 * synthesized with the repo's zero-key Microsoft Edge neural TTS
 * (src/services/edge-tts.js) -> $0, no API key, no account.
 *
 * Output:
 *   public/pacccfl/audio/es/lina-1..7.mp3   (es-US-PalomaNeural)
 *   public/pacccfl/audio/tl/lina-1..7.mp3   (fil-PH-BlessicaNeural)
 *
 * Usage:
 *   node scripts/generate-pacccfl-audio.js            # both languages, skips existing
 *   node scripts/generate-pacccfl-audio.js --force    # regenerate everything
 *   node scripts/generate-pacccfl-audio.js --lang=es  # one language only
 */

const fs = require('fs');
const path = require('path');
const edgeTts = require('../src/services/edge-tts');

const OUT_ROOT = path.join(__dirname, '..', 'public', 'pacccfl', 'audio');

const VOICES = {
  es: 'es-US-PalomaNeural',      // US Spanish female — the Central Florida audience
  tl: 'fil-PH-BlessicaNeural'    // Filipino female
};

// One entry per section of the page, in the order the orb walks them.
// Text mirrors the on-page copy for that section (hero, ecosystem, flow,
// modules, how, technology, access).
const SEGMENTS = [
  {
    n: 1,
    es: 'Bienvenido a PACC-CFL, la Cámara de Comercio Filipino Americana de la Florida Central. Negocios, no solo networking. Este es el ecosistema digital que conecta a la comunidad empresarial filipino americana y convierte las conexiones en negocios reales.',
    tl: 'Maligayang pagdating sa PACC-CFL, ang Philippine American Chamber of Commerce of Central Florida. Negosyo, hindi lang networking. Ito ang digital na ekosistema na nag-uugnay sa komunidad ng negosyong Filipino-American at ginagawang tunay na negosyo ang mga koneksiyon.'
  },
  {
    n: 2,
    es: 'PACC-CFL funciona sobre CamaraVirtual, un ecosistema digital de integración estratégica. No es un directorio estático ni una simple asociación: es una red viva donde miembros, empresas e instituciones se descubren, comercian y ejecutan proyectos reales, con gobernanza transparente e inteligencia artificial. Del registro a tu primer match de negocio en menos de cinco minutos.',
    tl: 'Tumatakbo ang PACC-CFL sa CamaraVirtual, isang digital na ekosistema para sa estratehikong integrasyon. Hindi ito static na direktoryo o simpleng asosasyon: ito ay buhay na network kung saan nagkakatuklasan, nagkakalakalan, at nagsasagawa ng tunay na proyekto ang mga miyembro, kompanya, at institusyon, nang may transparent na pamamahala at artificial intelligence. Mula sa pagrehistro hanggang sa iyong unang business match sa wala pang limang minuto.'
  },
  {
    n: 3,
    es: 'Así se mueve el ecosistema. Un miembro verificado publica una necesidad. La inteligencia artificial encuentra la contraparte en segundos. Nace un proyecto con equipo por roles. La simulación Monte Carlo valida el riesgo antes de comprometer recursos. El Intercambio genera la cotización, y el negocio queda cerrado. Lo que antes tomaba semanas, el ecosistema lo coordina en minutos.',
    tl: 'Ganito gumagalaw ang ekosistema. Isang beripikadong miyembro ang nagpo-post ng pangangailangan. Nahahanap ng artificial intelligence ang katapat sa ilang segundo. Nabubuo ang proyekto na may koponan ayon sa tungkulin. Vina-validate ng Monte Carlo simulation ang panganib bago magtalaga ng rekurso. Sa Palitan nabubuo ang quote, at nasasara ang negosyo. Ang dating tumatagal nang linggo, kino-coordinate ng ekosistema sa minuto.'
  },
  {
    n: 4,
    es: 'El panel del miembro reúne nueve módulos integrados. Dashboard con los índices de la red en tiempo real. Bandeja de mensajes entre miembros. Tu perfil verificado con Trust Score. Directorio filtrable por sector y región. AI Match en lenguaje natural. Tus búsquedas guardadas. Proyectos con equipos por roles. Invitaciones. Y el Intercambio, el mercado de cotizaciones de la red.',
    tl: 'Siyam na integratadong module ang nasa dashboard ng miyembro. Dashboard na may mga indeks ng network sa real time. Inbox para sa mensahe sa pagitan ng mga miyembro. Ang iyong beripikadong profile na may Trust Score. Direktoryo na masasala ayon sa sektor at rehiyon. AI Match sa natural na wika. Mga naka-save na paghahanap. Mga proyekto na may koponan ayon sa tungkulin. Mga imbitasyon. At ang Palitan, ang pamilihan ng quotation ng network.'
  },
  {
    n: 5,
    es: 'Del registro a tu primer negocio, en seis pasos. Uno: crea tu perfil por sector y región. Dos: abre el dashboard. Tres: usa AI Match. Cuatro: publica o responde cotizaciones en el Intercambio. Cinco: lanza proyectos validados con Monte Carlo. Seis: crece con confianza medible.',
    tl: 'Mula sa pagrehistro hanggang sa iyong unang negosyo, sa anim na hakbang. Una: gumawa ng profile ayon sa sektor at rehiyon. Ikalawa: buksan ang dashboard. Ikatlo: gamitin ang AI Match. Ikaapat: mag-post o sumagot ng quotation sa Palitan. Ikalima: maglunsad ng proyektong na-validate ng Monte Carlo. Ikaanim: lumago nang may nasusukat na tiwala.'
  },
  {
    n: 6,
    es: 'Debajo hay infraestructura seria. Orquestador MCP, coeficiente de Gini, matching con inteligencia artificial, simulación Monte Carlo, algoritmo TrustRank y pruebas de conocimiento cero. Modelos de inteligencia artificial junto a algoritmos de teoría de juegos, para optimizar recursos, calcular confianza y simular escenarios antes de comprometer un solo dólar.',
    tl: 'May seryosong imprastraktura sa ilalim nito. MCP Orchestrator, Gini coefficient, AI matching, Monte Carlo simulation, TrustRank algorithm, at Zero-Knowledge Proofs. Pinagsasama ang mga modelo ng artificial intelligence at mga algorithm ng game theory para i-optimize ang rekurso, kalkulahin ang tiwala, at gayahin ang mga senaryo bago magtalaga ng kahit isang dolyar.'
  },
  {
    n: 7,
    es: 'Entra al ecosistema digital. Súmate a la red, crea tu perfil verificado y haz tu primer match de negocio en menos de cinco minutos. PACC-CFL te espera en CamaraVirtual.',
    tl: 'Pumasok sa digital na ekosistema. Sumali sa network, gumawa ng iyong beripikadong profile, at gawin ang iyong unang business match sa wala pang limang minuto. Naghihintay ang PACC-CFL sa CamaraVirtual.'
  }
];

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const only = (args.find(a => a.startsWith('--lang=')) || '').split('=')[1];
  const langs = only ? [only] : Object.keys(VOICES);

  for (const lang of langs) {
    const voice = VOICES[lang];
    if (!voice) { console.error(`Unknown language "${lang}"`); process.exitCode = 1; continue; }

    const dir = path.join(OUT_ROOT, lang);
    fs.mkdirSync(dir, { recursive: true });
    console.log(`\n[${lang}] voice=${voice} -> ${dir}`);

    for (const seg of SEGMENTS) {
      const out = path.join(dir, `lina-${seg.n}.mp3`);
      if (fs.existsSync(out) && !force) { console.log(`  lina-${seg.n}.mp3  skip (exists)`); continue; }
      const text = seg[lang];
      if (!text) { console.error(`  lina-${seg.n}  MISSING ${lang} text`); process.exitCode = 1; continue; }
      try {
        const buf = await edgeTts.synthesize(text, { voice, rate: '-2%' });
        fs.writeFileSync(out, buf);
        console.log(`  lina-${seg.n}.mp3  ok (${(buf.length / 1024).toFixed(0)} KB)`);
      } catch (e) {
        console.error(`  lina-${seg.n}.mp3  FAILED: ${e.message}`);
        process.exitCode = 1;
      }
    }
  }
  console.log('\nDone.');
}

main().catch(e => { console.error(e); process.exit(1); });
