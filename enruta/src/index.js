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

// Los datos de ENRUTA son de ciudadanos: nada de este módulo debe terminar
// en un índice de búsqueda, esté o no protegido con contraseña.
app.use((req, res, next) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  next();
});

// Siembra de demostración al arrancar, igual que el resto de verticales del
// repo (VERITAS_SEED_DEMO, SPEAKUP_SEED_DEMO...). Apagada por omisión.
//
// SIEMBRA UNA VEZ Y NO VUELVE. La guarda es la marca `[demo]` en las filas:
// si ya hay ciudadanos sembrados, no hace nada, así que la variable puede
// quedarse puesta en Render sin que cada despliegue rehaga la base. Para
// volver a sembrar está POST /admin/seed-demo.
if (process.env.ENRUTA_SEED_DEMO === '1') {
  setImmediate(async () => {
    try {
      const { sembrarDemo, MARCA_DEMO, TENANT_DEMO } = require('./services/demo-data');
      const tenant_id = process.env.ENRUTA_SEED_TENANT || TENANT_DEMO;
      const yaSembrado = await models.EnrutaCliente.count({ where: { tenant_id, notas: MARCA_DEMO } });
      if (yaSembrado > 0) {
        console.log(`ENRUTA: siembra de demostración omitida, ya hay ${yaSembrado} ciudadanos marcados`);
        return;
      }
      const resumen = await sembrarDemo(models, {
        tenant_id,
        clientes: process.env.ENRUTA_SEED_CLIENTES,
        semilla: process.env.ENRUTA_SEED_SEMILLA && Number(process.env.ENRUTA_SEED_SEMILLA),
        reset: process.env.ENRUTA_SEED_RESET === '1'
      });
      console.log('ENRUTA: datos de demostración sembrados', JSON.stringify(resumen.creado),
                  JSON.stringify(resumen.documentos_por_estado));
    } catch (e) {
      // Una siembra fallida no puede tumbar el módulo entero.
      console.error('ENRUTA: falló la siembra de demostración:', e.message);
    }
  });
}

// Puerta de acceso opcional (ver src/auth.js). Apagada sin ENRUTA_PASSWORD.
const auth = require('./auth');
auth.montarRutas(app);
app.use(auth.puerta);

if (auth.protegido()) {
  console.log('🔒 ENRUTA protegido con ENRUTA_PASSWORD');
  if (!auth.claveHerramientas()) {
    console.warn('⚠️  ENRUTA: /voice/* sigue ABIERTO — configure ENRUTA_TOOLS_KEY ' +
                 'y envíela como cabecera x-enruta-tools-key desde el cliente que las consume');
  }
} else {
  console.warn('⚠️  ENRUTA sin autenticación: el tablero y la API son públicos. ' +
               'Configure ENRUTA_PASSWORD para cerrarlos.');
}

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

    /* Mobile Responsive Styles */
    .mobile-menu-btn {
      display: none;
      background: transparent;
      border: none;
      color: white;
      padding: 8px;
      cursor: pointer;
    }
    .mobile-menu-btn svg {
      width: 24px;
      height: 24px;
    }
    .nav-links {
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    .mobile-drawer {
      display: none;
      position: fixed;
      top: 0;
      right: -100%;
      width: 280px;
      height: 100%;
      background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
      box-shadow: -4px 0 20px rgba(0,0,0,0.3);
      z-index: 1000;
      transition: right 0.3s ease;
      padding: 1rem;
    }
    .mobile-drawer.open {
      right: 0;
    }
    .mobile-drawer-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      z-index: 999;
      opacity: 0;
      visibility: hidden;
      transition: all 0.3s ease;
    }
    .mobile-drawer-overlay.open {
      opacity: 1;
      visibility: visible;
    }
    .mobile-drawer-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid rgba(255,255,255,0.2);
    }
    .mobile-drawer-close {
      background: transparent;
      border: none;
      color: white;
      font-size: 1.5rem;
      cursor: pointer;
      padding: 4px;
    }
    .mobile-nav-links {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .mobile-nav-links a {
      color: white;
      text-decoration: none;
      padding: 0.75rem 1rem;
      border-radius: 0.5rem;
      transition: background 0.2s;
    }
    .mobile-nav-links a:hover {
      background: rgba(255,255,255,0.1);
    }
    .mobile-search {
      margin-top: 1.5rem;
    }
    .mobile-search input {
      width: 100%;
      padding: 0.75rem 1rem;
      border-radius: 0.5rem;
      border: none;
      margin-bottom: 0.5rem;
    }
    .mobile-search button {
      width: 100%;
      padding: 0.75rem 1rem;
      border-radius: 0.5rem;
      border: none;
      background: #1e40af;
      color: white;
      cursor: pointer;
    }

    /* Desktop search */
    .desktop-search {
      display: flex;
    }

    @media (max-width: 768px) {
      .mobile-menu-btn {
        display: block;
      }
      .nav-links {
        display: none;
      }
      .mobile-drawer {
        display: block;
      }
      .mobile-drawer-overlay {
        display: block;
      }
      .desktop-search {
        display: none;
      }
      /* Hide title and subtitle on mobile - show only logo */
      .nav-brand h1 {
        display: none !important;
      }
      .nav-brand p {
        display: none !important;
      }
      .nav-brand > div {
        display: none !important;
      }
      .nav-brand img {
        height: 36px !important;
      }
      .nav-brand {
        gap: 0 !important;
      }
      /* Client modal on small screens */
      #cliente-modal > div {
        margin: 0.5rem;
        max-height: calc(100vh - 1rem);
      }
      #cliente-modal .gradient-bg {
        padding: 0.75rem 1rem;
      }
      #cliente-modal h2 {
        font-size: 1rem;
      }
      #modal-content {
        padding: 1rem;
      }
    }

    /* Improve grid on tablets */
    @media (min-width: 481px) and (max-width: 768px) {
      .grid-cols-1.md\\:grid-cols-4 {
        grid-template-columns: repeat(2, 1fr);
      }
    }

  </style>
