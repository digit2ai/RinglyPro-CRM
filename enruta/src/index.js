/**
 * ENRUTA - Vehicle Document Management System with AI
 * Main entry point - Express sub-app for RinglyPro
 * URL: aiagent.ringlypro.com/enruta
 */
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express.Router();

// Import models
const models = require('../models');
const { sequelize } = models;

// Import routes
const clientesRoutes = require('./routes/clientes');
const documentosRoutes = require('./routes/documentos');
const contactosRoutes = require('./routes/contactos');
const renovacionesRoutes = require('./routes/renovaciones');
const sedesRoutes = require('./routes/sedes');
const campanasRoutes = require('./routes/campanas');
const plantillasRoutes = require('./routes/plantillas');
const comparendosRoutes = require('./routes/comparendos');
const dashboardRoutes = require('./routes/dashboard');
const voiceRoutes = require('./routes/voice');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files for dashboard
app.use('/static', express.static(path.join(__dirname, '../public')));

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({
      status: 'OK',
      service: 'ENRUTA - Vehicle Document Management',
      version: '1.0.0',
      database: 'connected',
      timestamp: new Date().toISOString(),
      endpoints: {
        api: '/enruta/api/*',
        dashboard: '/enruta/',
        voice: '/enruta/voice/*'
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      service: 'ENRUTA',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// API Routes
app.use('/api/clientes', clientesRoutes);
app.use('/api/documentos', documentosRoutes);
app.use('/api/contactos', contactosRoutes);
app.use('/api/renovaciones', renovacionesRoutes);
app.use('/api/sedes', sedesRoutes);
app.use('/api/campanas', campanasRoutes);
app.use('/api/plantillas', plantillasRoutes);
app.use('/api/comparendos', comparendosRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Voice AI Routes (Laura agent)
app.use('/voice', voiceRoutes);

// Dashboard UI (serve React app or EJS template)
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ENRUTA - Gestión Documental Vehicular</title>
  <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
  <style>
    .gradient-bg { background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); }
    .card { background: white; border-radius: 1rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
  </style>
</head>
<body class="bg-gray-100">
  <nav class="gradient-bg text-white p-4 shadow-lg">
    <div class="container mx-auto flex justify-between items-center">
      <div class="flex items-center space-x-3">
        <img src="https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/68ec2cfb385c9833a43e685f.png" alt="RinglyPro" class="h-8">
        <div>
          <h1 class="text-xl font-bold">ENRUTA</h1>
          <p class="text-xs text-blue-200">Sistema de Gestión Documental Vehicular</p>
        </div>
      </div>
      <div class="flex space-x-4">
        <a href="/enruta/api/dashboard/stats" class="hover:text-blue-200">API</a>
        <a href="https://cdav.gov.co" target="_blank" class="hover:text-blue-200">CDAV</a>
      </div>
    </div>
  </nav>

  <main class="container mx-auto p-6">
    <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      <div class="card p-6">
        <div class="text-3xl font-bold text-blue-600" id="total-clientes">-</div>
        <div class="text-gray-500">Clientes Registrados</div>
      </div>
      <div class="card p-6">
        <div class="text-3xl font-bold text-yellow-500" id="docs-por-vencer">-</div>
        <div class="text-gray-500">Docs Por Vencer</div>
      </div>
      <div class="card p-6">
        <div class="text-3xl font-bold text-red-500" id="docs-vencidos">-</div>
        <div class="text-gray-500">Docs Vencidos</div>
      </div>
      <div class="card p-6">
        <div class="text-3xl font-bold text-green-500" id="llamadas-hoy">-</div>
        <div class="text-gray-500">Llamadas Hoy</div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="card p-6">
        <h2 class="text-lg font-bold mb-4 text-gray-800">Documentos Por Vencer</h2>
        <div id="docs-list" class="space-y-3">
          <p class="text-gray-500">Cargando...</p>
        </div>
      </div>

      <div class="card p-6">
        <h2 class="text-lg font-bold mb-4 text-gray-800">Agente Laura - Estado</h2>
        <div class="flex items-center space-x-3 mb-4">
          <div class="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
          <span class="text-green-600 font-semibold">En Línea</span>
        </div>
        <div class="bg-gray-50 p-4 rounded-lg">
          <p class="text-sm text-gray-600">Laura está lista para realizar llamadas de recordatorio a ciudadanos con documentos por vencer.</p>
          <div class="mt-4 flex space-x-3">
            <button onclick="iniciarCampana()" class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition">
              Iniciar Campaña
            </button>
            <button onclick="verEstadisticas()" class="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition">
              Ver Estadísticas
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="card p-6 mt-6">
      <h2 class="text-lg font-bold mb-4 text-gray-800">Información del Sistema</h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div>
          <h3 class="font-semibold text-gray-700">CDAV/enRuta</h3>
          <p class="text-gray-500">Centro de Diagnóstico Automotor del Valle</p>
          <p class="text-gray-500">Cali, Valle del Cauca, Colombia</p>
        </div>
        <div>
          <h3 class="font-semibold text-gray-700">Contacto</h3>
          <p class="text-gray-500">Línea: (602) 380 8957</p>
          <p class="text-gray-500">WhatsApp: +57 317 513 4171</p>
        </div>
        <div>
          <h3 class="font-semibold text-gray-700">Servicios</h3>
          <p class="text-gray-500">Licencias de Conducción</p>
          <p class="text-gray-500">Revisión Técnico Mecánica (RTMyEC)</p>
        </div>
      </div>
    </div>
  </main>

  <footer class="bg-gray-800 text-white p-4 mt-8">
    <div class="container mx-auto text-center text-sm">
      <p>ENRUTA - Powered by <a href="https://ringlypro.com" class="text-blue-400 hover:underline">RinglyPro</a></p>
      <p class="text-gray-400 mt-1">Sistema de gestión documental vehicular con inteligencia artificial</p>
    </div>
  </footer>

  <script>
    // Load dashboard stats
    async function loadStats() {
      try {
        const res = await fetch('/enruta/api/dashboard/stats');
        const data = await res.json();

        if (data.success) {
          document.getElementById('total-clientes').textContent = data.stats.total_clientes || 0;
          document.getElementById('docs-por-vencer').textContent = data.stats.documentos_por_vencer || 0;
          document.getElementById('docs-vencidos').textContent = data.stats.documentos_vencidos || 0;
          document.getElementById('llamadas-hoy').textContent = data.stats.llamadas_hoy || 0;
        }
      } catch (error) {
        console.error('Error loading stats:', error);
      }
    }

    async function loadDocsList() {
      try {
        const res = await fetch('/enruta/api/documentos/por-vencer?limit=5');
        const data = await res.json();

        const container = document.getElementById('docs-list');
        if (data.success && data.data.length > 0) {
          container.innerHTML = data.data.map(doc => \`
            <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <div>
                <p class="font-medium text-gray-800">\${doc.cliente?.nombre_completo || 'N/A'}</p>
                <p class="text-sm text-gray-500">\${doc.tipo_documento} - Vence: \${doc.fecha_vencimiento}</p>
              </div>
              <span class="px-3 py-1 rounded-full text-xs font-medium \${
                doc.estado === 'vencido' ? 'bg-red-100 text-red-600' :
                doc.estado === 'por_vencer_7_dias' ? 'bg-yellow-100 text-yellow-600' :
                'bg-blue-100 text-blue-600'
              }">
                \${doc.estado.replace(/_/g, ' ')}
              </span>
            </div>
          \`).join('');
        } else {
          container.innerHTML = '<p class="text-gray-500">No hay documentos por vencer</p>';
        }
      } catch (error) {
        console.error('Error loading docs:', error);
      }
    }

    function iniciarCampana() {
      alert('Funcionalidad de campaña próximamente');
    }

    function verEstadisticas() {
      window.location.href = '/enruta/api/dashboard/stats';
    }

    // Load on page load
    loadStats();
    loadDocsList();

    // Refresh every 30 seconds
    setInterval(loadStats, 30000);
  </script>
</body>
</html>
  `);
});

// Sync database (create tables if not exist)
app.get('/health/sync', async (req, res) => {
  try {
    await sequelize.sync({ alter: true });
    res.json({
      status: 'OK',
      message: 'Database synchronized successfully',
      tables: Object.keys(models).filter(k => k !== 'sequelize' && k !== 'Sequelize')
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      error: error.message
    });
  }
});

// Seed initial CDAV locations
app.get('/health/seed', async (req, res) => {
  try {
    const { EnrutaSede } = models;

    // Default tenant ID (you can make this dynamic)
    const tenantId = req.query.tenant_id || '00000000-0000-0000-0000-000000000001';

    // CDAV/enRuta official locations
    const sedes = [
      {
        tenant_id: tenantId,
        nombre_sede: 'CDAV Sede Principal - Licencias de Conducción',
        tipo_sede: 'organismo_transito',
        departamento: 'Valle del Cauca',
        ciudad: 'Cali',
        barrio: 'La Flora',
        direccion: 'Calle 62 Norte # Avenida 3B - 40',
        codigo_postal: '760045',
        telefono: '(602) 380 8957',
        whatsapp: '+573175134171',
        sitio_web: 'https://cdav.gov.co',
        horario_lunes_viernes: '7:45 a.m. a 1:00 p.m. / 2:15 p.m. a 4:55 p.m.',
        horario_sabado: '8:00 a.m. a 12:00 m',
        horario_domingo: 'Cerrado',
        servicios_ofrecidos: ['licencia_expedicion', 'licencia_renovacion', 'licencia_recategorizacion', 'licencia_duplicado'],
        esta_activa: true
      },
      {
        tenant_id: tenantId,
        nombre_sede: 'CDAV Sede RTMyEC - Revisión Técnico Mecánica',
        tipo_sede: 'cda',
        departamento: 'Valle del Cauca',
        ciudad: 'Cali',
        barrio: 'La Flora',
        direccion: 'Calle 70 Norte # 3B - 81',
        telefono: '(602) 380 8957',
        whatsapp: '+573175134171',
        sitio_web: 'https://cdav.gov.co',
        horario_lunes_viernes: '7:30 a.m. a 5:30 p.m.',
        horario_sabado: '7:30 a.m. a 1:30 p.m.',
        horario_domingo: 'Cerrado',
        servicios_ofrecidos: ['rtmyec'],
        tipos_vehiculos_atendidos: ['liviano', 'pesado', 'motocicleta', 'electrico'],
        esta_activa: true
      }
    ];

    for (const sede of sedes) {
      await EnrutaSede.findOrCreate({
        where: {
          tenant_id: sede.tenant_id,
          nombre_sede: sede.nombre_sede
        },
        defaults: sede
      });
    }

    res.json({
      status: 'OK',
      message: 'CDAV locations seeded successfully',
      count: sedes.length
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      error: error.message
    });
  }
});

// Seed comprehensive test data for dashboard testing
app.get('/health/seed-test-data', async (req, res) => {
  try {
    const {
      EnrutaCliente,
      EnrutaDocumento,
      EnrutaRegistroContacto,
      EnrutaRenovacion,
      EnrutaCampana,
      EnrutaPlantillaMensaje,
      EnrutaComparendo
    } = models;

    const tenantId = req.query.tenant_id || '00000000-0000-0000-0000-000000000001';

    // Colombian first names
    const nombres = ['Carlos', 'María', 'José', 'Ana', 'Luis', 'Diana', 'Andrés', 'Paola', 'Juan', 'Laura',
                     'Pedro', 'Sofía', 'Miguel', 'Valentina', 'Diego', 'Camila', 'Fernando', 'Daniela', 'Ricardo', 'Isabella'];
    const apellidos = ['García', 'Rodríguez', 'Martínez', 'López', 'González', 'Hernández', 'Sánchez', 'Ramírez',
                       'Torres', 'Flores', 'Rivera', 'Gómez', 'Díaz', 'Reyes', 'Morales', 'Jiménez', 'Ruiz', 'Álvarez', 'Romero', 'Vargas'];
    const ciudades = ['Cali', 'Palmira', 'Yumbo', 'Jamundí', 'Candelaria', 'Buga'];
    const barrios = ['La Flora', 'Granada', 'San Fernando', 'Ciudad Jardín', 'El Ingenio', 'Chipichape', 'Centenario', 'Versalles'];

    // Helper functions
    const random = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    const randomPhone = () => `+5731${randomInt(0, 9)}${randomInt(1000000, 9999999)}`;
    const randomCedula = () => `${randomInt(10, 99)}${randomInt(100000, 999999)}${randomInt(100, 999)}`;

    const addDays = (date, days) => {
      const result = new Date(date);
      result.setDate(result.getDate() + days);
      return result;
    };

    // Create 25 test clients
    const clientes = [];
    for (let i = 0; i < 25; i++) {
      const primerNombre = random(nombres);
      const segundoNombre = Math.random() > 0.5 ? random(nombres) : null;
      const primerApellido = random(apellidos);
      const segundoApellido = random(apellidos);

      const [cliente] = await EnrutaCliente.findOrCreate({
        where: {
          tenant_id: tenantId,
          numero_documento: randomCedula()
        },
        defaults: {
          tenant_id: tenantId,
          tipo_documento: 'CC',
          numero_documento: randomCedula(),
          primer_nombre: primerNombre,
          segundo_nombre: segundoNombre,
          primer_apellido: primerApellido,
          segundo_apellido: segundoApellido,
          nombre_completo: [primerNombre, segundoNombre, primerApellido, segundoApellido].filter(Boolean).join(' '),
          fecha_nacimiento: new Date(randomInt(1960, 2000), randomInt(0, 11), randomInt(1, 28)),
          genero: Math.random() > 0.5 ? 'masculino' : 'femenino',
          correo_electronico: `${primerNombre.toLowerCase()}.${primerApellido.toLowerCase()}${randomInt(1, 99)}@gmail.com`,
          telefono_principal: randomPhone(),
          ciudad: random(ciudades),
          departamento: 'Valle del Cauca',
          barrio: random(barrios),
          direccion: `Calle ${randomInt(1, 100)} # ${randomInt(1, 50)} - ${randomInt(1, 99)}`,
          estado: 'activo',
          consentimiento_llamadas: true,
          consentimiento_sms: true,
          consentimiento_whatsapp: true,
          no_llamar: false,
          canal_preferido: random(['llamada', 'whatsapp', 'sms'])
        }
      });
      clientes.push(cliente);
    }

    // Document states and expiration dates
    const today = new Date();
    const docStates = [
      { estado: 'vigente', daysOffset: randomInt(60, 365) },
      { estado: 'por_vencer_30_dias', daysOffset: randomInt(20, 30) },
      { estado: 'por_vencer_15_dias', daysOffset: randomInt(10, 15) },
      { estado: 'por_vencer_7_dias', daysOffset: randomInt(1, 7) },
      { estado: 'vencido', daysOffset: randomInt(-90, -1) }
    ];

    const tiposDoc = ['licencia_conduccion', 'soat', 'revision_tecnicomecanica', 'tarjeta_propiedad'];
    const categoriasLicencia = ['A1', 'A2', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3'];

    // Create documents for each client
    const documentos = [];
    for (const cliente of clientes) {
      // Each client gets 1-3 documents
      const numDocs = randomInt(1, 3);
      const usedTypes = new Set();

      for (let j = 0; j < numDocs; j++) {
        let tipoDoc = random(tiposDoc);
        while (usedTypes.has(tipoDoc)) {
          tipoDoc = random(tiposDoc);
        }
        usedTypes.add(tipoDoc);

        const stateInfo = random(docStates);
        const fechaVencimiento = addDays(today, stateInfo.daysOffset);

        const [doc] = await EnrutaDocumento.findOrCreate({
          where: {
            tenant_id: tenantId,
            cliente_id: cliente.id,
            tipo_documento: tipoDoc
          },
          defaults: {
            tenant_id: tenantId,
            cliente_id: cliente.id,
            tipo_documento: tipoDoc,
            numero_documento: tipoDoc === 'licencia_conduccion' ? randomCedula() : `${randomInt(100000, 999999)}`,
            categoria_licencia: tipoDoc === 'licencia_conduccion' ? random(categoriasLicencia) : null,
            fecha_expedicion: addDays(fechaVencimiento, tipoDoc === 'licencia_conduccion' ? -3650 : -365),
            fecha_vencimiento: fechaVencimiento,
            estado: stateInfo.estado,
            tipo_multa: stateInfo.estado === 'vencido' ? random(['C', 'D']) : null,
            valor_multa_cop: stateInfo.estado === 'vencido' ? random([695000, 1207800, 1390000]) : null,
            riesgo_inmovilizacion: stateInfo.estado === 'vencido'
          }
        });
        documentos.push(doc);
      }
    }

    // Create contact records (call history)
    // Valid resultado values from model validation
    const resultados = ['informado_renovara', 'cita_agendada', 'ya_renovo', 'necesita_seguimiento', 'no_interesado', 'solicito_info_sms', 'no_contactado'];
    const contactos = [];

    for (let i = 0; i < 40; i++) {
      const cliente = random(clientes);
      const doc = documentos.find(d => d.cliente_id === cliente.id) || random(documentos);
      const resultado = random(resultados);
      // Valid estado_llamada: completada, buzon_voz, sin_respuesta, ocupado, fallida, numero_equivocado
      const estadoLlamada = resultado === 'no_contactado' ? random(['sin_respuesta', 'buzon_voz', 'ocupado']) : 'completada';
      const llamadaInicio = addDays(today, -randomInt(0, 30));
      const duracion = resultado === 'no_contactado' ? 0 : randomInt(30, 300);

      const contacto = await EnrutaRegistroContacto.create({
        tenant_id: tenantId,
        cliente_id: cliente.id,
        documento_id: doc.id,
        direccion_llamada: Math.random() > 0.8 ? 'entrante' : 'saliente',
        tipo_llamada: random(['recordatorio_30_dias', 'recordatorio_15_dias', 'recordatorio_7_dias', 'seguimiento']),
        estado_llamada: estadoLlamada,
        resultado: resultado,
        numero_origen: '+5723808957',
        numero_destino: cliente.telefono_principal,
        llamada_inicio: llamadaInicio,
        llamada_fin: new Date(llamadaInicio.getTime() + duracion * 1000),
        duracion_llamada_segundos: duracion,
        version_agente_ia: 'laura-v1.0',
        resumen_conversacion: resultado === 'cita_agendada'
          ? 'Cliente agendó cita para renovación de documentos'
          : resultado === 'informado_renovara'
          ? 'Cliente informado sobre vencimiento, confirmó que renovará'
          : null,
        requiere_seguimiento: resultado === 'necesita_seguimiento',
        fecha_seguimiento: resultado === 'necesita_seguimiento' ? addDays(today, randomInt(1, 7)) : null
      });
      contactos.push(contacto);
    }

    // Create active campaigns
    const campanas = [];
    const nombresCampana = [
      'Campaña Licencias Vencidas Enero',
      'Recordatorio SOAT Febrero',
      'RTMyEC Urgente Q1',
      'Seguimiento Clientes Inactivos'
    ];

    for (const nombreCampana of nombresCampana) {
      const [campana] = await EnrutaCampana.findOrCreate({
        where: {
          tenant_id: tenantId,
          nombre_campana: nombreCampana
        },
        defaults: {
          tenant_id: tenantId,
          nombre_campana: nombreCampana,
          descripcion: `Campaña automatizada para ${nombreCampana.toLowerCase()}`,
          tipo_campana: random(['recordatorio_30', 'recordatorio_15', 'recordatorio_7', 'vencidos', 'personalizada']),
          estado: random(['activa', 'pausada', 'borrador']),
          tipos_documentos_objetivo: [random(tiposDoc)],
          inicio_programado: addDays(today, -randomInt(0, 14)),
          fin_programado: addDays(today, randomInt(7, 30)),
          total_objetivos: randomInt(50, 200),
          llamadas_realizadas: randomInt(20, 80),
          llamadas_contestadas: randomInt(10, 40),
          llamadas_exitosas: randomInt(5, 20),
          renovaciones_iniciadas: randomInt(2, 10)
        }
      });
      campanas.push(campana);
    }

    // Create message templates
    const plantillas = [
      {
        nombre_plantilla: 'Recordatorio 30 días',
        tipo_plantilla: 'sms',
        evento_disparador: 'recordatorio_30_dias',
        contenido: 'Hola {{nombre}}, su {{documento}} vence el {{fecha_vencimiento}}. Renuévelo en CDAV: cdav.gov.co o llame al (602) 380 8957'
      },
      {
        nombre_plantilla: 'Cita Confirmada',
        tipo_plantilla: 'whatsapp',
        evento_disparador: 'cita_agendada',
        contenido: '✅ ¡Cita confirmada! {{nombre}}, lo esperamos el {{fecha_cita}} a las {{hora_cita}} en {{sede}}. Traiga: {{requisitos}}'
      },
      {
        nombre_plantilla: 'Documento Vencido',
        tipo_plantilla: 'sms',
        evento_disparador: 'documento_vencido',
        contenido: '⚠️ {{nombre}}, su {{documento}} está VENCIDO. Multa: ${{valor_multa}}. Renueve YA: cdav.gov.co'
      }
    ];

    for (const plantilla of plantillas) {
      await EnrutaPlantillaMensaje.findOrCreate({
        where: {
          tenant_id: tenantId,
          nombre_plantilla: plantilla.nombre_plantilla
        },
        defaults: {
          tenant_id: tenantId,
          ...plantilla,
          variables_requeridas: ['nombre', 'documento', 'fecha_vencimiento'],
          esta_activa: true
        }
      });
    }

    // Create some traffic fines (comparendos)
    const infracciones = [
      { codigo: 'C29', descripcion: 'No portar licencia de conducción', tipo: 'C', valor: 695000 },
      { codigo: 'D12', descripcion: 'No tener SOAT vigente', tipo: 'D', valor: 1207800 },
      { codigo: 'C35', descripcion: 'No tener RTMyEC vigente', tipo: 'C', valor: 695000 }
    ];

    for (let i = 0; i < 8; i++) {
      const cliente = random(clientes);
      const infraccion = random(infracciones);

      await EnrutaComparendo.findOrCreate({
        where: {
          tenant_id: tenantId,
          numero_comparendo: `VAL${randomInt(100000, 999999)}`
        },
        defaults: {
          tenant_id: tenantId,
          cliente_id: cliente.id,
          numero_comparendo: `VAL${randomInt(100000, 999999)}`,
          fecha_comparendo: addDays(today, -randomInt(1, 180)),
          descripcion_infraccion: infraccion.descripcion,
          tipo_infraccion: infraccion.tipo,
          valor_multa_cop: infraccion.valor,
          estado: random(['pendiente', 'en_proceso', 'curso_pedagogico', 'pagado', 'resuelto'])
        }
      });
    }

    res.json({
      status: 'OK',
      message: 'Test data seeded successfully',
      summary: {
        clientes: clientes.length,
        documentos: documentos.length,
        contactos: contactos.length,
        campanas: campanas.length,
        plantillas: plantillas.length,
        comparendos: 8
      }
    });

  } catch (error) {
    console.error('Seed error:', error);
    res.status(500).json({
      status: 'ERROR',
      error: error.message,
      stack: error.stack
    });
  }
});

module.exports = app;
