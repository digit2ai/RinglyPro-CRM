/**
 * ENRUTA - Voice API Routes
 * Laura: herramientas de consulta y registro de llamadas.
 * La voz de la web corre sobre el orbe propio (Web Speech + Haiku + Edge TTS);
 * la persona vive en src/config/voice-agents.js bajo el id "enruta".
 */
const express = require('express');
const router = express.Router();
const {
  EnrutaCliente,
  EnrutaDocumento,
  EnrutaRegistroContacto,
  EnrutaRenovacion,
  sequelize
} = require('../../models');
const { whereEstado, sqlPrioridad, hoyBogota, sumarDias } = require('../utils/estado');
const { LAURA_SYSTEM_PROMPT, LAURA_CONOCIMIENTO, generateLauraContext, getMessageTemplate } = require('../../prompts/laura-agent');

// GET /voice/laura/prompt - Prompt completo de Laura (guiones de llamada incluidos)
router.get('/laura/prompt', async (req, res) => {
  try {
    res.json({
      success: true,
      prompt: LAURA_SYSTEM_PROMPT,
      voice_settings: {
        language: 'es',
        accent: 'colombian',
        gender: 'female',
        name: 'Laura',
        style: 'warm, professional, patient'
      }
    });
  } catch (error) {
    console.error('Error getting prompt:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /voice/laura/contexto - Lo que el orbe de voz de la web le pasa a Laura
//
// El orbe solo puede hablar de lo que se le entrega como contexto: es su regla
// de honestidad, no puede inventar una tarifa que nadie le dio. El tablero
// pide esto al abrir y lo empuja con D2AIVoiceOrb.setContext().
//
// Van los HECHOS (recortados del prompt de Laura, no copiados) más la foto en
// vivo del tenant. Los guiones de llamada quedan fuera: el orbe de la web
// responde preguntas, no hace llamadas salientes.
router.get('/laura/contexto', async (req, res) => {
  try {
    const tenantFilter = req.query.tenant_id || '00000000-0000-0000-0000-000000000001';
    const partes = ['## enRuta - Centro de Diagnóstico Automotor del Valle (CDAV), Santiago de Cali', LAURA_CONOCIMIENTO];

    // La foto en vivo es un extra: si la consulta falla, el conocimiento
    // igual viaja. Un orbe sin cifras sirve; un orbe sin hechos, no.
    try {
      const [porVencer, vencidos, clientes] = await Promise.all([
        EnrutaDocumento.count({ where: { tenant_id: tenantFilter, ...whereEstado(['por_vencer_30_dias', 'por_vencer_15_dias', 'por_vencer_7_dias']) } }),
        EnrutaDocumento.count({ where: { tenant_id: tenantFilter, ...whereEstado('vencido') } }),
        EnrutaCliente.count({ where: { tenant_id: tenantFilter, estado: 'activo' } })
      ]);
      partes.push([
        '### Estado actual del tablero (en vivo)',
        `- Ciudadanos activos registrados: ${clientes}`,
        `- Documentos por vencer en los próximos 30 días: ${porVencer}`,
        `- Documentos ya vencidos: ${vencidos}`,
        'Estas tres cifras son del sistema en este momento. No cite ninguna otra cifra de la operación.'
      ].join('\n'));
    } catch (e) {
      console.error('ENRUTA: no se pudo adjuntar la foto en vivo al contexto de Laura:', e.message);
    }

    res.json({ success: true, contexto: partes.join('\n\n') });
  } catch (error) {
    console.error('Error building Laura context:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /voice/laura/context - Generate context for a specific call
router.post('/laura/context', async (req, res) => {
  try {
    const { cliente_id, documento_id } = req.body;

    if (!cliente_id || !documento_id) {
      return res.status(400).json({ success: false, error: 'cliente_id and documento_id required' });
    }

    const cliente = await EnrutaCliente.findByPk(cliente_id);
    const documento = await EnrutaDocumento.findByPk(documento_id);

    if (!cliente || !documento) {
      return res.status(404).json({ success: false, error: 'Cliente o documento no encontrado' });
    }

    const context = generateLauraContext(cliente, documento);

    res.json({
      success: true,
      context,
      full_prompt: LAURA_SYSTEM_PROMPT + '\n\n' + context
    });
  } catch (error) {
    console.error('Error generating context:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /voice/laura/iniciar-llamada - Initiate outbound call
router.post('/laura/iniciar-llamada', async (req, res) => {
  try {
    const { tenant_id, cliente_id, documento_id, tipo_llamada } = req.body;

    if (!tenant_id || !cliente_id) {
      return res.status(400).json({ success: false, error: 'tenant_id and cliente_id required' });
    }

    const cliente = await EnrutaCliente.findByPk(cliente_id);

    if (!cliente) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }

    // Check if client can be called
    if (cliente.no_llamar || cliente.estado === 'no_contactar') {
      return res.status(400).json({ success: false, error: 'Cliente no permite llamadas' });
    }

    // Create contact record
    const contacto = await EnrutaRegistroContacto.create({
      tenant_id,
      cliente_id,
      documento_id,
      direccion_llamada: 'saliente',
      tipo_llamada: tipo_llamada || 'recordatorio_30_dias',
      estado_llamada: 'en_progreso',
      llamada_inicio: new Date(),
      numero_destino: cliente.telefono_principal
    });

    // TODO: Integrate with Twilio to make the actual call
    // For now, return the contact record

    res.json({
      success: true,
      data: {
        contacto_id: contacto.id,
        cliente: {
          nombre: cliente.nombre_completo,
          telefono: cliente.telefono_principal
        },
        mensaje: 'Llamada iniciada (simulación)'
      }
    });
  } catch (error) {
    console.error('Error initiating call:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /voice/laura/webhook/inicio - Twilio call start webhook
router.post('/laura/webhook/inicio', async (req, res) => {
  try {
    const { CallSid, From, To, Direction } = req.body;

    // Log call start
    console.log('ENRUTA Call started:', { CallSid, From, To, Direction });

    // Laura por TELÉFONO todavía no existe.
    //
    // Esto conectaba la llamada a un agente conversacional de ElevenLabs, que
    // ya no se usa en ninguna parte de ENRUTA: la web corre sobre el orbe
    // propio (Web Speech + Haiku + Edge TTS, cero llaves). El camino de
    // reemplazo por teléfono es Twilio ConversationRelay, que este repo ya
    // tiene montado en /voice/relay/*, pero apuntarlo a ENRUTA exige un cerebro
    // con las herramientas de trámites y una llamada real de prueba: no se
    // despacha a ciegas.
    //
    // Mientras tanto se contesta con una voz neural en español y se dice la
    // verdad, en vez de dejar la llamada colgada contra un agente inexistente.
    console.warn('ENRUTA: llamada entrante sin agente de voz telefónico ' +
                 '(pendiente ConversationRelay)', { CallSid, From, To });

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Mia-Neural">Gracias por comunicarse con enRuta, el Centro de Diagnóstico Automotor del Valle. En este momento no contamos con atención automática por teléfono. Puede escribirnos por WhatsApp al tres uno siete, cinco uno tres, cuarenta y uno, setenta y uno, o consultar en cdav punto gov punto co. Que tenga un buen día.</Say>
</Response>`;

    res.type('text/xml').send(twiml);
  } catch (error) {
    console.error('Error in call webhook:', error);
    res.status(500).send('<Response><Say>Error interno. Intente más tarde.</Say></Response>');
  }
});

// POST /voice/laura/webhook/fin - Twilio call end webhook
router.post('/laura/webhook/fin', async (req, res) => {
  try {
    const {
      CallSid,
      CallDuration,
      RecordingUrl,
      CallStatus
    } = req.body;

    // Find and update the contact record
    const contacto = await EnrutaRegistroContacto.findOne({
      where: { call_sid: CallSid }
    });

    if (contacto) {
      await contacto.update({
        estado_llamada: CallStatus === 'completed' ? 'completada' : CallStatus,
        duracion_llamada_segundos: parseInt(CallDuration) || 0,
        url_grabacion: RecordingUrl,
        llamada_fin: new Date()
      });
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Error in call end webhook:', error);
    res.status(500).send('Error');
  }
});

// POST /voice/laura/resultado - Record call result
router.post('/laura/resultado', async (req, res) => {
  try {
    const {
      contacto_id,
      resultado,
      transcripcion,
      resumen,
      requiere_seguimiento,
      fecha_seguimiento,
      notas
    } = req.body;

    if (!contacto_id || !resultado) {
      return res.status(400).json({ success: false, error: 'contacto_id and resultado required' });
    }

    const contacto = await EnrutaRegistroContacto.findByPk(contacto_id);

    if (!contacto) {
      return res.status(404).json({ success: false, error: 'Registro no encontrado' });
    }

    await contacto.update({
      resultado,
      transcripcion_conversacion: transcripcion,
      resumen_conversacion: resumen,
      requiere_seguimiento: requiere_seguimiento || false,
      fecha_seguimiento,
      notas_seguimiento: notas,
      estado_llamada: 'completada'
    });

    // Update client last contact
    await EnrutaCliente.update(
      { ultimo_contacto_en: new Date() },
      { where: { id: contacto.cliente_id } }
    );

    // If appointment was scheduled, create renewal
    if (resultado === 'cita_agendada' && req.body.fecha_cita) {
      await EnrutaRenovacion.create({
        tenant_id: contacto.tenant_id,
        cliente_id: contacto.cliente_id,
        documento_id: contacto.documento_id,
        contacto_id: contacto.id,
        estado_renovacion: 'cita_agendada',
        fecha_cita: req.body.fecha_cita,
        sede_cita: req.body.sede_cita,
        historial_estados: [{ estado: 'cita_agendada', fecha: new Date().toISOString() }]
      });
    }

    // Handle client removal request
    if (resultado === 'solicito_retiro') {
      await EnrutaCliente.update(
        { estado: 'no_contactar', no_llamar: true },
        { where: { id: contacto.cliente_id } }
      );
    }

    res.json({ success: true, data: contacto });
  } catch (error) {
    console.error('Error recording result:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /voice/laura/enviar-mensaje - Send SMS/WhatsApp after call
router.post('/laura/enviar-mensaje', async (req, res) => {
  try {
    const { contacto_id, tipo, plantilla_nombre, datos } = req.body;

    if (!contacto_id) {
      return res.status(400).json({ success: false, error: 'contacto_id required' });
    }

    const contacto = await EnrutaRegistroContacto.findByPk(contacto_id, {
      include: [{ model: EnrutaCliente, as: 'cliente' }]
    });

    if (!contacto) {
      return res.status(404).json({ success: false, error: 'Registro no encontrado' });
    }

    // Generate message from template
    const mensaje = getMessageTemplate(contacto.resultado, {
      nombre: contacto.cliente.nombre_completo,
      documento: datos?.documento || 'documento',
      fecha_vencimiento: datos?.fecha_vencimiento || '',
      requisitos: datos?.requisitos || 'Cédula original, examen médico vigente',
      sede: datos?.sede || 'Calle 62 Norte # Av 3B-40, La Flora, Cali',
      horario: datos?.horario || 'Lun-Vie 7:45am-4:55pm',
      valor_multa: datos?.valor_multa || '695.000',
      fecha_cita: datos?.fecha_cita || '',
      hora_cita: datos?.hora_cita || '',
      referencia: datos?.referencia || '',
      estado_vencimiento: datos?.estado_vencimiento || 'por vencer'
    });

    // TODO: Integrate with Twilio SMS/WhatsApp to send actual message

    // Update contact record
    if (tipo === 'sms') {
      await contacto.update({ sms_enviado: true, contenido_sms: mensaje });
    } else if (tipo === 'whatsapp') {
      await contacto.update({ whatsapp_enviado: true, contenido_whatsapp: mensaje });
    }

    res.json({
      success: true,
      data: {
        mensaje,
        tipo,
        destinatario: contacto.cliente.telefono_principal
      }
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /voice/laura/cola - Get call queue
router.get('/laura/cola', async (req, res) => {
  try {
    const { tenant_id, limit = 50 } = req.query;

    if (!tenant_id) {
      return res.status(400).json({ success: false, error: 'tenant_id required' });
    }

    // Documentos que necesitan llamada.
    //
    // El orden se calcula sobre fecha_vencimiento y con la columna CALIFICADA
    // por su tabla: `CASE estado` a secas era ambiguo, porque el JOIN con
    // clientes trae un segundo "estado" y Postgres rechazaba la consulta
    // entera ("column reference \"estado\" is ambiguous"), dejando la cola de
    // llamadas de Laura caída.
    const documentos = await EnrutaDocumento.findAll({
      where: {
        tenant_id,
        ...whereEstado(['vencido', 'por_vencer_7_dias', 'por_vencer_15_dias', 'por_vencer_30_dias'])
      },
      limit: parseInt(limit),
      order: [
        [sequelize.literal(sqlPrioridad('EnrutaDocumento')), 'ASC'],
        ['fecha_vencimiento', 'ASC']
      ],
      include: [{
        model: EnrutaCliente,
        as: 'cliente',
        where: {
          estado: 'activo',
          no_llamar: false,
          consentimiento_llamadas: true
        }
      }]
    });

    res.json({ success: true, data: documentos, count: documentos.length });
  } catch (error) {
    console.error('Error getting call queue:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// HERRAMIENTAS DE LAURA - consultas que resuelve durante una conversación
// =====================================================

// POST /voice/laura/tools/consultar-documentos - Look up documents by cedula
// La llama el cliente de voz cuando Laura necesita el estado de un documento
router.post('/laura/tools/consultar-documentos', async (req, res) => {
  try {
    const { numero_cedula } = req.body;

    if (!numero_cedula) {
      return res.json({
        success: false,
        mensaje_para_usuario: 'No recibí el número de cédula. ¿Me lo puede repetir por favor?'
      });
    }

    // Clean cedula (remove dots, spaces)
    const cedulaLimpia = numero_cedula.replace(/[\.\s-]/g, '');

    // Find client by cedula
    const cliente = await EnrutaCliente.findOne({
      where: { numero_documento: cedulaLimpia }
    });

    if (!cliente) {
      return res.json({
        success: false,
        mensaje_para_usuario: `No encontré ningún registro con la cédula ${numero_cedula}. ¿Puede verificar el número o desea que lo registremos en nuestro sistema?`
      });
    }

    // Get all documents for this client
    const documentos = await EnrutaDocumento.findAll({
      where: { cliente_id: cliente.id },
      order: [['fecha_vencimiento', 'ASC']]
    });

    if (documentos.length === 0) {
      return res.json({
        success: true,
        cliente: {
          nombre: cliente.nombre_completo,
          cedula: cliente.numero_documento
        },
        documentos: [],
        mensaje_para_usuario: `Señor/a ${cliente.nombre_completo}, lo encontré en nuestro sistema pero no tiene documentos registrados. ¿Desea que registremos su licencia de conducción o SOAT?`
      });
    }

    // Format documents for Laura to read
    const docsFormateados = documentos.map(doc => {
      const fechaVenc = new Date(doc.fecha_vencimiento);
      const hoy = new Date();
      const diasRestantes = Math.ceil((fechaVenc - hoy) / (1000 * 60 * 60 * 24));

      let estadoTexto;
      if (diasRestantes < 0) {
        estadoTexto = `VENCIDO hace ${Math.abs(diasRestantes)} días`;
      } else if (diasRestantes === 0) {
        estadoTexto = 'VENCE HOY';
      } else if (diasRestantes <= 7) {
        estadoTexto = `vence en ${diasRestantes} días - URGENTE`;
      } else if (diasRestantes <= 15) {
        estadoTexto = `vence en ${diasRestantes} días`;
      } else if (diasRestantes <= 30) {
        estadoTexto = `vence en ${diasRestantes} días`;
      } else {
        estadoTexto = `vigente hasta el ${fechaVenc.toLocaleDateString('es-CO')}`;
      }

      const tipoTexto = {
        'licencia_conduccion': 'Licencia de conducción',
        'soat': 'SOAT',
        'revision_tecnicomecanica': 'Revisión técnico mecánica',
        'tarjeta_propiedad': 'Tarjeta de propiedad'
      }[doc.tipo_documento] || doc.tipo_documento;

      return {
        tipo: tipoTexto,
        numero: doc.numero_documento,
        categoria: doc.categoria_licencia,
        fecha_vencimiento: fechaVenc.toLocaleDateString('es-CO'),
        estado: doc.estado,
        estado_texto: estadoTexto,
        dias_restantes: diasRestantes,
        multa: doc.valor_multa_cop ? `$${doc.valor_multa_cop.toLocaleString('es-CO')} COP` : null,
        riesgo_inmovilizacion: doc.riesgo_inmovilizacion
      };
    });

    // Build message for Laura to read
    let mensaje = `Señor/a ${cliente.nombre_completo}, encontré ${documentos.length} documento${documentos.length > 1 ? 's' : ''} registrado${documentos.length > 1 ? 's' : ''}: `;

    docsFormateados.forEach((doc, i) => {
      mensaje += `${doc.tipo}${doc.categoria ? ` categoría ${doc.categoria}` : ''}, ${doc.estado_texto}`;
      if (doc.multa && doc.dias_restantes < 0) {
        mensaje += `. Tiene una multa pendiente de ${doc.multa}`;
        if (doc.riesgo_inmovilizacion) {
          mensaje += ' y riesgo de inmovilización del vehículo';
        }
      }
      if (i < docsFormateados.length - 1) mensaje += '. ';
    });

    // Add recommendation
    const vencidos = docsFormateados.filter(d => d.dias_restantes < 0);
    const porVencer = docsFormateados.filter(d => d.dias_restantes >= 0 && d.dias_restantes <= 30);

    if (vencidos.length > 0) {
      mensaje += '. Le recomiendo renovar lo antes posible para evitar más multas.';
    } else if (porVencer.length > 0) {
      mensaje += '. Le recomiendo agendar una cita pronto para evitar inconvenientes.';
    }

    res.json({
      success: true,
      cliente: {
        id: cliente.id,
        nombre: cliente.nombre_completo,
        cedula: cliente.numero_documento,
        telefono: cliente.telefono_principal,
        ciudad: cliente.ciudad
      },
      documentos: docsFormateados,
      resumen: {
        total: documentos.length,
        vencidos: vencidos.length,
        por_vencer: porVencer.length,
        vigentes: docsFormateados.filter(d => d.dias_restantes > 30).length
      },
      mensaje_para_usuario: mensaje
    });

  } catch (error) {
    console.error('Error consulting documents:', error);
    res.json({
      success: false,
      mensaje_para_usuario: 'Disculpe, tuve un problema consultando la información. ¿Puede intentar de nuevo en un momento?'
    });
  }
});

// POST /voice/laura/tools/consultar-comparendos - Look up traffic fines
router.post('/laura/tools/consultar-comparendos', async (req, res) => {
  try {
    const { numero_cedula } = req.body;

    if (!numero_cedula) {
      return res.json({
        success: false,
        mensaje_para_usuario: 'Necesito su número de cédula para consultar comparendos.'
      });
    }

    const cedulaLimpia = numero_cedula.replace(/[\.\s-]/g, '');

    const cliente = await EnrutaCliente.findOne({
      where: { numero_documento: cedulaLimpia }
    });

    if (!cliente) {
      return res.json({
        success: false,
        mensaje_para_usuario: `No encontré registros con esa cédula. Para consultar comparendos oficialmente, puede visitar el portal SIMIT en consulta.simit.org.co`
      });
    }

    const { EnrutaComparendo } = require('../../models');
    const comparendos = await EnrutaComparendo.findAll({
      where: { cliente_id: cliente.id },
      order: [['fecha_comparendo', 'DESC']]
    });

    if (comparendos.length === 0) {
      return res.json({
        success: true,
        mensaje_para_usuario: `Señor/a ${cliente.nombre_completo}, no tiene comparendos registrados en nuestro sistema. Para una consulta oficial, puede verificar en el portal SIMIT.`
      });
    }

    const pendientes = comparendos.filter(c => c.estado === 'pendiente' || c.estado === 'en_proceso');
    const totalDeuda = pendientes.reduce((sum, c) => sum + (c.valor_multa_cop || 0), 0);

    let mensaje = `Señor/a ${cliente.nombre_completo}, tiene ${comparendos.length} comparendo${comparendos.length > 1 ? 's' : ''} registrado${comparendos.length > 1 ? 's' : ''}. `;

    if (pendientes.length > 0) {
      mensaje += `${pendientes.length} pendiente${pendientes.length > 1 ? 's' : ''} de pago por un total de $${totalDeuda.toLocaleString('es-CO')} pesos. `;
      mensaje += 'Recuerde que puede acceder a un curso pedagógico para obtener hasta el 50% de descuento.';
    } else {
      mensaje += 'Todos sus comparendos están resueltos.';
    }

    res.json({
      success: true,
      cliente: cliente.nombre_completo,
      comparendos: comparendos.map(c => ({
        numero: c.numero_comparendo,
        fecha: c.fecha_comparendo,
        infraccion: c.descripcion_infraccion,
        tipo: c.tipo_infraccion,
        valor: c.valor_multa_cop,
        estado: c.estado
      })),
      resumen: {
        total: comparendos.length,
        pendientes: pendientes.length,
        total_deuda: totalDeuda
      },
      mensaje_para_usuario: mensaje
    });

  } catch (error) {
    console.error('Error consulting fines:', error);
    res.json({
      success: false,
      mensaje_para_usuario: 'Disculpe, no pude consultar los comparendos. Puede verificar en el portal SIMIT.'
    });
  }
});

// POST /voice/laura/tools/agendar-cita - Schedule appointment
router.post('/laura/tools/agendar-cita', async (req, res) => {
  try {
    const { numero_cedula, tipo_tramite, fecha_preferida, hora_preferida } = req.body;

    if (!numero_cedula) {
      return res.json({
        success: false,
        mensaje_para_usuario: 'Necesito su número de cédula para agendar la cita.'
      });
    }

    const cedulaLimpia = numero_cedula.replace(/[\.\s-]/g, '');
    const cliente = await EnrutaCliente.findOne({
      where: { numero_documento: cedulaLimpia }
    });

    if (!cliente) {
      return res.json({
        success: false,
        mensaje_para_usuario: 'No lo encontré en el sistema. Primero necesito registrar sus datos.'
      });
    }

    // For now, create a renovation record with the appointment
    const { EnrutaSede } = require('../../models');
    const sede = await EnrutaSede.findOne({
      where: { esta_activa: true },
      order: [['creado_en', 'ASC']]
    });

    const referencia = `CITA-${Date.now().toString(36).toUpperCase()}`;

    // LA REFERENCIA SE GUARDA. Antes se generaba, se le dictaba al ciudadano y
    // no se escribía en ninguna columna: llegaba a la sede con un número que no
    // existía. `referencia_cita` es el campo del modelo.
    //
    // La hora también se perdía: se pasaba `hora_cita`, que NO es una columna
    // de EnrutaRenovacion, y Sequelize descarta en silencio lo que no conoce.
    // Ahora fecha y hora se combinan en `fecha_cita`, que sí es un timestamp,
    // en horario de Colombia. Lo mismo pasaba con `tipo_tramite`, que ahora
    // viaja en el historial.
    const hora = /^\d{1,2}:\d{2}$/.test(String(hora_preferida || '')) ? hora_preferida : '09:00';
    const hoy = hoyBogota();
    let fechaBase = /^\d{4}-\d{2}-\d{2}$/.test(String(fecha_preferida || ''))
      ? fecha_preferida
      : sumarDias(hoy, 3);

    // NO SE AGENDA EN EL PASADO. Un modelo al que se le pide "el quince de
    // septiembre" devuelve la fecha con el año que le parezca: la primera cita
    // real quedó en septiembre de 2024 y se confirmó en voz alta como si nada.
    // El prompt ya lleva la fecha de hoy; esto es la red debajo, porque el
    // ciudadano se entera del error cuando llega a la sede.
    if (fechaBase < hoy) {
      return res.json({
        success: false,
        mensaje_para_usuario: `Esa fecha ya pasó. ¿Para qué día quiere la cita? Hoy es ${hoy}.`,
        error: `fecha_preferida ${fechaBase} es anterior a hoy (${hoy}); confirme el día con el ciudadano`
      });
    }
    // El CDAV no atiende domingos: agendar uno es mandar a alguien a una puerta cerrada.
    if (new Date(`${fechaBase}T12:00:00-05:00`).getDay() === 0) {
      fechaBase = sumarDias(fechaBase, 1);
    }
    const cuando = new Date(`${fechaBase}T${hora.padStart(5, '0')}:00-05:00`);

    // Se ata la cita al documento que la motiva cuando se sabe cuál es, para
    // que la renovación no quede colgando de nadie.
    const documento = tipo_tramite
      ? await EnrutaDocumento.findOne({
        where: { cliente_id: cliente.id, tipo_documento: tipo_tramite },
        order: [['fecha_vencimiento', 'ASC']]
      })
      : null;

    await EnrutaRenovacion.create({
      tenant_id: cliente.tenant_id,
      cliente_id: cliente.id,
      documento_id: documento ? documento.id : null,
      estado_renovacion: 'cita_agendada',
      fecha_cita: cuando,
      sede_cita: sede?.nombre_sede || 'CDAV Sede Principal',
      referencia_cita: referencia,
      costo_estimado_cop: documento ? documento.costo_estimado_renovacion : null,
      iniciada_en: new Date(),
      historial_estados: [{
        estado: 'cita_agendada',
        fecha: new Date().toISOString(),
        tramite: tipo_tramite || null,
        nota: 'Cita agendada por Laura'
      }]
    });

    const sedeInfo = sede ? `${sede.nombre_sede}, ${sede.direccion}` : 'Calle 62 Norte # Av 3B-40, La Flora, Cali';
    const horario = sede?.horario_lunes_viernes || 'Lunes a viernes 7:45am a 4:55pm';

    res.json({
      success: true,
      cita: {
        referencia,
        fecha: fechaBase,
        hora,
        sede: sedeInfo,
        horario,
        costo_estimado_cop: documento ? documento.costo_estimado_renovacion : null
      },
      // Sin promesa de SMS: nada en este sistema envía uno hoy, y una cita que
      // el ciudadano espera confirmar por mensaje es una cita a la que no llega.
      mensaje_para_usuario: `Listo, señor o señora ${cliente.nombre_completo}, le agendé la cita para el ${fechaBase} a las ${hora}. Su número de referencia es ${referencia}, anótelo. Lo esperamos en ${sedeInfo}. Recuerde llevar su cédula original y los demás requisitos del trámite.`
    });

  } catch (error) {
    console.error('Error scheduling appointment:', error);
    res.json({
      success: false,
      mensaje_para_usuario: 'Disculpe, no pude agendar la cita en este momento. Puede llamar directamente al (602) 380 8957 para agendar.'
    });
  }
});

// GET /voice/laura/tools/info-sedes - Get CDAV location info
router.get('/laura/tools/info-sedes', async (req, res) => {
  try {
    const { EnrutaSede } = require('../../models');
    const sedes = await EnrutaSede.findAll({
      where: { esta_activa: true }
    });

    const sedesInfo = sedes.map(s => ({
      nombre: s.nombre_sede,
      direccion: s.direccion,
      barrio: s.barrio,
      ciudad: s.ciudad,
      telefono: s.telefono,
      whatsapp: s.whatsapp,
      horario_semana: s.horario_lunes_viernes,
      horario_sabado: s.horario_sabado,
      servicios: s.servicios_ofrecidos
    }));

    res.json({
      success: true,
      sedes: sedesInfo,
      mensaje_para_usuario: sedes.length > 0
        ? `Tenemos ${sedes.length} sede${sedes.length > 1 ? 's' : ''} disponible${sedes.length > 1 ? 's' : ''}. La sede principal está en ${sedes[0].direccion}, barrio ${sedes[0].barrio}. Horario: ${sedes[0].horario_lunes_viernes}.`
        : 'Lo siento, no tengo información de sedes disponible en este momento.'
    });

  } catch (error) {
    console.error('Error getting locations:', error);
    res.json({
      success: false,
      mensaje_para_usuario: 'La sede principal está en Calle 62 Norte # Avenida 3B-40, barrio La Flora en Cali. Horario de lunes a viernes 7:45am a 4:55pm.'
    });
  }
});

// GET /voice/laura/tools-schema - definición de herramientas en formato OpenAI/JSON-Schema
router.get('/laura/tools-schema', (req, res) => {
  res.json({
    tools: [
      {
        type: 'function',
        function: {
          name: 'consultar_documentos',
          description: 'Consulta el estado de los documentos de un ciudadano (licencia, SOAT, RTMyEC) usando su número de cédula',
          parameters: {
            type: 'object',
            properties: {
              numero_cedula: {
                type: 'string',
                description: 'Número de cédula de ciudadanía del usuario'
              }
            },
            required: ['numero_cedula']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'consultar_comparendos',
          description: 'Consulta los comparendos (multas de tránsito) de un ciudadano',
          parameters: {
            type: 'object',
            properties: {
              numero_cedula: {
                type: 'string',
                description: 'Número de cédula de ciudadanía'
              }
            },
            required: ['numero_cedula']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'agendar_cita',
          description: 'Agenda una cita para renovación de licencia u otro trámite vehicular',
          parameters: {
            type: 'object',
            properties: {
              numero_cedula: {
                type: 'string',
                description: 'Número de cédula del ciudadano'
              },
              tipo_tramite: {
                type: 'string',
                enum: ['renovacion_licencia', 'expedicion_licencia', 'rtmyec', 'soat'],
                description: 'Tipo de trámite a realizar'
              },
              fecha_preferida: {
                type: 'string',
                description: 'Fecha preferida en formato YYYY-MM-DD'
              },
              hora_preferida: {
                type: 'string',
                description: 'Hora preferida (ej: 09:00, 14:00)'
              }
            },
            required: ['numero_cedula']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'info_sedes',
          description: 'Obtiene información sobre las sedes del CDAV (direcciones, horarios, servicios)',
          parameters: {
            type: 'object',
            properties: {}
          }
        }
      }
    ]
  });
});

module.exports = router;
