#!/usr/bin/env node
// Generate Lily's narration MP3s for the CamaraVirtual.app presentation.
//
// Voice engine: Microsoft Edge neural TTS via src/services/edge-tts.js — the
// same zero-key engine behind /api/tts/edge and the voice orb. This script used
// to call api.elevenlabs.io with ELEVENLABS_API_KEY; the character quota and the
// key are gone, the narrator is unchanged in name and role.
//
// Lily = es-MX-DaliaNeural, slowed slightly so a presentation reads calmly.
// Re-run after editing any slide text:
//   node scripts/generate-hispamind-audio.js --force
// (--force overwrites existing files; without it, existing MP3s are kept.)

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const edgeTts = require('../src/services/edge-tts');

const VOICE = process.env.HISPAMIND_VOICE || 'es-MX-DaliaNeural';
const RATE = process.env.HISPAMIND_RATE || '-6%';
const FORCE = process.argv.includes('--force');
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'chamber', 'hispamind', 'assets', 'audio');

const slides = [
  {
    file: 'hispamind-01.mp3',
    text: 'CámaraVirtual punto app. Ecosistema Digital. El motor B2B con Inteligencia Neural para Cámaras de Comercio. Impulsado por Digit2AI.'
  },
  {
    file: 'hispamind-02.mp3',
    text: 'Un mundo hispano conectado. Más de seiscientos millones de hispanohablantes. Una plataforma. CámaraVirtual punto app nace para conectar empresarios hispanohablantes de todo el mundo. Desde México hasta Argentina, desde Madrid hasta Miami, emprendedores de habla hispana crecen juntos bajo una misma plataforma digital con inteligencia artificial.'
  },
  {
    file: 'hispamind-03.mp3',
    text: 'Las conexiones existen. La infraestructura no. Cero por ciento de seguimiento de resultados. Presentaciones manuales. ROI de membresía imposible de demostrar. Directorios en Excel. Sin seguimiento de resultados. Las relaciones son reales. Las herramientas no.'
  },
  {
    file: 'hispamind-04.mp3',
    text: 'La solución. Una plataforma. Nueve módulos. Veinticuatro sectores. Seis regiones. Siempre activa. CámaraVirtual punto app es la columna vertebral digital que conecta a cada emprendedor, profesional y empresa hispanohablante del mundo.'
  },
  {
    file: 'hispamind-05.mp3',
    text: 'Seis módulos por desbloquear. Seis módulos centrales que impulsan el Ecosistema Digital de CámaraVirtual punto app. Panel de Control, Matching con Inteligencia Artificial, Proyectos, Intercambio Comercial, Analítica de Red y el Orquestador MCP. Vamos a desbloquearlos uno por uno.'
  },
  {
    file: 'hispamind-07.mp3',
    text: 'Módulo uno. Panel de Control. Tu centro de mando. Conoce el estado de tu red de un vistazo. Sin hojas de cálculo, sin suposiciones, sin esperar reportes trimestrales. Conteo de miembros activos en tiempo real, pipeline de proyectos abiertos, actividad de cotizaciones y el Índice de Salud HCI que mide la vitalidad general de tu cámara.'
  },
  {
    file: 'hispamind-09.mp3',
    text: 'Módulo dos. Matching de Negocios con Inteligencia Artificial. Necesito un socio de logística en México para exportar a Europa. La IA encuentra el mejor match en segundos, rankeado por scores de confianza y afinidad sectorial. Similaridad Coseno mide qué tan alineados están dos perfiles. La Corrección de Equidad Gini asegura distribución equitativa de oportunidades. Y los Scores de Confianza proporcionan resultados confiables basados en historial real.'
  },
  {
    file: 'hispamind-11.mp3',
    text: 'Módulo tres. Colaboración en Proyectos. Seis fases de ciclo de vida. Viabilidad basada en datos. Equipos inter-regionales. Propuesta, Análisis, Equipo, Recursos, Ejecución, Completado. Cada proyecto pasa por diez mil iteraciones de simulación Monte Carlo antes de comprometer un solo dólar. La IA conecta habilidades desde México, Colombia, Argentina, España o Estados Unidos con las necesidades del proyecto. Gobernanza transparente. Todos ven los mismos datos.'
  },
  {
    file: 'hispamind-13.mp3',
    text: 'Módulo cuatro. Intercambio Comercial. Un marketplace privado exclusivamente para miembros de CámaraVirtual punto app. Publica cotizaciones, navega el directorio de empresas, envía propuestas y gestiona ofertas dentro de tu red de confianza. Cotizaciones y propuestas entre empresas verificadas. Directorio buscable y siempre actualizado. Gestión de ofertas con criterios de evaluación. Y financiamiento seguro con fideicomiso Stripe.'
  },
  {
    file: 'hispamind-15.mp3',
    text: 'Módulos cinco y seis. Analítica de Red y Orquestador MCP. Seis herramientas tecnológicas que hacen la diferencia. Motor de Matching con Inteligencia Artificial. TrustRank inspirado en PageRank. Simulación Monte Carlo de diez mil iteraciones. Orquestador MCP con siete herramientas. Índice Compuesto HCI. Y Corrección de Equidad Gini. Todo impulsado por Digit2AI Neural Intelligence.'
  },
  {
    file: 'hispamind-16.mp3',
    text: 'Tus datos son tuyos. Aislamiento total. Sin fugas de datos. Sin analítica compartida. Catorce tablas privadas con prefijo hispamind. Autenticación JWT separada. Tus tokens, tus sesiones, tu control de acceso, independiente de cualquier otra cámara. Analítica independiente. Tus modelos de IA entrenan solo con tus datos. Tus insights permanecen privados. Ninguna otra cámara puede ver tus datos.'
  },
  {
    file: 'hispamind-17.mp3',
    text: 'Nivel de Poder cien. Todos los módulos activados. El Ecosistema Digital de CámaraVirtual punto app está completamente en línea. Panel de Control, Matching con IA, Proyectos, Intercambio Comercial, Analítica de Red y Orquestador MCP. Seis módulos desbloqueados. Ecosistema totalmente activado.'
  },
  {
    file: 'hispamind-18.mp3',
    text: 'El plan. Veinticinco dólares de configuración inicial más diez dólares por mes. Acceso total. Los nueve módulos completos. Cancela cuando quieras. Matching de Negocios con IA, Panel de Control, Colaboración en Proyectos, Intercambio Comercial, Analítica de Red, Orquestador MCP, Scoring TrustRank, Simulación Monte Carlo, Pagos seguros con Stripe y Asistente de Voz con IA disponible las veinticuatro horas.'
  },
  {
    file: 'hispamind-19.mp3',
    text: 'Tres pasos para activar tu cuenta hoy. Paso uno: regístrate en el portal. Crea tu perfil en CámaraVirtual punto app, toma menos de tres minutos. Paso dos: completa tu perfil. Agrega tu sector, habilidades, ubicación y lo que estás buscando. El motor de matching se activa inmediatamente. Paso tres: ejecuta tu primer match con IA. En minutos, recibe tu primera conexión de negocios curada por inteligencia artificial. Visita CámaraVirtual punto app y activa el ecosistema digital.'
  },
  {
    // Bios taken verbatim in substance from the founders slide itself, so the
    // narration can never claim more than the page shows.
    file: 'hispamind-founders.mp3',
    text: 'Quiénes somos. Estamos aquí para empoderar tu cámara de comercio. María Clara García, fundadora de Visionarium punto app. Fundó Visionarium en dos mil quince en Nueva York como incubadora de Liderazgo y Creatividad para jóvenes latinoamericanos. Más de treinta años transformando jóvenes en líderes a través de mentoría bilingüe, programas Fellowship y comunidad global. Hoy lidera la expansión de Visionarium con sede en Miami, como puente entre América Latina y Estados Unidos. Numeriano Bouffard, fundador de la cámara piloto PACC-CFL. Fundó PACC-CFL en mil novecientos noventa y cinco y la convirtió en la principal red de negocios filipino-americana en Florida Central. Presidente de la Fundación FPACC. Más de tres décadas conectando emprendedores, facilitando comercio y promoviendo negocios internacionales. Manuel Stagg, arquitecto tecnológico y CEO de Digit2AI, la empresa que construye todo el ecosistema CámaraVirtual punto app: el motor de matching con inteligencia artificial, el orquestador MCP, la plataforma de analítica y los agentes de voz que impulsan esta presentación. Con sede en Tampa, Florida. Tu siguiente paso: habla con nosotros. Visita CámaraVirtual punto app. Estamos listos para ayudar a tu cámara a crecer.'
  },
  {
    file: 'hispamind-20.mp3',
    text: 'CámaraVirtual punto app. Tu Cámara. Tus Datos. Tu Crecimiento. Impulsado por Digit2AI. Cámara de Comercio Digital para el Mundo Hispano. Gracias.'
  }
];

async function generateAudio(text, outputPath) {
  const buffer = await edgeTts.synthesize(text, { voice: VOICE, rate: RATE });
  fs.writeFileSync(outputPath, buffer);
  return buffer.length;
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log(`Generating ${slides.length} audio files — Lily on Edge neural (${VOICE}, ${RATE})...`);
  console.log(`Output: ${OUTPUT_DIR}\n`);

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const outputPath = path.join(OUTPUT_DIR, slide.file);

    // Skip if already exists (unless --force)
    if (!FORCE && fs.existsSync(outputPath)) {
      const stat = fs.statSync(outputPath);
      if (stat.size > 1000) {
        console.log(`[${i+1}/${slides.length}] SKIP ${slide.file} (already exists, ${(stat.size/1024).toFixed(0)}KB)`);
        continue;
      }
    }

    try {
      console.log(`[${i+1}/${slides.length}] Generating ${slide.file}...`);
      const size = await generateAudio(slide.text, outputPath);
      console.log(`  OK - ${(size/1024).toFixed(0)}KB`);
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.error(`  FAIL - ${err.message}`);
    }
  }

  console.log('\nDone!');
}

main().catch(console.error);
