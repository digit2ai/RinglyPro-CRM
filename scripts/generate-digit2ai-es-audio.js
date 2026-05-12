#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');

const API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = 'VmejBeYhbrcTPwDniox7'; // Lina - Sunny, Kind and Friendly (Spanish voice)
const MODEL_ID = 'eleven_multilingual_v2';
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'digit2ai-es-audio');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const slides = [
  { file: 'slide-01.mp3', text: 'Bienvenidos a Digit2AI Neural. La plataforma de operadores de inteligencia artificial nativa de MCP para todo negocio. Encuentra las fugas de dinero. Repáralas automáticamente. Toca Iniciar o pulsa Reproducir para comenzar la presentación.' },
  { file: 'slide-02.mp3', text: 'Entonces, ¿qué es realmente Digit2AI Neural? Considéralo una plataforma para construir operadores de inteligencia artificial para tu negocio. No solo asistentes, sino sistemas capaces de cuatro cosas. Entienden los flujos de trabajo, tal como tu equipo trabaja realmente. Toman decisiones en contexto, leen la situación antes de actuar. Ejecutan procesos multi-paso de principio a fin. Y operan partes del negocio de forma autónoma, sin un humano interviniendo en cada paso.' },
  { file: 'slide-03.mp3', text: 'Neural es la capa de inteligencia. Inspirada en redes neuronales, entiende contexto, intención y lógica de negocio, y mejora con el tiempo. La capa de agentes es la capa de ejecución. Convierte la inteligencia en acción a través de tus herramientas, tus datos y tus flujos. Y el protocolo MCP es lo que las une, enrutando hallazgos, transportando contexto compartido y orquestando operaciones multi-paso. Juntos producen agentes que no solo responden preguntas. Gestionan interacciones, califican datos, activan acciones entre sistemas y coordinan de extremo a extremo.' },
  { file: 'slide-04.mp3', text: 'Aquí está la diferencia clave. La automatización tradicional está basada en reglas. Flujos estáticos. Se rompe en cuanto la realidad se complica. Los agentes Neural son distintos. Conscientes del contexto. Adaptativos. Orientados a decisiones. No solo siguen reglas, operan flujos completos. El resultado: eliminan cuellos de botella, reducen la dependencia manual, aumentan velocidad y consistencia, y el negocio escala sin contratar más personal.' },
  { file: 'slide-05.mp3', text: 'Todo negocio pierde dinero cada día. Cuatro fugas dominan. Primero, llamadas perdidas y respuesta lenta a leads. Cada llamada sin contestar, y cada devolución lenta, es un negocio perdido. Segundo, pipelines estancados y leads viejos. Los negocios se pudren en CRMs que nadie lee. Tercero, trabajo sin facturar y fugas de ingresos, cuando llamadas, alcances y renovaciones caen entre sistemas. Y cuarto, ausencias y capacidad desperdiciada, el recurso más caro de cualquier negocio.' },
  { file: 'slide-06.mp3', text: 'Digit2AI Neural resuelve estas cuatro fugas con cuatro mecanismos sobre una sola plataforma nativa de MCP. Mecanismo uno: una fuerza de voice agents que contesta cada llamada. Mecanismo dos: una flota de diez analizadores Neural que inspeccionan continuamente llamadas, leads, reservas y pipelines. Mecanismo tres: flujos de auto-reparación que actúan sobre los hallazgos sin humanos en el loop. Y mecanismo cuatro: el servidor MCP, que orquesta los traspasos entre agentes en tiempo real.' },
  { file: 'slide-07.mp3', text: 'De la señal a la solución, sin humanos en el loop. Cinco etapas corren continuamente en tu negocio. Detectar. Diagnosticar. Prescribir. Auto-reparar. Y verificar. Cada etapa la dirige un agente distinto. El servidor MCP orquesta los traspasos, transporta contexto compartido y registra cada acción. El primer hallazgo aterriza en menos de treinta segundos.' },
  { file: 'slide-08.mp3', text: 'Una sola columna vertebral nativa de protocolo. Detectar corre veinticuatro siete, con diez analizadores Neural escaneando cada flujo. Diagnosticar enruta cada hallazgo al agente especialista correcto en menos de treinta segundos, con contexto completo adjunto. Auto-reparar ejecuta acciones pre-aprobadas al instante, mientras las de mayor riesgo emergen para aprobación humana con un clic. Cada acción queda registrada con los datos, la regla y el resultado.' },
  { file: 'slide-09.mp3', text: 'Ocho especialistas. Un supervisor. Todos los canales. La fuerza está organizada en tres grupos. Voz y respuesta a leads: Rachel, Ana y Lina. Pipeline e ingresos: Sentinel, Nova y Vault. Performance y personalizados: Origin, Coach, y un agente personalizado construido a medida para cualquier vertical, desplegado en días, no meses.' },
  { file: 'slide-10.mp3', text: 'Conoce a los primeros cuatro especialistas. Rachel contesta cada llamada entrante, califica al llamante y reserva la reunión. Ana llama a cada lead nuevo en menos de sesenta segundos, en inglés o español. Lina reactiva leads viejos con secuencias personalizadas y puntúa la intención. Sentinel observa cada etapa del negocio continuamente y marca los negocios estancados antes de que cuesten un trimestre.' },
  { file: 'slide-11.mp3', text: 'Y los siguientes cuatro. Nova confirma citas, envía recordatorios inteligentes y auto-reagenda reuniones perdidas. Vault cruza llamadas, contactos y negocios para detectar trabajo sin facturar. Origin clasifica cada fuente de leads por tasa de cierre y costo. Y Coach escucha transcripciones de llamadas y puntúa la performance del representante. Más un agente personalizado para trabajo específico de la industria.' },
  { file: 'slide-12.mp3', text: 'La arquitectura es una sola columna vertebral nativa de protocolo para toda la flota. La capa de experiencia cubre voz, web, SMS, WhatsApp, email, móvil y API. El servidor MCP es el núcleo de orquestación, enrutando hallazgos, transportando contexto compartido y aplicando protocolos. La capa de agentes y herramientas combina la fuerza con un router de modelos de lenguaje entre Opus, Sonnet, Haiku, Gemini y GPT, más herramientas para CRM, calendario, pagos y webhooks.' },
  { file: 'slide-13.mp3', text: 'Construye, despliega, gobierna y observa, todo desde un solo lugar. Construye con un editor visual de flujos, personajes de voz pre-entrenados y un SDK orientado a código para usuarios avanzados. Despliega en voz, chat, SMS, WhatsApp, móvil, REST y MCP. Gobierna con control de acceso por roles, aislamiento multi-tenant y auditoría estilo SOC2. Observa con dashboards de KPIs en tiempo real, transcripciones y seguimiento de retorno de inversión por agente.' },
  { file: 'slide-14.mp3', text: 'No es otro chatbot. No es un toolkit hazlo tú mismo. Es una plataforma terminada. Tiempo al primer valor: días para un chatbot único, meses en construcción propia, treinta segundos con Neural. Agentes pre-construidos: uno genérico, cero en construcción propia, ocho especialistas más personalizado en Neural. Cobertura de canales: solo web, lo que tú conectes, o todos los canales listos de fábrica. Precio: por puesto, por token más salarios de ingeniería, o por resultado resuelto.' },
  { file: 'slide-15.mp3', text: 'Donde Neural encuentra más dinero. Operaciones de ventas: llamadas perdidas, respuesta lenta a leads, pipelines estancados, leads viejos. Soporte al cliente: triaje de tickets, deflección de preguntas frecuentes, escalamiento de incidencias críticas. Servicios en terreno: confirmación de citas, reducción de ausencias, trabajo sin facturar. Práctica médica: contacto con pacientes, ingreso, triaje después de horas. Bienes raíces: velocidad al lead en sesenta segundos, consultas de listados, agenda de visitas. Y servicios legales y profesionales: ingreso bilingüe, chequeo de conflictos, renovación de contratos, recuperación de tiempo sin facturar.' },
  { file: 'slide-16.mp3', text: 'Calidad empresarial desde el día uno. El aislamiento multi-tenant da a cada cliente fronteras duras. La huella de auditoría completa registra cada decisión del agente. RBAC más SSO controlan cada acción. La residencia de datos ofrece opciones en Estados Unidos, Unión Europea y regiones específicas. Un SLA de noventa y nueve coma nueve por ciento respalda infraestructura de producción. Y la bóveda de secretos mantiene las credenciales fuera de los prompts.' },
  { file: 'slide-17.mp3', text: 'Veintiuna plataformas en producción, compartiendo un cerebro. RinglyPro. SurgicalMind. CW Carriers. Pinaxis. HISPATEC. CamaraVirtual. Visionarium. Torna Idioma. Y trece más. Veintidós verticales industriales. Tres voice agents en vivo. Operaciones autónomas veinticuatro siete. Cada nuevo tenant hereda la plataforma, y el cerebro compone a través de toda la flota.' },
  { file: 'slide-18.mp3', text: 'Tres flujos de ingresos componibles. Flujo uno: suscripciones SaaS recurrentes, predecibles y de alto margen. Flujo dos: ingresos por uso de minutos de voz, tokens y resultados resueltos, que escalan con el crecimiento del cliente. Flujo tres: licenciamiento vertical de paquetes industriales pre-construidos. Datos del cliente sin copia. Cada nueva vertical fortalece a la siguiente. El cerebro compone.' },
  { file: 'slide-19.mp3', text: 'Una ventana única en una generación. El mercado total direccionable para infraestructura de operadores e inteligencia artificial con agentes es de trescientos mil millones de dólares. El ochenta y cinco por ciento de los negocios sigue corriendo en llamadas, hojas de cálculo y automatización basada en reglas. La categoría de IA vertical crece a más del cuarenta por ciento compuesto anual hasta dos mil treinta. Digit2AI está posicionada para capturar una porción defensible de esa ola.' },
  { file: 'slide-20.mp3', text: 'Encuentra cada fuga de dinero. Repárala automáticamente. Sube un export de tu CRM y verás a Neural diagnosticar tu negocio en treinta segundos. O agenda una llamada de descubrimiento para desplegar la fuerza de agentes dentro de tu stack. Escríbenos a mstagg arroba digit2ai punto com. Digit2AI. Infraestructura de operadores de inteligencia artificial para todo negocio.' }
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
  console.log(`Voice ID: ${VOICE_ID} (Lina - Spanish)`);
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
    await new Promise(r => setTimeout(r, 400));
  }
  console.log('');
  console.log('Done.');
})();
