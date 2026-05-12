#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');

const API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // Lina - Sunny, Kind and Friendly (same voice as Cali deck)
const MODEL_ID = 'eleven_multilingual_v2';
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'delima-projects-audio');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const slides = [
  { file: 'slide-01.mp3', text: 'Cuatro proyectos. Un solo cerebro. Cuatro problemas distintos. Cuatro industrias. Una sola plataforma de inteligencia artificial Neural que los resuelve todos. Esta es la propuesta de Digit2AI para Eduardo Delima.' },
  { file: 'slide-02.mp3', text: 'Las cuatro oportunidades, de patrocinio deportivo a biodiésel. Proyecto uno: Deportivo Cali, ecosistema empresarial deportivo. Proyecto dos: Financiaplaning, planeación financiera integral. Proyecto tres: Canal de Empleo, inclusión laboral con inteligencia artificial. Proyecto cuatro: Aceites y biodiésel, energía alternativa con expansión a Florida. Un solo operador de inteligencia artificial los maneja todos.' },
  { file: 'slide-03.mp3', text: 'Qué es Digit2AI Neural. Tres capas: Neural, la capa de inteligencia que entiende contexto, intención y lógica de negocio. Agentes, la capa de ejecución que convierte inteligencia en acción a través de tus herramientas, datos y flujos. Y MCP, el protocolo que conecta hallazgos, contexto compartido y orquesta operaciones multi-paso entre agentes. No son chatbots. Son operadores que ven la situación, deciden, y ejecutan de extremo a extremo.' },
  { file: 'slide-04.mp3', text: 'Ocho agentes especialistas pre-construidos. Rachel, voice concierge. Ana, bilingüe español-inglés en sesenta segundos. Lina, nurturer de pipeline. Sentinel, salud del pipeline. Nova, reductor de no-shows. Vault, cazador de revenue leaks. Origin, auditor de retorno de inversión por fuente. Coach, revisor de conversiones. Cada proyecto reutiliza el mismo cerebro. Ahorras cuatro veces en construcción.' },
  { file: 'slide-05.mp3', text: 'Proyecto uno, el problema. El patrocinio deportivo no está digitalizado. Cuatro síntomas: sponsors gestionados manualmente, sin matching B2B entre empresas del ecosistema, retorno de inversión del patrocinio que no se mide digitalmente, y sin canal internacional para escalar el club. Decisiones tomadas por intuición.' },
  { file: 'slide-06.mp3', text: 'Proyecto uno, la solución Neural. Cámara de Comercio Deportiva Digital. Marketplace B2B más matching más ROI en tiempo real. Ana, voice agent en español e inglés, llama a sponsors potenciales. Recommendation Engine hace el matching sponsor-empresa por afinidad B2B. Predictive Analytics mide el retorno de inversión del patrocinio por canal y temporada. Y MCP Orchestration coordina activaciones, contratos y renovaciones. El flujo: detectar sponsor, diagnosticar encaje, prescribir activación, auto-fix outreach, verificar conversión.' },
  { file: 'slide-07.mp3', text: 'Proyecto dos, el problema. Planeación financiera fragmentada en Colombia. Cuatro síntomas: patrimonio, seguros, impuestos e inversiones operando en silos. Asesoría dispersa entre contador, broker, asesor y abogado sin coordinación. Sin motor de simulación de escenarios financieros. Y matching inversionista-proyecto que se hace de forma manual y relacional.' },
  { file: 'slide-08.mp3', text: 'Proyecto dos, la solución Neural. Motor de inteligencia artificial financiera. Un solo cerebro para patrimonio, pólizas, impuestos e inversiones. Conversational AI como asesor virtual integral veinticuatro siete. Agentes algorítmicos para simulación de escenarios financieros. Recommendation Engine para matching inversionista-proyecto automático. Y Compliance Layer con manejo de PII y datos bancarios bajo estándar SOC2. Sensitive data marcado como financiero y bancario desde el día uno.' },
  { file: 'slide-09.mp3', text: 'Proyecto tres, el problema. Miles de trabajadores invisibles para el canal digital. Cuatro síntomas: hojas Minerva físicas circulando en papel. Formularios manuscritos imposibles de buscar. Matching laboral manual y relacional. Y trabajadores informales excluidos por completo del canal digital de empleo.' },
  { file: 'slide-10.mp3', text: 'Proyecto tres, la solución Neural. Formalización laboral masiva. OCR más visión más matching igual inclusión basada en mérito. Document Understanding escanea la hoja Minerva y la convierte en perfil digital estructurado. Computer Vision interpreta letra manuscrita y firma. Recommendation Engine hace matching laboral inteligente por mérito. Y Ana, voice agent bilingüe, guía al trabajador en el llenado del perfil. El flujo: escanear Minerva, interpretar campos, estructurar perfil, match con vacantes, colocar en empleo formal.' },
  { file: 'slide-11.mp3', text: 'Proyecto cuatro, el problema. Reciclaje de aceite sin trazabilidad ni canal internacional. Cuatro síntomas: recolección gestionada de forma tradicional. Sin trazabilidad digital end-to-end del proveedor a la planta a la conversión a la venta. Expansión a Florida y Miami sin canal estructurado. Y alianzas motorsport sin matching industrial de oferta y demanda.' },
  { file: 'slide-12.mp3', text: 'Proyecto cuatro, la solución Neural. Energía alternativa digitalizada. Trazabilidad más matching industrial más reporte de sostenibilidad. Predictive Analytics hace forecast de volumen de recolección y rendimiento de conversión a biodiésel. MCP Integration conecta proveedores, plantas y compradores en Florida. Recommendation Engine hace matching con la red motorsport y los mercados de Florida y Miami. Y Generative AI produce reporte automático de CO2 evitado y huella de sostenibilidad. Diferenciador clave en mercados regulados.' },
  { file: 'slide-13.mp3', text: 'Por qué un solo cerebro: valor compuesto. Cuatro proyectos por un cerebro igual valor compuesto. Cada proyecto entrena el cerebro y el que sigue se construye más rápido y más barato. Deportivo Cali entrena el matching B2B y el ROI Analytics, reusable en Financiaplaning. Financiaplaning entrena la simulación y el matching financiero, reusable en Aceites. Canal de Empleo entrena el OCR y la visión, reusable en intake de cualquier vertical. Aceites entrena el matching industrial y el reporte de sostenibilidad, reusable en cualquier marketplace.' },
  { file: 'slide-14.mp3', text: 'Los cuatro proyectos en una tabla. Deportivo Cali: patrocinio no digitalizado, solución marketplace B2B más ROI Analytics más Ana. Financiaplaning: asesoría financiera fragmentada, solución motor de IA financiera más simulación más matching. Canal de Empleo: hojas Minerva físicas, solución OCR más visión más matching laboral. Aceites y biodiésel: reciclaje sin trazabilidad, solución Predictive Analytics más MCP Industrial más reporte de CO2.' },
  { file: 'slide-15.mp3', text: 'Cómo se entrega. Construido, desplegado, gobernado, observado. Build: workflows más voz más knowledge base con editor no-code y SDK para los técnicos. Deploy: voz, web, SMS, WhatsApp, API y MCP, todo en multi-canal. Govern: control de acceso por roles, multi-tenant y audit log estilo SOC2. Observe: dashboards de KPIs, transcripciones completas y retorno de inversión por cada agente. Misma plataforma, cuatro proyectos, cuatro fechas de despliegue independientes.' },
  { file: 'slide-16.mp3', text: 'Próximos pasos. De conversación a producción en semanas, no meses. Semana uno: kickoff de Zoom y captura de requerimientos. Semana dos: plan firmado y contrato emitido. Semanas tres a seis: build del primer proyecto, Eduardo elige cuál. Mes dos en adelante: los otros tres proyectos en paralelo. Cuatro proyectos. Un solo cerebro. Una sola plataforma. Listos para arrancar cuando tú lo estés. Escríbenos a mstagg arroba digit2ai punto com.' }
];