</head>
<body class="bg-gray-100">
  <!-- Mobile Drawer Overlay -->
  <div id="mobile-drawer-overlay" class="mobile-drawer-overlay" onclick="closeMobileMenu()"></div>

  <!-- Mobile Drawer -->
  <div id="mobile-drawer" class="mobile-drawer">
    <div class="mobile-drawer-header">
      <span class="text-white font-bold">Menú</span>
      <button class="mobile-drawer-close" onclick="closeMobileMenu()">&times;</button>
    </div>
    <div class="mobile-nav-links">
      <a href="/enruta/api/dashboard/stats">📊 Dashboard API</a>
      <a href="https://cdav.gov.co" target="_blank">🏢 CDAV Colombia</a>
      <a href="/enruta/health">❤️ Estado del Sistema</a>
    </div>
    <div class="mobile-search">
      <input type="text" id="cedula-search-mobile" placeholder="Buscar por cédula..."
        onkeypress="if(event.key==='Enter') buscarClienteMobile()">
      <button onclick="buscarClienteMobile()">🔍 Buscar Cliente</button>
    </div>
  </div>

  <nav class="gradient-bg text-white p-4 shadow-lg">
    <div class="container mx-auto flex justify-between items-center">
      <div class="nav-brand flex items-center space-x-3">
        <img src="https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/698a435b6505127aa93fdf45.png" alt="ENRUTA" class="h-10 rounded-lg">
        <div>
          <h1 class="text-xl font-bold">ENRUTA</h1>
          <p class="text-xs text-blue-200">Sistema de Gestión Documental Vehicular</p>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <!-- Desktop Navigation -->
        <div class="nav-links">
          <div class="desktop-search flex items-center">
            <input type="text" id="cedula-search" placeholder="Buscar por cédula..."
              class="px-3 py-1.5 rounded-l-lg text-gray-800 text-sm w-44 focus:outline-none"
              onkeypress="if(event.key==='Enter') buscarCliente()">
            <button onclick="buscarCliente()" class="bg-blue-800 hover:bg-blue-900 px-3 py-1.5 rounded-r-lg text-sm">
              🔍
            </button>
          </div>
          <a href="/enruta/api/dashboard/stats" class="hover:text-blue-200">API</a>
          <a href="https://cdav.gov.co" target="_blank" class="hover:text-blue-200">CDAV</a>
        </div>

        <!-- Hamburger Menu Button (mobile only) -->
        <button class="mobile-menu-btn" onclick="openMobileMenu()">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>
    </div>
  </nav>

  <!-- Modal for client details -->
  <div id="cliente-modal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50 flex items-center justify-center">
    <div class="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden">
      <div class="gradient-bg text-white p-4 flex justify-between items-center">
        <h2 class="text-lg font-bold">Información del Cliente</h2>
        <button onclick="cerrarModal()" class="text-white hover:text-blue-200 text-2xl">&times;</button>
      </div>
      <div id="modal-content" class="p-6 overflow-y-auto max-h-[calc(90vh-60px)]">
        <p class="text-gray-500">Cargando...</p>
      </div>
    </div>
  </div>

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
        const res = await fetch('/enruta/api/documentos/por-vencer?limit=5&tenant_id=00000000-0000-0000-0000-000000000001');
        const data = await res.json();

        const container = document.getElementById('docs-list');
        if (data.success && data.data.length > 0) {
          container.innerHTML = data.data.map(doc => \`
            <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <div>
                <p class="font-medium text-gray-800">\${doc.cliente?.primer_nombre || ''} \${doc.cliente?.primer_apellido || 'N/A'}</p>
                <p class="text-sm text-gray-500">\${formatTipoDoc(doc.tipo_documento)} - Vence: \${formatDate(doc.fecha_vencimiento)}</p>
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

    async function buscarCliente() {
      const cedula = document.getElementById('cedula-search').value.trim();
      if (!cedula) {
        alert('Por favor ingrese un número de cédula');
        return;
      }

      const modal = document.getElementById('cliente-modal');
      const content = document.getElementById('modal-content');

      modal.classList.remove('hidden');
      content.innerHTML = '<p class="text-gray-500 text-center py-8">Buscando...</p>';

      try {
        const res = await fetch(\`/enruta/api/clientes/buscar/cedula?cedula=\${encodeURIComponent(cedula)}&tenant_id=00000000-0000-0000-0000-000000000001\`);
        const data = await res.json();

        if (data.success && data.data) {
          const c = data.data;
          const docs = c.documentos || [];

          content.innerHTML = \`
            <div class="space-y-6">
              <!-- Client Info -->
              <div class="bg-blue-50 rounded-lg p-4">
                <h3 class="text-lg font-bold text-gray-800 mb-3">\${c.nombre_completo || 'N/A'}</h3>
                <div class="grid grid-cols-2 gap-3 text-sm">
                  <div><span class="text-gray-500">Cédula:</span> <span class="font-medium">\${c.numero_documento}</span></div>
                  <div><span class="text-gray-500">Teléfono:</span> <span class="font-medium">\${c.telefono_principal || 'N/A'}</span></div>
                  <div><span class="text-gray-500">Email:</span> <span class="font-medium">\${c.correo_electronico || 'N/A'}</span></div>
                  <div><span class="text-gray-500">Ciudad:</span> <span class="font-medium">\${c.ciudad || 'N/A'}</span></div>
                  <div class="col-span-2"><span class="text-gray-500">Dirección:</span> <span class="font-medium">\${c.direccion || 'N/A'}</span></div>
                </div>
              </div>

              <!-- Documents -->
              <div>
                <h4 class="font-bold text-gray-700 mb-3">Documentos (\${docs.length})</h4>
                \${docs.length > 0 ? docs.map(doc => \`
                  <div class="border rounded-lg p-4 mb-3 \${
                    doc.estado === 'vencido' ? 'border-red-300 bg-red-50' :
                    doc.estado.includes('por_vencer') ? 'border-yellow-300 bg-yellow-50' :
                    'border-green-300 bg-green-50'
                  }">
                    <div class="flex justify-between items-start">
                      <div>
                        <p class="font-semibold text-gray-800">\${formatTipoDoc(doc.tipo_documento)}</p>
                        <p class="text-sm text-gray-600">No: \${doc.numero_documento || 'N/A'}</p>
                        \${doc.categoria_licencia ? \`<p class="text-sm text-gray-600">Categoría: \${doc.categoria_licencia}</p>\` : ''}
                      </div>
                      <span class="px-3 py-1 rounded-full text-xs font-medium \${
                        doc.estado === 'vencido' ? 'bg-red-200 text-red-700' :
                        doc.estado === 'por_vencer_7_dias' ? 'bg-orange-200 text-orange-700' :
                        doc.estado.includes('por_vencer') ? 'bg-yellow-200 text-yellow-700' :
                        'bg-green-200 text-green-700'
                      }">
                        \${formatEstado(doc.estado)}
                      </span>
                    </div>
                    <div class="mt-2 text-sm grid grid-cols-2 gap-2">
                      <div><span class="text-gray-500">Expedición:</span> \${formatDate(doc.fecha_expedicion)}</div>
                      <div><span class="text-gray-500">Vencimiento:</span> <span class="font-medium">\${formatDate(doc.fecha_vencimiento)}</span></div>
                    </div>
                    \${doc.estado === 'vencido' && doc.valor_multa_cop ? \`
                      <div class="mt-2 text-sm text-red-600 font-medium">
                        Multa estimada: $\${Number(doc.valor_multa_cop).toLocaleString('es-CO')} COP
                      </div>
                    \` : ''}
                  </div>
                \`).join('') : '<p class="text-gray-500">No hay documentos registrados</p>'}
              </div>
            </div>
          \`;
        } else {
          content.innerHTML = \`
            <div class="text-center py-8">
              <p class="text-red-500 text-lg mb-2">Cliente no encontrado</p>
              <p class="text-gray-500">No existe un cliente con cédula: \${cedula}</p>
            </div>
          \`;
        }
      } catch (error) {
        console.error('Error searching:', error);
        content.innerHTML = \`
          <div class="text-center py-8">
            <p class="text-red-500">Error al buscar cliente</p>
            <p class="text-gray-500 text-sm">\${error.message}</p>
          </div>
        \`;
      }
    }

    function cerrarModal() {
      document.getElementById('cliente-modal').classList.add('hidden');
    }

    function formatTipoDoc(tipo) {
      const tipos = {
        'licencia_conduccion': 'Licencia de Conducción',
        'soat': 'SOAT',
        'revision_tecnicomecanica': 'Revisión Técnico Mecánica',
        'tarjeta_propiedad': 'Tarjeta de Propiedad'
      };
      return tipos[tipo] || tipo;
    }

    function formatEstado(estado) {
      const estados = {
        'vigente': 'Vigente',
        'por_vencer_30_dias': 'Vence en 30 días',
        'por_vencer_15_dias': 'Vence en 15 días',
        'por_vencer_7_dias': 'Vence en 7 días',
        'vencido': 'VENCIDO'
      };
      return estados[estado] || estado;
    }

    function formatDate(dateStr) {
      if (!dateStr) return 'N/A';
      const d = new Date(dateStr);
      return d.toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' });
    }

    // Close modals on escape key (handled below with voice modal)

    // Close modal on background click
    document.getElementById('cliente-modal').addEventListener('click', (e) => {
      if (e.target.id === 'cliente-modal') cerrarModal();
    });

    // Load on page load
    loadStats();
    loadDocsList();

    // Refresh every 30 seconds
    setInterval(loadStats, 30000);

    // =====================================================
    // Mobile Menu Functions
    // =====================================================
    function openMobileMenu() {
      document.getElementById('mobile-drawer').classList.add('open');
      document.getElementById('mobile-drawer-overlay').classList.add('open');
      document.body.style.overflow = 'hidden';
    }

    function closeMobileMenu() {
      document.getElementById('mobile-drawer').classList.remove('open');
      document.getElementById('mobile-drawer-overlay').classList.remove('open');
      document.body.style.overflow = '';
    }

    function buscarClienteMobile() {
      const cedula = document.getElementById('cedula-search-mobile').value.trim();
      if (!cedula) {
        alert('Por favor ingrese un número de cédula');
        return;
      }
      document.getElementById('cedula-search').value = cedula;
      closeMobileMenu();
      buscarCliente();
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        cerrarModal();
        closeMobileMenu();
      }
    });

    // =====================================================
    // Laura - orbe de voz propio
    //
    //   Oído -> Web Speech API, en el navegador
    //   Cerebro -> POST /api/voice-agent/chat (Claude Haiku)
    //   Voz -> POST /api/tts/edge, voz Dalia (es-MX-DaliaNeural)
    //
    // El orbe solo puede hablar de lo que se le entrega: por eso se le empuja
    // la base de conocimiento de trámites más la foto en vivo del tablero. Sin
    // eso solo leería las tarjetas de la página y no sabría una tarifa.
    // =====================================================
    const TENANT_ID = '00000000-0000-0000-0000-000000000001';

    async function cargarContextoLaura() {
      try {
        const r = await fetch('/enruta/voice/laura/contexto?tenant_id=' + TENANT_ID);
        const d = await r.json();
        if (d && d.success && d.contexto && window.D2AIVoiceOrb) {
          window.D2AIVoiceOrb.setContext(d.contexto);
        }
      } catch (err) {
        // Sin contexto el orbe cae a leer la página: degrada, no se rompe.
        console.warn('No se pudo cargar el contexto de Laura:', err.message);
      }
    }

    // El script del orbe es defer: existe después de parsear, no ahora.
    (function esperarOrbe(intentos) {
      if (window.D2AIVoiceOrb) return cargarContextoLaura();
      if (intentos <= 0) return console.warn('El orbe de voz no cargó');
      setTimeout(() => esperarOrbe(intentos - 1), 200);
    })(25);

    // Las cifras del tablero envejecen; el contexto se refresca con ellas.
    setInterval(cargarContextoLaura, 300000);
  </script>

  <!-- Laura: orbe de voz propio. Sin SDK de terceros y sin llaves en el navegador. -->
  <div data-voice-orb
       data-agent="enruta"
       data-lang="es"
       data-voice="dalia"
       data-accent="#3b82f6"
       data-label="Hablar con Laura"></div>
  <script src="/embed/voice-orb.js" defer></script>
</body>
</html>
  `);
});

