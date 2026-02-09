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

module.exports = router;
