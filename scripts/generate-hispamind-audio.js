#!/usr/bin/env node
// Generate Lily (Spanish Storyteller) narration MP3s for CamaraVirtual.app presentation
// Voice: Lily - Spanish Storyteller (zl7szWVBXnpgrJmAalgz)

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');

const API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = 'zl7szWVBXnpgrJmAalgz';
const MODEL_ID = 'eleven_multilingual_v2';
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'chamber', 'hispamind', 'assets', 'audio');

const slides = [
  {
    file: 'hispamind-01.mp3',
    text: 'CamaraVirtual punto app. Ecosistema Digital. El motor B2B con Inteligencia Neural para Camaras de Comercio. Impulsado por Digit2AI.'
  },
  {
    file: 'hispamind-02.mp3',
    text: 'Un mundo hispano conectado. Mas de seiscientos millones de hispanohablantes. Una plataforma. CamaraVirtual punto app nace para conectar empresarios hispanohablantes de todo el mundo. Desde Mexico hasta Argentina, desde Madrid hasta Miami, emprendedores de habla hispana crecen juntos bajo una misma plataforma digital con inteligencia artificial.'
  },
  {
    file: 'hispamind-03.mp3',
    text: 'Las conexiones existen. La infraestructura no. Cero por ciento de seguimiento de resultados. Presentaciones manuales. ROI de membresia imposible de demostrar. Directorios en Excel. Sin seguimiento de resultados. Las relaciones son reales. Las herramientas no.'
  },
  {
    file: 'hispamind-04.mp3',
    text: 'La solucion. Una plataforma. Nueve modulos. Veinticuatro sectores. Seis regiones. Siempre activa. CamaraVirtual punto app es la columna vertebral digital que conecta a cada emprendedor, profesional y empresa hispanohablante del mundo.'
  },
  {
    file: 'hispamind-05.mp3',
    text: 'Seis modulos por desbloquear. Seis modulos centrales que impulsan el Ecosistema Digital de CamaraVirtual punto app. Panel de Control, Matching con Inteligencia Artificial, Proyectos, Intercambio Comercial, Analitica de Red y el Orquestador MCP. Vamos a desbloquearlos uno por uno.'
  },
  {
    file: 'hispamind-07.mp3',
    text: 'Modulo uno. Panel de Control. Tu centro de mando. Conoce el estado de tu red de un vistazo. Sin hojas de calculo, sin suposiciones, sin esperar reportes trimestrales. Conteo de miembros activos en tiempo real, pipeline de proyectos abiertos, actividad de cotizaciones y el Indice de Salud HCI que mide la vitalidad general de tu camara.'
  },
  {
    file: 'hispamind-09.mp3',
    text: 'Modulo dos. Matching de Negocios con Inteligencia Artificial. Necesito un socio de logistica en Mexico para exportar a Europa. La IA encuentra el mejor match en segundos, rankeado por scores de confianza y afinidad sectorial. Similaridad Coseno mide que tan alineados estan dos perfiles. La Correccion de Equidad Gini asegura distribucion equitativa de oportunidades. Y los Scores de Confianza proporcionan resultados confiables basados en historial real.'
  },
  {
    file: 'hispamind-11.mp3',
    text: 'Modulo tres. Colaboracion en Proyectos. Seis fases de ciclo de vida. Viabilidad basada en datos. Equipos inter-regionales. Propuesta, Analisis, Equipo, Recursos, Ejecucion, Completado. Cada proyecto pasa por diez mil iteraciones de simulacion Monte Carlo antes de comprometer un solo dolar. La IA conecta habilidades desde Mexico, Colombia, Argentina, Espana o Estados Unidos con las necesidades del proyecto. Gobernanza transparente. Todos ven los mismos datos.'
  },
  {
    file: 'hispamind-13.mp3',
    text: 'Modulo cuatro. Intercambio Comercial. Un marketplace privado exclusivamente para miembros de CamaraVirtual punto app. Publica cotizaciones, navega el directorio de empresas, envia propuestas y gestiona ofertas dentro de tu red de confianza. Cotizaciones y propuestas entre empresas verificadas. Directorio buscable y siempre actualizado. Gestion de ofertas con criterios de evaluacion. Y financiamiento seguro con fideicomiso Stripe.'
  },
  {
    file: 'hispamind-15.mp3',
    text: 'Modulos cinco y seis. Analitica de Red y Orquestador MCP. Seis herramientas tecnologicas que hacen la diferencia. Motor de Matching con Inteligencia Artificial. TrustRank inspirado en PageRank. Simulacion Monte Carlo de diez mil iteraciones. Orquestador MCP con siete herramientas. Indice Compuesto HCI. Y Correccion de Equidad Gini. Todo impulsado por Digit2AI Neural Intelligence.'
  },
  {
    file: 'hispamind-16.mp3',
    text: 'Tus datos son tuyos. Aislamiento total. Sin fugas de datos. Sin analitica compartida. Catorce tablas privadas con prefijo hispamind. Autenticacion JWT separada. Tus tokens, tus sesiones, tu control de acceso, independiente de cualquier otra camara. Analitica independiente. Tus modelos de IA entrenan solo con tus datos. Tus insights permanecen privados. Ninguna otra camara puede ver tus datos.'
  },
  {
    file: 'hispamind-17.mp3',
    text: 'Nivel de Poder cien. Todos los modulos activados. El Ecosistema Digital de CamaraVirtual punto app esta completamente en linea. Panel de Control, Matching con IA, Proyectos, Intercambio Comercial, Analitica de Red y Orquestador MCP. Seis modulos desbloqueados. Ecosistema totalmente activado.'
  },
  {
    file: 'hispamind-18.mp3',
    text: 'El plan. Veinticinco dolares de configuracion inicial mas diez dolares por mes. Acceso total. Los nueve modulos completos. Cancela cuando quieras. Matching de Negocios con IA, Panel de Control, Colaboracion en Proyectos, Intercambio Comercial, Analitica de Red, Orquestador MCP, Scoring TrustRank, Simulacion Monte Carlo, Pagos seguros con Stripe y Asistente de Voz con IA disponible las veinticuatro horas.'
  },
  {
    file: 'hispamind-19.mp3',
    text: 'Tres pasos para activar tu cuenta hoy. Paso uno: registrate en el portal. Crea tu perfil en CamaraVirtual punto app, toma menos de tres minutos. Paso dos: completa tu perfil. Agrega tu sector, habilidades, ubicacion y lo que estas buscando. El motor de matching se activa inmediatamente. Paso tres: ejecuta tu primer match con IA. En minutos, recibe tu primera conexion de negocios curada por inteligencia artificial. Visita CamaraVirtual punto app y activa el ecosistema digital.'
  },
  {
    file: 'hispamind-20.mp3',
    text: 'CamaraVirtual punto app. Tu Camara. Tus Datos. Tu Crecimiento. Impulsado por Digit2AI. Camara de Comercio Digital para el Mundo Hispano. Gracias.'
  }
];

async function generateAudio(text, outputPath) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      text,
      model_id: MODEL_ID,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.4,
        use_speaker_boost: true
      }
    });

    const options = {
      hostname: 'api.elevenlabs.io',
      path: `/v1/text-to-speech/${VOICE_ID}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': API_KEY,
        'Accept': 'audio/mpeg'
      }
    };

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${body}`)));
        return;
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        fs.writeFileSync(outputPath, buffer);
        resolve(buffer.length);
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log(`Generating ${slides.length} audio files with Lily Spanish Storyteller...`);
  console.log(`Output: ${OUTPUT_DIR}\n`);

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const outputPath = path.join(OUTPUT_DIR, slide.file);

    // Skip if already exists
    if (fs.existsSync(outputPath)) {
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