async function generateAudio(text, outputPath) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      text,
      model_id: MODEL_ID,
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true }
    });
    const options = {
      hostname: 'api.elevenlabs.io',
      path: `/v1/text-to-speech/${VOICE_ID}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': API_KEY, 'Accept': 'audio/mpeg' }
    };
    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        let body = ''; res.on('data', d => body += d);
        res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${body}`)));
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        fs.writeFileSync(outputPath, Buffer.concat(chunks));
        resolve();
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

(async () => {
  if (!API_KEY) {
    console.error('ELEVENLABS_API_KEY missing in .env');
    process.exit(1);
  }
  console.log(`Generating ${slides.length} audio files in ${OUTPUT_DIR}`);
  console.log(`Voice ID: ${VOICE_ID} (Lina)`);
  console.log('');

  for (let i = 0; i < slides.length; i++) {
    const { file, text } = slides[i];
    const outPath = path.join(OUTPUT_DIR, file);
    if (fs.existsSync(outPath) && process.argv.indexOf('--force') === -1) {
      console.log(`[${i+1}/${slides.length}] ${file} already exists, skipping (use --force to regenerate)`);
      continue;
    }
    process.stdout.write(`[${i+1}/${slides.length}] ${file} ... `);
    try {
      await generateAudio(text, outPath);
      const size = (fs.statSync(outPath).size / 1024).toFixed(1);
      console.log(`OK (${size} KB)`);
    } catch (e) {
      console.log(`FAILED: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 400)); // rate limit gap
  }
  console.log('');
  console.log('Done.');
})();
