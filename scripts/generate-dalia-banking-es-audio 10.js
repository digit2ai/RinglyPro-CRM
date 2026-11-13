#!/usr/bin/env node
/**
 * Genera los MP3 de narración (voz Dalia) para la presentación en español
 * "Inteligencia Neuronal + MCP para el Cumplimiento Bancario".
 *
 * Contraparte en español de scripts/generate-rachel-banking-audio.js — mismo
 * mazo, mismas diez diapositivas, misma mecánica de reproducción; sólo cambia
 * el idioma y la voz. Motor: nuestro Edge TTS neuronal (sin API key, $0).
 *
 * Las cifras son las MISMAS que en la versión en inglés: esta es una
 * traducción del mazo, no una reescritura, así que ninguna cifra nueva puede
 * aparecer aquí sin existir también allá.
 *
 * Uso:  node scripts/generate-dalia-banking-es-audio.js [--force]
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const edgeTts = require('../src/services/edge-tts');

// Dalia = es-MX-DaliaNeural, la voz femenina LATAM cálida del repo.
const VOICE = process.env.NARRATION_VOICE_ES || 'es-MX-DaliaNeural';
// Un poco más lenta que el habla natural: es material técnico y con siglas.
const RATE = process.env.NARRATION_RATE_ES || '-4%';
const FORCE = process.argv.includes('--force');
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'neural-intelligence-banking-es', 'assets', 'audio');

// Los textos deben coincidir con los atributos data-narration de
// public/neural-intelligence-banking-es/presentation.html.
// Las cantidades van escritas en palabras porque el sintetizador las lee
// mejor así que en dígitos (y "274" se leía como año, no como cantidad).
const narrations = [
  // 01 — Portada
  `Bienvenidos. Soy Dalia, y hoy le voy a explicar cómo la Inteligencia Neuronal, impulsada por el Protocolo de Contexto de Modelo, está transformando el cumplimiento normativo bancario en todo el mundo. Esta tecnología atiende el mayor desafío que enfrentan hoy las instituciones financieras: la crisis de cumplimiento que cuesta más de doscientos setenta y cuatro mil millones de dólares al año y que genera tasas de falsos positivos superiores al noventa y cinco por ciento. Veamos cómo el razonamiento con inteligencia artificial, conectado mediante un estándar abierto y universal, puede resolverla.`,

  // 02 — El problema
  `Este es el problema de fondo. Los sistemas tradicionales de cumplimiento se basan en reglas. Aplican umbrales estáticos. Si una transacción supera los diez mil dólares, se marca. Si un nombre coincide con una lista de sanciones en un ochenta por ciento, se genera una alerta. Son reglas rígidas. No se adaptan a los métodos criminales, que sí evolucionan. Y generan un ruido enorme. Entre el noventa y cinco y el noventa y nueve por ciento de todas las alertas son falsos positivos. Es decir: por cada amenaza real detectada, el sistema produce entre veinte y noventa y nueve falsas alarmas. Los analistas de cumplimiento pasan el día despejando ruido en lugar de atrapar criminales. Esto no es una limitación del pasado. Es la realidad actual en la mayoría de los bancos del mundo.`,

  // 03 — Qué es la Inteligencia Neuronal
  `La Inteligencia Neuronal es algo distinto de raíz. En vez de aplicar reglas a datos aislados, razona sobre múltiples fuentes de información al mismo tiempo. Véalo así: un sistema de reglas es como una calculadora, sigue fórmulas. La Inteligencia Neuronal es como contratar a un equipo de analistas de cumplimiento expertos capaces de leer cada documento, consultar cada base de datos, aplicar criterio y trabajar a la velocidad del software, las veinticuatro horas del día. La diferencia clave es esta: los sistemas de reglas detectan patrones conocidos; la Inteligencia Neuronal identifica riesgos desconocidos razonando sobre el contexto. Combina el historial transaccional del cliente, su perfil de conocimiento del cliente, las bases de sanciones, las señales de prensa adversa, las estructuras de propiedad corporativa y los factores de riesgo geográfico, todo a la vez, en milisegundos.`,

  // 04 — Qué es MCP
  `Ahora bien, ¿cómo se conecta realmente la inteligencia artificial a todas esas fuentes de datos? Ahí entra el Protocolo de Contexto de Modelo, MCP por sus siglas en inglés. MCP es un estándar abierto publicado por Anthropic en dos mil veinticuatro. Piénselo como el USB-C de la inteligencia artificial. Antes del USB-C, cada aparato tenía su propio cargador. Del mismo modo, antes de MCP, cada conexión entre un modelo y una base de datos exigía una integración a la medida. MCP aporta un único protocolo universal que reemplaza decenas de conectores propietarios. Ya lo adoptaron Claude, ChatGPT, Visual Studio Code y las principales plataformas empresariales. Para la banca, esto significa que la inteligencia artificial puede conectarse a su core bancario, a sus bases de sanciones, a sus herramientas de gestión de casos y a sus sistemas de reporte regulatorio, todo a través de un solo protocolo estandarizado, seguro y auditable.`,

  // 05 — Arquitectura de tres capas
  `Déjeme mostrarle la arquitectura. MCP sigue un modelo de tres capas: anfitrión, cliente y servidor. Arriba está el anfitrión, que es su aplicación de cumplimiento bancario. Él controla todo: crea las conexiones, aplica las políticas de seguridad y decide qué datos fluyen hacia dónde. En el medio están los clientes MCP; cada uno mantiene una conexión aislada, uno a uno, con un servidor específico. El cliente de sanciones no puede ver al cliente de datos del cliente bancario. Ese aislamiento es crítico para la seguridad bancaria. Abajo están los servidores MCP: programas ligeros que envuelven sus sistemas bancarios existentes. Su plataforma core, su base de datos de la OFAC, su herramienta de gestión de casos; cada uno recibe un envoltorio estandarizado. No hay que reemplazar nada. Usted conserva su infraestructura actual.`,

  // 06 — Las tres primitivas
  `Cada servidor MCP se comunica mediante tres primitivas estandarizadas. Primera: las herramientas. Son funciones ejecutables que la inteligencia artificial puede invocar. Correr una verificación de sanciones. Traer un historial de transacciones. Presentar un reporte de actividad sospechosa. Cada invocación queda registrada con todos sus parámetros para auditoría. Segunda: los recursos. Son datos de sólo lectura que el servidor expone. Perfiles de clientes. Conjuntos de reglas regulatorias. Modelos de puntuación de riesgo. La aplicación controla cuándo y cómo se accede a esos datos. Tercera: los prompts. Son plantillas estructuradas que garantizan una salida consistente. Narrativas de reporte en formato FinCEN. Reportes de operación sospechosa para la AMLC. Resúmenes de debida diligencia ampliada. Cada informe sigue exactamente el formato que los examinadores esperan.`,

  // 07 — Flujo de una transferencia
  `Veamos un ejemplo concreto. Llega una transferencia electrónica para ser filtrada. Esto es exactamente lo que ocurre, en milisegundos. Paso uno: el servidor MCP de transacciones recibe los datos desde el riel de pagos, sea SWIFT, ACH, PIX, SEPA o InstaPay. Paso dos: el servidor MCP de sanciones verifica simultáneamente al ordenante y al beneficiario contra las listas de la OFAC, la ONU, la Unión Europea, la AMLC y la OFSI del Reino Unido, usando resolución de entidades con inteligencia artificial, no una simple comparación de texto. Paso tres: los servidores de core bancario y de conocimiento del cliente aportan el perfil, la calificación de riesgo, la línea base transaccional y el estado de debida diligencia. Paso cuatro: el motor de Inteligencia Neuronal razona sobre todos esos datos a la vez. ¿Es esta operación consistente con el perfil del cliente? ¿Con su grupo de pares? ¿Con las tipologías conocidas? Paso cinco: el sistema emite una decisión, liberar, alertar o bloquear, con toda la cadena de razonamiento registrada para los examinadores. Si se genera una alerta, el servidor de gestión de casos abre la investigación automáticamente.`,

  // 08 — Seguridad
  `La seguridad no es un añadido posterior. Está construida dentro del propio protocolo. MCP exige OAuth dos punto uno con PKCE en todas las conexiones. Los tokens se limitan por servidor mediante indicadores de recurso, según el estándar RFC ocho mil setecientos siete. Esto significa que un token emitido para el servidor de sanciones literalmente no puede usarse para acceder al servidor de datos del cliente. El aislamiento de datos se impone a nivel de protocolo. Los servidores no pueden leer la conversación completa ni asomarse a otros servidores. La única entidad que controla el flujo de datos entre servidores es su aplicación anfitriona. Cada invocación de herramienta, cada verificación de sanciones, cada consulta de datos, cada presentación de reporte, queda registrada con fecha, hora, identidad del usuario, parámetros y resultados. Esa bitácora inmutable satisface a la vez SOC dos, ISO veintisiete mil uno, la Ley de Inteligencia Artificial de la Unión Europea, la Circular mil ochenta y cinco del BSP y la OCC dos mil once guion doce.`,

  // 09 — Resultados
  `Hablemos de resultados. Los bancos que despliegan Inteligencia Neuronal con MCP están viendo reducciones de falsos positivos de entre el cincuenta y el setenta y cinco por ciento. No es una cifra teórica: HSBC reportó una reducción cercana al sesenta por ciento tras desplegar monitoreo transaccional basado en inteligencia artificial. Para un banco mediano, esto se traduce en una reducción de entre el cuarenta y el sesenta por ciento en el costo operativo de cumplimiento dentro de dieciocho a veinticuatro meses. El sistema automatiza el setenta por ciento de los flujos rutinarios de cumplimiento. Y el plazo de implementación es de noventa días hasta los primeros resultados medibles, no de doce a veinticuatro meses como en las plataformas empresariales heredadas. Cada fase corre en modo sombra, en paralelo con sus sistemas actuales, de modo que el riesgo de despliegue es cero.`,

  // 10 — Cierre
  `En resumen: la Inteligencia Neuronal con MCP no es una mejora incremental. Es un cambio de paradigma. De las reglas al razonamiento. De los silos propietarios a un estándar abierto y universal. Del noventa y cinco por ciento de falsos positivos a una detección inteligente y contextual. De soluciones puntuales y fragmentadas a una plataforma unificada que satisface a la vez a FinCEN, la AMLC, la CNBV, la AMLA, la MAS, AUSTRAC y a todos los reguladores principales. La tecnología existe. El marco regulatorio la respalda. El caso económico es claro. La pregunta para la alta dirección bancaria ya no es "¿deberíamos hacerlo?", sino "¿qué tan pronto podemos empezar?". Gracias. Soy Dalia, y esto ha sido un informe tecnológico de Digit2AI.`
];

// slideNumber es base 1; el mazo referencia assets/audio/slide-NN.mp3.
async function generateAudio(text, slideNumber) {
  const file = `slide-${String(slideNumber).padStart(2, '0')}.mp3`;
  const outputPath = path.join(OUTPUT_DIR, file);
  if (!FORCE && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000) {
    console.log(`[${String(slideNumber).padStart(2,'0')}] SKIP ${file}`);
    return 0;
  }
  const buffer = await edgeTts.synthesize(text, { voice: VOICE, rate: RATE });
  fs.writeFileSync(outputPath, buffer);
  console.log(`[${String(slideNumber).padStart(2,'0')}] OK ${file} (${(buffer.length/1024).toFixed(1)} KB)`);
  return buffer.length;
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log(`\nGenerando ${narrations.length} narraciones con la voz Dalia...\n`);
  console.log(`Voz: Dalia (${VOICE}, ${RATE}) — Edge neural, sin API key`);
  console.log(`Salida: ${OUTPUT_DIR}\n`);

  let total = 0;
  for (let i = 0; i < narrations.length; i++) {
    try {
      total += await generateAudio(narrations[i], i + 1);
      if (i < narrations.length - 1) await new Promise(r => setTimeout(r, 1500));
    } catch (err) {
      console.error(`[${String(i+1).padStart(2,'0')}] FALLÓ: ${err.message}`);
    }
  }

  console.log(`\nListo. ${(total/1024/1024).toFixed(2)} MB generados.\n`);
}

main();