// =====================================================
// OPERACIONES ADMINISTRATIVAS
//
// Estas tres rutas alteran el esquema o insertan datos en la base de
// PRODUCCIÓN. Estaban expuestas como GET sin autenticación en /health/*:
// cualquier buscador, prefetch del navegador o visitante curioso que abriera
// /enruta/health/sync corría `sequelize.sync({ alter: true })` contra la base
// real, y /health/seed-test-data sembraba 180 ciudadanos ficticios más.
//
// Ahora: POST, fuera del espacio /health, con clave y confirmación explícita.
// Sin ENRUTA_ADMIN_KEY (ni JWT_SECRET) quedan deshabilitadas, nunca abiertas.
// =====================================================
const crypto = require('crypto');

function claveAdminConfigurada() {
  return process.env.ENRUTA_ADMIN_KEY || process.env.JWT_SECRET || null;
}

function mismaClave(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function requiereClaveAdmin(req, res, next) {
  const esperada = claveAdminConfigurada();
  if (!esperada) {
    return res.status(503).json({
      status: 'DISABLED',
      error: 'Operación administrativa deshabilitada: falta ENRUTA_ADMIN_KEY'
    });
  }
  const enviada = req.get('x-enruta-admin-key') || (req.body && req.body.admin_key);
  // 404 y no 403: una clave equivocada no debe confirmar que la ruta existe.
  if (!enviada || !mismaClave(enviada, esperada)) {
    return res.status(404).json({ success: false, error: 'Endpoint not found' });
  }
  next();
}

function requiereConfirmacion(req, res, next) {
  if (req.body && req.body.confirmar === true) return next();
  return res.status(400).json({
    status: 'ERROR',
    error: 'Envíe { "confirmar": true } para ejecutar esta operación sobre la base de producción'
  });
}

// POST /enruta/admin/sync - Sincroniza el esquema (antes: GET /health/sync)
app.post('/admin/sync', requiereClaveAdmin, requiereConfirmacion, async (req, res) => {
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

// POST /enruta/admin/seed-sedes - Siembra las sedes CDAV (antes: GET /health/seed)
app.post('/admin/seed-sedes', requiereClaveAdmin, requiereConfirmacion, async (req, res) => {
  try {
    const { EnrutaSede } = models;

    // Default tenant ID (you can make this dynamic)
    const tenantId = (req.body && req.body.tenant_id) || '00000000-0000-0000-0000-000000000001';

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
// POST /enruta/admin/seed-demo - Siembra datos de demostración
//
// El generador vive en services/demo-data.js. La versión que estaba aquí
// escribía vencimientos con fechas literales, así que la demostración
// envejecía: medio año después el tablero era un muro de vencidos. El
// generador nuevo calcula el reparto contra el día en que se corre.
//
// Cuerpo: { confirmar:true, reset?:bool, clientes?:number, semilla?:number,
//           tenant_id?:uuid }
// `reset` BORRA las filas de este tenant antes de sembrar. Es la forma de
// dejar una demostración limpia en vez de apilar siembras, y por eso hay que
// pedirlo a propósito.
app.post('/admin/seed-demo', requiereClaveAdmin, requiereConfirmacion, async (req, res) => {
  try {
    const { sembrarDemo } = require('./services/demo-data');
    const resumen = await sembrarDemo(models, {
      tenant_id: req.body.tenant_id,
      clientes: req.body.clientes,
      semilla: req.body.semilla,
      reset: req.body.reset === true
    });
    res.json({ status: 'OK', message: 'Datos de demostración sembrados', ...resumen });
  } catch (error) {
    console.error('Seed demo error:', error);
    res.status(500).json({ status: 'ERROR', error: error.message });
  }
});

module.exports = app;
