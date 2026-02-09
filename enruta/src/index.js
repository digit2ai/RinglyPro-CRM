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

module.exports = app;
