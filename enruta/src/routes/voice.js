/**
 * ENRUTA - Voice API Routes
 * Laura AI agent voice integration (ElevenLabs + Twilio)
 */
const express = require('express');
const router = express.Router();
const {
  EnrutaCliente,
  EnrutaDocumento,
  EnrutaRegistroContacto,
  EnrutaRenovacion
} = require('../../models');
const { LAURA_SYSTEM_PROMPT, generateLauraContext, getMessageTemplate } = require('../../prompts/laura-agent');

// GET /voice/laura/prompt - Get Laura's system prompt for ElevenLabs
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

    // Return TwiML to connect to ElevenLabs
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://api.elevenlabs.io/v1/convai/conversation">
      <Parameter name="agent_id" value="${process.env.ELEVENLABS_ENRUTA_AGENT_ID || 'laura-enruta'}" />
    </Stream>
  </Connect>
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

    // Get documents that need calls
    const documentos = await EnrutaDocumento.findAll({
      where: {
        tenant_id,
        estado: {
          [require('sequelize').Op.in]: ['por_vencer_30_dias', 'por_vencer_15_dias', 'por_vencer_7_dias', 'vencido']
        }
      },
      limit: parseInt(limit),
      order: [
        [require('sequelize').literal(`
          CASE estado
            WHEN 'vencido' THEN 1
            WHEN 'por_vencer_7_dias' THEN 2
            WHEN 'por_vencer_15_dias' THEN 3
            WHEN 'por_vencer_30_dias' THEN 4
            ELSE 5
          END
        `), 'ASC'],
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
// ELEVENLABS TOOLS - Called by Laura during conversations
// =====================================================

// POST /voice/laura/tools/consultar-documentos - Look up documents by cedula
// This is called by ElevenLabs when Laura needs to check document status
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

    await EnrutaRenovacion.create({
      tenant_id: cliente.tenant_id,
      cliente_id: cliente.id,
      estado_renovacion: 'cita_agendada',
      fecha_cita: fecha_preferida || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
      hora_cita: hora_preferida || '09:00',
      sede_cita: sede?.nombre_sede || 'CDAV Sede Principal',
      tipo_tramite: tipo_tramite || 'renovacion_licencia',
      historial_estados: [{
        estado: 'cita_agendada',
        fecha: new Date().toISOString(),
        nota: 'Cita agendada por Laura via llamada telefónica'
      }]
    });

    const sedeInfo = sede ? `${sede.nombre_sede}, ${sede.direccion}` : 'Calle 62 Norte # Av 3B-40, La Flora, Cali';
    const horario = sede?.horario_lunes_viernes || 'Lunes a viernes 7:45am a 4:55pm';

    res.json({
      success: true,
      cita: {
        referencia,
        fecha: fecha_preferida || 'Por confirmar',
        hora: hora_preferida || '9:00 AM',
        sede: sedeInfo,
        horario: horario
      },
      mensaje_para_usuario: `Perfecto señor/a ${cliente.nombre_completo}, le agendé su cita. Su número de referencia es ${referencia}. Lo esperamos en ${sedeInfo}. Recuerde traer su cédula original y el examen médico vigente. Le enviaré un mensaje de texto con todos los detalles.`
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

// GET /voice/laura/tools-schema - ElevenLabs tool definitions
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
