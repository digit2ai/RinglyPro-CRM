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
      /* Voice widget stays visible but smaller */
      .voice-widget {
        margin-left: auto;
      }
      .voice-label {
        font-size: 12px;
      }
      .voice-btn {
        width: 36px;
        height: 36px;
      }
      .voice-btn .inner {
        width: 28px;
        height: 28px;
      }
      /* Cards on mobile */
      main.container {
        padding: 1rem;
      }
      .card {
        padding: 1rem;
      }
      .card .text-3xl {
        font-size: 1.5rem;
      }
      /* Footer */
      footer {
        padding: 1rem;
      }
      footer p {
        font-size: 0.75rem;
      }
    }

    @media (max-width: 480px) {
      nav {
        padding: 0.75rem !important;
      }
      .nav-brand {
        gap: 0.5rem !important;
      }
      .voice-label {
        display: none;
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
      /* Mic permission modal */
      .mic-modal {
        padding: 1.5rem;
        margin: 1rem;
      }
      .mic-modal-icon {
        width: 60px;
        height: 60px;
      }
      .mic-modal-icon svg {
        width: 30px;
        height: 30px;
      }
    }

    /* Improve grid on tablets */
    @media (min-width: 481px) and (max-width: 768px) {
      .grid-cols-1.md\\:grid-cols-4 {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    /* Voice Agent Widget Styles - Styled like Virginia */
    .voice-widget {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .voice-label {
      font-size: 14px;
      font-weight: 500;
      color: #f97316;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .voice-label::before {
      content: '';
      display: inline-block;
      width: 8px;
      height: 8px;
      background: #f97316;
      border-radius: 50%;
    }
    .voice-label.speaking::before {
      animation: pulse 1s infinite;
    }

    .voice-btn {
      position: relative;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
      box-shadow: 0 4px 6px rgba(0,0,0,0.2);
    }
    .voice-btn:hover { transform: scale(1.1); }
    .voice-btn:active { transform: scale(0.95); }
    .voice-btn.inactive { background: linear-gradient(135deg, #374151, #1f2937); }
    .voice-btn.active { background: linear-gradient(135deg, #f97316, #ea580c); }
    .voice-btn.connecting { background: #6b7280; opacity: 0.7; cursor: wait; }

    .voice-btn .ping {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      border: 2px solid #fb923c;
      animation: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;
    }
    .voice-btn .glow {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      filter: blur(4px);
      transition: all 0.3s;
    }
    .voice-btn.inactive .glow {
      background: linear-gradient(90deg, #f97316, #fb923c, #f97316);
      opacity: 0.3;
    }
    .voice-btn.active .glow {
      background: #f97316;
      opacity: 0.5;
    }
    .voice-btn .inner {
      position: relative;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s;
    }
    .voice-btn.inactive .inner { background: linear-gradient(135deg, #4b5563, #1f2937); }
    .voice-btn.active .inner { background: linear-gradient(135deg, #fb923c, #ea580c); }
    .voice-btn .inner svg { width: 16px; height: 16px; color: white; }
    .voice-btn .highlight {
      position: absolute;
      top: 4px;
      left: 6px;
      width: 8px;
      height: 6px;
      border-radius: 50%;
      background: white;
      opacity: 0.3;
      filter: blur(1px);
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    @keyframes ping {
      75%, 100% { transform: scale(1.5); opacity: 0; }
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    /* Microphone Permission Modal */
    .mic-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      opacity: 0;
      visibility: hidden;
      transition: all 0.3s ease;
    }
    .mic-modal-overlay.show {
      opacity: 1;
      visibility: visible;
    }
    .mic-modal {
      background: white;
      border-radius: 1rem;
      padding: 2rem;
      max-width: 400px;
      width: 90%;
      text-align: center;
      transform: scale(0.9);
      transition: transform 0.3s ease;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
    }
    .mic-modal-overlay.show .mic-modal {
      transform: scale(1);
    }
    .mic-modal-icon {
      width: 80px;
      height: 80px;
      margin: 0 auto 1.5rem;
      background: linear-gradient(135deg, #3b82f6, #1e3a8a);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: pulse-mic 2s ease-in-out infinite;
    }
    .mic-modal-icon svg {
      width: 40px;
      height: 40px;
      color: white;
    }
    @keyframes pulse-mic {
      0%, 100% { box-shadow: 0 0 0 0 rgba(59,130,246,0.4); }
      50% { box-shadow: 0 0 0 20px rgba(59,130,246,0); }
    }
    .mic-modal h3 {
      font-size: 1.25rem;
      font-weight: 700;
      color: #1f2937;
      margin-bottom: 0.5rem;
    }
    .mic-modal p {
      color: #6b7280;
      margin-bottom: 1.5rem;
      line-height: 1.5;
    }
    .mic-modal-btn {
      width: 100%;
      padding: 0.875rem 1.5rem;
      border-radius: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
    }
    .mic-modal-btn.primary {
      background: linear-gradient(135deg, #3b82f6, #1e3a8a);
      color: white;
      margin-bottom: 0.75rem;
    }
    .mic-modal-btn.primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(59,130,246,0.4);
    }
    .mic-modal-btn.secondary {
      background: #f3f4f6;
      color: #4b5563;
    }
    .mic-modal-btn.secondary:hover {
      background: #e5e7eb;
    }
    .mic-modal-hint {
      margin-top: 1rem;
      padding: 0.75rem;
      background: #fef3c7;
      border-radius: 0.5rem;
      font-size: 0.75rem;
      color: #92400e;
      display: none;
    }
    .mic-modal-hint.show {
      display: block;
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

        <!-- Voice Agent Widget - Laura (always visible) -->
        <div class="voice-widget">
          <span id="voice-label" class="voice-label">Laura</span>
          <button id="voice-btn" class="voice-btn inactive" onclick="toggleVoiceAgent()" title="Hablar con Laura">
            <div class="glow"></div>
            <div class="inner">
              <svg id="voice-icon-mic" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              <svg id="voice-icon-x" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="display:none;">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
              <svg id="voice-icon-spinner" fill="none" viewBox="0 0 24 24" style="display:none; animation: spin 1s linear infinite;">
                <circle opacity="0.25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path opacity="0.75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
            <div class="highlight"></div>
            <div id="voice-ping" class="ping" style="display:none;"></div>
          </button>
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

  <!-- Microphone Permission Modal -->
  <div id="mic-modal-overlay" class="mic-modal-overlay">
    <div class="mic-modal">
      <div class="mic-modal-icon">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
      </div>
      <h3>Hablar con Laura</h3>
      <p>Laura es nuestra asistente virtual. Necesita acceso a tu micrófono para escucharte.</p>
      <button class="mic-modal-btn primary" onclick="confirmMicPermission()">
        Permitir Micrófono
      </button>
      <button class="mic-modal-btn secondary" onclick="closeMicModal()">
        Cancelar
      </button>
      <div id="mic-modal-hint" class="mic-modal-hint">
        <strong>Permiso denegado.</strong> Para habilitar el micrófono:<br>
        1. Haz clic en el icono del candado 🔒 en la barra de direcciones<br>
        2. Busca "Micrófono" y selecciona "Permitir"<br>
        3. Recarga la página
      </div>
    </div>
  </div>

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

    // =====================================================
    // Voice Agent - Laura (ElevenLabs Conversational AI)
    // =====================================================
    const LAURA_AGENT_ID = 'agent_7901kh24ng7zfsg9v14jwd58bn5x';
    let voiceConversation = null;
    let voiceStatus = 'disconnected'; // disconnected, connecting, connected

    // Update UI based on voice status
    function updateVoiceUI(status, message) {
      voiceStatus = status;
      const btn = document.getElementById('voice-btn');
      const label = document.getElementById('voice-label');
      const iconMic = document.getElementById('voice-icon-mic');
      const iconX = document.getElementById('voice-icon-x');
      const iconSpinner = document.getElementById('voice-icon-spinner');
      const ping = document.getElementById('voice-ping');

      // Reset all icons
      iconMic.style.display = 'none';
      iconX.style.display = 'none';
      iconSpinner.style.display = 'none';
      ping.style.display = 'none';

      // Reset button classes
      btn.classList.remove('inactive', 'active', 'connecting');
      label.classList.remove('speaking');

      switch (status) {
        case 'disconnected':
          btn.classList.add('inactive');
          iconMic.style.display = 'block';
          label.textContent = 'Laura';
          btn.title = 'Hablar con Laura';
          break;
        case 'connecting':
          btn.classList.add('connecting');
          iconSpinner.style.display = 'block';
          label.textContent = 'Conectando...';
          btn.title = 'Conectando...';
          break;
        case 'connected':
          btn.classList.add('active');
          iconX.style.display = 'block';
          ping.style.display = 'block';
          if (message === 'Laura habla...') {
            label.textContent = 'Laura habla...';
            label.classList.add('speaking');
          } else {
            label.textContent = 'Laura';
          }
          btn.title = 'Terminar llamada';
          break;
        case 'error':
          btn.classList.add('inactive');
          iconMic.style.display = 'block';
          label.textContent = message || 'Error';
          btn.title = 'Error - Click para reintentar';
          setTimeout(() => {
            label.textContent = 'Laura';
          }, 3000);
          break;
      }
    }

    // Show microphone permission modal
    function showMicModal() {
      document.getElementById('mic-modal-overlay').classList.add('show');
      document.getElementById('mic-modal-hint').classList.remove('show');
    }

    // Close microphone permission modal
    function closeMicModal() {
      document.getElementById('mic-modal-overlay').classList.remove('show');
    }

    // User confirmed microphone permission
    async function confirmMicPermission() {
      try {
        // Request microphone permission
        console.log('Requesting microphone...');
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log('Microphone granted');

        // Close modal and start session
        closeMicModal();
        await actuallyStartVoiceSession();

      } catch (err) {
        console.error('Microphone permission denied:', err);
        // Show hint about how to enable
        document.getElementById('mic-modal-hint').classList.add('show');
      }
    }

    // Toggle voice agent on/off
    async function toggleVoiceAgent() {
      if (voiceStatus === 'connecting') return;

      if (voiceStatus === 'connected') {
        await endVoiceSession();
      } else {
        // Show permission modal first
        showMicModal();
      }
    }

    // Actually start voice conversation with Laura (after permission granted)
    async function actuallyStartVoiceSession() {
      try {
        updateVoiceUI('connecting');

        // Load ElevenLabs client dynamically if not already loaded
        if (!window.ElevenLabsClient) {
          console.log('Loading ElevenLabs SDK...');
          await loadElevenLabsSDK();
        }

        // Create conversation
        console.log('Starting conversation with Laura:', LAURA_AGENT_ID);
        voiceConversation = await window.ElevenLabsClient.Conversation.startSession({
          agentId: LAURA_AGENT_ID,
          onConnect: () => {
            console.log('ElevenLabs: Connected');
            updateVoiceUI('connected', 'Escuchando...');
          },
          onDisconnect: () => {
            console.log('ElevenLabs: Disconnected');
            updateVoiceUI('disconnected');
            voiceConversation = null;
          },
          onError: (error) => {
            console.error('ElevenLabs error:', error);
            updateVoiceUI('error', 'Error de conexión');
            voiceConversation = null;
          },
          onModeChange: (mode) => {
            console.log('Mode:', mode);
            if (mode.mode === 'speaking') {
              updateVoiceUI('connected', 'Laura habla...');
            } else {
              updateVoiceUI('connected', 'Escuchando...');
            }
          }
        });

        console.log('Session started:', voiceConversation);

      } catch (err) {
        console.error('Failed to start voice session:', err);
        updateVoiceUI('error', err.message || 'No se pudo conectar');
      }
    }

    // End voice conversation
    async function endVoiceSession() {
      try {
        console.log('Ending voice session...');
        if (voiceConversation) {
          await voiceConversation.endSession();
          voiceConversation = null;
        }
        updateVoiceUI('disconnected');
      } catch (err) {
        console.error('Error ending session:', err);
        updateVoiceUI('disconnected');
      }
    }

    // Load ElevenLabs SDK from CDN (requires livekit-client)
    function loadElevenLabsSDK() {
      return new Promise((resolve, reject) => {
        if (window.ElevenLabsClient) {
          resolve();
          return;
        }

        // First load livekit-client dependency
        const livekitScript = document.createElement('script');
        livekitScript.src = 'https://cdn.jsdelivr.net/npm/livekit-client@2.9.0/dist/livekit-client.umd.min.js';
        livekitScript.onload = () => {
          console.log('LiveKit SDK loaded');

          // Then load ElevenLabs client
          const elevenLabsScript = document.createElement('script');
          elevenLabsScript.src = 'https://cdn.jsdelivr.net/npm/@11labs/client@0.2.0/dist/lib.umd.min.js';
          elevenLabsScript.onload = () => {
            console.log('ElevenLabs SDK loaded');
            // The UMD exports to window.client
            window.ElevenLabsClient = window.client;
            resolve();
          };
          elevenLabsScript.onerror = () => {
            reject(new Error('Failed to load ElevenLabs SDK'));
          };
          document.head.appendChild(elevenLabsScript);
        };
        livekitScript.onerror = () => {
          reject(new Error('Failed to load LiveKit SDK'));
        };
        document.head.appendChild(livekitScript);
      });
    }

    // Close mic modal on background click
    document.getElementById('mic-modal-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'mic-modal-overlay') closeMicModal();
    });

    // Also close mic modal on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeMicModal();
        cerrarModal();
        closeMobileMenu();
      }
    });
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
        evento_disparador: 'post_llamada_recordatorio',
        cuerpo: 'Hola {nombre}, su {documento} vence el {fecha_vencimiento}. Renuévelo en CDAV: cdav.gov.co o llame al (602) 380 8957'
      },
      {
        nombre_plantilla: 'Cita Confirmada',
        tipo_plantilla: 'whatsapp',
        evento_disparador: 'confirmacion_cita',
        cuerpo: '¡Cita confirmada! {nombre}, lo esperamos el {fecha_cita} a las {hora_cita} en {sede}. Traiga: {requisitos}'
      },
      {
        nombre_plantilla: 'Documento Vencido',
        tipo_plantilla: 'sms',
        evento_disparador: 'aviso_vencimiento',
        cuerpo: '{nombre}, su {documento} está VENCIDO. Multa: ${valor_multa}. Renueve YA: cdav.gov.co'
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
