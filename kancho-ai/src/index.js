// kancho-ai/src/index.js
// Kancho Martial Arts AI - Main Entry Point
// Mounted at /kanchoai in the main RinglyPro app

const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const app = express();

// Admin auth middleware - verifies bridge JWT for admin-only endpoints
const KANCHO_JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
  try {
    const decoded = jwt.verify(token, KANCHO_JWT_SECRET);
    req.schoolId = decoded.schoolId;
    req.clientId = decoded.clientId;
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

// Kancho AI Logo URL
const KANCHO_LOGO_URL = 'https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/698d318b7f6dcf1134316df1.png';
const KANCHO_STRIPE_LOGO_URL = 'https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/698d245d721397289ba56c7d.png';

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static dashboard files
app.use(express.static(path.join(__dirname, '../dashboard/dist')));

// Serve PWA static files (service worker - manifest is dynamic)
app.use('/sw.js', express.static(path.join(__dirname, '../public/sw.js')));

// Dynamic manifest.json that adapts to the domain
app.get('/manifest.json', (req, res) => {
  const host = req.get('host') || '';
  const isKanchoDomain = host.includes('kanchoai.com');

  // Use root paths for kanchoai.com, /kanchoai paths for other domains
  const basePath = isKanchoDomain ? '/' : '/kanchoai/';

  const manifest = {
    name: 'Kancho AI - Business Intelligence',
    short_name: 'Kancho AI',
    description: 'AI Business Intelligence Officer for martial arts schools',
    start_url: basePath,
    display: 'standalone',
    background_color: '#0D0D0D',
    theme_color: '#E85A4F',
    orientation: 'portrait-primary',
    icons: [
      {
        src: 'https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/698d318b7f6dcf1134316df1.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any maskable'
      },
      {
        src: 'https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/698d318b7f6dcf1134316df1.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable'
      }
    ],
    categories: ['business', 'productivity'],
    lang: 'en',
    dir: 'ltr'
  };

  res.setHeader('Content-Type', 'application/manifest+json');
  res.json(manifest);
});

// Student Portal PWA manifest
app.get('/student-manifest.json', (req, res) => {
  const host = req.get('host') || '';
  const isKanchoDomain = host.includes('kanchoai.com');
  const basePath = isKanchoDomain ? '/student/' : '/kanchoai/student/';

  res.setHeader('Content-Type', 'application/manifest+json');
  res.json({
    name: 'My Dojo - Student Portal',
    short_name: 'My Dojo',
    description: 'Track attendance, schedule, belt progress & payments',
    start_url: basePath,
    display: 'standalone',
    background_color: '#0D0D0D',
    theme_color: '#E85A4F',
    orientation: 'portrait-primary',
    icons: [
      { src: 'https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/698d318b7f6dcf1134316df1.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: 'https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/698d318b7f6dcf1134316df1.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
    ],
    categories: ['education', 'health-fitness'],
    lang: 'en',
    dir: 'ltr'
  });
});

// Student Portal service worker
app.get('/student-sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send([
    "const CACHE_NAME = 'student-portal-v1';",
    "const urlsToCache = [];",
    "",
    "self.addEventListener('install', (event) => {",
    "  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)));",
    "  self.skipWaiting();",
    "});",
    "",
    "self.addEventListener('activate', (event) => {",
    "  event.waitUntil(",
    "    caches.keys().then(names => Promise.all(",
    "      names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))",
    "    ))",
    "  );",
    "  self.clients.claim();",
    "});",
    "",
    "self.addEventListener('fetch', (event) => {",
    "  if (event.request.method !== 'GET') return;",
    "  if (event.request.url.includes('/api/')) return;",
    "  event.respondWith(",
    "    fetch(event.request).then(response => {",
    "      if (response.ok) {",
    "        const clone = response.clone();",
    "        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));",
    "      }",
    "      return response;",
    "    }).catch(() => caches.match(event.request))",
    "  );",
    "});"
  ].join('\n'));
});

// Import models
let models;
let modelsError = null;

try {
  models = require('../models');
  console.log('Kancho AI Models loaded:', Object.keys(models).filter(k => k.startsWith('Kancho')));
} catch (error) {
  modelsError = error;
  console.error('Error loading Kancho AI models:', error.message);
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    service: 'Kancho Martial Arts AI',
    status: modelsError ? 'degraded' : 'healthy',
    timestamp: new Date().toISOString(),
    models: modelsError ? null : Object.keys(models).filter(k => k.startsWith('Kancho')),
    error: modelsError ? modelsError.message : null,
    endpoints: {
      dashboard: '/kanchoai/',
      api: '/kanchoai/api/v1/*',
      health: '/kanchoai/health'
    }
  });
});

// Dashboard Metrics Guide - Styled HTML page
app.get('/metrics-guide', (req, res) => {
  const fs = require('fs');
  const guidePath = path.join(__dirname, '../docs/DASHBOARD_METRICS_GUIDE.md');

  let markdownContent = '';
  try {
    markdownContent = fs.readFileSync(guidePath, 'utf8');
  } catch (error) {
    return res.status(404).send('Guide not found');
  }

  // Simple markdown to HTML conversion
  let htmlContent = markdownContent;

  // First, handle tables separately to avoid line break issues
  // Find all table blocks and convert them
  htmlContent = htmlContent.replace(/(\|[^\n]+\|\n)+/g, (tableBlock) => {
    const rows = tableBlock.trim().split('\n');
    let tableHtml = '<div class="overflow-x-auto my-6"><table class="w-full border border-kancho-dark-border rounded-lg overflow-hidden">';
    let isFirstDataRow = true;

    rows.forEach((row, index) => {
      const cells = row.split('|').filter(c => c.trim() !== '');
      // Skip separator rows (|---|---|)
      if (cells.every(c => /^[\s-:]+$/.test(c))) {
        return;
      }
      // First row is header
      if (index === 0) {
        tableHtml += '<thead><tr>';
        cells.forEach(c => {
          tableHtml += `<th class="px-4 py-3 text-left text-xs font-bold text-kancho uppercase bg-kancho-dark-card">${c.trim().replace(/\*\*/g, '')}</th>`;
        });
        tableHtml += '</tr></thead><tbody>';
      } else {
        tableHtml += '<tr>';
        cells.forEach(c => {
          tableHtml += `<td class="px-4 py-3 text-sm text-gray-300 border-t border-kancho-dark-border">${c.trim().replace(/\*\*/g, '')}</td>`;
        });
        tableHtml += '</tr>';
      }
    });
    tableHtml += '</tbody></table></div>';
    return tableHtml;
  });

  // Now process the rest
  htmlContent = htmlContent
    // Headers
    .replace(/^### (.*$)/gim, '<h3 class="text-xl font-bold mt-6 mb-3 text-kancho">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 class="text-2xl font-bold mt-8 mb-4 text-white border-b border-kancho-dark-border pb-2">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 class="text-4xl font-bold mb-6 text-white">$1</h1>')
    // Bold and italic
    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Code blocks
    .replace(/```([a-z]*)\n([\s\S]*?)```/g, '<pre class="bg-kancho-dark-card border border-kancho-dark-border rounded-lg p-4 my-4 overflow-x-auto text-sm"><code class="text-green-400">$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="bg-kancho-dark-card px-2 py-1 rounded text-kancho text-sm">$1</code>')
    // Lists - wrap in ul/ol
    .replace(/^- (.*$)/gim, '<li class="ml-4 mb-1 text-gray-300">$1</li>')
    .replace(/^(\d+)\. (.*$)/gim, '<li class="ml-4 mb-1 text-gray-300"><span class="text-kancho font-bold mr-2">$1.</span>$2</li>')
    // Wrap consecutive list items
    .replace(/(<li[^>]*>.*?<\/li>\n?)+/g, '<ul class="my-3 list-disc list-inside">$&</ul>')
    // Horizontal rules
    .replace(/^---$/gim, '<hr class="border-kancho-dark-border my-6">')
    // Clean up empty paragraphs and excessive line breaks
    .replace(/\n{3,}/g, '\n\n')
    // Paragraphs
    .replace(/\n\n(?!<)/g, '</p><p class="text-gray-300 mb-3 leading-relaxed">')
    // Single line breaks (not before HTML tags)
    .replace(/\n(?!<)/g, ' ')
    // Remove empty paragraphs
    .replace(/<p[^>]*>\s*<\/p>/g, '');

  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard Metrics Guide - Kancho AI</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            'kancho': '#E85A4F',
            'kancho-coral': '#E85A4F',
            'kancho-dark': '#0D0D0D',
            'kancho-dark-card': '#1A1A1A',
            'kancho-dark-border': '#2A2A2A'
          }
        }
      }
    }
  </script>
  <style>
    body { background: linear-gradient(180deg, #0D0D0D 0%, #1A1A1A 100%); }
  </style>
</head>
<body class="min-h-screen text-gray-300">
  <!-- Header -->
  <header class="border-b border-kancho-dark-border sticky top-0 z-50 bg-kancho-dark/95 backdrop-blur-xl">
    <div class="max-w-4xl mx-auto flex items-center justify-between px-6 py-4">
      <a href="/kanchoai" class="flex items-center gap-3 hover:opacity-80 transition">
        <img src="${KANCHO_LOGO_URL}" alt="Kancho AI" class="w-10 h-10 rounded-lg object-contain">
        <div>
          <h1 class="text-xl font-bold text-white tracking-tight">KANCHO AI</h1>
          <p class="text-xs text-gray-500">Dashboard Metrics Guide</p>
        </div>
      </a>
      <a href="/kanchoai" class="px-4 py-2 bg-kancho-dark-card border border-kancho-dark-border rounded-lg text-sm hover:bg-kancho-coral/20 hover:border-kancho-coral transition flex items-center gap-2">
        <i class="fas fa-arrow-left"></i>
        Back to Dashboard
      </a>
    </div>
  </header>

  <!-- Content -->
  <main class="max-w-4xl mx-auto px-6 py-12">
    <div class="prose prose-invert max-w-none">
      <p class="text-gray-300 mb-4 leading-relaxed">
      ${htmlContent}
      </p>
    </div>
  </main>

  <!-- Footer -->
  <footer class="border-t border-kancho-dark-border mt-16">
    <div class="max-w-4xl mx-auto px-6 py-8 text-center">
      <p class="text-gray-500 text-sm">&copy; ${new Date().getFullYear()} Kancho AI. All rights reserved.</p>
    </div>
  </footer>
</body>
</html>
  `);
});

// Helper function to generate styled static pages
function generateStaticPage(title, content, extraContent = '') {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Kancho AI</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            'kancho': '#E85A4F',
            'kancho-coral': '#E85A4F',
            'kancho-dark': '#0D0D0D',
            'kancho-dark-card': '#1A1A1A',
            'kancho-dark-border': '#2A2A2A'
          }
        }
      }
    }
  </script>
  <style>
    body { background: linear-gradient(180deg, #0D0D0D 0%, #1A1A1A 100%); }
  </style>
</head>
<body class="min-h-screen text-gray-300">
  <header class="border-b border-kancho-dark-border sticky top-0 z-50 bg-kancho-dark/95 backdrop-blur-xl">
    <div class="max-w-4xl mx-auto flex items-center justify-between px-6 py-4">
      <a href="/kanchoai" class="flex items-center gap-3 hover:opacity-80 transition">
        <img src="${KANCHO_LOGO_URL}" alt="Kancho AI" class="w-10 h-10 rounded-lg object-contain">
        <div>
          <h1 class="text-xl font-bold text-white tracking-tight">KANCHO AI</h1>
          <p class="text-xs text-gray-500">${title}</p>
        </div>
      </a>
      <a href="/kanchoai" class="px-4 py-2 bg-kancho-dark-card border border-kancho-dark-border rounded-lg text-sm hover:bg-kancho-coral/20 hover:border-kancho-coral transition flex items-center gap-2">
        <i class="fas fa-arrow-left"></i>
        Back to Dashboard
      </a>
    </div>
  </header>
  <main class="max-w-4xl mx-auto px-6 py-12">
    ${content}
  </main>
  <footer class="border-t border-kancho-dark-border mt-16">
    <div class="max-w-4xl mx-auto px-6 py-8 text-center">
      <p class="text-gray-500 text-sm">&copy; ${new Date().getFullYear()} Kancho AI. All rights reserved.</p>
    </div>
  </footer>
  ${extraContent}
</body>
</html>
  `;
}

// Features Page
app.get('/features', (req, res) => {
  res.send(generateStaticPage('Features', `
    <h1 class="text-4xl font-bold mb-6 text-white">Kancho AI Features</h1>
    <p class="text-gray-300 mb-8 text-lg">Powerful AI-driven tools designed specifically for martial arts schools and fitness businesses.</p>

    <div class="grid gap-8">
      <div class="bg-kancho-dark-card border border-kancho-dark-border rounded-2xl p-6">
        <div class="flex items-center gap-4 mb-4">
          <div class="w-12 h-12 bg-kancho-coral/20 rounded-xl flex items-center justify-center">
            <i class="fas fa-brain text-kancho text-xl"></i>
          </div>
          <h2 class="text-2xl font-bold text-white">AI Business Intelligence</h2>
        </div>
        <p class="text-gray-400 mb-4">Get real-time insights into your business performance with our AI-powered analytics dashboard.</p>
        <ul class="space-y-2 text-gray-300">
          <li class="flex items-center gap-2"><i class="fas fa-check text-green-400"></i> Health Score monitoring (0-100)</li>
          <li class="flex items-center gap-2"><i class="fas fa-check text-green-400"></i> Revenue tracking and forecasting</li>
          <li class="flex items-center gap-2"><i class="fas fa-check text-green-400"></i> Trend analysis and insights</li>
        </ul>
      </div>

      <div class="bg-kancho-dark-card border border-kancho-dark-border rounded-2xl p-6">
        <div class="flex items-center gap-4 mb-4">
          <div class="w-12 h-12 bg-kancho-coral/20 rounded-xl flex items-center justify-center">
            <i class="fas fa-user-shield text-kancho text-xl"></i>
          </div>
          <h2 class="text-2xl font-bold text-white">Churn Detection & Prevention</h2>
        </div>
        <p class="text-gray-400 mb-4">Identify at-risk members before they leave and take action to retain them.</p>
        <ul class="space-y-2 text-gray-300">
          <li class="flex items-center gap-2"><i class="fas fa-check text-green-400"></i> Predictive churn risk scoring</li>
          <li class="flex items-center gap-2"><i class="fas fa-check text-green-400"></i> Attendance pattern monitoring</li>
          <li class="flex items-center gap-2"><i class="fas fa-check text-green-400"></i> Automated retention alerts</li>
        </ul>
      </div>

      <div class="bg-kancho-dark-card border border-kancho-dark-border rounded-2xl p-6">
        <div class="flex items-center gap-4 mb-4">
          <div class="w-12 h-12 bg-kancho-coral/20 rounded-xl flex items-center justify-center">
            <i class="fas fa-fire text-kancho text-xl"></i>
          </div>
          <h2 class="text-2xl font-bold text-white">Lead Scoring & Prioritization</h2>
        </div>
        <p class="text-gray-400 mb-4">Focus your time on the leads most likely to convert with AI-powered lead scoring.</p>
        <ul class="space-y-2 text-gray-300">
          <li class="flex items-center gap-2"><i class="fas fa-check text-green-400"></i> Hot, warm, cold lead classification</li>
          <li class="flex items-center gap-2"><i class="fas fa-check text-green-400"></i> Conversion probability scoring</li>
          <li class="flex items-center gap-2"><i class="fas fa-check text-green-400"></i> Follow-up reminders</li>
        </ul>
      </div>

      <div class="bg-kancho-dark-card border border-kancho-dark-border rounded-2xl p-6">
        <div class="flex items-center gap-4 mb-4">
          <div class="w-12 h-12 bg-kancho-coral/20 rounded-xl flex items-center justify-center">
            <i class="fas fa-microphone text-kancho text-xl"></i>
          </div>
          <h2 class="text-2xl font-bold text-white">Voice AI Assistant</h2>
        </div>
        <p class="text-gray-400 mb-4">Talk to Kancho anytime to get instant business insights and recommendations.</p>
        <ul class="space-y-2 text-gray-300">
          <li class="flex items-center gap-2"><i class="fas fa-check text-green-400"></i> Natural voice conversations</li>
          <li class="flex items-center gap-2"><i class="fas fa-check text-green-400"></i> Bilingual support (English/Spanish)</li>
          <li class="flex items-center gap-2"><i class="fas fa-check text-green-400"></i> 24/7 AI receptionist (Pro plan)</li>
        </ul>
      </div>
    </div>

    <div class="mt-12 text-center">
      <a href="/kanchoai#pricing" class="inline-flex items-center gap-2 px-8 py-4 bg-kancho-coral hover:bg-kancho-coral/80 rounded-xl font-medium transition">
        <i class="fas fa-rocket"></i>
        Start Free Trial
      </a>
    </div>
  `));
});

// Pricing Page
app.get('/pricing', (req, res) => {
  res.send(generateStaticPage('Pricing', `
    <h1 class="text-4xl font-bold mb-6 text-white">Simple, Transparent Pricing</h1>
    <p class="text-gray-300 mb-8 text-lg">Choose the plan that fits your martial arts school. All plans include a 14-day free trial.</p>

    <div class="grid md:grid-cols-2 gap-8 mb-12">
      <div class="bg-kancho-dark-card border border-kancho-dark-border rounded-2xl p-8">
        <h2 class="text-2xl font-bold text-white mb-2">Kancho Intelligence</h2>
        <p class="text-gray-400 mb-4">AI Business Intelligence</p>
        <div class="flex items-baseline gap-1 mb-6">
          <span class="text-4xl font-bold text-kancho">$197</span>
          <span class="text-gray-400">/month</span>
        </div>
        <ul class="space-y-3 mb-8">
          <li class="flex items-center gap-3 text-gray-300"><i class="fas fa-check text-green-400"></i> AI Business Intelligence Officer</li>
          <li class="flex items-center gap-3 text-gray-300"><i class="fas fa-check text-green-400"></i> CRM Integration</li>
          <li class="flex items-center gap-3 text-gray-300"><i class="fas fa-check text-green-400"></i> Health Score Monitoring</li>
          <li class="flex items-center gap-3 text-gray-300"><i class="fas fa-check text-green-400"></i> Churn Detection & Alerts</li>
          <li class="flex items-center gap-3 text-gray-300"><i class="fas fa-check text-green-400"></i> Lead Scoring</li>
          <li class="flex items-center gap-3 text-gray-300"><i class="fas fa-check text-green-400"></i> Revenue Analytics</li>
          <li class="flex items-center gap-3 text-gray-300"><i class="fas fa-check text-green-400"></i> Voice AI Advisor</li>
          <li class="flex items-center gap-3 text-gray-300"><i class="fas fa-check text-green-400"></i> 100 AI Voice Minutes</li>
        </ul>
        <button onclick="selectPlan('intelligence')" class="w-full py-3 bg-white/10 hover:bg-kancho-coral/20 border border-kancho-dark-border rounded-xl font-medium transition">Get Started</button>
      </div>

      <div class="bg-kancho-dark-card border-2 border-kancho-coral/50 rounded-2xl p-8 relative">
        <div class="absolute -top-4 left-1/2 transform -translate-x-1/2">
          <span class="bg-kancho-coral px-4 py-1 rounded-full text-sm font-bold text-white">MOST POPULAR</span>
        </div>
        <h2 class="text-2xl font-bold text-white mb-2">Kancho Pro</h2>
        <p class="text-gray-400 mb-4">Intelligence + AI Receptionist</p>
        <div class="flex items-baseline gap-1 mb-6">
          <span class="text-4xl font-bold text-kancho">$397</span>
          <span class="text-gray-400">/month</span>
        </div>
        <ul class="space-y-3 mb-8">
          <li class="flex items-center gap-3 text-gray-300"><i class="fas fa-check text-green-400"></i> <strong>Everything in Intelligence</strong></li>
          <li class="flex items-center gap-3 text-gray-300"><i class="fas fa-check text-green-400"></i> 24/7 AI Receptionist</li>
          <li class="flex items-center gap-3 text-gray-300"><i class="fas fa-check text-green-400"></i> Automated Lead Follow-up</li>
          <li class="flex items-center gap-3 text-gray-300"><i class="fas fa-check text-green-400"></i> Retention Campaigns</li>
          <li class="flex items-center gap-3 text-gray-300"><i class="fas fa-check text-green-400"></i> No-show Recovery</li>
          <li class="flex items-center gap-3 text-gray-300"><i class="fas fa-check text-green-400"></i> Payment Reminders</li>
          <li class="flex items-center gap-3 text-gray-300"><i class="fas fa-check text-green-400"></i> Bilingual (EN/ES)</li>
          <li class="flex items-center gap-3 text-gray-300"><i class="fas fa-check text-green-400"></i> 500 AI Voice Minutes</li>
        </ul>
        <button onclick="selectPlan('pro')" class="w-full py-3 kancho-btn rounded-xl font-medium transition shadow-lg">Get Started</button>
      </div>
    </div>

    <div class="text-center">
      <p class="text-gray-400 mb-4">Need a custom enterprise solution?</p>
      <button onclick="document.getElementById('pricingBookingModal').classList.remove('hidden'); document.getElementById('pricingBookingModal').classList.add('flex');" class="text-kancho hover:underline cursor-pointer">Schedule a call for custom pricing</button>
    </div>
  `, `
    <!-- Booking Modal for Pricing Page (Custom Enterprise) -->
    <div id="pricingBookingModal" class="hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] items-center justify-center p-4 overflow-y-auto">
      <div class="bg-kancho-dark-card border border-kancho-dark-border rounded-3xl w-full max-w-3xl shadow-2xl my-4 mx-auto">
        <div class="p-6 border-b border-kancho-dark-border flex items-center justify-between sticky top-0 bg-kancho-dark-card z-10 rounded-t-3xl">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden bg-kancho-coral/20">
              <img src="${KANCHO_LOGO_URL}" alt="Kancho" class="w-10 h-10 object-contain">
            </div>
            <div>
              <h3 class="text-lg font-bold text-white">Schedule Your Demo</h3>
              <p class="text-sm text-gray-400">Book a personalized session with our team</p>
            </div>
          </div>
          <button onclick="document.getElementById('pricingBookingModal').classList.add('hidden'); document.getElementById('pricingBookingModal').classList.remove('flex');" class="p-2 hover:bg-white/10 rounded-lg transition">
            <i class="fas fa-times text-gray-400"></i>
          </button>
        </div>
        <div class="p-4">
          <iframe src="https://api.leadconnectorhq.com/widget/booking/nhKuDsn2At5csiDYc4d0" style="width: 100%; height: 700px; border: none;" scrolling="yes"></iframe>
        </div>
      </div>
    </div>
    <script src="https://link.msgsndr.com/js/form_embed.js" type="text/javascript"></script>
  `));
});

// Pricing Page (Spanish)
app.get('/es/pricing', (req, res) => {
  res.send(generateStaticPage('Precios', `
    <h1 class="text-4xl font-bold mb-6 text-white">Precios Simples y Transparentes</h1>
    <p class="text-gray-300 mb-8 text-lg">Elige el plan que mejor se adapte a tu escuela de artes marciales. Todos los planes incluyen 14 días de prueba gratis.</p>

    <div class="grid md:grid-cols-2 gap-8 mb-12">
      <div class="bg-kancho-dark-card border border-kancho-dark-border rounded-2xl p-8">
        <h2 class="text-2xl font-bold text-white mb-2">Kancho Intelligence</h2>
        <p class="text-gray-400 mb-4">Inteligencia de Negocio con IA</p>
        <div class="flex items-baseline gap-1 mb-6">
          <span class="text-4xl font-bold text-kancho">$197</span>
          <span class="text-gray-400">/mes</span>
        </div>
        <ul class="space-y-3 mb-8">
          <li class="flex items-center gap-3 text-gray-300"><i class="fas fa-check text-green-400"></i> Oficial de Inteligencia de Negocio con IA</li>
          <li class="flex items-center gap-3 text-gray-300"><i class="fas fa-check text-green-400"></i> Integración con CRM</li>
          <li class="flex items-center gap-3 text-gray-300"><i class="fas fa-check text-green-400"></i> Monitoreo de Puntaje de Salud</li>
          <li class="flex items-center gap-3 text-gray-300"><i class="fas fa-check text-green-400"></i> Detección de Abandono y Alertas</li>
          <li class="flex items-center gap-3 text-gray-300"><i class="fas fa-check text-green-400"></i> Puntuación de Prospectos</li>
          <li class="flex items-center gap-3 text-gray-300"><i class="fas fa-check text-green-400"></i> Análisis de Ingresos</li>
          <li class="flex items-center gap-3 text-gray-300"><i class="fas fa-check text-green-400"></i> Asesor de Voz con IA</li>
          <li class="flex items-center gap-3 text-gray-300"><i class="fas fa-check text-green-400"></i> 100 Minutos de Voz IA</li>
        </ul>
        <a href="https://checkout.stripe.com/c/pay/cs_live_a18grG2h3V8gz0gUChQ3o2R1FfHPo5GCMNtzTW5c0lLLThzQdOPHu0Zyfs#fidnandhYHdWcXxpYCc%2FJ2FgY2RwaXEnKSdkdWxOYHwnPyd1blppbHNgWjA0V012N2RDNlRHaUF3Yn19MUkzQ2R2SFRvQVVAVVJtMVJJNkhcQ1RURGlgQUdgQ2FUfWcwN2JGakJ3VmFWQHBIQEAzSXY2QGg1N310Y31LQHdiNTBBbjw0NTVIVzxdRGlNTCcpJ2N3amhWYHdzYHcnP3F3cGApJ2dkZm5id2pwa2FGamlqdyc%2FJyZjY2NjY2MnKSdpZHxqcHFRfHVgJz8ndmxrYmlgWmxxYGgnKSdga2RnaWBVaWRmYG1qaWFgd3YnP3F3cGB4JSUl" class="block w-full py-3 text-center bg-white/10 hover:bg-kancho-coral/20 border border-kancho-dark-border rounded-xl font-medium transition text-white no-underline">Comenzar</a>
      </div>

      <div class="bg-kancho-dark-card border-2 border-kancho-coral/50 rounded-2xl p-8 relative">
        <div class="absolute -top-4 left-1/2 transform -translate-x-1/2">
          <span class="bg-kancho-coral px-4 py-1 rounded-full text-sm font-bold text-white">MÁS POPULAR</span>
        </div>
        <h2 class="text-2xl font-bold text-white mb-2">Kancho Pro</h2>
        <p class="text-gray-400 mb-4">Intelligence + Recepcionista IA</p>
        <div class="flex items-baseline gap-1 mb-6">
          <span class="text-4xl font-bold text-kancho">$397</span>
          <span class="text-gray-400">/mes</span>
        </div>
        <ul class="space-y-3 mb-8">
          <li class="flex items-center gap-3 text-gray-300"><i class="fas fa-check text-green-400"></i> <strong>Todo lo de Intelligence</strong></li>
          <li class="flex items-center gap-3 text-gray-300"><i class="fas fa-check text-green-400"></i> Recepcionista IA 24/7</li>
          <li class="flex items-center gap-3 text-gray-300"><i class="fas fa-check text-green-400"></i> Seguimiento Automatizado de Prospectos</li>
          <li class="flex items-center gap-3 text-gray-300"><i class="fas fa-check text-green-400"></i> Campañas de Retención</li>
          <li class="flex items-center gap-3 text-gray-300"><i class="fas fa-check text-green-400"></i> Recuperación de Citas Perdidas</li>
          <li class="flex items-center gap-3 text-gray-300"><i class="fas fa-check text-green-400"></i> Recordatorios de Pago</li>
          <li class="flex items-center gap-3 text-gray-300"><i class="fas fa-check text-green-400"></i> Bilingüe (EN/ES)</li>
          <li class="flex items-center gap-3 text-gray-300"><i class="fas fa-check text-green-400"></i> 500 Minutos de Voz IA</li>
        </ul>
        <a href="https://checkout.stripe.com/c/pay/cs_live_a18grG2h3V8gz0gUChQ3o2R1FfHPo5GCMNtzTW5c0lLLThzQdOPHu0Zyfs#fidnandhYHdWcXxpYCc%2FJ2FgY2RwaXEnKSdkdWxOYHwnPyd1blppbHNgWjA0V012N2RDNlRHaUF3Yn19MUkzQ2R2SFRvQVVAVVJtMVJJNkhcQ1RURGlgQUdgQ2FUfWcwN2JGakJ3VmFWQHBIQEAzSXY2QGg1N310Y31LQHdiNTBBbjw0NTVIVzxdRGlNTCcpJ2N3amhWYHdzYHcnP3F3cGApJ2dkZm5id2pwa2FGamlqdyc%2FJyZjY2NjY2MnKSdpZHxqcHFRfHVgJz8ndmxrYmlgWmxxYGgnKSdga2RnaWBVaWRmYG1qaWFgd3YnP3F3cGB4JSUl" class="block w-full py-3 text-center bg-kancho-coral hover:bg-kancho-coral/80 rounded-xl font-medium transition text-white no-underline">Comenzar</a>
      </div>
    </div>

    <div class="text-center">
      <p class="text-gray-400 mb-4">¿Necesitas una solución empresarial personalizada?</p>
      <button onclick="document.getElementById('pricingBookingModalEs').classList.remove('hidden'); document.getElementById('pricingBookingModalEs').classList.add('flex');" class="text-kancho hover:underline cursor-pointer">Agenda una llamada para precios personalizados</button>
    </div>
  `, `
    <!-- Booking Modal for Pricing Page (Spanish - Custom Enterprise) -->
    <div id="pricingBookingModalEs" class="hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] items-center justify-center p-4 overflow-y-auto">
      <div class="bg-kancho-dark-card border border-kancho-dark-border rounded-3xl w-full max-w-3xl shadow-2xl my-4 mx-auto">
        <div class="p-6 border-b border-kancho-dark-border flex items-center justify-between sticky top-0 bg-kancho-dark-card z-10 rounded-t-3xl">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden bg-kancho-coral/20">
              <img src="${KANCHO_LOGO_URL}" alt="Kancho" class="w-10 h-10 object-contain">
            </div>
            <div>
              <h3 class="text-lg font-bold text-white">Agenda Tu Demo</h3>
              <p class="text-sm text-gray-400">Reserva una sesión personalizada con nuestro equipo</p>
            </div>
          </div>
          <button onclick="document.getElementById('pricingBookingModalEs').classList.add('hidden'); document.getElementById('pricingBookingModalEs').classList.remove('flex');" class="p-2 hover:bg-white/10 rounded-lg transition">
            <i class="fas fa-times text-gray-400"></i>
          </button>
        </div>
        <div class="p-4">
          <iframe src="https://api.leadconnectorhq.com/widget/booking/nhKuDsn2At5csiDYc4d0" style="width: 100%; height: 700px; border: none;" scrolling="yes"></iframe>
        </div>
      </div>
    </div>
    <script src="https://link.msgsndr.com/js/form_embed.js" type="text/javascript"></script>
  `));
});

// Integrations Page
app.get('/integrations', (req, res) => {
  res.send(generateStaticPage('Integrations', `
    <h1 class="text-4xl font-bold mb-6 text-white">Seamless Integrations</h1>
    <p class="text-gray-300 mb-8 text-lg">Kancho AI connects with the tools you already use to manage your martial arts school.</p>

    <div class="grid gap-6">
      <div class="bg-kancho-dark-card border border-kancho-dark-border rounded-2xl p-6">
        <div class="flex items-center gap-4 mb-4">
          <div class="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
            <i class="fas fa-database text-blue-400 text-xl"></i>
          </div>
          <div>
            <h2 class="text-xl font-bold text-white">CRM Systems</h2>
            <p class="text-gray-400 text-sm">Connect your existing CRM</p>
          </div>
        </div>
        <p class="text-gray-300">Integrates with GoHighLevel, Salesforce, HubSpot, and other popular CRM platforms. Your data syncs automatically.</p>
      </div>

      <div class="bg-kancho-dark-card border border-kancho-dark-border rounded-2xl p-6">
        <div class="flex items-center gap-4 mb-4">
          <div class="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
            <i class="fas fa-credit-card text-green-400 text-xl"></i>
          </div>
          <div>
            <h2 class="text-xl font-bold text-white">Payment Processors</h2>
            <p class="text-gray-400 text-sm">Track revenue automatically</p>
          </div>
        </div>
        <p class="text-gray-300">Connect Stripe, Square, or other payment processors to automatically track revenue and identify payment issues.</p>
      </div>

      <div class="bg-kancho-dark-card border border-kancho-dark-border rounded-2xl p-6">
        <div class="flex items-center gap-4 mb-4">
          <div class="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
            <i class="fas fa-calendar text-purple-400 text-xl"></i>
          </div>
          <div>
            <h2 class="text-xl font-bold text-white">Scheduling Systems</h2>
            <p class="text-gray-400 text-sm">Sync attendance data</p>
          </div>
        </div>
        <p class="text-gray-300">Works with Mindbody, Zen Planner, PushPress, and other martial arts school management software.</p>
      </div>

      <div class="bg-kancho-dark-card border border-kancho-dark-border rounded-2xl p-6">
        <div class="flex items-center gap-4 mb-4">
          <div class="w-12 h-12 bg-kancho-coral/20 rounded-xl flex items-center justify-center">
            <i class="fas fa-phone text-kancho text-xl"></i>
          </div>
          <div>
            <h2 class="text-xl font-bold text-white">Phone & SMS</h2>
            <p class="text-gray-400 text-sm">Voice AI & messaging</p>
          </div>
        </div>
        <p class="text-gray-300">Powered by ElevenLabs for natural voice AI and Twilio for reliable SMS and phone capabilities.</p>
      </div>
    </div>

    <div class="mt-12 bg-kancho-dark-card border border-kancho-dark-border rounded-2xl p-8 text-center">
      <h3 class="text-2xl font-bold text-white mb-4">White-Glove Setup</h3>
      <p class="text-gray-300 mb-6">Our team handles all integrations for you. No technical knowledge required.</p>
      <button onclick="document.getElementById('integrationsBookingModal').classList.remove('hidden'); document.getElementById('integrationsBookingModal').classList.add('flex');" class="inline-flex items-center gap-2 px-6 py-3 bg-kancho-coral hover:bg-kancho-coral/80 rounded-xl font-medium transition text-white cursor-pointer">
        <i class="fas fa-calendar"></i>
        Schedule Setup Call
      </button>
    </div>

    <!-- Booking Modal for Integrations Page -->
    <div id="integrationsBookingModal" class="hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] items-center justify-center p-4 overflow-y-auto">
      <div class="bg-kancho-dark-card border border-kancho-dark-border rounded-3xl w-full max-w-3xl shadow-2xl my-4 mx-auto">
        <div class="p-6 border-b border-kancho-dark-border flex items-center justify-between sticky top-0 bg-kancho-dark-card z-10 rounded-t-3xl">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden bg-kancho-coral/20">
              <img src="${KANCHO_LOGO_URL}" alt="Kancho" class="w-10 h-10 object-contain">
            </div>
            <div>
              <h3 class="text-lg font-bold">Schedule Setup Call</h3>
              <p class="text-sm text-gray-400">Book your white-glove integration session</p>
            </div>
          </div>
          <button onclick="document.getElementById('integrationsBookingModal').classList.add('hidden'); document.getElementById('integrationsBookingModal').classList.remove('flex');" class="p-2 hover:bg-white/10 rounded-lg transition">
            <i class="fas fa-times text-gray-400"></i>
          </button>
        </div>
        <div class="p-4">
          <iframe src="https://api.leadconnectorhq.com/widget/booking/nhKuDsn2At5csiDYc4d0" style="width: 100%; height: 700px; border: none;" scrolling="yes"></iframe>
        </div>
      </div>
    </div>
    <script src="https://link.msgsndr.com/js/form_embed.js" type="text/javascript"></script>
  `));
});

// About Us Page
app.get('/about', (req, res) => {
  res.send(generateStaticPage('About Us', `
    <h1 class="text-4xl font-bold mb-6 text-white">About Kancho AI</h1>

    <div class="bg-kancho-dark-card border border-kancho-dark-border rounded-2xl p-8 mb-8">
      <h2 class="text-2xl font-bold text-kancho mb-4">Our Mission</h2>
      <p class="text-gray-300 text-lg leading-relaxed">
        Kancho AI was built to help martial arts school owners focus on what they do best — teaching and transforming lives —
        while AI handles the business intelligence, member retention, and lead conversion that keeps their school thriving.
      </p>
    </div>

    <div class="grid md:grid-cols-2 gap-6 mb-8">
      <div class="bg-kancho-dark-card border border-kancho-dark-border rounded-2xl p-6">
        <div class="w-12 h-12 bg-kancho-coral/20 rounded-xl flex items-center justify-center mb-4">
          <i class="fas fa-heart text-kancho text-xl"></i>
        </div>
        <h3 class="text-xl font-bold text-white mb-2">Built by Martial Artists</h3>
        <p class="text-gray-400">We understand the unique challenges of running a martial arts school because we've lived them.</p>
      </div>

      <div class="bg-kancho-dark-card border border-kancho-dark-border rounded-2xl p-6">
        <div class="w-12 h-12 bg-kancho-coral/20 rounded-xl flex items-center justify-center mb-4">
          <i class="fas fa-robot text-kancho text-xl"></i>
        </div>
        <h3 class="text-xl font-bold text-white mb-2">Powered by AI</h3>
        <p class="text-gray-400">Cutting-edge artificial intelligence that gets smarter and more valuable every day.</p>
      </div>

      <div class="bg-kancho-dark-card border border-kancho-dark-border rounded-2xl p-6">
        <div class="w-12 h-12 bg-kancho-coral/20 rounded-xl flex items-center justify-center mb-4">
          <i class="fas fa-users text-kancho text-xl"></i>
        </div>
        <h3 class="text-xl font-bold text-white mb-2">Human Support</h3>
        <p class="text-gray-400">Real people ready to help you succeed, not just bots and ticket systems.</p>
      </div>

      <div class="bg-kancho-dark-card border border-kancho-dark-border rounded-2xl p-6">
        <div class="w-12 h-12 bg-kancho-coral/20 rounded-xl flex items-center justify-center mb-4">
          <i class="fas fa-chart-line text-kancho text-xl"></i>
        </div>
        <h3 class="text-xl font-bold text-white mb-2">Results Focused</h3>
        <p class="text-gray-400">Every feature is designed to directly impact your revenue and retention.</p>
      </div>
    </div>

    <div class="bg-kancho-dark-card border border-kancho-dark-border rounded-2xl p-8 text-center">
      <h3 class="text-2xl font-bold text-white mb-4">Part of the RinglyPro Family</h3>
      <p class="text-gray-300 mb-4">Kancho AI is proudly developed by RinglyPro, pioneers in AI-powered business solutions.</p>
      <p class="text-gray-500 text-sm">Trusted by martial arts schools across the United States and beyond.</p>
    </div>
  `));
});

// Contact Page
app.get('/contact', (req, res) => {
  res.send(generateStaticPage('Contact', `
    <h1 class="text-4xl font-bold mb-6 text-white">Get in Touch</h1>
    <p class="text-gray-300 mb-8 text-lg">Have questions? Schedule a call with our team.</p>

    <div class="grid md:grid-cols-3 gap-6 mb-12">
      <div class="bg-kancho-dark-card border border-kancho-dark-border rounded-2xl p-6">
        <div class="flex items-center gap-4 mb-4">
          <div class="w-12 h-12 bg-kancho-coral/20 rounded-xl flex items-center justify-center">
            <i class="fas fa-envelope text-kancho text-xl"></i>
          </div>
          <div>
            <h3 class="text-lg font-bold text-white">Email Support</h3>
            <a href="mailto:support@ringlypro.com" class="text-kancho hover:underline text-sm">support@ringlypro.com</a>
          </div>
        </div>
        <p class="text-gray-400 text-sm">For general inquiries. We respond within 24 hours.</p>
      </div>

      <div class="bg-kancho-dark-card border border-kancho-dark-border rounded-2xl p-6">
        <div class="flex items-center gap-4 mb-4">
          <div class="w-12 h-12 bg-kancho-coral/20 rounded-xl flex items-center justify-center">
            <i class="fas fa-calendar text-kancho text-xl"></i>
          </div>
          <div>
            <h3 class="text-lg font-bold text-white">Schedule a Demo</h3>
            <p class="text-gray-400 text-sm">See Kancho AI in action</p>
          </div>
        </div>
        <p class="text-gray-400 text-sm">Book a personalized demo below.</p>
      </div>

      <div class="bg-kancho-dark-card border border-kancho-dark-border rounded-2xl p-6">
        <div class="flex items-center gap-4 mb-4">
          <div class="w-12 h-12 bg-kancho-coral/20 rounded-xl flex items-center justify-center">
            <i class="fas fa-headset text-kancho text-xl"></i>
          </div>
          <div>
            <h3 class="text-lg font-bold text-white">Customer Success</h3>
            <p class="text-gray-400 text-sm">For existing customers</p>
          </div>
        </div>
        <p class="text-gray-400 text-sm">Reach your success manager via dashboard.</p>
      </div>
    </div>

    <!-- Calendar Booking Section -->
    <div class="bg-kancho-dark-card border border-kancho-dark-border rounded-2xl overflow-hidden">
      <div class="p-6 border-b border-kancho-dark-border">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden bg-kancho-coral/20">
            <img src="${KANCHO_LOGO_URL}" alt="Kancho" class="w-10 h-10 object-contain">
          </div>
          <div>
            <h3 class="text-xl font-bold text-white">Book a Demo</h3>
            <p class="text-gray-400">Schedule a personalized session with our team</p>
          </div>
        </div>
      </div>
      <div class="p-4">
        <iframe src="https://api.leadconnectorhq.com/widget/booking/nhKuDsn2At5csiDYc4d0" style="width: 100%; height: 700px; border: none;" scrolling="yes"></iframe>
      </div>
    </div>
    <script src="https://link.msgsndr.com/js/form_embed.js" type="text/javascript"></script>
  `));
});

// Privacy Policy Page
app.get('/privacy', (req, res) => {
  res.send(generateStaticPage('Privacy Policy', `
    <h1 class="text-4xl font-bold mb-6 text-white">Privacy Policy</h1>
    <p class="text-gray-400 mb-8">Last updated: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

    <div class="prose prose-invert max-w-none space-y-8">
      <section>
        <h2 class="text-2xl font-bold text-white mb-4">1. Information We Collect</h2>
        <p class="text-gray-300 mb-4">We collect information you provide directly to us, including:</p>
        <ul class="list-disc list-inside text-gray-300 space-y-2 ml-4">
          <li>Account information (name, email, phone number)</li>
          <li>Business information (school name, location, student data)</li>
          <li>Payment information (processed securely via Stripe)</li>
          <li>Communications you send to us</li>
        </ul>
      </section>

      <section>
        <h2 class="text-2xl font-bold text-white mb-4">2. How We Use Your Information</h2>
        <p class="text-gray-300 mb-4">We use the information we collect to:</p>
        <ul class="list-disc list-inside text-gray-300 space-y-2 ml-4">
          <li>Provide, maintain, and improve our services</li>
          <li>Process transactions and send related information</li>
          <li>Send technical notices, updates, and support messages</li>
          <li>Generate business intelligence insights for your school</li>
          <li>Power AI voice interactions and recommendations</li>
        </ul>
      </section>

      <section>
        <h2 class="text-2xl font-bold text-white mb-4">3. Data Security</h2>
        <p class="text-gray-300">
          We implement industry-standard security measures to protect your data. All data is encrypted in transit and at rest.
          We use secure cloud infrastructure and regularly audit our security practices. Your student data is kept strictly confidential
          and is never shared with third parties for marketing purposes.
        </p>
      </section>

      <section>
        <h2 class="text-2xl font-bold text-white mb-4">4. Data Retention</h2>
        <p class="text-gray-300">
          We retain your data for as long as your account is active or as needed to provide you services.
          If you close your account, we will delete your data within 90 days, unless we are required to retain it for legal purposes.
        </p>
      </section>

      <section>
        <h2 class="text-2xl font-bold text-white mb-4">5. Your Rights</h2>
        <p class="text-gray-300 mb-4">You have the right to:</p>
        <ul class="list-disc list-inside text-gray-300 space-y-2 ml-4">
          <li>Access your personal data</li>
          <li>Correct inaccurate data</li>
          <li>Request deletion of your data</li>
          <li>Export your data in a portable format</li>
          <li>Opt out of marketing communications</li>
        </ul>
      </section>

      <section>
        <h2 class="text-2xl font-bold text-white mb-4">6. Contact Us</h2>
        <p class="text-gray-300">
          If you have questions about this Privacy Policy, please contact us at
          <a href="mailto:support@ringlypro.com" class="text-kancho hover:underline">support@ringlypro.com</a>.
        </p>
      </section>
    </div>
  `));
});

// Terms of Service Page
app.get('/terms', (req, res) => {
  res.send(generateStaticPage('Terms of Service', `
    <h1 class="text-4xl font-bold mb-6 text-white">Terms of Service</h1>
    <p class="text-gray-400 mb-8">Last updated: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

    <div class="prose prose-invert max-w-none space-y-8">
      <section>
        <h2 class="text-2xl font-bold text-white mb-4">1. Acceptance of Terms</h2>
        <p class="text-gray-300">
          By accessing or using Kancho AI services, you agree to be bound by these Terms of Service.
          If you do not agree to these terms, you may not use our services.
        </p>
      </section>

      <section>
        <h2 class="text-2xl font-bold text-white mb-4">2. Description of Service</h2>
        <p class="text-gray-300">
          Kancho AI provides AI-powered business intelligence, voice AI capabilities, and analytics tools
          designed for martial arts schools and fitness businesses. Our services include dashboard analytics,
          churn detection, lead scoring, and voice AI interactions.
        </p>
      </section>

      <section>
        <h2 class="text-2xl font-bold text-white mb-4">3. Subscription and Payment</h2>
        <ul class="list-disc list-inside text-gray-300 space-y-2 ml-4">
          <li>Subscription fees are billed monthly in advance</li>
          <li>All plans include a 14-day free trial</li>
          <li>You may cancel your subscription at any time</li>
          <li>Refunds are provided on a case-by-case basis</li>
          <li>Prices are subject to change with 30 days notice</li>
        </ul>
      </section>

      <section>
        <h2 class="text-2xl font-bold text-white mb-4">4. User Responsibilities</h2>
        <p class="text-gray-300 mb-4">You agree to:</p>
        <ul class="list-disc list-inside text-gray-300 space-y-2 ml-4">
          <li>Provide accurate and complete information</li>
          <li>Maintain the security of your account credentials</li>
          <li>Use the service only for lawful purposes</li>
          <li>Not share your account with unauthorized users</li>
          <li>Comply with all applicable laws and regulations</li>
        </ul>
      </section>

      <section>
        <h2 class="text-2xl font-bold text-white mb-4">5. Intellectual Property</h2>
        <p class="text-gray-300">
          All content, features, and functionality of Kancho AI are owned by RinglyPro and are protected
          by international copyright, trademark, and other intellectual property laws. You retain ownership
          of your business data that you input into our system.
        </p>
      </section>

      <section>
        <h2 class="text-2xl font-bold text-white mb-4">6. Limitation of Liability</h2>
        <p class="text-gray-300">
          Kancho AI is provided "as is" without warranties of any kind. We are not liable for any indirect,
          incidental, special, consequential, or punitive damages resulting from your use of or inability
          to use the service.
        </p>
      </section>

      <section>
        <h2 class="text-2xl font-bold text-white mb-4">7. Termination</h2>
        <p class="text-gray-300">
          We may terminate or suspend your account at any time for violation of these terms.
          Upon termination, your right to use the service will immediately cease.
        </p>
      </section>

      <section>
        <h2 class="text-2xl font-bold text-white mb-4">8. Contact</h2>
        <p class="text-gray-300">
          For questions about these Terms of Service, please contact us at
          <a href="mailto:support@ringlypro.com" class="text-kancho hover:underline">support@ringlypro.com</a>.
        </p>
      </section>
    </div>
  `));
});

// API Routes
if (models && !modelsError) {
  // Mount API routes
  const schoolsRoutes = require('./routes/schools')(models);
  const studentsRoutes = require('./routes/students')(models);
  const leadsRoutes = require('./routes/leads')(models);
  const dashboardRoutes = require('./routes/dashboard')(models);
  const healthRoutes = require('./routes/health')(models);
  const voiceRoutes = require('./routes/voice')(models);
  const healthMetricsRoutes = require('./routes/health-metrics')(models);
  const outboundRoutes = require('./routes/outbound')(models);
  const classesRoutes = require('./routes/classes')(models);
  const revenueRoutes = require('./routes/revenue')(models);
  const attendanceRoutes = require('./routes/attendance')(models);

  app.use('/api/v1/schools', schoolsRoutes);
  app.use('/api/v1/students', studentsRoutes);
  app.use('/api/v1/leads', leadsRoutes);
  app.use('/api/v1/dashboard', dashboardRoutes);
  app.use('/api/v1/health', healthRoutes);
  app.use('/api/v1/voice', voiceRoutes);
  app.use('/api/v1/health-metrics', healthMetricsRoutes);
  app.use('/api/v1/outbound', outboundRoutes);
  app.use('/api/v1/classes', classesRoutes);
  app.use('/api/v1/revenue', revenueRoutes);
  app.use('/api/v1/attendance', attendanceRoutes);
  console.log('📞 Kancho Outbound Calling routes mounted at /api/v1/outbound');
  console.log('📅 Kancho Classes routes mounted at /api/v1/classes');

  // =====================================================
  // RINGLYPRO WHITE-LABEL BRIDGE ROUTES
  // These integrate RinglyPro CRM/voice/billing into KanchoAI
  // =====================================================
  try {
    const bridgeAuthRoutes = require('./routes/bridge-auth');
    const bridgeCrmRoutes = require('./routes/bridge-crm');
    const bridgeVoiceRoutes = require('./routes/bridge-voice');
    const bridgeBillingRoutes = require('./routes/bridge-billing');

    // Auth routes (no auth middleware - register/login are public)
    app.use('/api/v1/bridge/auth', bridgeAuthRoutes);

    // Protected bridge routes (require bridge JWT)
    const bridgeAuth = bridgeAuthRoutes.authenticateBridge;
    app.use('/api/v1/bridge/crm', bridgeAuth, bridgeCrmRoutes);
    app.use('/api/v1/bridge/voice', bridgeAuth, bridgeVoiceRoutes);
    app.use('/api/v1/bridge/billing', bridgeAuth, bridgeBillingRoutes);

    console.log('🔗 KanchoAI ↔ RinglyPro Bridge routes mounted:');
    console.log('   /api/v1/bridge/auth     (register, login, profile)');
    console.log('   /api/v1/bridge/crm      (contacts, appointments, messages, calls)');
    console.log('   /api/v1/bridge/voice    (voice agent status, toggle, settings)');
    console.log('   /api/v1/bridge/billing  (balance, plans, upgrade)');
    // Checkout + signup flow routes (no auth - public)
    try {
      const bridgeCheckoutRoutes = require('./routes/bridge-checkout');
      app.use('/api/v1/bridge/checkout', bridgeCheckoutRoutes);
      console.log('   /api/v1/bridge/checkout (Stripe-first signup flow)');
    } catch (checkoutError) {
      console.log('⚠️ KanchoAI Checkout routes not available:', checkoutError.message);
    }

  } catch (bridgeError) {
    console.log('⚠️ KanchoAI Bridge routes not available:', bridgeError.message);
  }

  // =====================================================
  // STUDENT PORTAL ROUTES
  // =====================================================
  try {
    const studentAuthRoutes = require('./routes/student-auth')(models);
    const studentPortalRoutes = require('./routes/student-portal')(models);
    const studentAuth = studentAuthRoutes.authenticateStudent;

    // Auth routes (public - register, login, password reset)
    app.use('/api/v1/student/auth', studentAuthRoutes);

    // Protected student portal routes
    app.use('/api/v1/student', studentAuth, studentPortalRoutes);

    // Student payment routes (Stripe checkout, autopay, merch purchase)
    const studentPaymentRoutes = require('./routes/student-payments')(models);
    app.use('/api/v1/student/payments', studentAuth, studentPaymentRoutes);

    console.log('🎓 KanchoAI Student Portal routes mounted:');
    console.log('   /api/v1/student/auth      (register, login, password reset)');
    console.log('   /api/v1/student/*         (dashboard, attendance, classes, profile)');
    console.log('   /api/v1/student/payments  (Stripe checkout, autopay, merch)');
  } catch (studentError) {
    console.log('⚠️ KanchoAI Student Portal routes not available:', studentError.message);
  }

  // =====================================================
  // KANCHO SUBSCRIPTION PLANS - Stripe Integration
  // =====================================================
  const KANCHO_PLANS = {
    intelligence: {
      name: 'Kancho Intelligence',
      price: 197,
      description: 'AI Business Intelligence Officer integrated with your CRM',
      features: ['AI Business Intelligence', 'CRM Integration', 'Health Scoring', 'Churn Detection', 'Lead Scoring', 'Revenue Analytics', 'Voice AI Advisor', '100 AI Voice Minutes ($0.50 thereafter)']
    },
    pro: {
      name: 'Kancho Pro',
      price: 397,
      description: 'Intelligence + AI Receptionist for 24/7 automation',
      features: ['Everything in Intelligence', '24/7 AI Receptionist', 'Lead Follow-up Calls', 'Retention Campaigns', 'No-show Recovery', 'Payment Reminders', 'Bilingual (EN/ES)', '500 AI Voice Minutes ($0.45 thereafter)']
    }
  };

  // POST /api/v1/subscribe - Create Stripe checkout session
  app.post('/api/v1/subscribe', async (req, res) => {
    try {
      const { plan, email } = req.body;

      // Validate plan
      if (!plan || !KANCHO_PLANS[plan]) {
        return res.status(400).json({
          success: false,
          error: 'Invalid plan selected. Choose intelligence, pro, or complete.'
        });
      }

      const planDetails = KANCHO_PLANS[plan];
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 'https://aiagent.ringlypro.com';

      // Create Stripe Checkout Session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: planDetails.name,
              description: planDetails.description,
              images: [KANCHO_STRIPE_LOGO_URL]
            },
            unit_amount: planDetails.price * 100,
            recurring: {
              interval: 'month',
              interval_count: 1
            }
          },
          quantity: 1
        }],
        mode: 'subscription',
        subscription_data: {
          trial_period_days: 14,
          metadata: {
            plan: plan,
            product: 'kancho_ai',
            features: planDetails.features.join(', ')
          }
        },
        success_url: webhookBaseUrl + '/kanchoai?subscribe=success&plan=' + plan,
        cancel_url: webhookBaseUrl + '/kanchoai?subscribe=canceled',
        metadata: {
          plan: plan,
          product: 'kancho_ai'
        }
      });

      console.log('[Kancho] Checkout session created: ' + session.id + ' for ' + planDetails.name);

      res.json({
        success: true,
        url: session.url,
        sessionId: session.id
      });

    } catch (error) {
      console.error('[Kancho] Subscription error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create checkout session'
      });
    }
  });

  // Comprehensive demo data seed endpoint
  app.post('/api/v1/seed-demo', requireAdmin, async (req, res) => {
    try {
      const { KanchoSchool, KanchoStudent, KanchoLead, KanchoRevenue, KanchoAiCall, KanchoHealthScore, KanchoBusinessHealthMetrics } = models;
      const today = new Date();
      const results = { schools: [], totalStudents: 0, totalLeads: 0, totalRevenue: 0, totalCalls: 0 };

      // School data - 8 Diverse Martial Arts Schools
      const schoolsData = [
        {
          info: {
            tenant_id: 1,
            name: 'Tampa Bay BJJ Academy',
            martial_art_type: 'BJJ',
            owner_name: 'Professor Carlos Silva',
            owner_email: 'carlos@tampabaybjj.com',
            owner_phone: '+18135551234',
            city: 'Tampa',
            state: 'FL',
            monthly_revenue_target: 45000,
            student_capacity: 250,
            plan_type: 'pro',
            voice_agent: 'both'
          },
          beltSystem: ['White', 'Blue', 'Purple', 'Brown', 'Black'],
          membershipTypes: ['Unlimited', '3x Week', '2x Week', 'Competition Team'],
          rateRange: [149, 249],
          programs: ['Adult BJJ', 'Kids BJJ', 'No-Gi', 'Competition', 'Women Only']
        },
        {
          info: {
            tenant_id: 1,
            name: 'Elite Karate Academy',
            martial_art_type: 'Karate',
            owner_name: 'Sensei Michael Tanaka',
            owner_email: 'mtanaka@elitekarate.com',
            owner_phone: '+17135559876',
            city: 'Houston',
            state: 'TX',
            monthly_revenue_target: 38000,
            student_capacity: 180,
            plan_type: 'growth',
            voice_agent: 'kancho'
          },
          beltSystem: ['White', 'Yellow', 'Orange', 'Green', 'Blue', 'Purple', 'Brown', 'Black'],
          membershipTypes: ['Family Plan', 'Individual', 'Kids Only', 'Adult Only'],
          rateRange: [129, 199],
          programs: ['Traditional Karate', 'Kids Karate', 'Kata', 'Kumite', 'Self Defense']
        },
        {
          info: {
            tenant_id: 1,
            name: 'Champions Taekwondo Center',
            martial_art_type: 'Taekwondo',
            owner_name: 'Master Kim Sung-ho',
            owner_email: 'masterkim@championtkd.com',
            owner_phone: '+13055557654',
            city: 'Miami',
            state: 'FL',
            monthly_revenue_target: 52000,
            student_capacity: 300,
            plan_type: 'enterprise',
            voice_agent: 'both'
          },
          beltSystem: ['White', 'Yellow', 'Green', 'Blue', 'Red', 'Black 1st Dan', 'Black 2nd Dan'],
          membershipTypes: ['Olympic Track', 'Traditional', 'Little Tigers', 'Family'],
          rateRange: [139, 229],
          programs: ['Olympic Sparring', 'Traditional Forms', 'Little Tigers (4-6)', 'Junior Program', 'Adult Program']
        },
        {
          info: {
            tenant_id: 1,
            name: 'Apex MMA Center',
            martial_art_type: 'MMA',
            owner_name: 'Coach Derek Williams',
            owner_email: 'derek@apexmma.com',
            owner_phone: '+13035558432',
            city: 'Denver',
            state: 'CO',
            monthly_revenue_target: 65000,
            student_capacity: 200,
            plan_type: 'pro',
            voice_agent: 'kancho'
          },
          beltSystem: ['Beginner', 'Intermediate', 'Advanced', 'Pro-Am', 'Professional'],
          membershipTypes: ['All Access', 'Striking Only', 'Grappling Only', 'Fight Team'],
          rateRange: [169, 299],
          programs: ['MMA Fundamentals', 'Striking', 'Wrestling', 'Submission Grappling', 'Fight Team']
        }
      ];

      const firstNames = ['James', 'Michael', 'Robert', 'David', 'William', 'Carlos', 'Miguel', 'Jose', 'Sofia', 'Isabella',
        'Mary', 'Patricia', 'Jennifer', 'Sarah', 'Jessica', 'Ethan', 'Mason', 'Logan', 'Alexander', 'Lucas'];
      const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'];
      const leadSources = ['Google Ads', 'Facebook', 'Instagram', 'Referral', 'Walk-in', 'Website', 'Yelp'];

      const randItem = (arr) => arr[Math.floor(Math.random() * arr.length)];
      const randBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
      const randDate = (daysBack) => new Date(today.getTime() - Math.random() * daysBack * 24 * 60 * 60 * 1000);

      for (const schoolData of schoolsData) {
        const [school] = await KanchoSchool.findOrCreate({
          where: { name: schoolData.info.name, tenant_id: 1 },
          defaults: schoolData.info
        });
        const schoolId = school.id;

        // Generate students
        const numStudents = randBetween(20, 40);
        const usedEmails = new Set();

        for (let i = 0; i < numStudents; i++) {
          const firstName = randItem(firstNames);
          const lastName = randItem(lastNames);
          let email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@email.com`;
          let counter = 1;
          while (usedEmails.has(email)) {
            email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${counter}@email.com`;
            counter++;
          }
          usedEmails.add(email);

          const churnRand = Math.random();
          let churnRisk, churnScore;
          if (churnRand < 0.60) { churnRisk = 'low'; churnScore = randBetween(1, 25); }
          else if (churnRand < 0.80) { churnRisk = 'medium'; churnScore = randBetween(26, 55); }
          else if (churnRand < 0.92) { churnRisk = 'high'; churnScore = randBetween(56, 80); }
          else { churnRisk = 'critical'; churnScore = randBetween(81, 100); }

          const beltIdx = Math.min(Math.floor(Math.pow(Math.random(), 1.5) * schoolData.beltSystem.length), schoolData.beltSystem.length - 1);

          await KanchoStudent.findOrCreate({
            where: { school_id: schoolId, email },
            defaults: {
              school_id: schoolId,
              first_name: firstName,
              last_name: lastName,
              email,
              phone: `+1${randBetween(200, 999)}${randBetween(100, 999)}${randBetween(1000, 9999)}`,
              belt_rank: schoolData.beltSystem[beltIdx],
              membership_type: randItem(schoolData.membershipTypes),
              monthly_rate: randBetween(schoolData.rateRange[0], schoolData.rateRange[1]),
              churn_risk: churnRisk,
              churn_risk_score: churnScore,
              enrollment_date: randDate(730),
              last_attendance: randDate(churnRisk === 'critical' ? 45 : churnRisk === 'high' ? 21 : 7),
              attendance_streak: churnRisk === 'low' ? randBetween(5, 30) : randBetween(0, 5),
              total_classes: randBetween(10, 500),
              status: churnRisk === 'critical' && Math.random() < 0.3 ? 'inactive' : 'active',
              payment_status: churnRisk === 'critical' ? randItem(['current', 'past_due', 'failed']) : 'current'
            }
          });
        }
        results.totalStudents += numStudents;

        // Generate leads
        const numLeads = randBetween(8, 15);
        for (let i = 0; i < numLeads; i++) {
          const firstName = randItem(firstNames);
          const lastName = randItem(lastNames);
          const tempRand = Math.random();
          let temperature, leadScore;
          if (tempRand < 0.25) { temperature = 'hot'; leadScore = randBetween(80, 100); }
          else if (tempRand < 0.75) { temperature = 'warm'; leadScore = randBetween(50, 79); }
          else { temperature = 'cold'; leadScore = randBetween(20, 49); }

          await KanchoLead.create({
            school_id: schoolId,
            first_name: firstName,
            last_name: lastName,
            email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@gmail.com`,
            phone: `+1${randBetween(200, 999)}${randBetween(100, 999)}${randBetween(1000, 9999)}`,
            source: randItem(leadSources),
            interest: randItem(schoolData.programs),
            temperature,
            lead_score: leadScore,
            status: randItem(['new', 'contacted', 'trial_scheduled', 'follow_up']),
            contact_attempts: randBetween(0, 5),
            last_contact_date: randDate(14)
          });
        }
        results.totalLeads += numLeads;

        // Generate revenue
        const numRevenues = randBetween(15, 25);
        let schoolRevenue = 0;
        for (let i = 0; i < numRevenues; i++) {
          const revenueType = randItem(['membership', 'retail', 'private_lesson', 'testing_fee', 'event']);
          const amount = revenueType === 'membership' ? randBetween(1000, 5000) : randBetween(50, 500);
          const date = new Date(today.getFullYear(), today.getMonth(), randBetween(1, today.getDate()));
          await KanchoRevenue.create({
            school_id: schoolId,
            date,
            type: revenueType,
            amount,
            description: `${revenueType} transaction`,
            is_recurring: revenueType === 'membership',
            source: 'demo'
          });
          schoolRevenue += amount;
        }
        results.totalRevenue += schoolRevenue;

        // Generate AI calls
        const numCalls = randBetween(5, 12);
        for (let i = 0; i < numCalls; i++) {
          await KanchoAiCall.create({
            school_id: schoolId,
            agent: randItem(['kancho', 'maestro']),
            call_type: randItem(['lead_followup', 'retention', 'no_show', 'payment_reminder']),
            direction: 'outbound',
            phone_number: `+1${randBetween(200, 999)}${randBetween(100, 999)}${randBetween(1000, 9999)}`,
            duration_seconds: randBetween(60, 300),
            status: 'completed',
            outcome: randItem(['trial_booked', 'callback_scheduled', 'issue_resolved']),
            sentiment: 'positive',
            created_at: randDate(7)
          });
        }
        results.totalCalls += numCalls;

        // Update school and create health score
        const activeCount = await KanchoStudent.count({ where: { school_id: schoolId, status: 'active' } });
        await school.update({ active_students: activeCount });

        const atRisk = await KanchoStudent.count({ where: { school_id: schoolId, churn_risk: ['high', 'critical'] } });
        const hotLeads = await KanchoLead.count({ where: { school_id: schoolId, temperature: 'hot' } });

        const overallScore = randBetween(65, 92);
        const grade = overallScore >= 90 ? 'A' : overallScore >= 80 ? 'B' : overallScore >= 70 ? 'C' : 'D';

        await KanchoHealthScore.findOrCreate({
          where: { school_id: schoolId, date: today.toISOString().split('T')[0] },
          defaults: {
            school_id: schoolId,
            date: today,
            retention_score: randBetween(60, 95),
            revenue_score: randBetween(50, 100),
            lead_score: randBetween(40, 90),
            attendance_score: randBetween(60, 90),
            engagement_score: randBetween(55, 85),
            growth_score: randBetween(50, 80),
            overall_score: overallScore,
            grade,
            vs_last_week: randBetween(-5, 10),
            insights: [
              atRisk > 0 ? `${atRisk} students at risk of churning` : 'Retention looks healthy',
              hotLeads > 0 ? `${hotLeads} hot leads ready for conversion` : 'Need more leads'
            ]
          }
        });

        // Create Business Health Metrics with KPIs including trial conversion and churn rate
        const currentMonth = today.toISOString().slice(0, 7); // YYYY-MM format
        const trialsStarted = randBetween(8, 20);
        const trialsConverted = Math.floor(trialsStarted * (randBetween(45, 75) / 100)); // 45-75% conversion
        const trialConversionRate = ((trialsConverted / trialsStarted) * 100).toFixed(2);
        const cancelledStudents = randBetween(1, 5);
        const startingStudents = activeCount + cancelledStudents;
        const churnRate = ((cancelledStudents / startingStudents) * 100).toFixed(2);
        const arps = (schoolRevenue / activeCount).toFixed(2);
        const revenueAtRisk = (atRisk * parseFloat(arps)).toFixed(2);
        const growthPotential = (hotLeads * parseFloat(arps)).toFixed(2);
        const revenueTarget = schoolData.info.monthly_revenue_target;
        const revenueVsTargetPercent = ((schoolRevenue / revenueTarget) * 100).toFixed(2);

        if (KanchoBusinessHealthMetrics) {
          await KanchoBusinessHealthMetrics.findOrCreate({
            where: { school_id: schoolId, report_month: currentMonth },
            defaults: {
              school_id: schoolId,
              report_month: currentMonth,
              active_students: activeCount,
              net_student_growth: trialsConverted - cancelledStudents,
              churn_rate: parseFloat(churnRate),
              arps: parseFloat(arps),
              trial_conversion_rate: parseFloat(trialConversionRate),
              trials_started: trialsStarted,
              trials_converted: trialsConverted,
              cancelled_students: cancelledStudents,
              health_score: overallScore,
              health_grade: grade,
              revenue_at_risk: parseFloat(revenueAtRisk),
              students_at_risk: atRisk,
              growth_potential: parseFloat(growthPotential),
              hot_leads: hotLeads,
              monthly_revenue: schoolRevenue,
              revenue_vs_target_percent: parseFloat(revenueVsTargetPercent)
            }
          });
        }

        results.schools.push({
          id: schoolId,
          name: schoolData.info.name,
          students: numStudents,
          leads: numLeads,
          grade
        });
      }

      res.json({
        success: true,
        message: 'Demo data seeded successfully',
        summary: {
          schools_created: results.schools.length,
          total_students: results.totalStudents,
          total_leads: results.totalLeads,
          total_revenue: `$${results.totalRevenue.toLocaleString()}`,
          total_ai_calls: results.totalCalls
        },
        schools: results.schools
      });
    } catch (error) {
      console.error('Seed error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Seed classes + attendance data
  app.post('/api/v1/seed-classes-attendance', requireAdmin, async (req, res) => {
    try {
      const { KanchoSchool, KanchoStudent, KanchoClass, KanchoAttendance } = models;

      // Get all schools
      const schools = await KanchoSchool.findAll({ raw: true });
      if (!schools.length) return res.status(400).json({ error: 'No schools found. Run seed-demo first.' });

      let totalClasses = 0, totalAttendance = 0;

      const classTemplates = [
        { name: 'Morning Fundamentals', program_type: 'Fundamentals', schedule: { days: ['Mon','Wed','Fri'], time: '06:30' }, duration_minutes: 60, capacity: 20 },
        { name: 'Kids Beginners', program_type: 'Kids', schedule: { days: ['Tue','Thu'], time: '16:00' }, duration_minutes: 45, capacity: 15 },
        { name: 'Advanced Sparring', program_type: 'Advanced', schedule: { days: ['Mon','Wed','Fri'], time: '18:30' }, duration_minutes: 90, capacity: 25 },
        { name: 'All Levels Open Mat', program_type: 'Open Mat', schedule: { days: ['Sat'], time: '10:00' }, duration_minutes: 120, capacity: 30 },
        { name: 'Competition Team', program_type: 'Competition', schedule: { days: ['Tue','Thu','Sat'], time: '17:00' }, duration_minutes: 90, capacity: 20 },
        { name: 'Women\'s Self-Defense', program_type: 'Self-Defense', schedule: { days: ['Wed'], time: '19:00' }, duration_minutes: 60, capacity: 15 },
        { name: 'Teens Program', program_type: 'Teens', schedule: { days: ['Mon','Wed'], time: '15:30' }, duration_minutes: 60, capacity: 18 },
        { name: 'Evening Basics', program_type: 'Fundamentals', schedule: { days: ['Tue','Thu'], time: '19:30' }, duration_minutes: 60, capacity: 20 },
      ];

      for (const school of schools) {
        // Create classes for this school
        const numClasses = 4 + Math.floor(Math.random() * 5); // 4-8 classes
        const shuffled = classTemplates.sort(() => Math.random() - 0.5).slice(0, numClasses);
        const createdClasses = [];

        for (const tmpl of shuffled) {
          const cls = await KanchoClass.create({
            school_id: school.id,
            name: tmpl.name,
            martial_art: school.martial_art_type || 'Mixed',
            program_type: tmpl.program_type,
            level: tmpl.program_type === 'Advanced' || tmpl.program_type === 'Competition' ? 'Advanced' : 'All Levels',
            schedule: tmpl.schedule,
            duration_minutes: tmpl.duration_minutes,
            capacity: tmpl.capacity,
            instructor: school.owner_name || 'Head Instructor',
            is_active: true,
            popularity_score: 50 + Math.floor(Math.random() * 50),
            created_at: new Date(),
            updated_at: new Date()
          });
          createdClasses.push(cls);
          totalClasses++;
        }

        // Get active students for this school
        const students = await KanchoStudent.findAll({
          where: { school_id: school.id, status: 'active' },
          attributes: ['id'],
          raw: true
        });

        if (!students.length) continue;

        // Generate 30 days of attendance records
        const today = new Date();
        const statuses = ['present', 'present', 'present', 'present', 'late']; // 80% present, 20% late

        for (let daysBack = 0; daysBack < 30; daysBack++) {
          const date = new Date(today);
          date.setDate(date.getDate() - daysBack);
          const dayOfWeek = date.getDay(); // 0=Sun, 6=Sat
          if (dayOfWeek === 0) continue; // Skip Sundays

          const dateStr = date.toISOString().split('T')[0];

          // Pick 1-3 classes that would have run on this day
          const dayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dayOfWeek];
          const todaysClasses = createdClasses.filter(c => {
            const sched = typeof c.schedule === 'string' ? JSON.parse(c.schedule) : c.schedule;
            return sched?.days?.includes(dayName);
          });

          for (const cls of todaysClasses) {
            // 50-85% of students attend each class
            const attendanceRate = 0.5 + Math.random() * 0.35;
            const attendees = students
              .sort(() => Math.random() - 0.5)
              .slice(0, Math.floor(students.length * attendanceRate));

            for (const student of attendees) {
              try {
                await KanchoAttendance.create({
                  school_id: school.id,
                  student_id: student.id,
                  class_id: cls.id,
                  date: dateStr,
                  checked_in_at: new Date(date.getTime() + Math.random() * 3600000),
                  status: statuses[Math.floor(Math.random() * statuses.length)],
                  recorded_by: 'seed'
                });
                totalAttendance++;
              } catch (e) {
                // Skip duplicates from unique constraint
              }
            }
          }
        }

        // Update student aggregates (total_classes, last_attendance, streak)
        for (const student of students) {
          const count = await KanchoAttendance.count({
            where: { student_id: student.id, status: ['present', 'late'] }
          });
          const lastRecord = await KanchoAttendance.findOne({
            where: { student_id: student.id },
            order: [['date', 'DESC']],
            raw: true
          });
          // Simple streak: count recent consecutive attendance days
          const records = await KanchoAttendance.findAll({
            where: { student_id: student.id, status: ['present', 'late'] },
            attributes: ['date'],
            order: [['date', 'DESC']],
            raw: true
          });
          let streak = 0;
          if (records.length > 0) {
            const uniqueDates = [...new Set(records.map(r => r.date))];
            streak = 1;
            for (let i = 1; i < uniqueDates.length; i++) {
              const diff = (new Date(uniqueDates[i-1]) - new Date(uniqueDates[i])) / 86400000;
              if (diff <= 3) streak++; else break;
            }
          }
          await KanchoStudent.update(
            { total_classes: count, last_attendance: lastRecord?.checked_in_at || null, attendance_streak: streak },
            { where: { id: student.id } }
          );
        }

        // Update class aggregates
        for (const cls of createdClasses) {
          const sessions = await KanchoAttendance.count({
            where: { class_id: cls.id },
            distinct: true,
            col: 'date'
          });
          const totalCheckins = await KanchoAttendance.count({
            where: { class_id: cls.id, status: ['present', 'late'] }
          });
          const avg = sessions > 0 ? Math.round((totalCheckins / sessions) * 100) / 100 : 0;
          const fill = cls.capacity > 0 ? Math.round((avg / cls.capacity) * 10000) / 100 : 0;
          await KanchoClass.update(
            { average_attendance: avg, fill_rate: fill },
            { where: { id: cls.id } }
          );
        }
      }

      res.json({
        success: true,
        message: 'Classes and attendance data seeded',
        summary: { classes_created: totalClasses, attendance_records: totalAttendance, schools_processed: schools.length }
      });
    } catch (error) {
      console.error('Seed classes/attendance error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Seed data for an existing school by ID
  app.post('/api/v1/seed-school/:id', requireAdmin, async (req, res) => {
    try {
      const { KanchoSchool, KanchoStudent, KanchoLead, KanchoRevenue, KanchoAiCall, KanchoHealthScore, KanchoBusinessHealthMetrics, KanchoClass } = models;
      const schoolId = parseInt(req.params.id);

      const school = await KanchoSchool.findByPk(schoolId);
      if (!school) return res.status(404).json({ error: 'School not found' });

      const today = new Date();
      const artType = school.martial_art_type || 'BJJ';

      // Art-specific configs
      const configs = {
        'BJJ': { belts: ['White', 'Blue', 'Purple', 'Brown', 'Black'], memberships: ['Unlimited', '3x Week', '2x Week', 'Competition Team'], programs: ['Adult BJJ', 'Kids BJJ', 'No-Gi', 'Competition', 'Women Only'], rates: [149, 249] },
        'Karate': { belts: ['White', 'Yellow', 'Orange', 'Green', 'Blue', 'Purple', 'Brown', 'Black'], memberships: ['Family Plan', 'Individual', 'Kids Only', 'Adult Only'], programs: ['Traditional Karate', 'Kids Karate', 'Kata', 'Kumite', 'Self Defense'], rates: [129, 199] },
        'Taekwondo': { belts: ['White', 'Yellow', 'Green', 'Blue', 'Red', 'Black 1st Dan', 'Black 2nd Dan'], memberships: ['Olympic Track', 'Traditional', 'Little Tigers', 'Family'], programs: ['Olympic Sparring', 'Traditional Forms', 'Little Tigers', 'Junior Program', 'Adult Program'], rates: [139, 229] },
        'MMA': { belts: ['Beginner', 'Intermediate', 'Advanced', 'Pro-Am', 'Professional'], memberships: ['All Access', 'Striking Only', 'Grappling Only', 'Fight Team'], programs: ['MMA Fundamentals', 'Striking', 'Wrestling', 'Submission Grappling', 'Fight Team'], rates: [169, 299] },
        'Judo': { belts: ['White', 'Yellow', 'Orange', 'Green', 'Blue', 'Brown', 'Black'], memberships: ['Unlimited', '3x Week', 'Competition'], programs: ['Adult Judo', 'Kids Judo', 'Competition', 'Self Defense'], rates: [129, 199] }
      };
      const cfg = configs[artType] || configs['BJJ'];

      const firstNames = ['James', 'Michael', 'Robert', 'David', 'William', 'Carlos', 'Miguel', 'Jose', 'Sofia', 'Isabella',
        'Mary', 'Patricia', 'Jennifer', 'Sarah', 'Jessica', 'Ethan', 'Mason', 'Logan', 'Alexander', 'Lucas',
        'Emma', 'Olivia', 'Liam', 'Noah', 'Ava', 'Mia', 'Daniel', 'Matthew', 'Aiden', 'Jackson'];
      const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
        'Anderson', 'Taylor', 'Thomas', 'Moore', 'White'];
      const leadSources = ['Google Ads', 'Facebook', 'Instagram', 'Referral', 'Walk-in', 'Website', 'Yelp'];

      const randItem = (arr) => arr[Math.floor(Math.random() * arr.length)];
      const randBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
      const randDate = (daysBack) => new Date(today.getTime() - Math.random() * daysBack * 24 * 60 * 60 * 1000);

      // Clear existing data for this school first
      await KanchoStudent.destroy({ where: { school_id: schoolId } });
      await KanchoLead.destroy({ where: { school_id: schoolId } });
      await KanchoRevenue.destroy({ where: { school_id: schoolId } });
      await KanchoAiCall.destroy({ where: { school_id: schoolId } });
      await KanchoHealthScore.destroy({ where: { school_id: schoolId } });
      if (KanchoBusinessHealthMetrics) await KanchoBusinessHealthMetrics.destroy({ where: { school_id: schoolId } });
      if (KanchoClass) await KanchoClass.destroy({ where: { school_id: schoolId } });

      // --- STUDENTS (30-40) ---
      const numStudents = randBetween(30, 40);
      const usedEmails = new Set();
      for (let i = 0; i < numStudents; i++) {
        const firstName = randItem(firstNames);
        const lastName = randItem(lastNames);
        let email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@email.com`;
        let counter = 1;
        while (usedEmails.has(email)) {
          email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${counter}@email.com`;
          counter++;
        }
        usedEmails.add(email);

        const churnRand = Math.random();
        let churnRisk, churnScore;
        if (churnRand < 0.55) { churnRisk = 'low'; churnScore = randBetween(1, 25); }
        else if (churnRand < 0.78) { churnRisk = 'medium'; churnScore = randBetween(26, 55); }
        else if (churnRand < 0.92) { churnRisk = 'high'; churnScore = randBetween(56, 80); }
        else { churnRisk = 'critical'; churnScore = randBetween(81, 100); }

        const beltIdx = Math.min(Math.floor(Math.pow(Math.random(), 1.5) * cfg.belts.length), cfg.belts.length - 1);

        await KanchoStudent.create({
          school_id: schoolId,
          first_name: firstName,
          last_name: lastName,
          email,
          phone: `+1${randBetween(200, 999)}${randBetween(100, 999)}${randBetween(1000, 9999)}`,
          belt_rank: cfg.belts[beltIdx],
          membership_type: randItem(cfg.memberships),
          monthly_rate: randBetween(cfg.rates[0], cfg.rates[1]),
          churn_risk: churnRisk,
          churn_risk_score: churnScore,
          enrollment_date: randDate(730),
          last_attendance: randDate(churnRisk === 'critical' ? 45 : churnRisk === 'high' ? 21 : 7),
          attendance_streak: churnRisk === 'low' ? randBetween(5, 30) : randBetween(0, 5),
          total_classes: randBetween(10, 500),
          status: churnRisk === 'critical' && Math.random() < 0.3 ? 'inactive' : 'active',
          payment_status: churnRisk === 'critical' ? randItem(['current', 'past_due', 'failed']) : 'current'
        });
      }

      // --- LEADS (10-15) ---
      const numLeads = randBetween(10, 15);
      for (let i = 0; i < numLeads; i++) {
        const firstName = randItem(firstNames);
        const lastName = randItem(lastNames);
        const tempRand = Math.random();
        let temperature, leadScore;
        if (tempRand < 0.30) { temperature = 'hot'; leadScore = randBetween(80, 100); }
        else if (tempRand < 0.70) { temperature = 'warm'; leadScore = randBetween(50, 79); }
        else { temperature = 'cold'; leadScore = randBetween(20, 49); }

        await KanchoLead.create({
          school_id: schoolId,
          first_name: firstName,
          last_name: lastName,
          email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${randBetween(1,99)}@gmail.com`,
          phone: `+1${randBetween(200, 999)}${randBetween(100, 999)}${randBetween(1000, 9999)}`,
          source: randItem(leadSources),
          interest: randItem(cfg.programs),
          temperature,
          lead_score: leadScore,
          status: randItem(['new', 'contacted', 'trial_scheduled', 'follow_up']),
          contact_attempts: randBetween(0, 5),
          last_contact_date: randDate(14)
        });
      }

      // --- REVENUE (20-30 entries for this month) ---
      const numRevenues = randBetween(20, 30);
      let totalRevenue = 0;
      for (let i = 0; i < numRevenues; i++) {
        const revenueType = randItem(['membership', 'membership', 'membership', 'retail', 'private_lesson', 'testing_fee', 'event']);
        const amount = revenueType === 'membership' ? randBetween(1000, 5000) : randBetween(50, 500);
        const date = new Date(today.getFullYear(), today.getMonth(), randBetween(1, today.getDate()));
        await KanchoRevenue.create({
          school_id: schoolId,
          date,
          type: revenueType,
          amount,
          description: `${revenueType.replace('_', ' ')} - ${school.name}`,
          is_recurring: revenueType === 'membership',
          source: 'system'
        });
        totalRevenue += amount;
      }

      // --- AI CALLS (8-15) ---
      const numCalls = randBetween(8, 15);
      for (let i = 0; i < numCalls; i++) {
        await KanchoAiCall.create({
          school_id: schoolId,
          agent: randItem(['kancho', 'maestro']),
          call_type: randItem(['lead_followup', 'retention', 'no_show', 'payment_reminder']),
          direction: 'outbound',
          phone_number: `+1${randBetween(200, 999)}${randBetween(100, 999)}${randBetween(1000, 9999)}`,
          duration_seconds: randBetween(60, 300),
          status: randItem(['completed', 'completed', 'completed', 'voicemail', 'no_answer']),
          outcome: randItem(['trial_booked', 'callback_scheduled', 'issue_resolved', 'left_voicemail', 'payment_collected']),
          sentiment: randItem(['positive', 'positive', 'neutral', 'negative']),
          created_at: randDate(7)
        });
      }

      // --- CLASSES (5-6) ---
      if (KanchoClass) {
        const classDays = ['Monday/Wednesday/Friday', 'Tuesday/Thursday', 'Monday/Wednesday', 'Saturday', 'Tuesday/Thursday/Saturday'];
        const classTimes = ['6:00 AM', '9:00 AM', '12:00 PM', '4:30 PM', '6:30 PM', '7:30 PM'];
        for (let i = 0; i < Math.min(cfg.programs.length, 5); i++) {
          await KanchoClass.create({
            school_id: schoolId,
            name: cfg.programs[i],
            schedule: `${classDays[i % classDays.length]} ${classTimes[i % classTimes.length]}`,
            instructor: school.owner_name || 'Head Instructor',
            max_capacity: randBetween(20, 40),
            current_enrollment: randBetween(8, 25),
            status: 'active'
          });
        }
      }

      // --- HEALTH SCORE ---
      const activeCount = await KanchoStudent.count({ where: { school_id: schoolId, status: 'active' } });
      const atRisk = await KanchoStudent.count({ where: { school_id: schoolId, churn_risk: ['high', 'critical'] } });
      const hotLeads = await KanchoLead.count({ where: { school_id: schoolId, temperature: 'hot' } });

      const overallScore = randBetween(68, 85);
      const grade = overallScore >= 90 ? 'A' : overallScore >= 80 ? 'B' : overallScore >= 70 ? 'C' : 'D';
      const detailedGrade = overallScore >= 93 ? 'A+' : overallScore >= 90 ? 'A' : overallScore >= 87 ? 'A-' : overallScore >= 83 ? 'B+' : overallScore >= 80 ? 'B' : overallScore >= 77 ? 'B-' : overallScore >= 73 ? 'C+' : overallScore >= 70 ? 'C' : overallScore >= 67 ? 'C-' : 'D+';

      await KanchoHealthScore.create({
        school_id: schoolId,
        date: today,
        retention_score: randBetween(65, 88),
        revenue_score: randBetween(55, 85),
        lead_score: randBetween(50, 82),
        attendance_score: randBetween(62, 88),
        engagement_score: randBetween(58, 82),
        growth_score: randBetween(50, 78),
        overall_score: overallScore,
        grade,
        vs_last_week: randBetween(-3, 8),
        insights: [
          `${atRisk} students at risk of churning - immediate attention needed`,
          `${hotLeads} hot leads ready for conversion`,
          `Monthly revenue at $${totalRevenue.toLocaleString()} this month`,
          activeCount > 30 ? 'Strong active student base' : 'Focus on student acquisition'
        ]
      });

      // --- BUSINESS HEALTH METRICS ---
      const currentMonth = today.toISOString().slice(0, 7);
      const trialsStarted = randBetween(8, 18);
      const trialsConverted = Math.floor(trialsStarted * (randBetween(50, 72) / 100));
      const trialConversionRate = Math.min(parseFloat(((trialsConverted / trialsStarted) * 100).toFixed(2)), 999.99);
      const cancelledStudents = randBetween(1, 4);
      const startingStudents = activeCount + cancelledStudents;
      const churnRate = Math.min(parseFloat(((cancelledStudents / startingStudents) * 100).toFixed(2)), 999.99);
      const arps = Math.min(parseFloat((totalRevenue / Math.max(activeCount, 1)).toFixed(2)), 99999999.99);
      const revenueAtRisk = Math.min(parseFloat((atRisk * arps).toFixed(2)), 99999999.99);
      const growthPotential = Math.min(parseFloat((hotLeads * arps).toFixed(2)), 99999999.99);
      const revenueTarget = school.monthly_revenue_target || 30000;
      const revenueVsTargetPercent = Math.min(parseFloat(((totalRevenue / revenueTarget) * 100).toFixed(2)), 9999.99);

      await school.update({ active_students: activeCount });

      if (KanchoBusinessHealthMetrics) {
        await KanchoBusinessHealthMetrics.create({
          school_id: schoolId,
          report_month: currentMonth,
          active_students: activeCount,
          net_student_growth: trialsConverted - cancelledStudents,
          churn_rate: churnRate,
          arps: arps,
          trial_conversion_rate: trialConversionRate,
          trials_started: trialsStarted,
          trials_converted: trialsConverted,
          cancelled_students: cancelledStudents,
          health_score: overallScore,
          health_grade: detailedGrade,
          revenue_at_risk: revenueAtRisk,
          students_at_risk: atRisk,
          growth_potential: growthPotential,
          hot_leads: hotLeads,
          monthly_revenue: Math.min(totalRevenue, 99999999.99),
          revenue_vs_target_percent: revenueVsTargetPercent
        });
      }

      res.json({
        success: true,
        message: `Data seeded for ${school.name}`,
        summary: {
          school: school.name,
          school_id: schoolId,
          students: numStudents,
          active_students: activeCount,
          at_risk: atRisk,
          leads: numLeads,
          hot_leads: hotLeads,
          revenue_entries: numRevenues,
          total_revenue: `$${totalRevenue.toLocaleString()}`,
          ai_calls: numCalls,
          health_grade: grade,
          health_score: overallScore
        }
      });
    } catch (error) {
      console.error('Seed school error:', error);
      res.status(500).json({ error: error.message, stack: error.stack });
    }
  });

  // =====================================================
  // ADMIN: Student Portal Account Management
  // =====================================================

  // GET /api/v1/student-accounts?school_id=X - List student portal accounts
  app.get('/api/v1/student-accounts', requireAdmin, async (req, res) => {
    try {
      const { school_id, status } = req.query;
      if (!school_id) return res.status(400).json({ error: 'school_id required' });

      const where = { school_id };
      if (status) where.status = status;

      const accounts = await models.KanchoStudentAuth.findAll({
        where,
        include: [{ model: models.KanchoStudent, as: 'student', attributes: ['id', 'first_name', 'last_name', 'belt_rank', 'email'] }],
        order: [['created_at', 'DESC']]
      });

      res.json({ success: true, data: accounts });
    } catch (error) {
      console.error('Error fetching student accounts:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PUT /api/v1/student-accounts/:id/approve - Approve a pending student account
  app.put('/api/v1/student-accounts/:id/approve', requireAdmin, async (req, res) => {
    try {
      const auth = await models.KanchoStudentAuth.findByPk(req.params.id);
      if (!auth) return res.status(404).json({ error: 'Account not found' });

      // Try to link to student record if not already linked
      if (!auth.student_id) {
        const { student_id } = req.body;
        if (student_id) {
          auth.student_id = student_id;
        } else {
          // Try auto-match by email
          const student = await models.KanchoStudent.findOne({
            where: { email: auth.email, school_id: auth.school_id }
          });
          if (student) auth.student_id = student.id;
        }
      }

      auth.status = 'active';
      await auth.save();

      res.json({ success: true, data: auth });
    } catch (error) {
      console.error('Error approving student account:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PUT /api/v1/student-accounts/:id/suspend - Suspend a student account
  app.put('/api/v1/student-accounts/:id/suspend', requireAdmin, async (req, res) => {
    try {
      const auth = await models.KanchoStudentAuth.findByPk(req.params.id);
      if (!auth) return res.status(404).json({ error: 'Account not found' });

      auth.status = 'suspended';
      await auth.save();

      res.json({ success: true, data: auth });
    } catch (error) {
      console.error('Error suspending student account:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PUT /api/v1/student-accounts/:id/link - Link student account to student record
  app.put('/api/v1/student-accounts/:id/link', requireAdmin, async (req, res) => {
    try {
      const { student_id } = req.body;
      if (!student_id) return res.status(400).json({ error: 'student_id required' });

      const auth = await models.KanchoStudentAuth.findByPk(req.params.id);
      if (!auth) return res.status(404).json({ error: 'Account not found' });

      auth.student_id = student_id;
      if (auth.status === 'pending') auth.status = 'active';
      await auth.save();

      res.json({ success: true, data: auth });
    } catch (error) {
      console.error('Error linking student account:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // =====================================================
  // ADMIN: Merchandise Management
  // =====================================================

  // GET /api/v1/merchandise?school_id=X
  app.get('/api/v1/merchandise', async (req, res) => {
    try {
      const { school_id } = req.query;
      if (!school_id) return res.status(400).json({ error: 'school_id required' });
      const items = await models.KanchoMerchandise.findAll({
        where: { school_id },
        order: [['sort_order', 'ASC'], ['category', 'ASC'], ['name', 'ASC']]
      });
      res.json({ success: true, data: items });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/v1/merchandise
  app.post('/api/v1/merchandise', requireAdmin, async (req, res) => {
    try {
      const { school_id, name, description, price, image_url, category, sizes, in_stock, stripe_price_id, sort_order } = req.body;
      if (!school_id || !name || price === undefined) return res.status(400).json({ error: 'school_id, name, and price required' });
      const item = await models.KanchoMerchandise.create({
        school_id, name, description, price, image_url, category: category || 'other',
        sizes: sizes || [], in_stock: in_stock !== false, stripe_price_id, sort_order: sort_order || 0
      });
      res.status(201).json({ success: true, data: item });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // PUT /api/v1/merchandise/:id
  app.put('/api/v1/merchandise/:id', requireAdmin, async (req, res) => {
    try {
      const item = await models.KanchoMerchandise.findByPk(req.params.id);
      if (!item) return res.status(404).json({ error: 'Item not found' });
      const fields = ['name', 'description', 'price', 'image_url', 'category', 'sizes', 'in_stock', 'stripe_price_id', 'sort_order'];
      fields.forEach(f => { if (req.body[f] !== undefined) item[f] = req.body[f]; });
      await item.save();
      res.json({ success: true, data: item });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/v1/merchandise/:id
  app.delete('/api/v1/merchandise/:id', requireAdmin, async (req, res) => {
    try {
      const item = await models.KanchoMerchandise.findByPk(req.params.id);
      if (!item) return res.status(404).json({ error: 'Item not found' });
      await item.destroy();
      res.json({ success: true, message: 'Item deleted' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/v1/seed-merchandise - Seed sample merchandise
  app.post('/api/v1/seed-merchandise', requireAdmin, async (req, res) => {
    try {
      const schools = await models.KanchoSchool.findAll({ attributes: ['id', 'name', 'martial_art_type'] });
      let total = 0;

      const merchTemplates = [
        { name: 'School Gi - White', category: 'gi', price: 89.99, sizes: ['Youth S','Youth M','Youth L','S','M','L','XL','XXL'], description: 'Official school gi in white. Lightweight pearl weave, embroidered school logo.', image_url: 'https://images.unsplash.com/photo-1555597673-b21d5c935865?w=400' },
        { name: 'School Gi - Black', category: 'gi', price: 99.99, sizes: ['S','M','L','XL','XXL'], description: 'Premium black gi with reinforced stitching and embroidered school logo.', image_url: 'https://images.unsplash.com/photo-1555597673-b21d5c935865?w=400' },
        { name: 'Training Rash Guard', category: 'apparel', price: 44.99, sizes: ['S','M','L','XL'], description: 'Short sleeve rash guard with school logo. Moisture-wicking fabric.', image_url: 'https://images.unsplash.com/photo-1556906781-9a412961c28c?w=400' },
        { name: 'School T-Shirt', category: 'apparel', price: 29.99, sizes: ['Youth S','Youth M','Youth L','S','M','L','XL','XXL'], description: 'Cotton blend t-shirt with school logo and martial arts design.', image_url: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400' },
        { name: 'Training Shorts', category: 'apparel', price: 39.99, sizes: ['S','M','L','XL'], description: 'Lightweight fight shorts with side slits for mobility.', image_url: 'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?w=400' },
        { name: 'Boxing Gloves - 16oz', category: 'gear', price: 59.99, sizes: ['12oz','14oz','16oz'], description: 'Synthetic leather boxing gloves. Great for beginners and intermediate.', image_url: 'https://images.unsplash.com/photo-1509255929945-586a420363cf?w=400' },
        { name: 'Shin Guards', category: 'gear', price: 49.99, sizes: ['S','M','L','XL'], description: 'Padded shin guards with instep protection.', image_url: 'https://images.unsplash.com/photo-1517438322307-e67111335449?w=400' },
        { name: 'Mouth Guard', category: 'gear', price: 14.99, sizes: ['Youth','Adult'], description: 'Boil-and-bite mouth guard with carrying case.', image_url: 'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=400' },
        { name: 'School Gym Bag', category: 'accessories', price: 34.99, sizes: [], description: 'Duffel bag with school logo. Ventilated shoe compartment.', image_url: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400' },
        { name: 'Water Bottle', category: 'accessories', price: 19.99, sizes: [], description: '32oz insulated stainless steel water bottle with school logo.', image_url: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=400' },
        { name: 'Belt Display Frame', category: 'accessories', price: 39.99, sizes: [], description: 'Wall-mounted display frame for your belt collection.', image_url: 'https://images.unsplash.com/photo-1555597673-b21d5c935865?w=400' },
        { name: 'Protein Shake Mix', category: 'supplements', price: 49.99, sizes: ['Chocolate','Vanilla','Strawberry'], description: 'Post-training recovery shake. 30 servings per container.', image_url: 'https://images.unsplash.com/photo-1593095948071-474c5cc2c838?w=400' }
      ];

      for (const school of schools) {
        // Each school gets 6-10 random items
        const count = 6 + Math.floor(Math.random() * 5);
        const shuffled = merchTemplates.sort(() => 0.5 - Math.random()).slice(0, count);

        for (let i = 0; i < shuffled.length; i++) {
          const t = shuffled[i];
          await models.KanchoMerchandise.create({
            school_id: school.id,
            name: t.name,
            description: t.description,
            price: t.price,
            image_url: t.image_url,
            category: t.category,
            sizes: t.sizes,
            in_stock: Math.random() > 0.15,
            sort_order: i
          });
          total++;
        }
      }

      res.json({ success: true, message: total + ' merchandise items seeded across ' + schools.length + ' schools' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // =====================================================
  // STRIPE WEBHOOK - Student Payment Events
  // =====================================================
  app.post('/webhooks/kancho-stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.KANCHO_STRIPE_WEBHOOK_SECRET;

    let event;
    try {
      if (endpointSecret && sig) {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
      } else {
        event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      }
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).json({ error: 'Webhook signature failed' });
    }

    try {
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const meta = session.metadata || {};

        if (meta.source && meta.source.startsWith('student_portal')) {
          const studentId = parseInt(meta.student_id);
          const schoolId = parseInt(meta.school_id);
          const type = meta.type || 'membership';
          const amount = (session.amount_total || 0) / 100;

          if (studentId && schoolId && amount > 0) {
            await models.KanchoRevenue.create({
              school_id: schoolId,
              student_id: studentId,
              date: new Date().toISOString().split('T')[0],
              type: type,
              amount: amount,
              description: meta.description || meta.merchandise_name || 'Student portal payment',
              payment_method: 'stripe',
              transaction_id: session.payment_intent || session.subscription || session.id,
              is_recurring: session.mode === 'subscription',
              source: meta.source
            });

            // Update student payment status
            await models.KanchoStudent.update(
              { payment_status: 'current', last_payment_date: new Date().toISOString().split('T')[0] },
              { where: { id: studentId } }
            );

            console.log('[Kancho Webhook] Payment recorded: $' + amount + ' from student ' + studentId);
          }
        }
      }

      res.json({ received: true });
    } catch (error) {
      console.error('Webhook processing error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // =====================================================
  // ADMIN: Belt Requirements Management
  // =====================================================

  // GET /api/v1/belt-requirements?school_id=X
  app.get('/api/v1/belt-requirements', requireAdmin, async (req, res) => {
    try {
      const { school_id } = req.query;
      if (!school_id) return res.status(400).json({ error: 'school_id required' });
      const belts = await models.KanchoBeltRequirement.findAll({
        where: { school_id },
        order: [['sort_order', 'ASC']]
      });
      res.json({ success: true, data: belts });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/v1/belt-requirements
  app.post('/api/v1/belt-requirements', requireAdmin, async (req, res) => {
    try {
      const { school_id, belt_name, belt_color, sort_order, min_classes, min_months, requirements, testing_fee } = req.body;
      if (!school_id || !belt_name) return res.status(400).json({ error: 'school_id and belt_name required' });
      const belt = await models.KanchoBeltRequirement.create({
        school_id, belt_name, belt_color, sort_order: sort_order || 0,
        min_classes: min_classes || 0, min_months: min_months || 0,
        requirements: requirements || [], testing_fee: testing_fee || 0
      });
      res.status(201).json({ success: true, data: belt });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // PUT /api/v1/belt-requirements/:id
  app.put('/api/v1/belt-requirements/:id', requireAdmin, async (req, res) => {
    try {
      const belt = await models.KanchoBeltRequirement.findByPk(req.params.id);
      if (!belt) return res.status(404).json({ error: 'Belt requirement not found' });
      const fields = ['belt_name', 'belt_color', 'sort_order', 'min_classes', 'min_months', 'requirements', 'testing_fee'];
      fields.forEach(f => { if (req.body[f] !== undefined) belt[f] = req.body[f]; });
      await belt.save();
      res.json({ success: true, data: belt });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/v1/belt-requirements/:id
  app.delete('/api/v1/belt-requirements/:id', requireAdmin, async (req, res) => {
    try {
      const belt = await models.KanchoBeltRequirement.findByPk(req.params.id);
      if (!belt) return res.status(404).json({ error: 'Belt requirement not found' });
      await belt.destroy();
      res.json({ success: true, message: 'Belt requirement deleted' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/v1/seed-belt-requirements - Seed default belt hierarchy for all schools
  app.post('/api/v1/seed-belt-requirements', requireAdmin, async (req, res) => {
    try {
      const schools = await models.KanchoSchool.findAll({ attributes: ['id', 'martial_art_type'] });
      let total = 0;

      const defaultBelts = [
        { belt_name: 'White', belt_color: '#FFFFFF', sort_order: 0, min_classes: 0, min_months: 0, requirements: ['Basic stance and movement','Front kick','Basic blocks'], testing_fee: 0 },
        { belt_name: 'Yellow', belt_color: '#FFD700', sort_order: 1, min_classes: 30, min_months: 3, requirements: ['All White belt requirements','Roundhouse kick','3 basic kata forms','Basic sparring concepts'], testing_fee: 35 },
        { belt_name: 'Orange', belt_color: '#FF8C00', sort_order: 2, min_classes: 60, min_months: 6, requirements: ['All Yellow belt requirements','Side kick','Back kick','5 kata forms','Light sparring'], testing_fee: 45 },
        { belt_name: 'Green', belt_color: '#228B22', sort_order: 3, min_classes: 100, min_months: 9, requirements: ['All Orange belt requirements','Spinning kicks','8 kata forms','Controlled sparring','Self-defense combinations'], testing_fee: 55 },
        { belt_name: 'Blue', belt_color: '#1E90FF', sort_order: 4, min_classes: 150, min_months: 14, requirements: ['All Green belt requirements','Jump kicks','Advanced combinations','10 kata forms','Full sparring','Board breaking'], testing_fee: 65 },
        { belt_name: 'Purple', belt_color: '#800080', sort_order: 5, min_classes: 200, min_months: 20, requirements: ['All Blue belt requirements','Advanced kata forms','Weapons basics','Teaching assist role','Competition participation'], testing_fee: 75 },
        { belt_name: 'Brown', belt_color: '#8B4513', sort_order: 6, min_classes: 280, min_months: 28, requirements: ['All Purple belt requirements','Weapons proficiency','Advanced sparring strategies','Teaching lower belts','Written exam on principles'], testing_fee: 85 },
        { belt_name: 'Red', belt_color: '#DC143C', sort_order: 7, min_classes: 350, min_months: 36, requirements: ['All Brown belt requirements','Master all kata forms','Advanced weapons','Lead class sessions','Demonstrate mastery of fundamentals'], testing_fee: 95 },
        { belt_name: 'Black', belt_color: '#000000', sort_order: 8, min_classes: 500, min_months: 48, requirements: ['All Red belt requirements','Create original kata','Full weapons mastery','Teaching certification','Panel review and demonstration','Written thesis on martial arts philosophy'], testing_fee: 150 }
      ];

      for (const school of schools) {
        const existing = await models.KanchoBeltRequirement.count({ where: { school_id: school.id } });
        if (existing > 0) continue;

        for (const belt of defaultBelts) {
          await models.KanchoBeltRequirement.create({ school_id: school.id, ...belt });
          total++;
        }
      }

      res.json({ success: true, message: total + ' belt requirements seeded across ' + schools.length + ' schools' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  console.log('Kancho AI API routes mounted:');
  console.log('  - /kanchoai/api/v1/schools');
  console.log('  - /kanchoai/api/v1/students');
  console.log('  - /kanchoai/api/v1/leads');
  console.log('  - /kanchoai/api/v1/dashboard');
  console.log('  - /kanchoai/api/v1/health');
  console.log('  - /kanchoai/api/v1/voice');
  console.log('  - /kanchoai/api/v1/student-accounts');
  console.log('  - /kanchoai/api/v1/merchandise');
  console.log('  - /kanchoai/api/v1/belt-requirements');
  console.log('  - /webhooks/kancho-stripe');
} else {
  app.use('/api/v1/*', (req, res) => {
    res.status(503).json({
      error: 'Kancho AI database not available',
      message: 'Run database migrations to enable full functionality',
      details: modelsError ? modelsError.message : 'Unknown error'
    });
  });
}

// Spanish Landing Page
app.get('/es', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>Kancho AI - Inteligencia de Negocio para Escuelas de Artes Marciales</title>

  <!-- PWA Meta Tags -->
  <meta name="theme-color" content="#E85A4F">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Kancho AI">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="application-name" content="Kancho AI">
  <meta name="msapplication-TileColor" content="#E85A4F">
  <meta name="description" content="Oficial de Inteligencia de Negocio con IA para escuelas de artes marciales. Monitorea la salud, retiene miembros, convierte prospectos.">

  <!-- PWA Manifest & Icons -->
  <link rel="manifest" href="/kanchoai/manifest.json">
  <link rel="apple-touch-icon" href="${KANCHO_LOGO_URL}">
  <link rel="icon" type="image/png" href="${KANCHO_LOGO_URL}">

  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            kancho: {
              coral: '#E85A4F',
              'coral-dark': '#D64A3F',
              dark: '#0D0D0D',
              'dark-card': '#1A1A1A',
              'dark-border': '#2A2A2A'
            }
          }
        }
      }
    }
  </script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    * { -webkit-tap-highlight-color: transparent; }
    html { scroll-behavior: smooth; }
    body {
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      overscroll-behavior: none;
    }
    .gradient-bg { background: #0D0D0D; }
    .card { background: #1A1A1A; border: 1px solid #2A2A2A; }
    .card-danger { background: linear-gradient(135deg, rgba(232, 90, 79, 0.15) 0%, rgba(232, 90, 79, 0.05) 100%); border-color: rgba(232, 90, 79, 0.3); }
    .card-success { background: linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(34, 197, 94, 0.05) 100%); border-color: rgba(34, 197, 94, 0.2); }
    .glow-pulse { animation: glow-pulse 2s ease-in-out infinite; }
    @keyframes glow-pulse { 0%, 100% { box-shadow: 0 0 40px rgba(232, 90, 79, 0.3); } 50% { box-shadow: 0 0 60px rgba(232, 90, 79, 0.5); } }
    .score-ring { stroke-dasharray: 377; stroke-dashoffset: calc(377 - (377 * var(--score)) / 100); transition: stroke-dashoffset 1.5s ease-out; }
    .fade-in { animation: fadeIn 0.5s ease-out; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    .kancho-btn { background: linear-gradient(135deg, #E85A4F 0%, #D64A3F 100%); -webkit-tap-highlight-color: transparent; }
    .kancho-btn:hover, .kancho-btn:active { background: linear-gradient(135deg, #D64A3F 0%, #C53A2F 100%); }
    .text-kancho { color: #E85A4F; }

    /* Mobile-first responsive styles */
    @media (max-width: 768px) {
      .mobile-header {
        flex-direction: column;
        gap: 12px;
        padding: 12px 16px;
        align-items: stretch;
      }
      .mobile-header > div:first-child {
        justify-content: center;
      }
      .mobile-header .header-actions {
        flex-direction: column;
        gap: 10px;
        width: 100%;
      }
      .mobile-header .header-actions > * {
        width: 100%;
        justify-content: center;
      }
      .mobile-header .demo-label {
        display: none;
      }
      .mobile-header select {
        width: 100%;
        padding: 12px 16px;
        font-size: 16px; /* Prevents iOS zoom */
      }
      .mobile-header button {
        width: 100%;
        padding: 14px 20px;
        font-size: 16px;
      }
      .mobile-main {
        padding: 12px !important;
      }
      body {
        padding-bottom: 80px;
      }
      .mobile-hero-logo {
        width: 200px !important;
        height: 200px !important;
      }
      .mobile-hero-logo img {
        width: 160px !important;
        height: 160px !important;
      }
      h2.mobile-title {
        font-size: 1.75rem !important;
        line-height: 1.2 !important;
      }
      .mobile-value-props {
        gap: 16px !important;
      }
      .mobile-value-props .card {
        padding: 20px !important;
      }
      .mobile-pricing-grid {
        gap: 20px !important;
      }
      .mobile-pricing-grid > div {
        transform: none !important;
      }
      .mobile-stats-banner {
        grid-template-columns: repeat(2, 1fr) !important;
        gap: 16px !important;
      }
      .mobile-workflow {
        gap: 24px !important;
      }
      .mobile-cta-buttons {
        flex-direction: column !important;
        gap: 12px !important;
      }
      .mobile-cta-buttons > * {
        width: 100% !important;
        text-align: center;
      }
      .mobile-footer-grid {
        grid-template-columns: 1fr !important;
        gap: 32px !important;
        text-align: center;
      }
      .mobile-kpi-grid {
        grid-template-columns: repeat(2, 1fr) !important;
      }
      .language-toggle {
        bottom: 16px !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
      }
    }

    @media (max-width: 480px) {
      .mobile-hero-logo {
        width: 160px !important;
        height: 160px !important;
      }
      .mobile-hero-logo img {
        width: 120px !important;
        height: 120px !important;
      }
      h2.mobile-title {
        font-size: 1.5rem !important;
      }
      .mobile-stats-banner p.text-3xl {
        font-size: 1.5rem !important;
      }
    }

    /* Safe area for notched phones */
    @supports (padding: max(0px)) {
      body {
        padding-left: max(12px, env(safe-area-inset-left));
        padding-right: max(12px, env(safe-area-inset-right));
        padding-bottom: max(80px, env(safe-area-inset-bottom));
      }
    }

    /* Touch-friendly buttons */
    button, a, select {
      min-height: 44px;
      cursor: pointer;
    }

    /* Smooth scrolling for modals */
    .modal-scroll {
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
    }

    /* Standalone PWA mode adjustments */
    @media all and (display-mode: standalone) {
      body {
        padding-top: env(safe-area-inset-top);
      }
      header {
        padding-top: env(safe-area-inset-top);
      }
    }
  </style>
</head>
<body class="gradient-bg min-h-screen text-white">
  <!-- Header -->
  <header class="border-b border-kancho-dark-border sticky top-0 z-50 bg-kancho-dark/95 backdrop-blur-xl safe-area-top">
    <div class="max-w-7xl mx-auto flex items-center justify-between px-4 md:px-6 py-3 md:py-4 mobile-header">
      <div class="flex items-center gap-3">
        <img src="${KANCHO_LOGO_URL}" alt="Kancho AI" class="w-10 h-10 md:w-12 md:h-12 rounded-lg object-contain">
        <div>
          <h1 class="text-lg md:text-2xl font-bold text-white tracking-tight">KANCHO AI</h1>
          <p class="text-xs text-gray-500 hidden sm:block">Inteligencia de Negocio con IA</p>
        </div>
      </div>
      <div class="flex items-center gap-2 md:gap-4 header-actions">
        <span class="text-gray-400 text-sm font-medium demo-label hidden md:inline">DEMO</span>
        <i class="fas fa-chevron-right text-gray-500 text-xs demo-label hidden md:inline"></i>
        <select id="schoolSelect" class="bg-kancho-dark-card border border-kancho-dark-border rounded-lg px-3 md:px-4 py-2.5 text-sm focus:border-kancho-coral focus:outline-none transition">
          <option value="">Selecciona tu Negocio...</option>
        </select>
        <button onclick="talkToKancho()" class="kancho-btn px-4 md:px-5 py-2.5 rounded-lg text-sm font-medium transition flex items-center gap-2 shadow-lg">
          <i class="fas fa-microphone"></i>
          <span class="hidden sm:inline">Habla con Kancho</span>
          <span class="sm:hidden">Hablar</span>
        </button>
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <main class="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 mobile-main">
    <!-- Welcome Section -->
    <div id="welcomeSection" class="py-8 md:py-16">
      <div class="text-center mb-10 md:mb-16">
        <div class="w-48 h-48 sm:w-64 sm:h-64 md:w-80 md:h-80 lg:w-96 lg:h-96 rounded-3xl flex items-center justify-center mx-auto mb-6 md:mb-8 glow-pulse overflow-hidden bg-kancho-dark-card border border-kancho-dark-border mobile-hero-logo">
          <img src="${KANCHO_LOGO_URL}" alt="Kancho AI" class="w-36 h-36 sm:w-48 sm:h-48 md:w-64 md:h-64 lg:w-80 lg:h-80 object-contain">
        </div>
        <h2 class="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 md:mb-4 mobile-title">Conoce a <span class="text-kancho">Kancho AI</span></h2>
        <p class="text-lg md:text-xl text-gray-300 mb-2">Tu Oficial de Inteligencia de Negocio con IA</p>
        <p class="text-gray-400 max-w-2xl mx-auto text-sm md:text-base px-2">
          Se conecta a los datos de tu empresa, entiende cómo funciona realmente tu negocio,
          y te entrega información clara sobre dónde estás perdiendo dinero, dónde puedes crecer,
          y qué acciones maximizarán tus ganancias y rendimiento.
        </p>
      </div>

      <!-- Value Props -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8 mb-10 md:mb-16 mobile-value-props">
        <div class="card card-danger rounded-2xl p-8 text-center">
          <div class="w-16 h-16 bg-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <i class="fas fa-money-bill-wave text-red-400 text-2xl"></i>
          </div>
          <h3 class="text-xl font-bold mb-2 text-red-400">Encuentra Fugas de Dinero</h3>
          <p class="text-gray-400 text-sm">Identifica dónde estás perdiendo ingresos - miembros que abandonan, pagos fallidos, oportunidades perdidas</p>
        </div>

        <div class="card card-success rounded-2xl p-8 text-center">
          <div class="w-16 h-16 bg-green-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <i class="fas fa-chart-line text-green-400 text-2xl"></i>
          </div>
          <h3 class="text-xl font-bold mb-2 text-green-400">Detecta Crecimiento</h3>
          <p class="text-gray-400 text-sm">Descubre potencial sin explotar - prospectos calientes, oportunidades de venta adicional, posibilidades de expansión</p>
        </div>

        <div class="card rounded-2xl p-8 text-center" style="background: linear-gradient(135deg, rgba(232, 90, 79, 0.1) 0%, rgba(232, 90, 79, 0.05) 100%); border-color: rgba(232, 90, 79, 0.2);">
          <div class="w-16 h-16 bg-kancho-coral/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <i class="fas fa-bolt text-kancho text-2xl"></i>
          </div>
          <h3 class="text-xl font-bold mb-2 text-kancho">Toma Acción</h3>
          <p class="text-gray-400 text-sm">Obtén recomendaciones priorizadas que maximizan ganancias y rendimiento de inmediato</p>
        </div>
      </div>

      <!-- CTA -->
      <div class="text-center mb-16">
        <p class="text-gray-400 mb-6">Selecciona un negocio arriba para ver a Kancho en acción, o:</p>
        <button onclick="seedDemoData()" class="kancho-btn px-8 py-4 rounded-xl font-medium transition shadow-lg">
          <i class="fas fa-rocket mr-2"></i>Cargar Datos de Demostración
        </button>
      </div>

      <!-- Sección de Reserva de Clase de Prueba -->
      <div class="mt-16 pt-16 border-t border-kancho-dark-border">
        <div class="text-center mb-12">
          <h2 class="text-2xl sm:text-3xl font-bold mb-3 md:mb-4 mobile-title">¿Listo Para Comenzar Tu <span class="text-kancho">Viaje en Artes Marciales?</span></h2>
          <p class="text-gray-400 max-w-2xl mx-auto">Reserva tu clase de prueba gratuita hoy. No se requiere experiencia. Sin compromiso.</p>
        </div>
        <div class="max-w-4xl mx-auto">
          <div class="card rounded-2xl p-8 text-center border-kancho-coral/30" style="border-color: rgba(232, 90, 79, 0.3);">
            <div class="w-20 h-20 bg-kancho-coral/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <i class="fas fa-calendar-check text-kancho text-3xl"></i>
            </div>
            <h3 class="text-2xl font-bold mb-4">Reserva Tu Prueba Gratis</h3>
            <p class="text-gray-400 mb-6">Conoce a nuestro Especialista KanchoAI. Descubre si somos la opción ideal para ti.</p>
            <ul class="text-left max-w-md mx-auto space-y-3 mb-8">
              <li class="flex items-center gap-3 text-gray-300"><i class="fas fa-check-circle text-green-400"></i> No se requiere experiencia</li>
              <li class="flex items-center gap-3 text-gray-300"><i class="fas fa-check-circle text-green-400"></i> Cero compromiso o presión</li>
            </ul>
            <button onclick="openTrialBookingModal()" class="kancho-btn px-8 py-4 rounded-xl font-medium transition shadow-lg text-lg">
              <i class="fas fa-calendar-plus mr-2"></i>Reservar Prueba Gratis
            </button>
          </div>
        </div>
      </div>

      <!-- Nuestros Programas -->
      <div class="mt-16 pt-16 border-t border-kancho-dark-border">
        <div class="text-center mb-12">
          <h2 class="text-2xl sm:text-3xl font-bold mb-3 md:mb-4 mobile-title">Explora Nuestros <span class="text-kancho">Programas</span></h2>
          <p class="text-gray-400 max-w-2xl mx-auto">Entrenamiento de artes marciales de clase mundial para todas las edades y niveles.</p>
        </div>
        <div id="classesGridEs" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-5 max-w-7xl mx-auto mobile-value-props">
          <div class="text-center col-span-full py-8">
            <i class="fas fa-spinner fa-spin text-kancho text-3xl mb-4 block"></i>
            <p class="text-gray-400">Cargando clases...</p>
          </div>
        </div>
      </div>

      <!-- Onboarding Section -->
      <div class="mt-16 pt-16 border-t border-kancho-dark-border">
        <div class="text-center mb-12">
          <h2 class="text-2xl sm:text-3xl font-bold mb-3 md:mb-4 mobile-title">Comenzar con <span class="text-kancho">Kancho AI</span> es Muy Fácil</h2>
          <p class="text-gray-400 max-w-2xl mx-auto text-sm md:text-base px-2">Nuestro equipo dedicado te guía personalmente en cada paso del proceso.</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 max-w-4xl mx-auto mobile-workflow">
          <!-- Step 1 -->
          <div class="text-center">
            <div class="w-16 h-16 bg-kancho-coral/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <span class="text-2xl font-bold text-kancho">1</span>
            </div>
            <h3 class="text-xl font-bold mb-3">Integración de Datos</h3>
            <p class="text-gray-400 text-sm">
              Conecta tus herramientas y plataformas existentes, y nuestro equipo se encarga de la configuración por ti. Integración rápida y segura sin complicaciones.
            </p>
          </div>

          <!-- Step 2 -->
          <div class="text-center">
            <div class="w-16 h-16 bg-kancho-coral/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <span class="text-2xl font-bold text-kancho">2</span>
            </div>
            <h3 class="text-xl font-bold mb-3">Onboarding Personalizado</h3>
            <p class="text-gray-400 text-sm">
              Recibe entrenamiento personalizado 1-a-1 para que te sientas seguro desde el primer día. Nuestro equipo de soporte es como tener tu propio departamento de TI dedicado.
            </p>
          </div>
        </div>
      </div>

      <!-- App Preview Image -->
      <div class="mt-16 flex justify-center">
        <img src="https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/698f40f5772de9dc86d48339.png" alt="Kancho AI App Preview" class="max-w-full md:max-w-4xl rounded-2xl shadow-2xl shadow-kancho-coral/10">
      </div>

      <!-- AI Automation Workflow Section -->
      <div class="mt-16 pt-16 border-t border-kancho-dark-border">
        <div class="text-center mb-12">
          <h2 class="text-2xl sm:text-3xl font-bold mb-3 md:mb-4 mobile-title">Cómo <span class="text-kancho">Kancho AI</span> Trabaja Para Ti</h2>
          <p class="text-gray-400 max-w-2xl mx-auto text-sm md:text-base px-2">Un sistema de IA completamente automatizado que monitorea, retiene y hace crecer tu escuela de artes marciales — 24/7, sin mover un dedo.</p>
        </div>

        <!-- Workflow Steps -->
        <div class="max-w-5xl mx-auto">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8 relative mobile-workflow">
            <!-- Connection Lines (Desktop) -->
            <div class="hidden md:block absolute top-16 left-1/4 right-1/4 h-0.5 bg-gradient-to-r from-kancho-coral via-amber-500 to-green-500"></div>

            <!-- Step 1: Monitor -->
            <div class="relative">
              <div class="card rounded-2xl p-6 text-center h-full">
                <div class="w-20 h-20 bg-kancho-coral/20 rounded-full flex items-center justify-center mx-auto mb-6 relative z-10 border-4 border-kancho-dark">
                  <i class="fas fa-heartbeat text-kancho text-3xl"></i>
                </div>
                <div class="inline-block bg-kancho-coral/20 text-kancho text-xs font-bold px-3 py-1 rounded-full mb-4">PASO 1</div>
                <h3 class="text-xl font-bold mb-3 text-white">Monitorea la Salud</h3>
                <p class="text-gray-400 text-sm mb-4">
                  Kancho AI monitorea continuamente el puntaje de salud de tu escuela, rastreando patrones de asistencia, estado de pagos y niveles de compromiso en tiempo real.
                </p>
                <ul class="text-left text-sm space-y-2">
                  <li class="flex items-center gap-2 text-gray-300">
                    <i class="fas fa-check-circle text-kancho text-xs"></i>
                    Puntaje de salud en tiempo real (0-100)
                  </li>
                  <li class="flex items-center gap-2 text-gray-300">
                    <i class="fas fa-check-circle text-kancho text-xs"></i>
                    Detección de estudiantes en riesgo
                  </li>
                  <li class="flex items-center gap-2 text-gray-300">
                    <i class="fas fa-check-circle text-kancho text-xs"></i>
                    Seguimiento y pronóstico de ingresos
                  </li>
                </ul>
              </div>
            </div>

            <!-- Step 2: Retain -->
            <div class="relative">
              <div class="card rounded-2xl p-6 text-center h-full border-amber-500/30">
                <div class="w-20 h-20 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-6 relative z-10 border-4 border-kancho-dark">
                  <i class="fas fa-phone-alt text-amber-400 text-3xl"></i>
                </div>
                <div class="inline-block bg-amber-500/20 text-amber-400 text-xs font-bold px-3 py-1 rounded-full mb-4">PASO 2</div>
                <h3 class="text-xl font-bold mb-3 text-white">Retiene Miembros</h3>
                <p class="text-gray-400 text-sm mb-4">
                  Cuando un estudiante muestra señales de abandono, Kancho AI automáticamente realiza llamadas de retención personalizadas para re-engancharlo antes de que cancele.
                </p>
                <ul class="text-left text-sm space-y-2">
                  <li class="flex items-center gap-2 text-gray-300">
                    <i class="fas fa-check-circle text-amber-400 text-xs"></i>
                    Llamadas de seguimiento automáticas
                  </li>
                  <li class="flex items-center gap-2 text-gray-300">
                    <i class="fas fa-check-circle text-amber-400 text-xs"></i>
                    Scripts de retención personalizados
                  </li>
                  <li class="flex items-center gap-2 text-gray-300">
                    <i class="fas fa-check-circle text-amber-400 text-xs"></i>
                    Recuperación de citas perdidas y pagos
                  </li>
                </ul>
              </div>
            </div>

            <!-- Step 3: Convert -->
            <div class="relative">
              <div class="card rounded-2xl p-6 text-center h-full border-green-500/30">
                <div class="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6 relative z-10 border-4 border-kancho-dark">
                  <i class="fas fa-chart-line text-green-400 text-3xl"></i>
                </div>
                <div class="inline-block bg-green-500/20 text-green-400 text-xs font-bold px-3 py-1 rounded-full mb-4">PASO 3</div>
                <h3 class="text-xl font-bold mb-3 text-white">Convierte Prospectos</h3>
                <p class="text-gray-400 text-sm mb-4">
                  Kancho AI se comunica con cada prospecto desde el primer contacto hasta la conversión — haciendo seguimiento, programando pruebas y nutriéndolos hasta que se conviertan en miembros.
                </p>
                <ul class="text-left text-sm space-y-2">
                  <li class="flex items-center gap-2 text-gray-300">
                    <i class="fas fa-check-circle text-green-400 text-xs"></i>
                    Engagement de prospectos de principio a fin
                  </li>
                  <li class="flex items-center gap-2 text-gray-300">
                    <i class="fas fa-check-circle text-green-400 text-xs"></i>
                    Programación automática de pruebas
                  </li>
                  <li class="flex items-center gap-2 text-gray-300">
                    <i class="fas fa-check-circle text-green-400 text-xs"></i>
                    Priorización de prospectos calientes
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <!-- Result Banner -->
          <div class="mt-12 bg-gradient-to-r from-kancho-coral/10 via-amber-500/10 to-green-500/10 border border-kancho-dark-border rounded-2xl p-8 text-center">
            <div class="flex flex-col md:flex-row items-center justify-center gap-6">
              <div class="flex items-center gap-3">
                <i class="fas fa-robot text-kancho text-2xl"></i>
                <span class="text-white font-medium">Automatización IA 24/7</span>
              </div>
              <div class="hidden md:block w-px h-8 bg-kancho-dark-border"></div>
              <div class="flex items-center gap-3">
                <i class="fas fa-hand-holding-usd text-amber-400 text-2xl"></i>
                <span class="text-white font-medium">Protege Ingresos</span>
              </div>
              <div class="hidden md:block w-px h-8 bg-kancho-dark-border"></div>
              <div class="flex items-center gap-3">
                <i class="fas fa-users text-green-400 text-2xl"></i>
                <span class="text-white font-medium">Crece tu Membresía</span>
              </div>
            </div>
            <p class="text-gray-400 text-sm mt-4">Todo funcionando automáticamente mientras tú te enfocas en enseñar y transformar vidas.</p>
          </div>
        </div>
      </div>

      <!-- Integration Image -->
      <div class="mt-16 flex justify-center">
        <img src="https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/698d575dbfe00f98dff7c57d.png" alt="Integraciones Kancho AI" class="max-w-full md:max-w-4xl rounded-2xl">
      </div>

      <!-- Subscription Plans -->
      <div class="mt-16 pt-16 border-t border-kancho-dark-border" id="pricing">
        <div class="text-center mb-12">
          <h2 class="text-2xl sm:text-3xl font-bold mb-3 md:mb-4 mobile-title">Elige Tu Plan de <span class="text-kancho">Kancho AI</span></h2>
          <p class="text-gray-400 max-w-2xl mx-auto text-sm md:text-base px-2">Potencia tu escuela de artes marciales con inteligencia de negocio impulsada por IA, recepcionista automatizada y soluciones CRM completas.</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 max-w-6xl mx-auto mobile-pricing-grid">
          <!-- Plan 1: Kancho Intelligence -->
          <div class="card rounded-2xl p-8 relative hover:border-kancho-coral/50 transition-all duration-300">
            <div class="text-center mb-6">
              <h3 class="text-xl font-bold mb-2">Kancho Intelligence</h3>
              <p class="text-gray-400 text-sm mb-4">Inteligencia de Negocio con IA</p>
              <div class="flex items-baseline justify-center gap-1">
                <span class="text-4xl font-bold text-kancho">$197</span>
                <span class="text-gray-400">/mes</span>
              </div>
            </div>
            <ul class="space-y-3 mb-8">
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Oficial de Inteligencia de Negocio con IA</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Se integra con tu CRM existente</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Monitoreo de puntaje de salud en tiempo real</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Detección de riesgo de abandono y alertas</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Puntuación y priorización de prospectos</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Análisis y pronóstico de ingresos</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Asesor de negocio por voz con IA</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">100 minutos de voz IA incluidos ($0.50 después)</span>
              </li>
            </ul>
            <a href="https://checkout.stripe.com/c/pay/cs_live_a18grG2h3V8gz0gUChQ3o2R1FfHPo5GCMNtzTW5c0lLLThzQdOPHu0Zyfs#fidnandhYHdWcXxpYCc%2FJ2FgY2RwaXEnKSdkdWxOYHwnPyd1blppbHNgWjA0V012N2RDNlRHaUF3Yn19MUkzQ2R2SFRvQVVAVVJtMVJJNkhcQ1RURGlgQUdgQ2FUfWcwN2JGakJ3VmFWQHBIQEAzSXY2QGg1N310Y31LQHdiNTBBbjw0NTVIVzxdRGlNTCcpJ2N3amhWYHdzYHcnP3F3cGApJ2dkZm5id2pwa2FGamlqdyc%2FJyZjY2NjY2MnKSdpZHxqcHFRfHVgJz8ndmxrYmlgWmxxYGgnKSdga2RnaWBVaWRmYG1qaWFgd3YnP3F3cGB4JSUl" class="block w-full py-3 text-center bg-white/10 hover:bg-kancho-coral/20 border border-kancho-dark-border hover:border-kancho-coral rounded-xl font-medium transition text-white no-underline">
              Comenzar
            </a>
          </div>

          <!-- Plan 2: Kancho Pro (Most Popular) -->
          <div class="card rounded-2xl p-8 relative border-kancho-coral/50 transform scale-105 shadow-xl shadow-kancho-coral/10">
            <div class="absolute -top-4 left-1/2 transform -translate-x-1/2">
              <span class="bg-kancho-coral px-4 py-1 rounded-full text-sm font-bold">MÁS POPULAR</span>
            </div>
            <div class="text-center mb-6">
              <h3 class="text-xl font-bold mb-2">Kancho Pro</h3>
              <p class="text-gray-400 text-sm mb-4">Intelligence + Recepcionista IA</p>
              <div class="flex items-baseline justify-center gap-1">
                <span class="text-4xl font-bold text-kancho">$397</span>
                <span class="text-gray-400">/mes</span>
              </div>
            </div>
            <ul class="space-y-3 mb-8">
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm"><strong>Todo lo de Intelligence</strong></span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Recepcionista IA 24/7 (Teléfono y SMS)</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Llamadas automatizadas de seguimiento a prospectos</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Campañas de retención automatizadas</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Llamadas de recuperación de citas perdidas</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Automatización de recordatorios de pago</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Soporte bilingüe (EN/ES)</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">500 minutos de voz IA incluidos ($0.45 después)</span>
              </li>
            </ul>
            <a href="https://checkout.stripe.com/c/pay/cs_live_a18grG2h3V8gz0gUChQ3o2R1FfHPo5GCMNtzTW5c0lLLThzQdOPHu0Zyfs#fidnandhYHdWcXxpYCc%2FJ2FgY2RwaXEnKSdkdWxOYHwnPyd1blppbHNgWjA0V012N2RDNlRHaUF3Yn19MUkzQ2R2SFRvQVVAVVJtMVJJNkhcQ1RURGlgQUdgQ2FUfWcwN2JGakJ3VmFWQHBIQEAzSXY2QGg1N310Y31LQHdiNTBBbjw0NTVIVzxdRGlNTCcpJ2N3amhWYHdzYHcnP3F3cGApJ2dkZm5id2pwa2FGamlqdyc%2FJyZjY2NjY2MnKSdpZHxqcHFRfHVgJz8ndmxrYmlgWmxxYGgnKSdga2RnaWBVaWRmYG1qaWFgd3YnP3F3cGB4JSUl" class="block w-full py-3 text-center kancho-btn rounded-xl font-medium transition shadow-lg text-white no-underline">
              Comenzar
            </a>
          </div>

          <!-- Plan 3: Kancho Enterprise -->
          <div class="card rounded-2xl p-8 relative hover:border-kancho-coral/50 transition-all duration-300">
            <div class="text-center mb-6">
              <h3 class="text-xl font-bold mb-2">Kancho Enterprise</h3>
              <p class="text-gray-400 text-sm mb-4">Solución SaaS Multi-Tenant</p>
              <div class="flex items-baseline justify-center gap-1">
                <span class="text-4xl font-bold text-kancho">Personalizado</span>
              </div>
            </div>
            <ul class="space-y-3 mb-8">
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm"><strong>Todo lo de Pro</strong></span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Plataforma multi-tenant marca blanca</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Soporte multi-idioma</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Integraciones personalizadas y acceso API</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Gerente de cuenta dedicado</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Soporte prioritario y SLA</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Precios por volumen para proveedores SaaS</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Minutos de voz IA ilimitados</span>
              </li>
            </ul>
            <button onclick="openBookingModal()" class="w-full py-3 bg-white/10 hover:bg-kancho-coral/20 border border-kancho-dark-border hover:border-kancho-coral rounded-xl font-medium transition">
              Agenda una Llamada
            </button>
          </div>

        </div>

        <p class="text-center text-gray-500 text-sm mt-8">Todos los planes incluyen 14 días de prueba gratis. No se requiere tarjeta de crédito para comenzar.</p>

        <!-- Final CTA -->
        <div class="text-center mt-12">
          <a href="https://checkout.stripe.com/c/pay/cs_live_a18grG2h3V8gz0gUChQ3o2R1FfHPo5GCMNtzTW5c0lLLThzQdOPHu0Zyfs#fidnandhYHdWcXxpYCc%2FJ2FgY2RwaXEnKSdkdWxOYHwnPyd1blppbHNgWjA0V012N2RDNlRHaUF3Yn19MUkzQ2R2SFRvQVVAVVJtMVJJNkhcQ1RURGlgQUdgQ2FUfWcwN2JGakJ3VmFWQHBIQEAzSXY2QGg1N310Y31LQHdiNTBBbjw0NTVIVzxdRGlNTCcpJ2N3amhWYHdzYHcnP3F3cGApJ2dkZm5id2pwa2FGamlqdyc%2FJyZjY2NjY2MnKSdpZHxqcHFRfHVgJz8ndmxrYmlgWmxxYGgnKSdga2RnaWBVaWRmYG1qaWFgd3YnP3F3cGB4JSUl" class="inline-block kancho-btn px-10 py-4 rounded-xl font-medium text-lg transition shadow-lg text-white no-underline">
            <i class="fas fa-rocket mr-2"></i>Comienza Tu Prueba Gratis
          </a>
          <p class="text-gray-500 text-sm mt-4">No se requiere tarjeta de crédito • Cancela cuando quieras</p>
        </div>
      </div>

      <!-- Business Value Section -->
      <div class="mt-16 pt-16 border-t border-kancho-dark-border">
        <div class="text-center mb-12">
          <h2 class="text-2xl sm:text-3xl font-bold mb-3 md:mb-4 mobile-title">Valor de Negocio para <span class="text-kancho">Tu Escuela</span></h2>
          <p class="text-gray-400 max-w-2xl mx-auto text-sm md:text-base px-2">Métricas reales que generan resultados reales. Así es como Kancho AI entrega valor medible a tu escuela de artes marciales.</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 max-w-6xl mx-auto mobile-kpi-grid">
          <!-- Health Score -->
          <div class="card rounded-2xl p-6">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 bg-kancho-coral/20 rounded-lg flex items-center justify-center">
                <i class="fas fa-heartbeat text-kancho"></i>
              </div>
              <h3 class="text-lg font-bold text-white">Puntaje de Salud del Negocio</h3>
            </div>
            <p class="text-gray-400 text-sm">Obtén un puntaje de salud en tiempo real de 0-100 que combina métricas de retención, ingresos y prospectos en un número accionable.</p>
          </div>

          <!-- Churn Detection -->
          <div class="card rounded-2xl p-6">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
                <i class="fas fa-user-minus text-red-400"></i>
              </div>
              <h3 class="text-lg font-bold text-white">Reducción de Tasa de Abandono</h3>
            </div>
            <p class="text-gray-400 text-sm">Identifica estudiantes en riesgo antes de que cancelen. Escuelas usando Kancho AI ven hasta 40% de reducción en abandono mensual.</p>
          </div>

          <!-- Revenue at Risk -->
          <div class="card rounded-2xl p-6">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center">
                <i class="fas fa-exclamation-triangle text-amber-400"></i>
              </div>
              <h3 class="text-lg font-bold text-white">Alertas de Ingresos en Riesgo</h3>
            </div>
            <p class="text-gray-400 text-sm">Ve exactamente cuántos ingresos están en riesgo por miembros en peligro de abandonar. Toma acción antes de perder $4,000+ mensuales.</p>
          </div>

          <!-- Lead Scoring -->
          <div class="card rounded-2xl p-6">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center">
                <i class="fas fa-fire text-orange-400"></i>
              </div>
              <h3 class="text-lg font-bold text-white">Priorización de Prospectos Calientes</h3>
            </div>
            <p class="text-gray-400 text-sm">Sabe qué prospectos están listos para convertir con puntuación de prospectos impulsada por IA. Enfócate primero en los de alto valor.</p>
          </div>

          <!-- ARPS Tracking -->
          <div class="card rounded-2xl p-6">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                <i class="fas fa-dollar-sign text-green-400"></i>
              </div>
              <h3 class="text-lg font-bold text-white">Ingreso Promedio por Estudiante</h3>
            </div>
            <p class="text-gray-400 text-sm">Rastrea el ARPS para entender el valor real de cada miembro y optimizar tus estrategias de precios y ventas adicionales.</p>
          </div>

          <!-- Trial Conversion -->
          <div class="card rounded-2xl p-6">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <i class="fas fa-user-plus text-blue-400"></i>
              </div>
              <h3 class="text-lg font-bold text-white">Tasa de Conversión de Pruebas</h3>
            </div>
            <p class="text-gray-400 text-sm">Monitorea cuántos estudiantes de prueba se convierten en miembros de pago. Mejora tu proceso de conversión con insights basados en datos.</p>
          </div>
        </div>

        <!-- Stats Banner -->
        <div class="mt-12 bg-kancho-dark-card border border-kancho-dark-border rounded-2xl p-4 md:p-8">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8 text-center mobile-stats-banner">
            <div>
              <p class="text-2xl md:text-3xl font-bold text-kancho">40%</p>
              <p class="text-gray-400 text-xs md:text-sm">Reducción Promedio de Abandono</p>
            </div>
            <div>
              <p class="text-3xl font-bold text-kancho">2x</p>
              <p class="text-gray-400 text-sm">Tasa de Conversión de Prospectos</p>
            </div>
            <div>
              <p class="text-3xl font-bold text-kancho">$4,700</p>
              <p class="text-gray-400 text-sm">Ingresos Salvados Mensualmente</p>
            </div>
            <div>
              <p class="text-3xl font-bold text-kancho">24/7</p>
              <p class="text-gray-400 text-sm">Monitoreo de Negocio con IA</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Hero CTA Section -->
      <div class="mt-20 pt-20 border-t border-kancho-dark-border text-center">
        <div class="mb-8">
          <p class="text-2xl font-bold mb-4" style="color: #E85A4F;">Powered by:</p>
          <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/68ec2cfb385c9833a43e685f.png" alt="Kancho AI" class="max-w-2xl w-full mx-auto mb-6">
        </div>
        <p class="text-kancho text-lg font-medium mb-2">Inteligencia de Negocio con IA — Plataforma de Voz y Analítica</p>
        <p class="text-gray-400 text-sm mb-8">Detección de Abandono · Puntuación de Prospectos · Analítica de Ingresos</p>

        <h2 class="text-2xl sm:text-3xl md:text-5xl lg:text-6xl font-bold text-white leading-tight max-w-5xl mx-auto mb-8 md:mb-12 mobile-title px-2" style="color: #5BA4D4;">
          Un sistema de IA todo-en-uno que encuentra negocios, los llama automáticamente, recolecta prospectos y agenda citas.
        </h2>

        <div class="flex flex-col sm:flex-row gap-4 justify-center mb-6 mobile-cta-buttons">
          <a href="https://checkout.stripe.com/c/pay/cs_live_a18grG2h3V8gz0gUChQ3o2R1FfHPo5GCMNtzTW5c0lLLThzQdOPHu0Zyfs#fidnandhYHdWcXxpYCc%2FJ2FgY2RwaXEnKSdkdWxOYHwnPyd1blppbHNgWjA0V012N2RDNlRHaUF3Yn19MUkzQ2R2SFRvQVVAVVJtMVJJNkhcQ1RURGlgQUdgQ2FUfWcwN2JGakJ3VmFWQHBIQEAzSXY2QGg1N310Y31LQHdiNTBBbjw0NTVIVzxdRGlNTCcpJ2N3amhWYHdzYHcnP3F3cGApJ2dkZm5id2pwa2FGamlqdyc%2FJyZjY2NjY2MnKSdpZHxqcHFRfHVgJz8ndmxrYmlgWmxxYGgnKSdga2RnaWBVaWRmYG1qaWFgd3YnP3F3cGB4JSUl" class="kancho-btn px-10 py-4 rounded-full font-medium text-lg transition shadow-lg text-white no-underline">
            Comenzar Gratis
          </a>
          <button onclick="openBookingModal()" class="px-10 py-4 rounded-full font-medium text-lg border-2 border-gray-600 hover:border-gray-400 transition">
            Agenda un Demo
          </button>
        </div>
        <p class="text-gray-500 text-sm">Totalmente gratis — sin tarjeta de crédito, sin costos ocultos</p>
      </div>

      <!-- Booking Modal -->
      <div id="bookingModal" class="hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] items-center justify-center p-4 overflow-y-auto">
        <div class="bg-kancho-dark-card border border-kancho-dark-border rounded-3xl w-full max-w-3xl shadow-2xl my-4 mx-auto">
          <div class="p-6 border-b border-kancho-dark-border flex items-center justify-between sticky top-0 bg-kancho-dark-card z-10 rounded-t-3xl">
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden bg-kancho-coral/20">
                <img src="${KANCHO_LOGO_URL}" alt="Kancho" class="w-10 h-10 object-contain">
              </div>
              <div>
                <h3 class="text-lg font-bold">Agenda tu Onboarding</h3>
                <p class="text-sm text-gray-400">Reserva tu sesión de onboarding personalizada</p>
              </div>
            </div>
            <button onclick="closeBookingModal()" class="p-2 hover:bg-white/10 rounded-lg transition">
              <i class="fas fa-times text-gray-400"></i>
            </button>
          </div>
          <div class="p-4">
            <iframe src="https://api.leadconnectorhq.com/widget/booking/nhKuDsn2At5csiDYc4d0" style="width: 100%; height: 800px; border: none;" scrolling="yes"></iframe>
          </div>
        </div>
      </div>
      <script src="https://link.msgsndr.com/js/form_embed.js" type="text/javascript"></script>

      <!-- Modal de Reserva de Prueba -->
      <div id="trialBookingModal" class="hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] items-center justify-center p-4 overflow-y-auto">
        <div class="bg-kancho-dark-card border border-kancho-dark-border rounded-3xl w-full max-w-3xl shadow-2xl my-4 mx-auto">
          <div class="p-6 border-b border-kancho-dark-border flex items-center justify-between sticky top-0 bg-kancho-dark-card z-10 rounded-t-3xl">
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden bg-green-500/20">
                <i class="fas fa-calendar-check text-green-400 text-2xl"></i>
              </div>
              <div>
                <h3 class="text-lg font-bold text-white">Reserva Tu Prueba Gratis</h3>
                <p class="text-sm text-gray-400">Conoce a nuestro Especialista KanchoAI</p>
              </div>
            </div>
            <button onclick="closeTrialBookingModal()" class="p-2 hover:bg-white/10 rounded-lg transition">
              <i class="fas fa-times text-gray-400"></i>
            </button>
          </div>
          <div class="p-4">
            <iframe src="https://api.leadconnectorhq.com/widget/booking/nhKuDsn2At5csiDYc4d0" style="width: 100%; height: 700px; border: none;" scrolling="yes"></iframe>
          </div>
        </div>
      </div>
    </div>

    <!-- Dashboard Section -->
    <div id="dashboardSection" class="hidden fade-in">
      <div class="card rounded-2xl p-6 mb-8 border-kancho-coral/30" style="border-color: rgba(232, 90, 79, 0.3);">
        <div class="flex items-start gap-4">
          <img src="${KANCHO_LOGO_URL}" alt="Kancho" class="w-12 h-12 rounded-xl object-contain">
          <div>
            <p class="text-kancho font-medium mb-1">Kancho dice:</p>
            <p id="kanchoMessage" class="text-lg text-gray-200">Analizando los datos de tu negocio...</p>
          </div>
        </div>
      </div>

      <!-- Stats Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
        <div class="card rounded-2xl p-6 text-center relative">
          <a href="/kanchoai/metrics-guide" target="_blank" class="absolute top-4 right-4 text-gray-500 hover:text-kancho transition" title="Aprende sobre métricas">
            <i class="fas fa-question-circle"></i>
          </a>
          <p class="text-xs text-gray-400 uppercase mb-4">Salud del Negocio</p>
          <div class="relative w-36 h-36 mx-auto mb-4">
            <svg class="w-36 h-36 transform -rotate-90">
              <circle cx="72" cy="72" r="60" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="10"/>
              <circle id="scoreRing" cx="72" cy="72" r="60" fill="none" stroke="url(#scoreGradient)" stroke-width="10" stroke-linecap="round" class="score-ring" style="--score: 0"/>
              <defs>
                <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="#F17A70"/>
                  <stop offset="100%" stop-color="#E85A4F"/>
                </linearGradient>
              </defs>
            </svg>
            <div class="absolute inset-0 flex items-center justify-center">
              <div>
                <span id="healthScore" class="text-4xl font-bold">--</span>
                <p class="text-xs text-gray-500">/ 100</p>
              </div>
            </div>
          </div>
          <span id="healthGrade" class="inline-block px-4 py-1.5 bg-kancho-coral/20 text-kancho rounded-full text-sm font-bold">Calificación: --</span>
        </div>

        <div class="card card-danger rounded-2xl p-6">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
              <i class="fas fa-arrow-trend-down text-red-400"></i>
            </div>
            <p class="text-xs text-gray-400 uppercase">Ingresos en Riesgo</p>
          </div>
          <p id="revenueAtRisk" class="text-3xl font-bold text-red-400">$--</p>
          <p id="atRiskStudents" class="text-sm text-gray-400 mt-1">-- estudiantes en riesgo</p>
        </div>

        <div class="card card-success rounded-2xl p-6">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
              <i class="fas fa-arrow-trend-up text-green-400"></i>
            </div>
            <p class="text-xs text-gray-400 uppercase">Potencial de Crecimiento</p>
          </div>
          <p id="growthPotential" class="text-3xl font-bold text-green-400">$--</p>
          <p id="hotLeads" class="text-sm text-gray-400 mt-1">-- prospectos calientes</p>
        </div>

        <div class="card rounded-2xl p-6">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <i class="fas fa-dollar-sign text-blue-400"></i>
            </div>
            <p class="text-xs text-gray-400 uppercase">Ingresos Mensuales</p>
          </div>
          <p id="monthlyRevenue" class="text-3xl font-bold text-white">$--</p>
          <p id="revenueProgress" class="text-sm text-gray-400 mt-1">--% de la meta</p>
        </div>
      </div>

      <!-- KPI Metrics Section -->
      <div class="mb-8">
        <h3 class="text-lg font-bold mb-4 flex items-center justify-between">
          <span class="flex items-center gap-2">
            <i class="fas fa-chart-line text-kancho"></i>
            Indicadores Clave de Rendimiento
          </span>
          <a href="/kanchoai/metrics-guide" target="_blank" class="text-sm text-gray-400 hover:text-kancho transition flex items-center gap-1 font-normal">
            <i class="fas fa-question-circle"></i>
            <span class="hidden sm:inline">¿Qué significan?</span>
          </a>
        </h3>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <!-- Active Students -->
          <div class="card rounded-xl p-4 text-center">
            <p class="text-xs text-gray-400 uppercase mb-2">Estudiantes Activos</p>
            <p id="kpiActiveStudents" class="text-2xl font-bold text-white">--</p>
            <p id="kpiStudentGrowth" class="text-xs text-gray-400 mt-1">-- crecimiento neto</p>
          </div>
          <!-- Churn Rate -->
          <div class="card rounded-xl p-4 text-center">
            <p class="text-xs text-gray-400 uppercase mb-2">Tasa de Abandono</p>
            <p id="kpiChurnRate" class="text-2xl font-bold text-amber-400">--%</p>
            <p class="text-xs text-gray-400 mt-1">este mes</p>
          </div>
          <!-- ARPS -->
          <div class="card rounded-xl p-4 text-center">
            <p class="text-xs text-gray-400 uppercase mb-2">Ingreso Prom/Est</p>
            <p id="kpiARPS" class="text-2xl font-bold text-green-400">$--</p>
            <p class="text-xs text-gray-400 mt-1">ARPS</p>
          </div>
          <!-- Trial Conversion -->
          <div class="card rounded-xl p-4 text-center">
            <p class="text-xs text-gray-400 uppercase mb-2">Conversión Pruebas</p>
            <p id="kpiTrialConversion" class="text-2xl font-bold text-blue-400">--%</p>
            <p class="text-xs text-gray-400 mt-1">tasa de conversión</p>
          </div>
          <!-- Revenue vs Target -->
          <div class="card rounded-xl p-4 text-center">
            <p class="text-xs text-gray-400 uppercase mb-2">vs Meta</p>
            <p id="kpiRevenueTarget" class="text-2xl font-bold text-kancho">--%</p>
            <p class="text-xs text-gray-400 mt-1">de meta mensual</p>
          </div>
        </div>
      </div>

      <!-- Action Lists -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="card rounded-2xl p-6">
          <h3 class="text-lg font-bold mb-4 flex items-center gap-2">
            <i class="fas fa-user-minus text-red-400"></i>
            Miembros en Riesgo
          </h3>
          <div id="atRiskList" class="space-y-3"></div>
        </div>

        <div class="card rounded-2xl p-6">
          <h3 class="text-lg font-bold mb-4 flex items-center gap-2">
            <i class="fas fa-fire text-green-400"></i>
            Prospectos Calientes
          </h3>
          <div id="hotLeadsList" class="space-y-3"></div>
        </div>
      </div>
    </div>
  </main>

  <!-- Footer -->
  <footer class="border-t border-kancho-dark-border bg-kancho-dark/95 mt-12 md:mt-20">
    <div class="max-w-7xl mx-auto px-4 md:px-6 py-10 md:py-16">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-12 mobile-footer-grid">
        <!-- Brand -->
        <div class="md:col-span-1">
          <div class="flex items-center gap-3 mb-4">
            <img src="${KANCHO_LOGO_URL}" alt="Kancho AI" class="w-10 h-10 rounded-lg object-contain">
            <span class="text-xl font-bold">KANCHO AI</span>
          </div>
          <p class="text-gray-400 text-sm mb-4">Oficial de Inteligencia de Negocio con IA para escuelas de artes marciales y negocios de fitness.</p>
          <p class="text-gray-500 text-xs">Desarrollado por RinglyPro</p>
        </div>

        <!-- Product -->
        <div>
          <h4 class="font-semibold mb-4 text-white">Producto</h4>
          <ul class="space-y-2 text-sm">
            <li><a href="/kanchoai/features" class="text-gray-400 hover:text-kancho transition">Características</a></li>
            <li><a href="/kanchoai/es/pricing" class="text-gray-400 hover:text-kancho transition">Precios</a></li>
            <li><a href="/kanchoai/integrations" class="text-gray-400 hover:text-kancho transition">Integraciones</a></li>
            <li><a href="/kanchoai/metrics-guide" class="text-gray-400 hover:text-kancho transition">Guía del Dashboard</a></li>
          </ul>
        </div>

        <!-- Company -->
        <div>
          <h4 class="font-semibold mb-4 text-white">Empresa</h4>
          <ul class="space-y-2 text-sm">
            <li><a href="/kanchoai/about" class="text-gray-400 hover:text-kancho transition">Sobre Nosotros</a></li>
            <li><a href="/kanchoai/contact" class="text-gray-400 hover:text-kancho transition">Contacto</a></li>
          </ul>
        </div>

        <!-- Legal -->
        <div>
          <h4 class="font-semibold mb-4 text-white">Legal</h4>
          <ul class="space-y-2 text-sm">
            <li><a href="/kanchoai/privacy" class="text-gray-400 hover:text-kancho transition">Política de Privacidad</a></li>
            <li><a href="/kanchoai/terms" class="text-gray-400 hover:text-kancho transition">Términos de Servicio</a></li>
            <li><a href="mailto:support@ringlypro.com" class="text-gray-400 hover:text-kancho transition">support@ringlypro.com</a></li>
          </ul>
        </div>
      </div>

      <!-- Bottom Bar -->
      <div class="border-t border-kancho-dark-border mt-12 pt-8 text-center">
        <p class="text-gray-500 text-sm">&copy; ${new Date().getFullYear()} Kancho AI. Todos los derechos reservados.</p>
      </div>
    </div>
  </footer>

  <!-- Language Toggle -->
  <div class="fixed bottom-4 left-4 flex gap-2">
    <a href="/kanchoai" class="px-4 py-2 bg-kancho-dark-card border border-kancho-dark-border rounded-lg text-sm hover:bg-kancho-coral/20 transition">EN</a>
    <a href="/kanchoai/es" class="px-4 py-2 bg-kancho-coral/20 border border-kancho-dark-border rounded-lg text-sm">ES</a>
  </div>

  <!-- Voice Chat Modal -->
  <div id="voiceModal" class="hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] items-center justify-center p-4">
    <div class="bg-kancho-dark-card border border-kancho-dark-border rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
      <div class="p-6 border-b border-kancho-dark-border flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden bg-kancho-coral/20">
            <img src="${KANCHO_LOGO_URL}" alt="Kancho" class="w-10 h-10 object-contain">
          </div>
          <div>
            <h3 class="text-lg font-bold">Habla con Kancho</h3>
            <p id="voiceStatus" class="text-sm text-gray-400">Iniciando conversación...</p>
          </div>
        </div>
        <button onclick="closeVoiceModal()" class="p-2 hover:bg-white/10 rounded-lg transition">
          <i class="fas fa-times text-gray-400"></i>
        </button>
      </div>

      <div class="p-8 flex flex-col items-center justify-center min-h-[300px]">
        <div id="voiceWidgetContainer" class="mb-4"></div>
        <p id="widgetSchoolName" class="text-lg font-medium text-white mb-2"></p>
        <p class="text-sm text-gray-400 text-center">
          Haz clic en el orbe para hablar con Kancho.<br>
          Pregunta sobre ingresos, miembros, prospectos y más.
        </p>
      </div>

      <div class="p-4 border-t border-kancho-dark-border">
        <button onclick="closeVoiceModal()" class="w-full py-3 bg-white/10 hover:bg-white/20 rounded-xl font-medium transition">
          Terminar Conversación
        </button>
      </div>
    </div>
  </div>

  <script src="https://elevenlabs.io/convai-widget/index.js" async type="text/javascript"></script>

  <style>
    #voiceWidgetContainer {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 120px;
    }
    #voiceWidgetContainer elevenlabs-convai {
      position: relative !important;
      bottom: auto !important;
      right: auto !important;
    }
    elevenlabs-convai::part(powered-by) {
      display: none !important;
    }
    /* Hide the default ElevenLabs widget that auto-renders in bottom-right */
    body > elevenlabs-convai {
      display: none !important;
    }
  </style>

  <script>
    let currentSchoolId = null;
    let currentSchoolData = null;
    let currentLanguage = 'es';

    async function loadSchools() {
      try {
        const res = await fetch('/kanchoai/api/v1/schools?tenant_id=1');
        const data = await res.json();
        const select = document.getElementById('schoolSelect');
        select.innerHTML = '<option value="">Selecciona tu Negocio...</option>';
        if (data.data) {
          data.data.forEach(school => {
            select.innerHTML += '<option value="' + school.id + '">' + school.name + '</option>';
          });
        }
      } catch (e) {
        console.error('Error al cargar escuelas:', e);
      }
    }

    // Outbound Calling Functions
    async function callMember(studentId, phone, btn) {
      if (!currentSchoolId) {
        alert('Por favor selecciona una escuela primero');
        return;
      }
      if (!phone) {
        alert('Este miembro no tiene número de teléfono registrado');
        return;
      }

      const originalText = btn.textContent;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

      try {
        const res = await fetch('/kanchoai/api/v1/outbound/call-member', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            student_id: studentId,
            school_id: currentSchoolId,
            phone: phone
          })
        });

        const data = await res.json();

        if (data.success) {
          btn.innerHTML = '<i class="fas fa-check"></i>';
          btn.className = btn.className.replace('bg-red-500/20 text-red-400', 'bg-green-500/20 text-green-400');
          setTimeout(() => {
            btn.textContent = originalText;
            btn.disabled = false;
            btn.className = btn.className.replace('bg-green-500/20 text-green-400', 'bg-red-500/20 text-red-400');
          }, 3000);
        } else {
          alert('Error: ' + (data.error || 'No se pudo iniciar la llamada'));
          btn.textContent = originalText;
          btn.disabled = false;
        }
      } catch (e) {
        console.error('Error al llamar:', e);
        alert('Error al iniciar la llamada');
        btn.textContent = originalText;
        btn.disabled = false;
      }
    }

    async function callLead(leadId, phone, btn) {
      if (!currentSchoolId) {
        alert('Por favor selecciona una escuela primero');
        return;
      }
      if (!phone) {
        alert('Este prospecto no tiene número de teléfono registrado');
        return;
      }

      const originalText = btn.textContent;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

      try {
        const res = await fetch('/kanchoai/api/v1/outbound/call-lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lead_id: leadId,
            school_id: currentSchoolId,
            phone: phone
          })
        });

        const data = await res.json();

        if (data.success) {
          btn.innerHTML = '<i class="fas fa-check"></i>';
          btn.className = btn.className.replace('bg-green-500/20 text-green-400', 'bg-blue-500/20 text-blue-400');
          setTimeout(() => {
            btn.textContent = originalText;
            btn.disabled = false;
            btn.className = btn.className.replace('bg-blue-500/20 text-blue-400', 'bg-green-500/20 text-green-400');
          }, 3000);
        } else {
          alert('Error: ' + (data.error || 'No se pudo iniciar la llamada'));
          btn.textContent = originalText;
          btn.disabled = false;
        }
      } catch (e) {
        console.error('Error al llamar:', e);
        alert('Error al iniciar la llamada');
        btn.textContent = originalText;
        btn.disabled = false;
      }
    }

    document.getElementById('schoolSelect').addEventListener('change', async (e) => {
      currentSchoolId = e.target.value;
      if (currentSchoolId) {
        await loadDashboard(currentSchoolId);
        loadClassesEs();
      } else {
        document.getElementById('welcomeSection').classList.remove('hidden');
        document.getElementById('dashboardSection').classList.add('hidden');
        loadClassesEs();
      }
    });

    async function loadDashboard(schoolId) {
      document.getElementById('welcomeSection').classList.add('hidden');
      document.getElementById('dashboardSection').classList.remove('hidden');

      try {
        const res = await fetch('/kanchoai/api/v1/dashboard?school_id=' + schoolId);
        const data = await res.json();
        const d = data.data;

        currentSchoolData = d;

        const score = d.health?.overall_score || 0;
        document.getElementById('healthScore').textContent = score;
        document.getElementById('healthGrade').textContent = 'Calificación: ' + (d.health?.grade || '--');
        document.getElementById('scoreRing').style.setProperty('--score', score);

        // Update ring color based on health score
        const gradient = document.getElementById('scoreGradient');
        if (gradient) {
          const stops = gradient.querySelectorAll('stop');
          let color1, color2;
          if (score >= 80) {
            color1 = '#22C55E'; color2 = '#16A34A'; // Green
          } else if (score >= 60) {
            color1 = '#FBBF24'; color2 = '#F59E0B'; // Yellow/Amber
          } else {
            color1 = '#F87171'; color2 = '#EF4444'; // Red
          }
          if (stops[0]) stops[0].setAttribute('stop-color', color1);
          if (stops[1]) stops[1].setAttribute('stop-color', color2);
        }

        const atRiskCount = d.students?.at_risk || 0;
        const revenueAtRisk = atRiskCount * 175;
        document.getElementById('revenueAtRisk').textContent = '$' + revenueAtRisk.toLocaleString();
        document.getElementById('atRiskStudents').textContent = atRiskCount + ' estudiantes en riesgo';

        const hotLeadsCount = d.leads?.hot || 0;
        const growthPotential = hotLeadsCount * 175;
        document.getElementById('growthPotential').textContent = '$' + growthPotential.toLocaleString();
        document.getElementById('hotLeads').textContent = hotLeadsCount + ' prospectos calientes';

        const revenue = d.revenue?.this_month || 0;
        document.getElementById('monthlyRevenue').textContent = '$' + Math.round(revenue).toLocaleString();
        document.getElementById('revenueProgress').textContent = (d.revenue?.percent || 0) + '% de la meta';

        const kpi = d.kpi || {};
        const activeStudents = kpi.active_students || d.students?.active || 0;
        const netGrowth = kpi.net_student_growth || 0;
        const churnRate = kpi.churn_rate || 0;
        const arps = kpi.arps || 175;
        const trialConversion = kpi.trial_conversion_rate || 0;
        const revenueVsTarget = kpi.revenue_vs_target_percent || d.revenue?.percent || 0;

        document.getElementById('kpiActiveStudents').textContent = activeStudents;
        document.getElementById('kpiStudentGrowth').textContent = (netGrowth >= 0 ? '+' : '') + netGrowth + ' crecimiento neto';
        document.getElementById('kpiChurnRate').textContent = parseFloat(churnRate).toFixed(1) + '%';
        document.getElementById('kpiARPS').textContent = '$' + Math.round(arps);
        document.getElementById('kpiTrialConversion').textContent = parseFloat(trialConversion).toFixed(1) + '%';
        document.getElementById('kpiRevenueTarget').textContent = parseFloat(revenueVsTarget).toFixed(1) + '%';

        const churnEl = document.getElementById('kpiChurnRate');
        if (churnRate > 10) churnEl.className = 'text-2xl font-bold text-red-400';
        else if (churnRate > 5) churnEl.className = 'text-2xl font-bold text-amber-400';
        else churnEl.className = 'text-2xl font-bold text-green-400';

        const targetEl = document.getElementById('kpiRevenueTarget');
        if (revenueVsTarget >= 100) targetEl.className = 'text-2xl font-bold text-green-400';
        else if (revenueVsTarget >= 80) targetEl.className = 'text-2xl font-bold text-amber-400';
        else targetEl.className = 'text-2xl font-bold text-red-400';

        // Kancho message — contextual AI insights (ES)
        let message = '';
        const insights = [];
        if (score >= 80) insights.push('Tu dojo va fuerte con ' + score + '/100.');
        else if (score >= 60) insights.push('Puntaje de salud: ' + score + '/100 — hay espacio para crecer.');
        else insights.push('Puntaje de salud: ' + score + '/100 — necesita atención.');
        if (atRiskCount > 0 && atRiskCount >= 5) insights.push('Alerta: ' + atRiskCount + ' estudiantes en riesgo de abandonar ($' + revenueAtRisk.toLocaleString() + ' en juego). Prioriza el contacto hoy.');
        else if (atRiskCount > 0) insights.push(atRiskCount + ' estudiante' + (atRiskCount > 1 ? 's' : '') + ' en riesgo — una llamada rápida podría salvar $' + revenueAtRisk.toLocaleString() + '.');
        if (hotLeadsCount >= 3) insights.push(hotLeadsCount + ' prospectos calientes listos — aprovecha el momento.');
        else if (hotLeadsCount > 0) insights.push(hotLeadsCount + ' prospecto' + (hotLeadsCount > 1 ? 's' : '') + ' caliente' + (hotLeadsCount > 1 ? 's' : '') + ' listo' + (hotLeadsCount > 1 ? 's' : '') + ' para convertir.');
        if (churnRate > 10) insights.push('Tasa de abandono (' + parseFloat(churnRate).toFixed(1) + '%) alta. Considera una campaña de retención.');
        else if (churnRate < 3 && activeStudents > 10) insights.push('Excelente retención — solo ' + parseFloat(churnRate).toFixed(1) + '% de abandono.');
        if (revenueVsTarget >= 100) insights.push('Meta de ingresos alcanzada! Considera subir tu objetivo.');
        else if (revenueVsTarget < 50 && revenueVsTarget > 0) insights.push('Ingresos al ' + parseFloat(revenueVsTarget).toFixed(0) + '% de la meta — enfócate en conversiones y renovaciones.');
        if (trialConversion > 50 && activeStudents > 5) insights.push('Conversión de pruebas al ' + parseFloat(trialConversion).toFixed(0) + '% — tus clases introductorias funcionan.');
        else if (trialConversion < 20 && trialConversion > 0) insights.push('Conversión de pruebas baja (' + parseFloat(trialConversion).toFixed(0) + '%). Revisa la experiencia de primera clase.');
        message = insights.slice(0, 3).join(' ');
        document.getElementById('kanchoMessage').textContent = message;

        const atRiskList = document.getElementById('atRiskList');
        atRiskList.innerHTML = '';
        if (d.lists?.at_risk_students) {
          d.lists.at_risk_students.forEach(s => {
            atRiskList.innerHTML += '<div class="flex items-center justify-between p-3 bg-red-500/10 rounded-lg border-l-2 border-red-500">' +
              '<div><p class="font-medium">' + s.first_name + ' ' + s.last_name + '</p>' +
              '<p class="text-xs text-gray-400">riesgo ' + s.churn_risk + '</p></div>' +
              '<button onclick="callMember(' + s.id + ', \\'' + (s.phone || '').replace(/'/g, "\\'") + '\\', this)" class="px-3 py-1 bg-red-500/20 text-red-400 rounded text-sm hover:bg-red-500/40 transition">Llamar</button></div>';
          });
        }

        const hotLeadsList = document.getElementById('hotLeadsList');
        hotLeadsList.innerHTML = '';
        if (d.lists?.hot_leads) {
          d.lists.hot_leads.forEach(l => {
            hotLeadsList.innerHTML += '<div class="flex items-center justify-between p-3 bg-green-500/10 rounded-lg border-l-2 border-green-500">' +
              '<div><p class="font-medium">' + l.first_name + ' ' + (l.last_name || '') + '</p>' +
              '<p class="text-xs text-gray-400">Puntuación: ' + l.lead_score + '</p></div>' +
              '<button onclick="callLead(' + l.id + ', \\'' + (l.phone || '').replace(/'/g, "\\'") + '\\', this)" class="px-3 py-1 bg-green-500/20 text-green-400 rounded text-sm hover:bg-green-500/40 transition">Llamar</button></div>';
          });
        }
      } catch (e) {
        console.error('Error al cargar dashboard:', e);
      }
    }

    async function seedDemoData() {
      try {
        const btn = event.target;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Cargando...';

        const res = await fetch('/kanchoai/api/v1/seed-demo', { method: 'POST' });
        const data = await res.json();

        await loadSchools();
        btn.innerHTML = '<i class="fas fa-check mr-2"></i>¡Datos Cargados!';
        setTimeout(() => {
          btn.disabled = false;
          btn.innerHTML = '<i class="fas fa-rocket mr-2"></i>Cargar Datos de Demostración';
        }, 2000);
      } catch (e) {
        console.error('Error al cargar datos demo:', e);
      }
    }

    const KANCHO_VOICE_AGENT_ID = 'agent_5601kh453hqqfz59nfemkwk02vax';
    let widgetElement = null;

    function talkToKancho() {
      if (!currentSchoolId) {
        alert('Por favor selecciona un negocio primero para hablar con Kancho');
        return;
      }
      openVoiceModal();
    }

    function openVoiceModal() {
      const modal = document.getElementById('voiceModal');
      const schoolNameEl = document.getElementById('widgetSchoolName');
      const container = document.getElementById('voiceWidgetContainer');
      const statusEl = document.getElementById('voiceStatus');

      modal.classList.remove('hidden');
      modal.classList.add('flex');
      statusEl.textContent = 'Iniciando conversación...';

      const schoolSelect = document.getElementById('schoolSelect');
      const selectedOption = schoolSelect.options[schoolSelect.selectedIndex];
      schoolNameEl.textContent = selectedOption ? selectedOption.text : '';

      const school = currentSchoolData?.school || {};
      const health = currentSchoolData?.health || {};
      const students = currentSchoolData?.students || {};
      const revenue = currentSchoolData?.revenue || {};
      const leads = currentSchoolData?.leads || {};

      const atRiskCount = students.at_risk || 0;
      const hotLeads = leads.hot || 0;

      const schoolId = parseInt(currentSchoolId, 10);
      const dynamicVars = {
        dynamic_variable: schoolId,
        school_id: schoolId,
        language: 'es',
        school_name: school.name || 'tu escuela',
        martial_art: school.martial_art_type || 'artes marciales',
        health_score: health.overall_score || 0,
        health_grade: health.grade || 'N/A',
        active_students: students.active || 0,
        at_risk_students: atRiskCount,
        revenue_at_risk: atRiskCount * 175,
        hot_leads: hotLeads,
        growth_potential: hotLeads * 175,
        monthly_revenue: revenue.this_month || 0,
        revenue_target: revenue.target || 0,
        revenue_percent: revenue.percent || 0
      };

      console.log('[Kancho] Creando widget con:', dynamicVars);

      container.innerHTML = '';
      widgetElement = document.createElement('elevenlabs-convai');
      widgetElement.setAttribute('agent-id', KANCHO_VOICE_AGENT_ID);
      widgetElement.setAttribute('dynamic-variables', JSON.stringify(dynamicVars));
      container.appendChild(widgetElement);

      autoStartWidget();
    }

    function autoStartWidget() {
      let attempts = 0;
      const maxAttempts = 20;
      const statusEl = document.getElementById('voiceStatus');

      function waitForWidget() {
        attempts++;
        if (!widgetElement) return;

        const shadowRoot = widgetElement.shadowRoot;
        if (shadowRoot) {
          const btn = shadowRoot.querySelector('button');
          if (btn) {
            console.log('[Kancho] Widget listo - esperando clic del usuario');
            statusEl.textContent = 'Listo - Haz clic en el orbe para hablar';
            return;
          }
        }

        if (attempts < maxAttempts) {
          setTimeout(waitForWidget, 200);
        } else {
          statusEl.textContent = 'Haz clic en el orbe para comenzar a hablar';
        }
      }

      setTimeout(waitForWidget, 500);
    }

    function closeVoiceModal() {
      const modal = document.getElementById('voiceModal');
      const container = document.getElementById('voiceWidgetContainer');

      if (container) container.innerHTML = '';
      widgetElement = null;

      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }

    function openBookingModal() {
      const modal = document.getElementById('bookingModal');
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }

    function closeBookingModal() {
      const modal = document.getElementById('bookingModal');
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }

    // Modal de Reserva de Prueba
    function openTrialBookingModal() {
      const modal = document.getElementById('trialBookingModal');
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }

    function closeTrialBookingModal() {
      const modal = document.getElementById('trialBookingModal');
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }

    // Carga de Clases
    const martialArtIcons = {
      'Karate': 'fa-hand-paper', 'Taekwondo': 'fa-running', 'BJJ': 'fa-hand-rock',
      'Muay Thai': 'fa-fire', 'MMA': 'fa-fist-raised', 'Kickboxing': 'fa-fire-alt',
      'Judo': 'fa-user-ninja', 'Krav Maga': 'fa-shield-alt', 'Boxing': 'fa-mitten',
      'Kung Fu': 'fa-yin-yang', 'Aikido': 'fa-circle-notch', 'Capoeira': 'fa-music',
      'Wrestling': 'fa-people-arrows', 'Hapkido': 'fa-bolt', 'Jeet Kune Do': 'fa-dragon'
    };
    const martialArtColors = {
      'Karate': '#3B82F6', 'Taekwondo': '#10B981', 'BJJ': '#8B5CF6',
      'Muay Thai': '#F59E0B', 'MMA': '#EF4444', 'Kickboxing': '#F97316',
      'Judo': '#6366F1', 'Krav Maga': '#64748B', 'Boxing': '#DC2626',
      'Kung Fu': '#E11D48', 'Aikido': '#0EA5E9', 'Capoeira': '#22C55E',
      'Wrestling': '#A855F7', 'Hapkido': '#14B8A6', 'Jeet Kune Do': '#FBBF24'
    };
    const classNamesEs = {
      'Karate': 'Karate', 'Taekwondo': 'Taekwondo', 'Brazilian Jiu-Jitsu': 'Jiu-Jitsu Brasileño',
      'Muay Thai': 'Muay Thai', 'Mixed Martial Arts': 'Artes Marciales Mixtas', 'Kickboxing': 'Kickboxing',
      'Judo': 'Judo', 'Krav Maga': 'Krav Maga', 'Boxing': 'Boxeo',
      'Kung Fu': 'Kung Fu', 'Aikido': 'Aikido', 'Capoeira': 'Capoeira',
      'Wrestling': 'Lucha Libre', 'Hapkido': 'Hapkido', 'Jeet Kune Do': 'Jeet Kune Do'
    };

    async function loadClassesEs() {
      try {
        const schoolId = currentSchoolId || '';
        const res = await fetch('/kanchoai/api/v1/classes/public?school_id=' + schoolId);
        const result = await res.json();
        if (result.success) renderClassesEs(result.data);
      } catch (e) {
        console.error('Error cargando clases:', e);
      }
    }

    function renderClassesEs(classes) {
      const grid = document.getElementById('classesGridEs');
      if (!classes || classes.length === 0) {
        grid.innerHTML = '<div class="text-center col-span-full py-8"><p class="text-gray-400">No hay clases disponibles.</p></div>';
        return;
      }
      grid.innerHTML = classes.map(cls => {
        const icon = martialArtIcons[cls.martial_art] || 'fa-trophy';
        const color = martialArtColors[cls.martial_art] || '#E85A4F';
        const name = classNamesEs[cls.name] || cls.name;
        return '<div class="card rounded-2xl p-6 hover:border-kancho-coral/50 transition-all duration-300 fade-in">' +
          '<div class="w-14 h-14 rounded-xl flex items-center justify-center mb-4" style="background: ' + color + '20;">' +
            '<i class="fas ' + icon + '" style="color: ' + color + '; font-size: 1.5rem;"></i></div>' +
          '<div class="flex items-center gap-2 mb-2">' +
            '<span class="text-xs font-bold px-2 py-1 rounded-full" style="background: ' + color + '20; color: ' + color + ';">' + (cls.level || 'Todos los Niveles') + '</span></div>' +
          '<h3 class="text-lg font-bold text-white mb-2">' + name + '</h3>' +
          '<p class="text-gray-400 text-sm mb-4">' + (cls.description || '') + '</p>' +
          '<div class="pt-4 border-t border-kancho-dark-border text-center">' +
            '<button onclick="openTrialBookingModal()" class="w-full px-4 py-2 kancho-btn rounded-lg text-sm font-medium transition">Reservar Prueba Gratis</button></div></div>';
      }).join('');
    }

    loadSchools();
    loadClassesEs();

    // Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        const swPath = window.location.hostname.includes('kanchoai.com') ? '/sw.js' : '/kanchoai/sw.js';
        navigator.serviceWorker.register(swPath)
          .then(reg => console.log('[Kancho] SW registrado:', reg.scope))
          .catch(err => console.log('[Kancho] SW error:', err));
      });
    }
  </script>

  <!-- WhatsApp Widget -->
  <a href="https://wa.me/18136414177" target="_blank" rel="noopener" style="position:fixed;bottom:24px;right:24px;z-index:9999;width:60px;height:60px;background:#25D366;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.3);transition:transform 0.2s;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
  </a>

</body>
</html>
  `);
});

// =====================================================
// STUDENT PORTAL PWA - Mobile-first SPA
// =====================================================
app.get('/student', studentPortalHandler);
app.get('/student/*', studentPortalHandler);

function studentPortalHandler(req, res) {
  const host = req.get('host') || '';
  const isKanchoDomain = host.includes('kanchoai.com');
  const basePath = isKanchoDomain ? '/student/' : '/kanchoai/student/';
  const apiBase = isKanchoDomain ? '' : '/kanchoai';

  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>My Dojo - Student Portal</title>
  <meta name="theme-color" content="#E85A4F">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="My Dojo">
  <meta name="mobile-web-app-capable" content="yes">
  <link rel="manifest" href="${apiBase}/student-manifest.json">
  <link rel="apple-touch-icon" href="${KANCHO_LOGO_URL}">
  <link rel="icon" type="image/png" href="${KANCHO_LOGO_URL}">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --bg: #0D0D0D; --surface: #1A1A1A; --surface2: #222; --border: #333;
      --text: #F0F0F0; --text2: #999; --accent: #E85A4F; --accent2: #D4453B;
      --success: #22C55E; --warning: #F59E0B; --danger: #EF4444;
      --safe-bottom: env(safe-area-inset-bottom, 0px);
    }
    body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; min-height: 100vh; overflow-x: hidden; }

    /* Auth screens */
    .auth-container { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; }
    .auth-logo { width: 80px; height: 80px; border-radius: 20px; margin-bottom: 16px; }
    .auth-title { font-size: 24px; font-weight: 700; margin-bottom: 4px; }
    .auth-subtitle { color: var(--text2); margin-bottom: 32px; font-size: 14px; }
    .auth-form { width: 100%; max-width: 380px; }
    .form-group { margin-bottom: 16px; }
    .form-group label { display: block; font-size: 13px; color: var(--text2); margin-bottom: 6px; font-weight: 500; }
    .form-group input, .form-group select { width: 100%; padding: 12px 16px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; color: var(--text); font-size: 16px; outline: none; transition: border-color 0.2s; -webkit-appearance: none; }
    .form-group input:focus, .form-group select:focus { border-color: var(--accent); }
    .form-group select option { background: var(--surface); color: var(--text); }
    .btn { width: 100%; padding: 14px; background: var(--accent); color: #fff; border: none; border-radius: 10px; font-size: 16px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
    .btn:hover { background: var(--accent2); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--text); }
    .btn-outline:hover { border-color: var(--accent); color: var(--accent); background: transparent; }
    .btn-sm { padding: 8px 16px; font-size: 13px; width: auto; border-radius: 8px; }
    .btn-success { background: var(--success); }
    .btn-success:hover { background: #16A34A; }
    .auth-link { color: var(--accent); text-decoration: none; font-size: 14px; cursor: pointer; }
    .auth-link:hover { text-decoration: underline; }
    .auth-links { text-align: center; margin-top: 20px; display: flex; flex-direction: column; gap: 12px; }
    .auth-error { background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3); color: #EF4444; padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 14px; display: none; }
    .auth-success { background: rgba(34,197,94,0.15); border: 1px solid rgba(34,197,94,0.3); color: #22C55E; padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 14px; display: none; }

    /* App shell */
    .app-shell { display: none; min-height: 100vh; padding-bottom: calc(70px + var(--safe-bottom)); }
    .app-header { background: var(--surface); padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 100; }
    .app-header h1 { font-size: 18px; font-weight: 700; }
    .app-header .school-name { font-size: 12px; color: var(--text2); }
    .header-right { display: flex; align-items: center; gap: 12px; }

    /* Bottom nav */
    .bottom-nav { position: fixed; bottom: 0; left: 0; right: 0; background: var(--surface); border-top: 1px solid var(--border); display: flex; align-items: center; justify-content: space-around; padding: 8px 0 calc(8px + var(--safe-bottom)); z-index: 200; }
    .nav-item { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 4px 12px; color: var(--text2); text-decoration: none; font-size: 10px; font-weight: 500; cursor: pointer; transition: color 0.2s; border: none; background: none; }
    .nav-item.active { color: var(--accent); }
    .nav-item svg { width: 22px; height: 22px; }
    .nav-checkin { position: relative; }
    .nav-checkin .checkin-circle { width: 52px; height: 52px; background: var(--accent); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-top: -20px; box-shadow: 0 4px 12px rgba(232,90,79,0.4); }
    .nav-checkin .checkin-circle svg { width: 26px; height: 26px; color: #fff; }

    /* Sections */
    .section { display: none; padding: 16px 20px; }
    .section.active { display: block; }
    .section-title { font-size: 20px; font-weight: 700; margin-bottom: 16px; }

    /* Cards */
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px; margin-bottom: 12px; }
    .card-title { font-size: 13px; color: var(--text2); margin-bottom: 8px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; }
    .card-value { font-size: 28px; font-weight: 700; }
    .card-row { display: flex; gap: 12px; }
    .card-row .card { flex: 1; }

    /* Stats grid */
    .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
    .stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 14px; text-align: center; }
    .stat-value { font-size: 24px; font-weight: 700; }
    .stat-label { font-size: 11px; color: var(--text2); margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }

    /* Belt display */
    .belt-display { display: flex; align-items: center; gap: 12px; padding: 16px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 12px; }
    .belt-color { width: 48px; height: 12px; border-radius: 6px; border: 1px solid var(--border); }
    .belt-info h3 { font-size: 16px; font-weight: 600; }
    .belt-info p { font-size: 12px; color: var(--text2); }
    .belt-stripes { display: flex; gap: 4px; margin-top: 4px; }
    .belt-stripe { width: 16px; height: 4px; border-radius: 2px; background: var(--warning); }
    .belt-stripe.empty { background: var(--border); }

    /* Check-in button */
    .checkin-hero { text-align: center; padding: 40px 20px; }
    .checkin-hero-btn { width: 140px; height: 140px; border-radius: 50%; background: linear-gradient(135deg, var(--accent), #C0392B); border: none; color: white; font-size: 18px; font-weight: 700; cursor: pointer; box-shadow: 0 8px 32px rgba(232,90,79,0.4); transition: transform 0.2s, box-shadow 0.2s; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; margin: 0 auto; }
    .checkin-hero-btn:hover { transform: scale(1.05); box-shadow: 0 12px 40px rgba(232,90,79,0.5); }
    .checkin-hero-btn:active { transform: scale(0.98); }
    .checkin-hero-btn svg { width: 36px; height: 36px; }
    .checkin-hero-btn.checked { background: linear-gradient(135deg, var(--success), #16A34A); box-shadow: 0 8px 32px rgba(34,197,94,0.4); }
    .checkin-class-select { margin: 20px auto; max-width: 320px; }
    .checkin-class-select select { width: 100%; padding: 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; color: var(--text); font-size: 15px; }

    /* List items */
    .list-item { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; margin-bottom: 8px; }
    .list-item-left { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; }
    .list-item-icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .list-item-text h4 { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .list-item-text p { font-size: 12px; color: var(--text2); }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
    .badge-success { background: rgba(34,197,94,0.15); color: var(--success); }
    .badge-warning { background: rgba(245,158,11,0.15); color: var(--warning); }
    .badge-danger { background: rgba(239,68,68,0.15); color: var(--danger); }
    .badge-accent { background: rgba(232,90,79,0.15); color: var(--accent); }

    /* Schedule */
    .schedule-day { margin-bottom: 16px; }
    .schedule-day-header { font-size: 14px; font-weight: 600; color: var(--accent); margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid var(--border); }
    .schedule-class { padding: 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 6px; display: flex; align-items: center; justify-content: space-between; }
    .schedule-class.enrolled { border-color: var(--accent); background: rgba(232,90,79,0.05); }
    .schedule-time { font-size: 13px; font-weight: 600; color: var(--accent); min-width: 70px; }
    .schedule-name { font-size: 14px; font-weight: 500; flex: 1; margin: 0 12px; }
    .schedule-instructor { font-size: 12px; color: var(--text2); }

    /* Profile form */
    .profile-section { margin-bottom: 24px; }
    .profile-section h3 { font-size: 16px; font-weight: 600; margin-bottom: 12px; color: var(--accent); }

    /* Payment card */
    .payment-status-card { text-align: center; padding: 24px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 16px; }
    .payment-amount { font-size: 36px; font-weight: 700; }
    .payment-label { font-size: 13px; color: var(--text2); margin-top: 4px; }

    /* Empty state */
    .empty-state { text-align: center; padding: 40px 20px; color: var(--text2); }
    .empty-state svg { width: 48px; height: 48px; margin-bottom: 12px; opacity: 0.5; }
    .empty-state p { font-size: 14px; }

    /* Shop / Merchandise */
    .shop-categories { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 12px; margin-bottom: 16px; -webkit-overflow-scrolling: touch; }
    .shop-categories::-webkit-scrollbar { display: none; }
    .shop-cat { padding: 8px 16px; border-radius: 20px; font-size: 13px; font-weight: 500; background: var(--surface); border: 1px solid var(--border); color: var(--text2); cursor: pointer; white-space: nowrap; transition: all 0.2s; }
    .shop-cat.active { background: var(--accent); border-color: var(--accent); color: #fff; }
    .shop-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .shop-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; transition: transform 0.2s; }
    .shop-card:active { transform: scale(0.98); }
    .shop-card-img { width: 100%; height: 140px; object-fit: cover; background: var(--surface2); }
    .shop-card-body { padding: 12px; }
    .shop-card-name { font-size: 13px; font-weight: 600; line-height: 1.3; margin-bottom: 4px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .shop-card-cat { font-size: 11px; color: var(--text2); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
    .shop-card-price { font-size: 16px; font-weight: 700; color: var(--accent); }
    .shop-card-sizes { font-size: 11px; color: var(--text2); margin-top: 4px; }
    .shop-card-oos { opacity: 0.5; }
    .shop-card-oos .shop-card-price { color: var(--text2); text-decoration: line-through; }
    .shop-detail-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 300; display: flex; align-items: flex-end; justify-content: center; }
    .shop-detail { background: var(--surface); border-radius: 16px 16px 0 0; width: 100%; max-width: 480px; max-height: 85vh; overflow-y: auto; padding: 20px; padding-bottom: calc(20px + var(--safe-bottom)); }
    .shop-detail-img { width: 100%; height: 220px; object-fit: cover; border-radius: 12px; margin-bottom: 16px; background: var(--surface2); }
    .shop-detail-name { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
    .shop-detail-cat { font-size: 12px; color: var(--text2); text-transform: uppercase; margin-bottom: 12px; }
    .shop-detail-price { font-size: 24px; font-weight: 700; color: var(--accent); margin-bottom: 12px; }
    .shop-detail-desc { font-size: 14px; color: var(--text2); line-height: 1.5; margin-bottom: 16px; }
    .shop-sizes { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
    .shop-size { padding: 8px 14px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; cursor: pointer; transition: all 0.2s; }
    .shop-size.selected { border-color: var(--accent); background: rgba(232,90,79,0.15); color: var(--accent); }

    /* Toast */
    .toast { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); padding: 12px 24px; border-radius: 10px; font-size: 14px; font-weight: 500; z-index: 9999; animation: toastIn 0.3s ease; }
    .toast-success { background: var(--success); color: #fff; }
    .toast-error { background: var(--danger); color: #fff; }
    @keyframes toastIn { from { opacity: 0; transform: translateX(-50%) translateY(-10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }

    /* Loading */
    .spinner { width: 32px; height: 32px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; margin: 20px auto; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Streak fire */
    .streak-fire { font-size: 28px; }

    /* Attendance history */
    .attendance-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border); }
    .attendance-item:last-child { border-bottom: none; }
    .attendance-date { font-size: 13px; font-weight: 500; }
    .attendance-class { font-size: 12px; color: var(--text2); }
  </style>
</head>
<body>

<!-- AUTH: Welcome -->
<div id="authWelcome" class="auth-container">
  <img src="${KANCHO_LOGO_URL}" alt="Logo" class="auth-logo">
  <h2 class="auth-title">Student Portal</h2>
  <p class="auth-subtitle">Track attendance, schedule & progress</p>
  <div class="auth-form">
    <button class="btn" onclick="showAuth('login')">Sign In</button>
    <div style="height:12px"></div>
    <button class="btn btn-outline" onclick="showAuth('register')">Create Account</button>
  </div>
</div>

<!-- AUTH: Login -->
<div id="authLogin" class="auth-container" style="display:none">
  <img src="${KANCHO_LOGO_URL}" alt="Logo" class="auth-logo">
  <h2 class="auth-title">Welcome Back</h2>
  <p class="auth-subtitle">Sign in to your student account</p>
  <div class="auth-form">
    <div id="loginError" class="auth-error"></div>
    <div class="form-group">
      <label>School</label>
      <select id="loginSchool"><option value="">Loading schools...</option></select>
    </div>
    <div class="form-group">
      <label>Email</label>
      <input type="email" id="loginEmail" placeholder="you@email.com" autocomplete="email">
    </div>
    <div class="form-group">
      <label>Password</label>
      <input type="password" id="loginPassword" placeholder="Enter password" autocomplete="current-password">
    </div>
    <button class="btn" id="loginBtn" onclick="doLogin()">Sign In</button>
    <div class="auth-links">
      <a class="auth-link" onclick="showAuth('forgot')">Forgot password?</a>
      <a class="auth-link" onclick="showAuth('register')">Don&apos;t have an account? Register</a>
    </div>
  </div>
</div>

<!-- AUTH: Register -->
<div id="authRegister" class="auth-container" style="display:none">
  <img src="${KANCHO_LOGO_URL}" alt="Logo" class="auth-logo">
  <h2 class="auth-title">Create Account</h2>
  <p class="auth-subtitle">Register for the student portal</p>
  <div class="auth-form">
    <div id="registerError" class="auth-error"></div>
    <div id="registerSuccess" class="auth-success"></div>
    <div class="form-group">
      <label>School</label>
      <select id="registerSchool"><option value="">Loading schools...</option></select>
    </div>
    <div style="display:flex;gap:12px">
      <div class="form-group" style="flex:1">
        <label>First Name</label>
        <input type="text" id="registerFirst" placeholder="First" autocomplete="given-name">
      </div>
      <div class="form-group" style="flex:1">
        <label>Last Name</label>
        <input type="text" id="registerLast" placeholder="Last" autocomplete="family-name">
      </div>
    </div>
    <div class="form-group">
      <label>Email</label>
      <input type="email" id="registerEmail" placeholder="you@email.com" autocomplete="email">
    </div>
    <div class="form-group">
      <label>Phone (optional)</label>
      <input type="tel" id="registerPhone" placeholder="(555) 123-4567" autocomplete="tel">
    </div>
    <div class="form-group">
      <label>Password (min 8 characters)</label>
      <input type="password" id="registerPassword" placeholder="Create a password" autocomplete="new-password">
    </div>
    <button class="btn" id="registerBtn" onclick="doRegister()">Create Account</button>
    <div class="auth-links">
      <a class="auth-link" onclick="showAuth('login')">Already have an account? Sign In</a>
    </div>
  </div>
</div>

<!-- AUTH: Forgot Password -->
<div id="authForgot" class="auth-container" style="display:none">
  <img src="${KANCHO_LOGO_URL}" alt="Logo" class="auth-logo">
  <h2 class="auth-title">Reset Password</h2>
  <p class="auth-subtitle">We&apos;ll send you a reset link</p>
  <div class="auth-form">
    <div id="forgotError" class="auth-error"></div>
    <div id="forgotSuccess" class="auth-success"></div>
    <div class="form-group">
      <label>School</label>
      <select id="forgotSchool"><option value="">Loading schools...</option></select>
    </div>
    <div class="form-group">
      <label>Email</label>
      <input type="email" id="forgotEmail" placeholder="you@email.com">
    </div>
    <button class="btn" onclick="doForgotPassword()">Send Reset Link</button>
    <div class="auth-links">
      <a class="auth-link" onclick="showAuth('login')">Back to Sign In</a>
    </div>
  </div>
</div>

<!-- AUTH: Reset Password -->
<div id="authReset" class="auth-container" style="display:none">
  <img src="${KANCHO_LOGO_URL}" alt="Logo" class="auth-logo">
  <h2 class="auth-title">New Password</h2>
  <p class="auth-subtitle">Enter your new password</p>
  <div class="auth-form">
    <div id="resetError" class="auth-error"></div>
    <div id="resetSuccess" class="auth-success"></div>
    <div class="form-group">
      <label>New Password (min 8 characters)</label>
      <input type="password" id="resetPassword" placeholder="New password">
    </div>
    <div class="form-group">
      <label>Confirm Password</label>
      <input type="password" id="resetConfirm" placeholder="Confirm password">
    </div>
    <button class="btn" onclick="doResetPassword()">Set New Password</button>
  </div>
</div>

<!-- AUTH: Pending -->
<div id="authPending" class="auth-container" style="display:none">
  <img src="${KANCHO_LOGO_URL}" alt="Logo" class="auth-logo">
  <h2 class="auth-title">Account Pending</h2>
  <p class="auth-subtitle" style="max-width:320px;text-align:center">Your account has been created. Please wait for your school to approve your student portal access.</p>
  <div class="auth-form" style="margin-top:24px">
    <button class="btn btn-outline" onclick="showAuth('login')">Back to Sign In</button>
  </div>
</div>

<!-- APP SHELL -->
<div id="appShell" class="app-shell">
  <div class="app-header">
    <div>
      <h1 id="headerTitle">Dashboard</h1>
      <div class="school-name" id="headerSchool"></div>
    </div>
    <div class="header-right">
      <button onclick="doLogout()" style="background:none;border:none;color:var(--text2);font-size:13px;cursor:pointer;">Logout</button>
    </div>
  </div>

  <!-- Dashboard -->
  <div id="sectionDashboard" class="section active">
    <div id="dashboardContent"><div class="spinner"></div></div>
  </div>

  <!-- Check In -->
  <div id="sectionCheckin" class="section">
    <div id="checkinContent"><div class="spinner"></div></div>
  </div>

  <!-- Schedule -->
  <div id="sectionSchedule" class="section">
    <h2 class="section-title">Class Schedule</h2>
    <div id="scheduleContent"><div class="spinner"></div></div>
  </div>

  <!-- Shop -->
  <div id="sectionShop" class="section">
    <h2 class="section-title">Pro Shop</h2>
    <div id="shopContent"><div class="spinner"></div></div>
  </div>

  <!-- Payments -->
  <div id="sectionPayments" class="section">
    <h2 class="section-title">Payments</h2>
    <div id="paymentsContent"><div class="spinner"></div></div>
  </div>

  <!-- Belt Progress -->
  <div id="sectionBeltProgress" class="section">
    <h2 class="section-title">Belt Progress</h2>
    <div id="beltProgressContent"><div class="spinner"></div></div>
  </div>

  <!-- Profile -->
  <div id="sectionProfile" class="section">
    <h2 class="section-title">Profile</h2>
    <div id="profileContent"><div class="spinner"></div></div>
  </div>

  <!-- Bottom Navigation -->
  <div class="bottom-nav">
    <button class="nav-item active" data-section="Dashboard" onclick="switchSection('Dashboard')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
      <span>Home</span>
    </button>
    <button class="nav-item" data-section="Schedule" onclick="switchSection('Schedule')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      <span>Schedule</span>
    </button>
    <button class="nav-item nav-checkin" data-section="Checkin" onclick="switchSection('Checkin')">
      <div class="checkin-circle">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <span>Check In</span>
    </button>
    <button class="nav-item" data-section="BeltProgress" onclick="switchSection('BeltProgress')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15l-2 5l9-11h-5l2-5L7 15z"/></svg>
      <span>Belts</span>
    </button>
    <button class="nav-item" data-section="Profile" onclick="switchSection('Profile')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      <span>More</span>
    </button>
  </div>
</div>

<script>
// ============ CONFIG ============
const API = '${apiBase}/api/v1/student';
const AUTH_API = API + '/auth';
const TOKEN_KEY = 'kancho_student_token';
const USER_KEY = 'kancho_student_user';

let currentUser = null;
let currentToken = null;
let dashboardData = null;
let resetToken = null;

// ============ HELPERS ============
function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (currentToken) headers['Authorization'] = 'Bearer ' + currentToken;
  return fetch(path, { ...opts, headers }).then(r => r.json());
}

function showToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = 'toast toast-' + type;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function getBeltColor(belt) {
  if (!belt) return '#666';
  const b = belt.toLowerCase();
  const colors = { white:'#fff', yellow:'#FFD700', orange:'#FF8C00', green:'#22C55E', blue:'#3B82F6', purple:'#8B5CF6', brown:'#92400E', red:'#EF4444', black:'#111' };
  for (const [k,v] of Object.entries(colors)) { if (b.includes(k)) return v; }
  return '#666';
}

function formatDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ============ AUTH ============
function showAuth(screen) {
  ['authWelcome','authLogin','authRegister','authForgot','authReset','authPending','appShell'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });
  const map = { welcome:'authWelcome', login:'authLogin', register:'authRegister', forgot:'authForgot', reset:'authReset', pending:'authPending', app:'appShell' };
  const el = document.getElementById(map[screen]);
  if (el) el.style.display = screen === 'app' ? 'block' : 'flex';
}

async function loadSchools() {
  try {
    const res = await api(AUTH_API + '/schools');
    if (res.success && res.data) {
      const opts = '<option value="">Select your school</option>' + res.data.map(s =>
        '<option value="' + s.id + '">' + s.name + (s.city ? ' - ' + s.city + (s.state ? ', ' + s.state : '') : '') + '</option>'
      ).join('');
      ['loginSchool','registerSchool','forgotSchool'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = opts;
      });
    }
  } catch (e) { console.error('Failed to load schools:', e); }
}

async function doLogin() {
  const school_id = document.getElementById('loginSchool').value;
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  errEl.style.display = 'none';

  if (!school_id || !email || !password) { errEl.textContent = 'All fields are required'; errEl.style.display = 'block'; return; }

  document.getElementById('loginBtn').disabled = true;
  try {
    const res = await api(AUTH_API + '/login', { method: 'POST', body: JSON.stringify({ email, password, school_id: parseInt(school_id) }) });
    if (res.success) {
      localStorage.setItem(TOKEN_KEY, res.token);
      localStorage.setItem(USER_KEY, JSON.stringify(res.data));
      currentToken = res.token;
      currentUser = res.data;
      enterApp();
    } else {
      errEl.textContent = res.error || 'Login failed';
      errEl.style.display = 'block';
    }
  } catch (e) {
    errEl.textContent = 'Connection error. Please try again.';
    errEl.style.display = 'block';
  }
  document.getElementById('loginBtn').disabled = false;
}

async function doRegister() {
  const school_id = document.getElementById('registerSchool').value;
  const first_name = document.getElementById('registerFirst').value;
  const last_name = document.getElementById('registerLast').value;
  const email = document.getElementById('registerEmail').value;
  const phone = document.getElementById('registerPhone').value;
  const password = document.getElementById('registerPassword').value;
  const errEl = document.getElementById('registerError');
  const successEl = document.getElementById('registerSuccess');
  errEl.style.display = 'none';
  successEl.style.display = 'none';

  if (!school_id || !first_name || !last_name || !email || !password) { errEl.textContent = 'All required fields must be filled'; errEl.style.display = 'block'; return; }
  if (password.length < 8) { errEl.textContent = 'Password must be at least 8 characters'; errEl.style.display = 'block'; return; }

  document.getElementById('registerBtn').disabled = true;
  try {
    const res = await api(AUTH_API + '/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, first_name, last_name, phone, school_id: parseInt(school_id) })
    });
    if (res.success) {
      if (res.status === 'active' && res.token) {
        localStorage.setItem(TOKEN_KEY, res.token);
        localStorage.setItem(USER_KEY, JSON.stringify(res.data));
        currentToken = res.token;
        currentUser = res.data;
        enterApp();
      } else {
        showAuth('pending');
      }
    } else {
      errEl.textContent = res.error || 'Registration failed';
      errEl.style.display = 'block';
    }
  } catch (e) {
    errEl.textContent = 'Connection error. Please try again.';
    errEl.style.display = 'block';
  }
  document.getElementById('registerBtn').disabled = false;
}

async function doForgotPassword() {
  const school_id = document.getElementById('forgotSchool').value;
  const email = document.getElementById('forgotEmail').value;
  const errEl = document.getElementById('forgotError');
  const successEl = document.getElementById('forgotSuccess');
  errEl.style.display = 'none';
  successEl.style.display = 'none';

  if (!school_id || !email) { errEl.textContent = 'School and email are required'; errEl.style.display = 'block'; return; }

  try {
    const res = await api(AUTH_API + '/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email, school_id: parseInt(school_id) })
    });
    successEl.textContent = 'If an account exists, a reset link has been sent to your email.';
    successEl.style.display = 'block';
  } catch (e) {
    errEl.textContent = 'Connection error. Please try again.';
    errEl.style.display = 'block';
  }
}

async function doResetPassword() {
  const password = document.getElementById('resetPassword').value;
  const confirm = document.getElementById('resetConfirm').value;
  const errEl = document.getElementById('resetError');
  const successEl = document.getElementById('resetSuccess');
  errEl.style.display = 'none';
  successEl.style.display = 'none';

  if (!password || password.length < 8) { errEl.textContent = 'Password must be at least 8 characters'; errEl.style.display = 'block'; return; }
  if (password !== confirm) { errEl.textContent = 'Passwords do not match'; errEl.style.display = 'block'; return; }

  try {
    const res = await api(AUTH_API + '/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token: resetToken, newPassword: password })
    });
    if (res.success) {
      successEl.textContent = 'Password reset! Redirecting to login...';
      successEl.style.display = 'block';
      setTimeout(() => showAuth('login'), 2000);
    } else {
      errEl.textContent = res.error || 'Reset failed';
      errEl.style.display = 'block';
    }
  } catch (e) {
    errEl.textContent = 'Connection error. Please try again.';
    errEl.style.display = 'block';
  }
}

function doLogout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  currentToken = null;
  currentUser = null;
  dashboardData = null;
  showAuth('welcome');
}

// ============ APP ============
function enterApp() {
  document.getElementById('headerSchool').textContent = currentUser?.schoolName || '';
  showAuth('app');
  // Check for payment/purchase return params
  const params = new URLSearchParams(window.location.search);
  if (params.get('payment') === 'success') { showToast('Payment successful!'); window.history.replaceState({}, '', window.location.pathname); switchSection('Payments'); return; }
  if (params.get('payment') === 'canceled') { showToast('Payment canceled', 'error'); window.history.replaceState({}, '', window.location.pathname); }
  if (params.get('autopay') === 'success') { showToast('Autopay enabled!'); window.history.replaceState({}, '', window.location.pathname); switchSection('Payments'); return; }
  if (params.get('purchase') === 'success') { showToast('Purchase successful!'); window.history.replaceState({}, '', window.location.pathname); switchSection('Shop'); return; }
  if (params.get('purchase') === 'canceled') { showToast('Purchase canceled', 'error'); window.history.replaceState({}, '', window.location.pathname); }
  if (params.get('belt_test') === 'success') { showToast('Belt test registered! Payment confirmed.'); window.history.replaceState({}, '', window.location.pathname); switchSection('BeltProgress'); return; }
  if (params.get('belt_test') === 'canceled') { showToast('Belt test registration canceled', 'error'); window.history.replaceState({}, '', window.location.pathname); }
  switchSection('Dashboard');
}

function switchSection(name) {
  ['Dashboard','Checkin','Schedule','Shop','Payments','BeltProgress','Profile'].forEach(s => {
    const sec = document.getElementById('section' + s);
    if (sec) sec.classList.toggle('active', s === name);
  });
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.section === name);
  });
  const titles = { Dashboard:'Dashboard', Checkin:'Check In', Schedule:'Schedule', Shop:'Pro Shop', Payments:'Payments', BeltProgress:'Belt Progress', Profile:'Profile' };
  document.getElementById('headerTitle').textContent = titles[name] || name;

  if (name === 'Dashboard') loadDashboard();
  else if (name === 'Checkin') loadCheckin();
  else if (name === 'Schedule') loadSchedule();
  else if (name === 'Shop') loadShop();
  else if (name === 'Payments') loadPayments();
  else if (name === 'BeltProgress') loadBeltProgress();
  else if (name === 'Profile') loadProfile();
}

// ============ DASHBOARD ============
async function loadDashboard() {
  const el = document.getElementById('dashboardContent');
  el.innerHTML = '<div class="spinner"></div>';
  try {
    const res = await api(API + '/dashboard');
    if (!res.success) { el.innerHTML = '<div class="empty-state"><p>' + (res.data?.message || 'Error loading dashboard') + '</p></div>'; return; }
    dashboardData = res.data;
    const s = res.data.student;
    const streak = s.attendanceStreak || 0;
    const beltColor = getBeltColor(s.beltRank);

    let html = '';

    // Belt display
    html += '<div class="belt-display"><div class="belt-color" style="background:' + beltColor + '"></div><div class="belt-info"><h3>' + (s.beltRank || 'No Belt') + '</h3><p>' + (s.membershipType || 'Member') + '</p>';
    if (s.beltStripes > 0) {
      html += '<div class="belt-stripes">';
      for (let i = 0; i < 4; i++) html += '<div class="belt-stripe' + (i >= s.beltStripes ? ' empty' : '') + '"></div>';
      html += '</div>';
    }
    html += '</div></div>';

    // Stats
    html += '<div class="stats-grid">';
    html += '<div class="stat-card"><div class="stat-value">' + (streak > 0 ? '<span class="streak-fire">&#128293;</span> ' : '') + streak + '</div><div class="stat-label">Day Streak</div></div>';
    html += '<div class="stat-card"><div class="stat-value">' + (s.totalClasses || 0) + '</div><div class="stat-label">Total Classes</div></div>';
    html += '</div>';

    // Payment status
    const pStatus = s.paymentStatus || 'current';
    const pBadge = pStatus === 'current' ? 'badge-success' : pStatus === 'past_due' ? 'badge-warning' : 'badge-danger';
    html += '<div class="card"><div class="card-title">Payment Status</div><div style="display:flex;align-items:center;justify-content:space-between"><span class="badge ' + pBadge + '">' + pStatus.replace('_', ' ').toUpperCase() + '</span>';
    if (s.monthlyRate > 0) html += '<span style="font-size:20px;font-weight:700">$' + parseFloat(s.monthlyRate).toFixed(0) + '<span style="font-size:13px;color:var(--text2)">/mo</span></span>';
    html += '</div></div>';

    // Today's classes
    const tc = res.data.todayClasses || [];
    const ta = res.data.todayAttendance || [];
    const checkedClassIds = ta.map(a => a.class_id);

    if (tc.length > 0) {
      html += '<div class="card"><div class="card-title">Today&apos;s Classes</div>';
      tc.forEach(c => {
        const isChecked = checkedClassIds.includes(c.id);
        html += '<div class="list-item" style="margin-bottom:8px"><div class="list-item-left"><div class="list-item-text"><h4>' + c.name + '</h4><p>' + (c.instructor || '') + ' &middot; ' + (c.durationMinutes || 60) + ' min</p></div></div>';
        if (isChecked) html += '<span class="badge badge-success">Checked In</span>';
        else html += '<button class="btn btn-sm btn-success" onclick="doCheckin(' + c.id + ')">Check In</button>';
        html += '</div>';
      });
      html += '</div>';
    }

    // Member since
    if (s.enrollmentDate) {
      html += '<div class="card"><div class="card-title">Member Since</div><div style="font-size:16px;font-weight:500">' + formatDate(s.enrollmentDate) + '</div></div>';
    }

    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = '<div class="empty-state"><p>Error loading dashboard</p></div>';
    console.error(e);
  }
}

// ============ CHECK IN ============
async function loadCheckin() {
  const el = document.getElementById('checkinContent');
  el.innerHTML = '<div class="spinner"></div>';
  try {
    const [classesRes, historyRes] = await Promise.all([
      api(API + '/classes'),
      api(API + '/attendance/history')
    ]);

    const classes = classesRes.success ? classesRes.data : [];
    const history = historyRes.success ? historyRes.data : [];

    // Check if already checked in today
    const todayStr = new Date().toISOString().split('T')[0];
    const todayCheckins = history.filter(h => h.date === todayStr);

    let html = '<div class="checkin-hero">';

    if (todayCheckins.length > 0) {
      html += '<div class="checkin-hero-btn checked" onclick="doCheckinGeneral()" style="cursor:default"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg><span>Checked In!</span></div>';
      html += '<p style="margin-top:16px;color:var(--success);font-weight:500">' + todayCheckins.length + ' check-in(s) today</p>';
    } else {
      html += '<div class="checkin-hero-btn" onclick="doCheckinGeneral()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg><span>Check In</span></div>';
    }

    html += '</div>';

    // Class selector
    if (classes.length > 0) {
      html += '<div class="checkin-class-select"><select id="checkinClassSelect"><option value="">General Check-in</option>';
      classes.forEach(c => { html += '<option value="' + c.id + '">' + c.name + '</option>'; });
      html += '</select></div>';
    }

    // Recent history
    if (history.length > 0) {
      html += '<div class="card" style="margin-top:16px"><div class="card-title">Recent Attendance</div>';
      history.slice(0, 10).forEach(h => {
        html += '<div class="attendance-item"><div><div class="attendance-date">' + formatDate(h.date) + '</div><div class="attendance-class">' + (h.class?.name || 'General') + '</div></div><span class="badge badge-success">' + (h.status || 'present') + '</span></div>';
      });
      html += '</div>';
    }

    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = '<div class="empty-state"><p>Error loading check-in</p></div>';
    console.error(e);
  }
}

async function doCheckin(classId) {
  try {
    const res = await api(API + '/attendance/check-in', {
      method: 'POST',
      body: JSON.stringify({ class_id: classId || null })
    });
    if (res.success) {
      showToast('Checked in! Streak: ' + (res.streak || 0));
      loadCheckin();
      loadDashboard();
    } else {
      showToast(res.error || 'Check-in failed', 'error');
    }
  } catch (e) {
    showToast('Connection error', 'error');
  }
}

function doCheckinGeneral() {
  const sel = document.getElementById('checkinClassSelect');
  const classId = sel ? parseInt(sel.value) || null : null;
  doCheckin(classId);
}

// ============ SCHEDULE ============
async function loadSchedule() {
  const el = document.getElementById('scheduleContent');
  el.innerHTML = '<div class="spinner"></div>';
  try {
    const res = await api(API + '/classes');
    if (!res.success) { el.innerHTML = '<div class="empty-state"><p>Error loading classes</p></div>'; return; }

    const classes = res.data || [];
    if (classes.length === 0) {
      el.innerHTML = '<div class="empty-state"><p>No classes available yet</p></div>';
      return;
    }

    const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    // Map abbreviated or full day names to full day name
    const dayMap = { mon:'Monday', tue:'Tuesday', wed:'Wednesday', thu:'Thursday', fri:'Friday', sat:'Saturday', sun:'Sunday',
      monday:'Monday', tuesday:'Tuesday', wednesday:'Wednesday', thursday:'Thursday', friday:'Friday', saturday:'Saturday', sunday:'Sunday' };
    function toFullDay(d) { return dayMap[(d || '').toLowerCase().slice(0,3)] || d; }

    let html = '';
    const byDay = {};
    days.forEach(d => { byDay[d] = []; });

    classes.forEach(c => {
      if (!c.schedule) return;
      const sched = c.schedule;
      if (Array.isArray(sched)) {
        sched.forEach(s => {
          const day = toFullDay(s.day);
          if (byDay[day]) byDay[day].push({ ...c, time: s.time || s.start_time || '' });
        });
      } else if (sched.days) {
        sched.days.forEach(d => {
          const day = toFullDay(d);
          if (byDay[day]) byDay[day].push({ ...c, time: sched.time || sched.start_time || '' });
        });
      }
    });

    days.forEach(day => {
      const dayClasses = byDay[day];
      if (dayClasses.length === 0) return;
      dayClasses.sort((a, b) => (a.time || '').localeCompare(b.time || ''));

      html += '<div class="schedule-day"><div class="schedule-day-header">' + day + '</div>';
      dayClasses.forEach(c => {
        html += '<div class="schedule-class' + (c.enrolled ? ' enrolled' : '') + '">';
        html += '<div class="schedule-time">' + (c.time || '-') + '</div>';
        html += '<div class="schedule-name">' + c.name + '<br><span style="font-size:11px;color:var(--text2)">' + (c.instructor || '') + ' &middot; ' + (c.duration_minutes || 60) + 'min</span></div>';
        if (c.enrolled) html += '<button class="btn btn-sm btn-outline" style="border-color:var(--danger);color:var(--danger)" onclick="dropClass(' + c.id + ')">Drop</button>';
        else html += '<button class="btn btn-sm" onclick="enrollClass(' + c.id + ')">Enroll</button>';
        html += '</div>';
      });
      html += '</div>';
    });

    if (!html) html = '<div class="empty-state"><p>No class schedules configured yet</p></div>';
    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = '<div class="empty-state"><p>Error loading schedule</p></div>';
    console.error(e);
  }
}

async function enrollClass(id) {
  try {
    const res = await api(API + '/classes/' + id + '/enroll', { method: 'POST' });
    if (res.success) { showToast('Enrolled!'); loadSchedule(); }
    else showToast(res.error || 'Failed', 'error');
  } catch (e) { showToast('Connection error', 'error'); }
}

async function dropClass(id) {
  if (!confirm('Drop this class?')) return;
  try {
    const res = await api(API + '/classes/' + id + '/drop', { method: 'POST' });
    if (res.success) { showToast('Dropped from class'); loadSchedule(); }
    else showToast(res.error || 'Failed', 'error');
  } catch (e) { showToast('Connection error', 'error'); }
}

// ============ SHOP ============
let shopData = [];
let shopFilter = 'all';

async function loadShop() {
  const el = document.getElementById('shopContent');
  el.innerHTML = '<div class="spinner"></div>';
  try {
    const res = await api(API + '/merchandise');
    if (!res.success) { el.innerHTML = '<div class="empty-state"><p>Error loading shop</p></div>'; return; }

    shopData = res.data || [];
    if (shopData.length === 0) {
      el.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg><p>No merchandise available yet</p></div>';
      return;
    }

    renderShop();
  } catch (e) {
    el.innerHTML = '<div class="empty-state"><p>Error loading shop</p></div>';
    console.error(e);
  }
}

function renderShop() {
  const el = document.getElementById('shopContent');
  const categories = ['all', ...new Set(shopData.map(i => i.category))];
  const filtered = shopFilter === 'all' ? shopData : shopData.filter(i => i.category === shopFilter);

  let html = '<div class="shop-categories">';
  categories.forEach(c => {
    const label = c === 'all' ? 'All' : c.charAt(0).toUpperCase() + c.slice(1);
    html += '<div class="shop-cat' + (shopFilter === c ? ' active' : '') + '" onclick="filterShop(' + "'" + c + "'" + ')">' + label + '</div>';
  });
  html += '</div>';

  html += '<div class="shop-grid">';
  filtered.forEach(item => {
    const oos = !item.in_stock;
    html += '<div class="shop-card' + (oos ? ' shop-card-oos' : '') + '" onclick="openShopDetail(' + item.id + ')">';
    if (item.image_url) {
      html += '<img class="shop-card-img" src="' + item.image_url + '" alt="' + item.name + '" onerror="this.style.display=' + "'none'" + '">';
    } else {
      html += '<div class="shop-card-img" style="display:flex;align-items:center;justify-content:center"><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1" style="opacity:0.3"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg></div>';
    }
    html += '<div class="shop-card-body">';
    html += '<div class="shop-card-cat">' + (item.category || 'other') + '</div>';
    html += '<div class="shop-card-name">' + item.name + '</div>';
    html += '<div class="shop-card-price">$' + parseFloat(item.price).toFixed(2) + '</div>';
    if (oos) html += '<div style="font-size:11px;color:var(--danger);margin-top:4px">Out of Stock</div>';
    else if (item.sizes && item.sizes.length > 0) html += '<div class="shop-card-sizes">' + item.sizes.length + ' sizes</div>';
    html += '</div></div>';
  });
  html += '</div>';

  el.innerHTML = html;
}

function filterShop(cat) {
  shopFilter = cat;
  renderShop();
}

function openShopDetail(itemId) {
  const item = shopData.find(i => i.id === itemId);
  if (!item) return;

  const overlay = document.createElement('div');
  overlay.className = 'shop-detail-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  let sizesHtml = '';
  if (item.sizes && item.sizes.length > 0) {
    sizesHtml = '<div style="font-size:13px;color:var(--text2);margin-bottom:8px;font-weight:500">Select Size</div><div class="shop-sizes">';
    item.sizes.forEach((s, i) => {
      sizesHtml += '<div class="shop-size' + (i === 0 ? ' selected' : '') + '" onclick="selectSize(this)">' + s + '</div>';
    });
    sizesHtml += '</div>';
  }

  overlay.innerHTML = '<div class="shop-detail">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
    '<span style="font-size:13px;color:var(--text2)">Product Details</span>' +
    '<button onclick="this.closest(' + "'.shop-detail-overlay'" + ').remove()" style="background:none;border:none;color:var(--text2);font-size:20px;cursor:pointer;padding:4px">&times;</button>' +
    '</div>' +
    (item.image_url ? '<img class="shop-detail-img" src="' + item.image_url + '" alt="' + item.name + '" onerror="this.style.display=' + "'none'" + '">' : '') +
    '<div class="shop-detail-cat">' + (item.category || 'other') + '</div>' +
    '<div class="shop-detail-name">' + item.name + '</div>' +
    '<div class="shop-detail-price">$' + parseFloat(item.price).toFixed(2) + '</div>' +
    (item.description ? '<div class="shop-detail-desc">' + item.description + '</div>' : '') +
    sizesHtml +
    (item.in_stock ?
      '<button class="btn" onclick="buyMerch(' + item.id + ', this)" style="margin-top:8px">Buy Now</button>' :
      '<button class="btn" disabled style="margin-top:8px;opacity:0.5">Out of Stock</button>'
    ) +
    '</div>';

  document.body.appendChild(overlay);
}

function selectSize(el) {
  el.parentElement.querySelectorAll('.shop-size').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
}

async function buyMerch(itemId, btn) {
  const item = shopData.find(i => i.id === itemId);
  if (!item) return;
  const sizeEl = btn.closest('.shop-detail').querySelector('.shop-size.selected');
  const size = sizeEl ? sizeEl.textContent : '';
  btn.textContent = 'Processing...';
  btn.disabled = true;
  try {
    const res = await api(API + '/payments/merchandise/buy', {
      method: 'POST',
      body: JSON.stringify({ item_id: itemId, size: size })
    });
    if (res.success && res.url) {
      window.location.href = res.url;
    } else {
      showToast(res.error || 'Purchase failed', 'error');
      btn.textContent = 'Buy Now';
      btn.disabled = false;
    }
  } catch (e) {
    showToast('Connection error', 'error');
    btn.textContent = 'Buy Now';
    btn.disabled = false;
  }
}

// ============ PAYMENTS ============
async function loadPayments() {
  const el = document.getElementById('paymentsContent');
  el.innerHTML = '<div class="spinner"></div>';
  try {
    const [payRes, autopayRes] = await Promise.all([
      api(API + '/payments'),
      api(API + '/payments/autopay/status')
    ]);

    const payments = payRes.success ? payRes.data || [] : [];
    const autopay = autopayRes.success ? autopayRes.data : {};
    let html = '';

    // Summary
    const total = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    html += '<div class="payment-status-card"><div class="payment-amount">$' + total.toFixed(2) + '</div><div class="payment-label">Total Paid</div></div>';

    // Action buttons
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0">';
    html += '<button class="btn" onclick="makePayment()">Make Payment</button>';
    if (autopay.hasAutopay) {
      html += '<button class="btn btn-outline" style="border-color:var(--error);color:var(--error)" onclick="cancelAutopay()">Cancel Autopay</button>';
    } else if (autopay.monthlyRate > 0) {
      html += '<button class="btn btn-outline" onclick="setupAutopay()">Enable Autopay</button>';
    } else {
      html += '<button class="btn btn-outline" disabled style="opacity:0.5">Autopay N/A</button>';
    }
    html += '</div>';

    if (autopay.monthlyRate > 0) {
      html += '<div class="card" style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;align-items:center"><span style="color:var(--text2)">Monthly Rate</span><span style="font-size:20px;font-weight:700">$' + parseFloat(autopay.monthlyRate).toFixed(0) + '/mo</span></div></div>';
    }

    if (payments.length === 0) {
      html += '<div class="empty-state"><p>No payment history yet</p></div>';
    } else {
      html += '<div class="card"><div class="card-title">Payment History</div>';
      payments.forEach(p => {
        html += '<div class="list-item" style="margin-bottom:8px"><div class="list-item-left"><div class="list-item-text"><h4>$' + parseFloat(p.amount || 0).toFixed(2) + '</h4><p>' + (p.type || 'payment') + ' &middot; ' + formatDate(p.date) + '</p></div></div><span class="badge badge-success">Paid</span></div>';
      });
      html += '</div>';
    }

    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = '<div class="empty-state"><p>Error loading payments</p></div>';
    console.error(e);
  }
}

async function makePayment() {
  const amount = prompt('Enter payment amount ($):');
  if (!amount || isNaN(amount) || parseFloat(amount) <= 0) return;
  const type = prompt('Payment type (membership, testing_fee, other):', 'membership') || 'membership';
  try {
    const res = await api(API + '/payments/pay', {
      method: 'POST',
      body: JSON.stringify({ amount: parseFloat(amount), type: type, description: type + ' payment' })
    });
    if (res.success && res.url) {
      window.location.href = res.url;
    } else {
      showToast(res.error || 'Payment failed', 'error');
    }
  } catch (e) { showToast('Connection error', 'error'); }
}

async function setupAutopay() {
  try {
    const res = await api(API + '/payments/autopay/setup', { method: 'POST' });
    if (res.success && res.url) {
      window.location.href = res.url;
    } else {
      showToast(res.error || 'Autopay setup failed', 'error');
    }
  } catch (e) { showToast('Connection error', 'error'); }
}

async function cancelAutopay() {
  if (!confirm('Cancel your monthly autopay? You can re-enable it anytime.')) return;
  try {
    const res = await api(API + '/payments/autopay/cancel', { method: 'POST' });
    if (res.success) {
      showToast('Autopay cancelled', 'success');
      loadPayments();
    } else {
      showToast(res.error || 'Failed to cancel autopay', 'error');
    }
  } catch (e) { showToast('Connection error', 'error'); }
}

// ============ BELT PROGRESS ============
async function loadBeltProgress() {
  const el = document.getElementById('beltProgressContent');
  el.innerHTML = '<div class="spinner"></div>';
  try {
    const res = await api(API + '/belt-progress');
    if (!res.success) { el.innerHTML = '<div class="empty-state"><p>Belt progress not available</p></div>'; return; }

    const d = res.data;
    const belts = d.belts || [];
    if (belts.length === 0) {
      el.innerHTML = '<div class="empty-state"><p>Belt requirements not configured yet</p></div>';
      return;
    }

    let html = '';

    // Current belt display
    html += '<div class="card" style="text-align:center;padding:20px;margin-bottom:16px">';
    html += '<div class="belt-display" style="justify-content:center"><div class="belt-color" style="background:' + getBeltColor(d.currentBelt) + ';width:60px;height:60px;border-radius:12px"></div></div>';
    html += '<h3 style="margin-top:12px;font-size:20px">' + (d.currentBelt || 'White Belt') + '</h3>';
    html += '<p style="color:var(--text2);font-size:13px;margin-top:4px">' + d.totalClasses + ' classes &middot; ' + d.monthsTraining + ' months training</p>';
    if (d.currentStripes > 0) {
      html += '<div class="belt-stripes" style="justify-content:center;margin-top:8px">';
      for (let i = 0; i < 4; i++) html += '<div class="belt-stripe' + (i >= d.currentStripes ? ' empty' : '') + '"></div>';
      html += '</div>';
    }
    html += '</div>';

    // Progress to next belt
    if (d.nextBelt && d.progress) {
      const p = d.progress;
      html += '<div class="card" style="margin-bottom:16px"><div class="card-title">Progress to ' + d.nextBelt.name + ' Belt</div>';
      html += '<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px"><span>Classes</span><span>' + p.classesCompleted + '/' + p.classesRequired + '</span></div>';
      html += '<div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden"><div style="height:100%;width:' + p.classProgress + '%;background:var(--accent);border-radius:4px;transition:width 0.5s"></div></div></div>';
      html += '<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px"><span>Time</span><span>' + p.monthsCompleted + '/' + p.monthsRequired + ' months</span></div>';
      html += '<div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden"><div style="height:100%;width:' + p.monthProgress + '%;background:var(--success);border-radius:4px;transition:width 0.5s"></div></div></div>';
      html += '<div style="text-align:center;font-size:24px;font-weight:700;color:var(--accent);margin:12px 0">' + p.overallProgress + '%</div>';
      if (p.testingFee > 0) {
        html += '<div style="text-align:center;font-size:13px;color:var(--text2);margin-bottom:8px">Testing fee: $' + parseFloat(p.testingFee).toFixed(0) + '</div>';
        html += '<div style="text-align:center"><button class="btn" onclick="registerBeltTest(\\''+d.nextBelt.name+'\\', '+p.testingFee+')">Register for Belt Test</button></div>';
      } else {
        html += '<div style="text-align:center;margin-top:8px"><button class="btn" onclick="registerBeltTest(\\''+d.nextBelt.name+'\\', 0)">Register for Belt Test</button></div>';
      }
      // Requirements checklist
      if (p.requirements && p.requirements.length > 0) {
        html += '<div style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px"><div style="font-size:13px;font-weight:600;margin-bottom:8px">Requirements</div>';
        p.requirements.forEach(r => {
          html += '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13px;color:var(--text2)"><div style="width:18px;height:18px;border:1.5px solid var(--border);border-radius:4px;flex-shrink:0"></div>' + r + '</div>';
        });
        html += '</div>';
      }
      html += '</div>';
    }

    // Full belt ladder
    html += '<div class="card"><div class="card-title">Belt Ladder</div>';
    belts.forEach((b, idx) => {
      const isCurrent = b.name.toLowerCase() === (d.currentBelt || '').toLowerCase();
      const isPast = idx < d.currentIndex;
      const opacity = isPast ? '0.5' : '1';
      const border = isCurrent ? 'border:2px solid var(--accent);' : '';
      html += '<div style="display:flex;align-items:center;gap:12px;padding:8px 0;opacity:' + opacity + ';' + border + 'border-radius:8px;padding:8px">';
      html += '<div style="width:28px;height:28px;border-radius:6px;background:' + (b.color || '#888') + ';flex-shrink:0;border:1px solid rgba(255,255,255,0.2)"></div>';
      html += '<div style="flex:1"><div style="font-weight:' + (isCurrent ? '700' : '500') + '">' + b.name + (isCurrent ? ' <span style="color:var(--accent);font-size:11px">CURRENT</span>' : '') + '</div>';
      html += '<div style="font-size:11px;color:var(--text2)">' + b.minClasses + ' classes &middot; ' + b.minMonths + ' months' + (b.testingFee > 0 ? ' &middot; $' + parseFloat(b.testingFee).toFixed(0) : '') + '</div>';
      html += '</div>';
      if (isPast) html += '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--success)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
      html += '</div>';
    });
    html += '</div>';

    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = '<div class="empty-state"><p>Error loading belt progress</p></div>';
    console.error(e);
  }
}

async function registerBeltTest(beltName, fee) {
  if (!confirm('Register for ' + beltName + ' Belt test' + (fee > 0 ? ' ($' + fee + ' testing fee)' : '') + '?')) return;
  try {
    const res = await api(API + '/belt-test/register', {
      method: 'POST',
      body: JSON.stringify({ belt_name: beltName, testing_fee: fee })
    });
    if (res.success) {
      if (res.url) {
        // Stripe payment for testing fee
        window.location.href = res.url;
      } else {
        showToast('Registered for ' + beltName + ' belt test!', 'success');
        loadBeltProgress();
      }
    } else {
      showToast(res.error || 'Registration failed', 'error');
    }
  } catch (e) { showToast('Connection error', 'error'); }
}

// ============ PROFILE ============
async function loadProfile() {
  const el = document.getElementById('profileContent');
  el.innerHTML = '<div class="spinner"></div>';
  try {
    const res = await api(AUTH_API + '/me');
    if (!res.success) { el.innerHTML = '<div class="empty-state"><p>Error loading profile</p></div>'; return; }

    const { auth, student, school } = res.data;
    let html = '';

    // Basic info
    html += '<div class="profile-section"><h3>Personal Information</h3>';
    html += '<div class="form-group"><label>First Name</label><input type="text" id="profFirst" value="' + (auth.firstName || '') + '" disabled></div>';
    html += '<div class="form-group"><label>Last Name</label><input type="text" id="profLast" value="' + (auth.lastName || '') + '" disabled></div>';
    html += '<div class="form-group"><label>Email</label><input type="email" id="profEmail" value="' + (auth.email || '') + '"></div>';
    html += '<div class="form-group"><label>Phone</label><input type="tel" id="profPhone" value="' + (student?.phone || auth.phone || '') + '"></div>';
    if (student?.dateOfBirth) {
      html += '<div class="form-group"><label>Date of Birth</label><input type="date" id="profDob" value="' + (student.dateOfBirth || '') + '"></div>';
    }
    html += '</div>';

    // Emergency contact
    html += '<div class="profile-section"><h3>Emergency Contact</h3>';
    const ec = student?.emergencyContact || {};
    html += '<div class="form-group"><label>Name</label><input type="text" id="ecName" value="' + (ec.name || '') + '"></div>';
    html += '<div class="form-group"><label>Phone</label><input type="tel" id="ecPhone" value="' + (ec.phone || '') + '"></div>';
    html += '<div class="form-group"><label>Relationship</label><input type="text" id="ecRelation" value="' + (ec.relationship || '') + '"></div>';
    html += '</div>';

    // School info (read-only)
    if (school) {
      html += '<div class="profile-section"><h3>School</h3>';
      html += '<div class="card"><h4>' + school.name + '</h4>';
      if (school.martialArtType) html += '<p style="color:var(--text2);font-size:13px">' + school.martialArtType + '</p>';
      html += '</div></div>';
    }

    // Belt info (read-only)
    if (student) {
      html += '<div class="profile-section"><h3>Training Info</h3>';
      html += '<div class="card">';
      html += '<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="color:var(--text2)">Belt Rank</span><span style="font-weight:600">' + (student.beltRank || 'N/A') + '</span></div>';
      html += '<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="color:var(--text2)">Total Classes</span><span style="font-weight:600">' + (student.totalClasses || 0) + '</span></div>';
      html += '<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="color:var(--text2)">Streak</span><span style="font-weight:600">' + (student.attendanceStreak || 0) + ' days</span></div>';
      html += '<div style="display:flex;justify-content:space-between"><span style="color:var(--text2)">Membership</span><span style="font-weight:600">' + (student.membershipType || 'Standard') + '</span></div>';
      html += '</div></div>';
    }

    html += '<button class="btn" onclick="saveProfile()" style="margin-top:8px">Save Changes</button>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">';
    html += '<button class="btn btn-outline" onclick="switchSection(' + "'Payments'" + ')">Payments</button>';
    html += '<button class="btn btn-outline" onclick="switchSection(' + "'Shop'" + ')">Pro Shop</button>';
    html += '</div>';
    html += '<button class="btn btn-outline" onclick="doLogout()" style="margin-top:12px;border-color:var(--danger);color:var(--danger)">Sign Out</button>';

    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = '<div class="empty-state"><p>Error loading profile</p></div>';
    console.error(e);
  }
}

async function saveProfile() {
  try {
    const email = document.getElementById('profEmail')?.value;
    const phone = document.getElementById('profPhone')?.value;
    const ecName = document.getElementById('ecName')?.value;
    const ecPhone = document.getElementById('ecPhone')?.value;
    const ecRelation = document.getElementById('ecRelation')?.value;

    const body = { email, phone };
    if (ecName || ecPhone || ecRelation) {
      body.emergency_contact = { name: ecName || '', phone: ecPhone || '', relationship: ecRelation || '' };
    }

    const res = await api(API + '/profile', { method: 'PUT', body: JSON.stringify(body) });
    if (res.success) showToast('Profile saved!');
    else showToast(res.error || 'Save failed', 'error');
  } catch (e) { showToast('Connection error', 'error'); }
}

// ============ INIT ============
async function init() {
  // Check for reset token
  const params = new URLSearchParams(window.location.search);
  resetToken = params.get('reset_token');
  if (resetToken) {
    try {
      const res = await api(AUTH_API + '/verify-reset-token', { method: 'POST', body: JSON.stringify({ token: resetToken }) });
      if (res.success) { showAuth('reset'); return; }
    } catch (e) {}
    showAuth('login');
    return;
  }

  // Check stored token
  const storedToken = localStorage.getItem(TOKEN_KEY);
  const storedUser = localStorage.getItem(USER_KEY);
  if (storedToken && storedUser) {
    currentToken = storedToken;
    currentUser = JSON.parse(storedUser);

    // Verify token is still valid
    try {
      const res = await api(AUTH_API + '/me');
      if (res.success) {
        enterApp();
        return;
      }
    } catch (e) {}

    // Token invalid
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    currentToken = null;
    currentUser = null;
  }

  showAuth('welcome');
  loadSchools();
}

// Add enter key handlers
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (document.getElementById('authLogin').style.display !== 'none') doLogin();
    else if (document.getElementById('authRegister').style.display !== 'none') doRegister();
  }
});

// Load schools when switching to auth screens
const origShowAuth = showAuth;
showAuth = function(screen) {
  origShowAuth(screen);
  if (['login','register','forgot'].includes(screen)) loadSchools();
};

init();
</script>
</body>
</html>
  `);
}

// Serve dashboard for all other routes (SPA fallback)
app.get('*', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>Kancho AI - Business Intelligence for Martial Arts Schools</title>

  <!-- PWA Meta Tags -->
  <meta name="theme-color" content="#E85A4F">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Kancho AI">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="application-name" content="Kancho AI">
  <meta name="msapplication-TileColor" content="#E85A4F">
  <meta name="description" content="AI Business Intelligence Officer for martial arts schools. Monitor health, retain members, convert leads.">

  <!-- PWA Manifest & Icons -->
  <link rel="manifest" href="/kanchoai/manifest.json">
  <link rel="apple-touch-icon" href="${KANCHO_LOGO_URL}">
  <link rel="icon" type="image/png" href="${KANCHO_LOGO_URL}">

  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            kancho: {
              coral: '#E85A4F',
              'coral-dark': '#D64A3F',
              dark: '#0D0D0D',
              'dark-card': '#1A1A1A',
              'dark-border': '#2A2A2A'
            }
          }
        }
      }
    }
  </script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    * { -webkit-tap-highlight-color: transparent; }
    html { scroll-behavior: smooth; }
    body {
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      overscroll-behavior: none;
    }
    .gradient-bg { background: #0D0D0D; }
    .card { background: #1A1A1A; border: 1px solid #2A2A2A; }
    .card-danger { background: linear-gradient(135deg, rgba(232, 90, 79, 0.15) 0%, rgba(232, 90, 79, 0.05) 100%); border-color: rgba(232, 90, 79, 0.3); }
    .card-success { background: linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(34, 197, 94, 0.05) 100%); border-color: rgba(34, 197, 94, 0.2); }
    .glow-pulse { animation: glow-pulse 2s ease-in-out infinite; }
    @keyframes glow-pulse { 0%, 100% { box-shadow: 0 0 40px rgba(232, 90, 79, 0.3); } 50% { box-shadow: 0 0 60px rgba(232, 90, 79, 0.5); } }
    .score-ring { stroke-dasharray: 377; stroke-dashoffset: calc(377 - (377 * var(--score)) / 100); transition: stroke-dashoffset 1.5s ease-out; }
    .fade-in { animation: fadeIn 0.5s ease-out; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    .kancho-btn { background: linear-gradient(135deg, #E85A4F 0%, #D64A3F 100%); -webkit-tap-highlight-color: transparent; }
    .kancho-btn:hover, .kancho-btn:active { background: linear-gradient(135deg, #D64A3F 0%, #C53A2F 100%); }
    .text-kancho { color: #E85A4F; }

    /* Mobile-first responsive styles */
    @media (max-width: 768px) {
      .mobile-header {
        flex-direction: column;
        gap: 12px;
        padding: 12px 16px;
        align-items: stretch;
      }
      .mobile-header > div:first-child {
        justify-content: center;
      }
      .mobile-header .header-actions {
        flex-direction: column;
        gap: 10px;
        width: 100%;
      }
      .mobile-header .header-actions > * {
        width: 100%;
        justify-content: center;
      }
      .mobile-header .demo-label {
        display: none;
      }
      .mobile-header select {
        width: 100%;
        padding: 12px 16px;
        font-size: 16px; /* Prevents iOS zoom */
      }
      .mobile-header button {
        width: 100%;
        padding: 14px 20px;
        font-size: 16px;
      }
      .mobile-main {
        padding: 12px !important;
      }
      body {
        padding-bottom: 80px;
      }
      .mobile-hero-logo {
        width: 200px !important;
        height: 200px !important;
      }
      .mobile-hero-logo img {
        width: 160px !important;
        height: 160px !important;
      }
      h2.mobile-title {
        font-size: 1.75rem !important;
        line-height: 1.2 !important;
      }
      .mobile-value-props {
        gap: 16px !important;
      }
      .mobile-value-props .card {
        padding: 20px !important;
      }
      .mobile-pricing-grid {
        gap: 20px !important;
      }
      .mobile-pricing-grid > div {
        transform: none !important;
      }
      .mobile-stats-banner {
        grid-template-columns: repeat(2, 1fr) !important;
        gap: 16px !important;
      }
      .mobile-workflow {
        gap: 24px !important;
      }
      .mobile-cta-buttons {
        flex-direction: column !important;
        gap: 12px !important;
      }
      .mobile-cta-buttons > * {
        width: 100% !important;
        text-align: center;
      }
      .mobile-footer-grid {
        grid-template-columns: 1fr !important;
        gap: 32px !important;
        text-align: center;
      }
      .mobile-kpi-grid {
        grid-template-columns: repeat(2, 1fr) !important;
      }
      .language-toggle {
        bottom: 16px !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
      }
    }

    @media (max-width: 480px) {
      .mobile-hero-logo {
        width: 160px !important;
        height: 160px !important;
      }
      .mobile-hero-logo img {
        width: 120px !important;
        height: 120px !important;
      }
      h2.mobile-title {
        font-size: 1.5rem !important;
      }
      .mobile-stats-banner p.text-3xl {
        font-size: 1.5rem !important;
      }
    }

    /* Safe area for notched phones */
    @supports (padding: max(0px)) {
      body {
        padding-left: max(12px, env(safe-area-inset-left));
        padding-right: max(12px, env(safe-area-inset-right));
        padding-bottom: max(80px, env(safe-area-inset-bottom));
      }
    }

    /* Touch-friendly buttons */
    button, a, select {
      min-height: 44px;
      cursor: pointer;
    }

    /* Smooth scrolling for modals */
    .modal-scroll {
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
    }
    /* Auth styles */
    .login-card { background: #1A1A1A; border: 1px solid #2A2A2A; max-width: 420px; margin: 0 auto; }
    .login-input { background: #0D0D0D; border: 1px solid #2A2A2A; color: white; width: 100%; padding: 12px 16px; border-radius: 12px; font-size: 16px; transition: border-color 0.2s; }
    .login-input:focus { outline: none; border-color: #E85A4F; }
    .login-input::placeholder { color: #6B7280; }
    .provision-step { display: flex; align-items: center; gap: 12px; padding: 12px 0; }
    .provision-step .step-icon { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .provision-step.pending .step-icon { background: rgba(255,255,255,0.05); color: #6B7280; }
    .provision-step.active .step-icon { background: rgba(232,90,79,0.2); color: #E85A4F; }
    .provision-step.done .step-icon { background: rgba(34,197,94,0.2); color: #22C55E; }
    .auth-user-badge { display: flex; align-items: center; gap: 8px; background: #1A1A1A; border: 1px solid #2A2A2A; border-radius: 12px; padding: 6px 12px; }
    .plan-badge { font-size: 10px; font-weight: 700; text-transform: uppercase; padding: 2px 8px; border-radius: 9999px; background: rgba(232,90,79,0.2); color: #E85A4F; }
    /* Signup modal */
    .signup-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.75); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 16px; backdrop-filter: blur(4px); }
    .signup-modal { background: #111; border: 1px solid #2A2A2A; border-radius: 16px; max-width: 520px; width: 100%; max-height: 90vh; overflow-y: auto; padding: 32px; position: relative; }
    .signup-modal h2 { font-size: 24px; font-weight: 700; margin-bottom: 4px; }
    .signup-modal .plan-tag { display: inline-block; background: rgba(232,90,79,0.2); color: #E85A4F; font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 9999px; margin-bottom: 20px; }
    .signup-modal label { display: block; font-size: 13px; color: #9CA3AF; margin-bottom: 6px; margin-top: 16px; }
    .signup-modal label:first-of-type { margin-top: 0; }
    .signup-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .signup-modal .close-btn { position: absolute; top: 16px; right: 16px; background: none; border: none; color: #6B7280; font-size: 20px; cursor: pointer; padding: 4px 8px; border-radius: 8px; }
    .signup-modal .close-btn:hover { color: white; background: rgba(255,255,255,0.1); }
    .signup-modal .trial-note { text-align: center; font-size: 13px; color: #9CA3AF; margin-top: 12px; }
    .signup-modal .trial-note strong { color: #22C55E; }
    @media (max-width: 640px) { .signup-row { grid-template-columns: 1fr; } .signup-modal { padding: 24px 20px; } }
    /* Dashboard Tabs */
    .tab-nav { display: flex; gap: 2px; background: #111; border: 1px solid #2A2A2A; border-radius: 12px; padding: 4px; overflow-x: auto; -webkit-overflow-scrolling: touch; }
    .tab-btn { padding: 10px 20px; border: none; background: transparent; color: #6B7280; font-size: 14px; font-weight: 600; cursor: pointer; border-radius: 8px; white-space: nowrap; transition: all 0.2s; }
    .tab-btn:hover { color: #D1D5DB; background: rgba(255,255,255,0.05); }
    .tab-btn.active { color: #E85A4F; background: rgba(232,90,79,0.1); }
    .tab-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: #EF4444; color: #fff; font-size: 11px; font-weight: 700; margin-left: 6px; line-height: 1; animation: badgePulse 2s ease-in-out infinite; }
    @keyframes badgePulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.15); } }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    @media (max-width: 640px) { .tab-btn { padding: 8px 14px; font-size: 13px; } }
    /* Data Tables */
    .data-table { width: 100%; border-collapse: separate; border-spacing: 0; }
    .data-table th { text-align: left; padding: 12px 16px; font-size: 11px; text-transform: uppercase; color: #6B7280; font-weight: 600; border-bottom: 1px solid #2A2A2A; }
    .data-table td { padding: 12px 16px; font-size: 14px; border-bottom: 1px solid rgba(255,255,255,0.04); }
    .data-table tr { cursor: pointer; transition: background 0.15s; }
    .data-table tbody tr:hover { background: rgba(232,90,79,0.05); }
    @media (max-width: 768px) { .data-table th, .data-table td { padding: 10px 8px; font-size: 12px; } }
    /* Filter Bar */
    .filter-bar { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
    .filter-bar input, .filter-bar select { background: #0D0D0D; border: 1px solid #2A2A2A; color: white; padding: 8px 14px; border-radius: 10px; font-size: 14px; }
    .filter-bar input { flex: 1; min-width: 180px; }
    .filter-bar input:focus, .filter-bar select:focus { outline: none; border-color: #E85A4F; }
    .filter-bar input::placeholder { color: #6B7280; }
    /* Badges */
    .badge { display: inline-block; padding: 3px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .badge-active { background: rgba(34,197,94,0.15); color: #22C55E; }
    .badge-inactive { background: rgba(107,114,128,0.15); color: #9CA3AF; }
    .badge-frozen { background: rgba(59,130,246,0.15); color: #60A5FA; }
    .badge-cancelled { background: rgba(239,68,68,0.15); color: #EF4444; }
    .badge-prospect { background: rgba(168,85,247,0.15); color: #A855F7; }
    .badge-hot { background: rgba(239,68,68,0.15); color: #EF4444; }
    .badge-warm { background: rgba(245,158,11,0.15); color: #F59E0B; }
    .badge-cold { background: rgba(59,130,246,0.15); color: #60A5FA; }
    .badge-new { background: rgba(34,197,94,0.15); color: #22C55E; }
    .badge-converted { background: rgba(168,85,247,0.15); color: #A855F7; }
    .badge-lost { background: rgba(107,114,128,0.15); color: #6B7280; }
    .badge-low { background: rgba(34,197,94,0.15); color: #22C55E; }
    .badge-medium { background: rgba(245,158,11,0.15); color: #F59E0B; }
    .badge-high { background: rgba(239,68,68,0.15); color: #EF4444; }
    .badge-critical { background: rgba(220,38,38,0.2); color: #DC2626; }
    .badge-confirmed { background: rgba(34,197,94,0.15); color: #22C55E; }
    .badge-pending { background: rgba(245,158,11,0.15); color: #F59E0B; }
    .badge-completed { background: rgba(59,130,246,0.15); color: #60A5FA; }
    /* Slide Panel */
    .slide-panel { position: fixed; top: 0; right: -520px; width: 480px; max-width: 100vw; height: 100vh; background: #111; border-left: 1px solid #2A2A2A; z-index: 150; transition: right 0.3s ease; overflow-y: auto; box-shadow: -8px 0 32px rgba(0,0,0,0.5); }
    .slide-panel.open { right: 0; }
    .slide-panel-header { position: sticky; top: 0; background: #111; border-bottom: 1px solid #2A2A2A; padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; z-index: 2; }
    .slide-panel-body { padding: 24px; }
    .slide-panel-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 140; }
    .slide-panel-overlay.open { display: block; }
    @media (max-width: 640px) { .slide-panel { width: 100vw; right: -100vw; } }
    /* Global Modal */
    .modal { display: none; position: fixed; inset: 0; z-index: 200; }
    .modal.open { display: flex; align-items: center; justify-content: center; }
    .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.6); }
    .modal-content { position: relative; background: #1A1A1A; border: 1px solid #333; border-radius: 16px; padding: 24px; width: 90vw; max-height: 90vh; overflow-y: auto; z-index: 201; }
    /* Calendar */
    .calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
    .calendar-header-cell { padding: 8px 4px; text-align: center; font-size: 11px; text-transform: uppercase; color: #6B7280; font-weight: 600; }
    .calendar-day { min-height: 80px; background: #1A1A1A; border: 1px solid #2A2A2A; border-radius: 8px; padding: 6px 8px; cursor: pointer; transition: border-color 0.15s; }
    .calendar-day:hover { border-color: #E85A4F; }
    .calendar-day.today { border-color: #E85A4F; background: rgba(232,90,79,0.05); }
    .calendar-day.selected { border-color: #E85A4F; background: rgba(232,90,79,0.1); }
    .calendar-day.other-month { opacity: 0.3; }
    .calendar-day-number { font-size: 13px; font-weight: 600; color: #D1D5DB; }
    .calendar-dot { width: 6px; height: 6px; border-radius: 50%; background: #E85A4F; display: inline-block; margin: 1px; }
    @media (max-width: 640px) { .calendar-day { min-height: 48px; padding: 4px; } .calendar-day-number { font-size: 11px; } }
    /* Pagination */
    .pagination { display: flex; justify-content: center; align-items: center; gap: 4px; margin-top: 16px; }
    .pagination button { padding: 6px 12px; border: 1px solid #2A2A2A; background: #1A1A1A; color: #9CA3AF; border-radius: 8px; font-size: 13px; cursor: pointer; transition: all 0.15s; }
    .pagination button:hover { border-color: #E85A4F; color: white; }
    .pagination button.active { background: rgba(232,90,79,0.2); border-color: #E85A4F; color: #E85A4F; }
    .pagination button:disabled { opacity: 0.3; cursor: not-allowed; }
    /* Summary Cards */
    .summary-card { background: #1A1A1A; border: 1px solid #2A2A2A; border-radius: 12px; padding: 16px; text-align: center; }
    .summary-card .label { font-size: 11px; text-transform: uppercase; color: #6B7280; margin-bottom: 6px; }
    .summary-card .value { font-size: 24px; font-weight: 700; }
    /* Action button */
    .btn-primary { background: linear-gradient(135deg, #E85A4F, #F17A70); color: white; border: none; padding: 10px 20px; border-radius: 10px; font-weight: 600; font-size: 14px; cursor: pointer; transition: opacity 0.15s; }
    .btn-primary:hover { opacity: 0.9; }
    .btn-sm { padding: 6px 14px; font-size: 12px; border-radius: 8px; }
    .btn-ghost { background: transparent; border: 1px solid #2A2A2A; color: #D1D5DB; padding: 6px 14px; border-radius: 8px; font-size: 12px; cursor: pointer; transition: all 0.15s; }
    .btn-ghost:hover { border-color: #E85A4F; color: white; }
    /* Form modal */
    .form-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.75); z-index: 200; display: none; align-items: center; justify-content: center; padding: 16px; backdrop-filter: blur(4px); }
    .form-modal.open { display: flex; }
    .form-modal-content { background: #111; border: 1px solid #2A2A2A; border-radius: 16px; max-width: 520px; width: 100%; max-height: 90vh; overflow-y: auto; padding: 32px; position: relative; }
    .form-modal-content h3 { font-size: 20px; font-weight: 700; margin-bottom: 20px; }
    .form-group { margin-bottom: 16px; }
    .form-group label { display: block; font-size: 13px; color: #9CA3AF; margin-bottom: 6px; }
    .form-group input, .form-group select, .form-group textarea { background: #0D0D0D; border: 1px solid #2A2A2A; color: white; width: 100%; padding: 10px 14px; border-radius: 10px; font-size: 14px; }
    .form-group input:focus, .form-group select:focus, .form-group textarea:focus { outline: none; border-color: #E85A4F; }
    .form-group textarea { resize: vertical; min-height: 80px; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    /* Attendance */
    .checkin-student-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: #1A1A1A; border: 1px solid #2A2A2A; border-radius: 10px; margin-bottom: 6px; cursor: pointer; transition: border-color 0.15s; }
    .checkin-student-row:hover { border-color: #E85A4F; }
    .checkin-student-row.checked { border-color: #10B981; background: rgba(16,185,129,0.05); }
    .checkin-checkbox { width: 20px; height: 20px; accent-color: #E85A4F; cursor: pointer; }
    .checkin-student-info { flex: 1; margin-left: 12px; }
    .checkin-student-name { font-weight: 600; font-size: 14px; }
    .checkin-student-meta { font-size: 11px; color: #6B7280; margin-top: 2px; }
    .checkin-actions { display: flex; gap: 8px; margin-bottom: 12px; }
    .attendance-history-item { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: #1A1A1A; border: 1px solid #2A2A2A; border-radius: 8px; margin-bottom: 4px; font-size: 13px; }
    .attendance-history-item .date { color: #D1D5DB; font-weight: 500; }
    .attendance-history-item .class-name { color: #9CA3AF; }
    .streak-badge { display: inline-flex; align-items: center; gap: 4px; background: linear-gradient(135deg, #F59E0B, #EF4444); color: white; padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; }
    .btn-checkin { background: #10B981; color: white; border: none; padding: 8px 16px; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; transition: opacity 0.15s; }
    .btn-checkin:hover { opacity: 0.9; }
    .roster-loading { text-align: center; color: #6B7280; padding: 40px 0; }
    @media (max-width: 640px) { .form-row { grid-template-columns: 1fr; } }
    .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
    .detail-row .label { color: #6B7280; font-size: 13px; }
    .detail-row .value { color: #D1D5DB; font-size: 14px; font-weight: 500; }
  </style>
</head>
<body class="gradient-bg min-h-screen text-white">
  <!-- Header -->
  <header class="border-b border-kancho-dark-border sticky top-0 z-50 bg-kancho-dark/95 backdrop-blur-xl safe-area-top">
    <div class="max-w-7xl mx-auto flex items-center justify-between px-4 md:px-6 py-3 md:py-4 mobile-header">
      <div class="flex items-center gap-3">
        <img src="${KANCHO_LOGO_URL}" alt="Kancho AI" class="w-10 h-10 md:w-12 md:h-12 rounded-lg object-contain">
        <div>
          <h1 class="text-lg md:text-2xl font-bold text-white tracking-tight">KANCHO AI</h1>
          <p class="text-xs text-gray-500 hidden sm:block">AI Business Intelligence</p>
        </div>
      </div>
      <div class="flex items-center gap-2 md:gap-4 header-actions">
        <!-- Unauthenticated header (demo mode) -->
        <div id="headerUnauth" class="flex items-center gap-2 md:gap-4">
          <span class="text-gray-400 text-sm font-medium demo-label hidden md:inline">DEMO</span>
          <i class="fas fa-chevron-right text-gray-500 text-xs demo-label hidden md:inline"></i>
          <select id="schoolSelect" class="bg-kancho-dark-card border border-kancho-dark-border rounded-lg px-3 md:px-4 py-2 md:py-2.5 text-sm focus:border-kancho-coral focus:outline-none transition">
            <option value="">Select Business...</option>
          </select>
          <button onclick="talkToKancho()" class="kancho-btn px-4 md:px-5 py-2 md:py-2.5 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2 shadow-lg whitespace-nowrap">
            <i class="fas fa-microphone"></i>
            <span class="hidden sm:inline">Talk to Kancho</span>
            <span class="sm:hidden">Talk</span>
          </button>
          <button onclick="showLoginSection()" class="px-3 md:px-4 py-2 md:py-2.5 bg-white/10 border border-kancho-dark-border rounded-lg text-sm hover:bg-kancho-coral/20 hover:border-kancho-coral transition flex items-center gap-2">
            <i class="fas fa-sign-in-alt"></i>
            <span class="hidden sm:inline">Sign In</span>
          </button>
        </div>
        <!-- Authenticated header -->
        <div id="headerAuth" class="hidden flex items-center gap-2 md:gap-4">
          <div class="auth-user-badge">
            <div class="text-right hidden sm:block">
              <p id="headerSchoolName" class="text-sm font-medium text-white leading-tight"></p>
              <p id="headerUserEmail" class="text-xs text-gray-400 leading-tight"></p>
            </div>
            <span id="headerPlanBadge" class="plan-badge"></span>
          </div>
          <button onclick="talkToKancho()" class="kancho-btn px-4 md:px-5 py-2 md:py-2.5 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2 shadow-lg whitespace-nowrap">
            <i class="fas fa-microphone"></i>
            <span class="hidden sm:inline">Talk to Kancho</span>
            <span class="sm:hidden">Talk</span>
          </button>
          <button onclick="logout()" class="p-2 md:px-3 md:py-2.5 bg-white/10 border border-kancho-dark-border rounded-lg text-sm hover:bg-red-500/20 hover:border-red-500/50 transition" title="Logout">
            <i class="fas fa-sign-out-alt text-gray-400"></i>
          </button>
        </div>
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <main class="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 mobile-main">

    <!-- Login Section -->
    <div id="loginSection" class="hidden py-16">
      <div class="login-card rounded-2xl p-8">
        <div class="text-center mb-8">
          <img src="${KANCHO_LOGO_URL}" alt="Kancho AI" class="w-20 h-20 rounded-xl mx-auto mb-4 object-contain">
          <h2 class="text-2xl font-bold">Welcome Back</h2>
          <p class="text-gray-400 text-sm mt-2">Sign in to your Kancho AI dashboard</p>
        </div>
        <form id="loginForm" onsubmit="handleLogin(event)" class="space-y-4">
          <div>
            <label class="text-sm text-gray-400 block mb-1">Email</label>
            <input type="email" id="loginEmail" class="login-input" placeholder="you@yourschool.com" required autocomplete="email">
          </div>
          <div>
            <label class="text-sm text-gray-400 block mb-1">Password</label>
            <input type="password" id="loginPassword" class="login-input" placeholder="Your password" required autocomplete="current-password">
          </div>
          <div id="loginError" class="hidden text-red-400 text-sm text-center py-2"></div>
          <button type="submit" id="loginBtn" class="w-full kancho-btn py-3 rounded-xl font-medium transition shadow-lg">
            <span id="loginBtnText">Sign In</span>
          </button>
          <div class="text-right mt-2">
            <button type="button" onclick="showForgotPassword()" class="text-kancho text-sm hover:underline">Forgot Password?</button>
          </div>
        </form>
        <div class="text-center mt-6 space-y-2">
          <p class="text-gray-400 text-sm">Don't have an account? <a href="#pricing" onclick="showLandingPage()" class="text-kancho hover:underline">Sign Up</a></p>
          <button onclick="showLandingPage()" class="text-gray-500 text-xs hover:text-gray-300 transition"><i class="fas fa-arrow-left mr-1"></i>Back to Home</button>
        </div>
      </div>
    </div>

    <!-- Forgot Password Section -->
    <div id="forgotPasswordSection" class="hidden py-16">
      <div class="login-card rounded-2xl p-8">
        <div class="text-center mb-8">
          <div class="w-16 h-16 bg-kancho-coral/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <i class="fas fa-key text-kancho text-2xl"></i>
          </div>
          <h2 class="text-2xl font-bold">Reset Password</h2>
          <p class="text-gray-400 text-sm mt-2">Enter your email and we'll send you a reset link</p>
        </div>
        <form id="forgotPasswordForm" onsubmit="handleForgotPassword(event)" class="space-y-4">
          <div>
            <label class="text-sm text-gray-400 block mb-1">Email</label>
            <input type="email" id="forgotEmail" class="login-input" placeholder="you@yourschool.com" required autocomplete="email">
          </div>
          <div id="forgotError" class="hidden text-red-400 text-sm text-center py-2"></div>
          <div id="forgotSuccess" class="hidden text-green-400 text-sm text-center py-3 bg-green-400/10 rounded-xl"></div>
          <button type="submit" id="forgotBtn" class="w-full kancho-btn py-3 rounded-xl font-medium transition shadow-lg">
            Send Reset Link
          </button>
        </form>
        <div class="text-center mt-6">
          <button onclick="showLoginSection()" class="text-kancho text-sm hover:underline"><i class="fas fa-arrow-left mr-1"></i>Back to Sign In</button>
        </div>
      </div>
    </div>

    <!-- Reset Password Section (shown when user clicks email link) -->
    <div id="resetPasswordSection" class="hidden py-16">
      <div class="login-card rounded-2xl p-8">
        <div class="text-center mb-8">
          <div class="w-16 h-16 bg-kancho-coral/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <i class="fas fa-lock text-kancho text-2xl"></i>
          </div>
          <h2 class="text-2xl font-bold">Set New Password</h2>
          <p id="resetEmailDisplay" class="text-gray-400 text-sm mt-2"></p>
        </div>
        <form id="resetPasswordForm" onsubmit="handleResetPassword(event)" class="space-y-4">
          <div>
            <label class="text-sm text-gray-400 block mb-1">New Password</label>
            <input type="password" id="resetNewPassword" class="login-input" placeholder="Min 8 characters" minlength="8" required autocomplete="new-password">
          </div>
          <div>
            <label class="text-sm text-gray-400 block mb-1">Confirm Password</label>
            <input type="password" id="resetConfirmPassword" class="login-input" placeholder="Confirm new password" minlength="8" required autocomplete="new-password">
          </div>
          <div id="resetError" class="hidden text-red-400 text-sm text-center py-2"></div>
          <div id="resetSuccess" class="hidden text-center py-4">
            <div class="text-green-400 mb-3"><i class="fas fa-check-circle text-3xl"></i></div>
            <p class="text-green-400 font-medium">Password reset successfully!</p>
            <button type="button" onclick="showLoginSection()" class="kancho-btn px-8 py-2 rounded-xl font-medium transition mt-4">Sign In Now</button>
          </div>
          <button type="submit" id="resetBtn" class="w-full kancho-btn py-3 rounded-xl font-medium transition shadow-lg">
            Reset Password
          </button>
        </form>
      </div>
    </div>

    <!-- Signup Success / Provisioning Section -->
    <div id="signupSuccessSection" class="hidden py-16">
      <div class="max-w-lg mx-auto text-center">
        <div class="w-24 h-24 bg-kancho-coral/20 rounded-full flex items-center justify-center mx-auto mb-6 glow-pulse">
          <i class="fas fa-cog fa-spin text-kancho text-3xl" id="provisionSpinner"></i>
        </div>
        <h2 class="text-2xl font-bold mb-2" id="provisionTitle">Setting Up Your Account</h2>
        <p class="text-gray-400 mb-8" id="provisionSubtitle">We're configuring everything for your school...</p>
        <div class="card rounded-2xl p-6 text-left space-y-1" id="provisionSteps"></div>
        <div id="provisionError" class="hidden mt-6 card card-danger rounded-xl p-4 text-center">
          <p class="text-red-400"><i class="fas fa-exclamation-circle mr-2"></i><span id="provisionErrorMsg"></span></p>
          <button onclick="window.location.reload()" class="mt-3 px-4 py-2 bg-white/10 rounded-lg text-sm hover:bg-white/20 transition">Try Again</button>
        </div>
      </div>
    </div>

    <!-- Welcome Section -->
    <div id="welcomeSection" class="py-8 md:py-16">
      <div class="text-center mb-10 md:mb-16">
        <div class="w-48 h-48 sm:w-64 sm:h-64 md:w-80 md:h-80 lg:w-96 lg:h-96 rounded-3xl flex items-center justify-center mx-auto mb-6 md:mb-8 glow-pulse overflow-hidden bg-kancho-dark-card border border-kancho-dark-border mobile-hero-logo">
          <img src="${KANCHO_LOGO_URL}" alt="Kancho AI" class="w-36 h-36 sm:w-48 sm:h-48 md:w-64 md:h-64 lg:w-80 lg:h-80 object-contain">
        </div>
        <h2 class="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 md:mb-4 mobile-title">Meet <span class="text-kancho">Kancho AI</span></h2>
        <p class="text-lg md:text-xl text-gray-300 mb-2">Your AI Business Intelligence Officer</p>
        <p class="text-gray-400 max-w-2xl mx-auto text-sm md:text-base px-2">
          Connects to your company data, understands how your business really works,
          and delivers clear insights on where you're losing money, where you can grow,
          and what actions will maximize your profit and performance.
        </p>
      </div>

      <!-- Value Props -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8 mb-10 md:mb-16 mobile-value-props">
        <div class="card card-danger rounded-2xl p-5 md:p-8 text-center">
          <div class="w-12 h-12 md:w-16 md:h-16 bg-red-500/20 rounded-xl md:rounded-2xl flex items-center justify-center mx-auto mb-3 md:mb-4">
            <i class="fas fa-money-bill-wave text-red-400 text-xl md:text-2xl"></i>
          </div>
          <h3 class="text-lg md:text-xl font-bold mb-2 text-red-400">Find Money Leaks</h3>
          <p class="text-gray-400 text-xs md:text-sm">Identify where you're losing revenue - churning members, failed payments, missed opportunities</p>
        </div>

        <div class="card card-success rounded-2xl p-5 md:p-8 text-center">
          <div class="w-12 h-12 md:w-16 md:h-16 bg-green-500/20 rounded-xl md:rounded-2xl flex items-center justify-center mx-auto mb-3 md:mb-4">
            <i class="fas fa-chart-line text-green-400 text-xl md:text-2xl"></i>
          </div>
          <h3 class="text-lg md:text-xl font-bold mb-2 text-green-400">Spot Growth</h3>
          <p class="text-gray-400 text-xs md:text-sm">Discover untapped potential - hot leads, upsell opportunities, expansion possibilities</p>
        </div>

        <div class="card rounded-2xl p-5 md:p-8 text-center" style="background: linear-gradient(135deg, rgba(232, 90, 79, 0.1) 0%, rgba(232, 90, 79, 0.05) 100%); border-color: rgba(232, 90, 79, 0.2);">
          <div class="w-12 h-12 md:w-16 md:h-16 bg-kancho-coral/20 rounded-xl md:rounded-2xl flex items-center justify-center mx-auto mb-3 md:mb-4">
            <i class="fas fa-bolt text-kancho text-xl md:text-2xl"></i>
          </div>
          <h3 class="text-lg md:text-xl font-bold mb-2 text-kancho">Take Action</h3>
          <p class="text-gray-400 text-xs md:text-sm">Get prioritized recommendations that maximize profit and performance immediately</p>
        </div>
      </div>

      <!-- Feature Props Row 2 -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8 mb-10 md:mb-16 mobile-value-props">
        <div class="card rounded-2xl p-5 md:p-8 text-center" style="background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(99, 102, 241, 0.05) 100%); border-color: rgba(99, 102, 241, 0.2);">
          <div class="w-12 h-12 md:w-16 md:h-16 bg-indigo-500/20 rounded-xl md:rounded-2xl flex items-center justify-center mx-auto mb-3 md:mb-4">
            <i class="fas fa-phone-alt text-indigo-400 text-xl md:text-2xl"></i>
          </div>
          <h3 class="text-lg md:text-xl font-bold mb-2 text-indigo-400">AI Call Handling</h3>
          <p class="text-gray-400 text-xs md:text-sm">Automatic inbound & outbound call handling — AI answers, books appointments, and follows up with leads 24/7</p>
        </div>

        <div class="card rounded-2xl p-5 md:p-8 text-center" style="background: linear-gradient(135deg, rgba(251, 191, 36, 0.1) 0%, rgba(251, 191, 36, 0.05) 100%); border-color: rgba(251, 191, 36, 0.2);">
          <div class="w-12 h-12 md:w-16 md:h-16 bg-amber-500/20 rounded-xl md:rounded-2xl flex items-center justify-center mx-auto mb-3 md:mb-4">
            <i class="fas fa-cogs text-amber-400 text-xl md:text-2xl"></i>
          </div>
          <h3 class="text-lg md:text-xl font-bold mb-2 text-amber-400">CRM Automations</h3>
          <p class="text-gray-400 text-xs md:text-sm">Business automations that manage your pipeline — scheduling, reminders, follow-ups, and revenue tracking on autopilot</p>
        </div>

        <div class="card rounded-2xl p-5 md:p-8 text-center" style="background: linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(34, 197, 94, 0.05) 100%); border-color: rgba(34, 197, 94, 0.2);">
          <div class="w-12 h-12 md:w-16 md:h-16 bg-emerald-500/20 rounded-xl md:rounded-2xl flex items-center justify-center mx-auto mb-3 md:mb-4">
            <i class="fas fa-user-shield text-emerald-400 text-xl md:text-2xl"></i>
          </div>
          <h3 class="text-lg md:text-xl font-bold mb-2 text-emerald-400">Student Tracking</h3>
          <p class="text-gray-400 text-xs md:text-sm">Churn reduction, lead handling, attendance tracking, belt progress, and payment management — all in one place</p>
        </div>
      </div>

      <!-- CTA -->
      <div class="text-center mb-16">
        <p class="text-gray-400 mb-6">Select a business above to see Kancho in action, or:</p>
        <div class="flex flex-col sm:flex-row gap-4 justify-center">
          <button onclick="seedDemoData()" class="kancho-btn px-8 py-4 rounded-xl font-medium transition shadow-lg">
            <i class="fas fa-rocket mr-2"></i>Load Demo Data
          </button>
          <button onclick="showLoginSection()" class="px-8 py-4 rounded-xl font-medium border-2 border-gray-600 hover:border-kancho-coral transition">
            <i class="fas fa-sign-in-alt mr-2"></i>Sign In to Your Dashboard
          </button>
        </div>
      </div>

      <!-- Trial Class Booking Section -->
      <div class="mt-16 pt-16 border-t border-kancho-dark-border">
        <div class="text-center mb-12">
          <h2 class="text-3xl font-bold mb-4">Ready to Start Your <span class="text-kancho">Martial Arts Journey?</span></h2>
          <p class="text-gray-400 max-w-2xl mx-auto">Book your free trial class today. No experience necessary. No commitment required.</p>
        </div>
        <div class="max-w-4xl mx-auto">
          <div class="card rounded-2xl p-8 text-center border-kancho-coral/30" style="border-color: rgba(232, 90, 79, 0.3);">
            <div class="w-20 h-20 bg-kancho-coral/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <i class="fas fa-calendar-check text-kancho text-3xl"></i>
            </div>
            <h3 class="text-2xl font-bold mb-4">Book Your Free Trial</h3>
            <p class="text-gray-400 mb-6">Meet our KanchoAI Specialist. See if we're the right fit for you.</p>
            <ul class="text-left max-w-md mx-auto space-y-3 mb-8">
              <li class="flex items-center gap-3 text-gray-300"><i class="fas fa-check-circle text-green-400"></i> No experience required</li>
              <li class="flex items-center gap-3 text-gray-300"><i class="fas fa-check-circle text-green-400"></i> Zero commitment or pressure</li>
            </ul>
            <button onclick="openTrialBookingModal()" class="kancho-btn px-8 py-4 rounded-xl font-medium transition shadow-lg text-lg">
              <i class="fas fa-calendar-plus mr-2"></i>Book Free Trial Now
            </button>
          </div>
        </div>
      </div>

      <!-- Our Programs Section -->
      <div class="mt-16 pt-16 border-t border-kancho-dark-border">
        <div class="text-center mb-12">
          <h2 class="text-3xl font-bold mb-4">Explore Our <span class="text-kancho">Programs</span></h2>
          <p class="text-gray-400 max-w-2xl mx-auto">World-class martial arts training for all ages and skill levels.</p>
        </div>
        <div id="classesGrid" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-5 max-w-7xl mx-auto">
          <div class="text-center col-span-full py-8">
            <i class="fas fa-spinner fa-spin text-kancho text-3xl mb-4 block"></i>
            <p class="text-gray-400">Loading classes...</p>
          </div>
        </div>
      </div>

      <!-- Onboarding Section -->
      <div class="mt-16 pt-16 border-t border-kancho-dark-border">
        <div class="text-center mb-12">
          <h2 class="text-3xl font-bold mb-4">Getting Started With <span class="text-kancho">Kancho AI</span> Is Effortless</h2>
          <p class="text-gray-400 max-w-2xl mx-auto">Our dedicated team personally guides you through every step of the process.</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          <!-- Step 1 -->
          <div class="text-center">
            <div class="w-16 h-16 bg-kancho-coral/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <span class="text-2xl font-bold text-kancho">1</span>
            </div>
            <h3 class="text-xl font-bold mb-3">Data Integration</h3>
            <p class="text-gray-400 text-sm">
              Connect your existing tools and platforms, and our team handles the setup for you. Fast, secure integration with no hassle.
            </p>
          </div>

          <!-- Step 2 -->
          <div class="text-center">
            <div class="w-16 h-16 bg-kancho-coral/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <span class="text-2xl font-bold text-kancho">2</span>
            </div>
            <h3 class="text-xl font-bold mb-3">White-Glove Onboarding</h3>
            <p class="text-gray-400 text-sm">
              Get personalized 1-on-1 training so you feel confident from day one. Our support team is like having your own dedicated IT department.
            </p>
          </div>
        </div>
      </div>

      <!-- App Preview Image -->
      <div class="mt-16 flex justify-center">
        <img src="https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/698f40f5772de9dc86d48339.png" alt="Kancho AI App Preview" class="max-w-full md:max-w-4xl rounded-2xl shadow-2xl shadow-kancho-coral/10">
      </div>

      <!-- AI Automation Workflow Section -->
      <div class="mt-16 pt-16 border-t border-kancho-dark-border">
        <div class="text-center mb-12">
          <h2 class="text-3xl font-bold mb-4">How <span class="text-kancho">Kancho AI</span> Works For You</h2>
          <p class="text-gray-400 max-w-2xl mx-auto">A fully automated AI system that monitors, retains, and grows your martial arts school — 24/7, without lifting a finger.</p>
        </div>

        <!-- Workflow Steps -->
        <div class="max-w-5xl mx-auto">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            <!-- Connection Lines (Desktop) -->
            <div class="hidden md:block absolute top-16 left-1/4 right-1/4 h-0.5 bg-gradient-to-r from-kancho-coral via-amber-500 to-green-500"></div>

            <!-- Step 1: Monitor -->
            <div class="relative">
              <div class="card rounded-2xl p-6 text-center h-full">
                <div class="w-20 h-20 bg-kancho-coral/20 rounded-full flex items-center justify-center mx-auto mb-6 relative z-10 border-4 border-kancho-dark">
                  <i class="fas fa-heartbeat text-kancho text-3xl"></i>
                </div>
                <div class="inline-block bg-kancho-coral/20 text-kancho text-xs font-bold px-3 py-1 rounded-full mb-4">STEP 1</div>
                <h3 class="text-xl font-bold mb-3 text-white">Monitor Health</h3>
                <p class="text-gray-400 text-sm mb-4">
                  Kancho AI continuously monitors your school's health score, tracking attendance patterns, payment status, and engagement levels in real-time.
                </p>
                <ul class="text-left text-sm space-y-2">
                  <li class="flex items-center gap-2 text-gray-300">
                    <i class="fas fa-check-circle text-kancho text-xs"></i>
                    Real-time health score (0-100)
                  </li>
                  <li class="flex items-center gap-2 text-gray-300">
                    <i class="fas fa-check-circle text-kancho text-xs"></i>
                    At-risk student detection
                  </li>
                  <li class="flex items-center gap-2 text-gray-300">
                    <i class="fas fa-check-circle text-kancho text-xs"></i>
                    Revenue tracking & forecasting
                  </li>
                </ul>
              </div>
            </div>

            <!-- Step 2: Retain -->
            <div class="relative">
              <div class="card rounded-2xl p-6 text-center h-full border-amber-500/30">
                <div class="w-20 h-20 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-6 relative z-10 border-4 border-kancho-dark">
                  <i class="fas fa-phone-alt text-amber-400 text-3xl"></i>
                </div>
                <div class="inline-block bg-amber-500/20 text-amber-400 text-xs font-bold px-3 py-1 rounded-full mb-4">STEP 2</div>
                <h3 class="text-xl font-bold mb-3 text-white">Retain Members</h3>
                <p class="text-gray-400 text-sm mb-4">
                  When a student shows churn signals, Kancho AI automatically places personalized retention calls to re-engage them before they cancel.
                </p>
                <ul class="text-left text-sm space-y-2">
                  <li class="flex items-center gap-2 text-gray-300">
                    <i class="fas fa-check-circle text-amber-400 text-xs"></i>
                    Automatic outreach calls
                  </li>
                  <li class="flex items-center gap-2 text-gray-300">
                    <i class="fas fa-check-circle text-amber-400 text-xs"></i>
                    Personalized retention scripts
                  </li>
                  <li class="flex items-center gap-2 text-gray-300">
                    <i class="fas fa-check-circle text-amber-400 text-xs"></i>
                    No-show & payment recovery
                  </li>
                </ul>
              </div>
            </div>

            <!-- Step 3: Convert -->
            <div class="relative">
              <div class="card rounded-2xl p-6 text-center h-full border-green-500/30">
                <div class="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6 relative z-10 border-4 border-kancho-dark">
                  <i class="fas fa-chart-line text-green-400 text-3xl"></i>
                </div>
                <div class="inline-block bg-green-500/20 text-green-400 text-xs font-bold px-3 py-1 rounded-full mb-4">STEP 3</div>
                <h3 class="text-xl font-bold mb-3 text-white">Convert Leads</h3>
                <p class="text-gray-400 text-sm mb-4">
                  Kancho AI engages with every lead from first contact to conversion — following up, scheduling trials, and nurturing until they become paying members.
                </p>
                <ul class="text-left text-sm space-y-2">
                  <li class="flex items-center gap-2 text-gray-300">
                    <i class="fas fa-check-circle text-green-400 text-xs"></i>
                    End-to-end lead engagement
                  </li>
                  <li class="flex items-center gap-2 text-gray-300">
                    <i class="fas fa-check-circle text-green-400 text-xs"></i>
                    Automated trial scheduling
                  </li>
                  <li class="flex items-center gap-2 text-gray-300">
                    <i class="fas fa-check-circle text-green-400 text-xs"></i>
                    Hot lead prioritization
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <!-- Result Banner -->
          <div class="mt-12 bg-gradient-to-r from-kancho-coral/10 via-amber-500/10 to-green-500/10 border border-kancho-dark-border rounded-2xl p-8 text-center">
            <div class="flex flex-col md:flex-row items-center justify-center gap-6">
              <div class="flex items-center gap-3">
                <i class="fas fa-robot text-kancho text-2xl"></i>
                <span class="text-white font-medium">24/7 AI Automation</span>
              </div>
              <div class="hidden md:block w-px h-8 bg-kancho-dark-border"></div>
              <div class="flex items-center gap-3">
                <i class="fas fa-hand-holding-usd text-amber-400 text-2xl"></i>
                <span class="text-white font-medium">Protect Revenue</span>
              </div>
              <div class="hidden md:block w-px h-8 bg-kancho-dark-border"></div>
              <div class="flex items-center gap-3">
                <i class="fas fa-users text-green-400 text-2xl"></i>
                <span class="text-white font-medium">Grow Membership</span>
              </div>
            </div>
            <p class="text-gray-400 text-sm mt-4">All working automatically while you focus on teaching and transforming lives.</p>
          </div>
        </div>
      </div>

      <!-- Integration Image -->
      <div class="mt-16 flex justify-center">
        <img src="https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/698d575dbfe00f98dff7c57d.png" alt="Kancho AI Integrations" class="max-w-full md:max-w-4xl rounded-2xl">
      </div>

      <!-- Subscription Plans -->
      <div class="mt-10 md:mt-16 pt-10 md:pt-16 border-t border-kancho-dark-border" id="pricing">
        <div class="text-center mb-8 md:mb-12 px-2">
          <h2 class="text-2xl md:text-3xl font-bold mb-3 md:mb-4 mobile-title">Choose Your <span class="text-kancho">Kancho AI</span> Plan</h2>
          <p class="text-gray-400 max-w-2xl mx-auto text-sm md:text-base">Power your martial arts school with AI-driven business intelligence, automated receptionist, and complete CRM solutions.</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 max-w-6xl mx-auto mobile-pricing-grid">
          <!-- Plan 1: Kancho Intelligence -->
          <div class="card rounded-2xl p-5 md:p-8 relative hover:border-kancho-coral/50 transition-all duration-300">
            <div class="text-center mb-6">
              <h3 class="text-xl font-bold mb-2">Kancho Intelligence</h3>
              <p class="text-gray-400 text-sm mb-4">AI Business Intelligence</p>
              <div class="flex items-baseline justify-center gap-1">
                <span class="text-4xl font-bold text-kancho">$197</span>
                <span class="text-gray-400">/month</span>
              </div>
            </div>
            <ul class="space-y-3 mb-8">
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">AI Business Intelligence Officer</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Integrates with your existing CRM</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Real-time health score monitoring</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Churn risk detection & alerts</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Lead scoring & prioritization</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Revenue analytics & forecasting</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Voice AI business advisor</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">100 AI voice minutes included ($0.50 thereafter)</span>
              </li>
            </ul>
            <button onclick="selectPlan('intelligence', this)" class="w-full py-3 bg-white/10 hover:bg-kancho-coral/20 border border-kancho-dark-border hover:border-kancho-coral rounded-xl font-medium transition">
              Get Started
            </button>
          </div>

          <!-- Plan 2: Kancho Pro (Most Popular) -->
          <div class="card rounded-2xl p-8 relative border-kancho-coral/50 transform scale-105 shadow-xl shadow-kancho-coral/10">
            <div class="absolute -top-4 left-1/2 transform -translate-x-1/2">
              <span class="bg-kancho-coral px-4 py-1 rounded-full text-sm font-bold">MOST POPULAR</span>
            </div>
            <div class="text-center mb-6">
              <h3 class="text-xl font-bold mb-2">Kancho Pro</h3>
              <p class="text-gray-400 text-sm mb-4">Intelligence + AI Receptionist</p>
              <div class="flex items-baseline justify-center gap-1">
                <span class="text-4xl font-bold text-kancho">$397</span>
                <span class="text-gray-400">/month</span>
              </div>
            </div>
            <ul class="space-y-3 mb-8">
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm"><strong>Everything in Intelligence</strong></span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">24/7 AI Receptionist (Phone & SMS)</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Automated lead follow-up calls</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Retention outreach campaigns</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">No-show recovery calls</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Payment reminder automation</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Bilingual support (EN/ES)</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">500 AI voice minutes included ($0.45 thereafter)</span>
              </li>
            </ul>
            <button onclick="selectPlan('pro', this)" class="w-full py-3 kancho-btn rounded-xl font-medium transition shadow-lg">
              Get Started
            </button>
          </div>

          <!-- Plan 3: Kancho Enterprise -->
          <div class="card rounded-2xl p-8 relative hover:border-kancho-coral/50 transition-all duration-300">
            <div class="text-center mb-6">
              <h3 class="text-xl font-bold mb-2">Kancho Enterprise</h3>
              <p class="text-gray-400 text-sm mb-4">Multi-Tenant SaaS Solution</p>
              <div class="flex items-baseline justify-center gap-1">
                <span class="text-4xl font-bold text-kancho">Custom</span>
              </div>
            </div>
            <ul class="space-y-3 mb-8">
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm"><strong>Everything in Pro</strong></span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">White-label multi-tenant platform</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Multi-language support</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Custom integrations & API access</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Dedicated account manager</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Priority support & SLA</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Volume pricing for SaaS providers</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Unlimited AI voice minutes</span>
              </li>
            </ul>
            <button onclick="openBookingModal()" class="w-full py-3 bg-white/10 hover:bg-kancho-coral/20 border border-kancho-dark-border hover:border-kancho-coral rounded-xl font-medium transition">
              Schedule a Call
            </button>
          </div>

        </div>

        <p class="text-center text-gray-500 text-sm mt-8">All plans include a 14-day free trial. No credit card required to start.</p>

        <!-- Final CTA -->
        <div class="text-center mt-12">
          <button onclick="selectPlan('intelligence', this)" class="kancho-btn px-10 py-4 rounded-xl font-medium text-lg transition shadow-lg">
            <i class="fas fa-rocket mr-2"></i>Start Your Free Trial
          </button>
          <p class="text-gray-500 text-sm mt-4">No credit card required • Cancel anytime</p>
        </div>
      </div>

      <!-- Business Value Section -->
      <div class="mt-16 pt-16 border-t border-kancho-dark-border">
        <div class="text-center mb-12">
          <h2 class="text-3xl font-bold mb-4">Business Value to <span class="text-kancho">Your School</span></h2>
          <p class="text-gray-400 max-w-2xl mx-auto">Real metrics that drive real results. Here's how Kancho AI delivers measurable value to your martial arts school.</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          <!-- Health Score -->
          <div class="card rounded-2xl p-6">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 bg-kancho-coral/20 rounded-lg flex items-center justify-center">
                <i class="fas fa-heartbeat text-kancho"></i>
              </div>
              <h3 class="text-lg font-bold text-white">Business Health Score</h3>
            </div>
            <p class="text-gray-400 text-sm">Get a real-time 0-100 health score that combines retention, revenue, and lead metrics into one actionable number.</p>
          </div>

          <!-- Churn Detection -->
          <div class="card rounded-2xl p-6">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
                <i class="fas fa-user-minus text-red-400"></i>
              </div>
              <h3 class="text-lg font-bold text-white">Churn Rate Reduction</h3>
            </div>
            <p class="text-gray-400 text-sm">Identify at-risk students before they cancel. Schools using Kancho AI see up to 40% reduction in monthly churn.</p>
          </div>

          <!-- Revenue at Risk -->
          <div class="card rounded-2xl p-6">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center">
                <i class="fas fa-exclamation-triangle text-amber-400"></i>
              </div>
              <h3 class="text-lg font-bold text-white">Revenue at Risk Alerts</h3>
            </div>
            <p class="text-gray-400 text-sm">See exactly how much revenue is at risk from at-risk members. Take action before losing $4,000+ monthly.</p>
          </div>

          <!-- Lead Scoring -->
          <div class="card rounded-2xl p-6">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center">
                <i class="fas fa-fire text-orange-400"></i>
              </div>
              <h3 class="text-lg font-bold text-white">Hot Lead Prioritization</h3>
            </div>
            <p class="text-gray-400 text-sm">Know which leads are ready to convert with AI-powered lead scoring. Focus on high-value prospects first.</p>
          </div>

          <!-- ARPS Tracking -->
          <div class="card rounded-2xl p-6">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                <i class="fas fa-dollar-sign text-green-400"></i>
              </div>
              <h3 class="text-lg font-bold text-white">Average Revenue Per Student</h3>
            </div>
            <p class="text-gray-400 text-sm">Track ARPS to understand the true value of each member and optimize your pricing and upselling strategies.</p>
          </div>

          <!-- Trial Conversion -->
          <div class="card rounded-2xl p-6">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <i class="fas fa-user-plus text-blue-400"></i>
              </div>
              <h3 class="text-lg font-bold text-white">Trial Conversion Rate</h3>
            </div>
            <p class="text-gray-400 text-sm">Monitor how many trial students become paying members. Improve your conversion process with data-driven insights.</p>
          </div>
        </div>

        <!-- Stats Banner -->
        <div class="mt-12 bg-kancho-dark-card border border-kancho-dark-border rounded-2xl p-8">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <p class="text-3xl font-bold text-kancho">40%</p>
              <p class="text-gray-400 text-sm">Average Churn Reduction</p>
            </div>
            <div>
              <p class="text-3xl font-bold text-kancho">2x</p>
              <p class="text-gray-400 text-sm">Lead Conversion Rate</p>
            </div>
            <div>
              <p class="text-3xl font-bold text-kancho">$4,700</p>
              <p class="text-gray-400 text-sm">Avg. Revenue Saved Monthly</p>
            </div>
            <div>
              <p class="text-3xl font-bold text-kancho">24/7</p>
              <p class="text-gray-400 text-sm">AI Business Monitoring</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Hero CTA Section -->
      <div class="mt-20 pt-20 border-t border-kancho-dark-border text-center">
        <div class="mb-8">
          <p class="text-2xl font-bold mb-4" style="color: #E85A4F;">Powered by:</p>
          <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/68ec2cfb385c9833a43e685f.png" alt="Kancho AI" class="max-w-2xl w-full mx-auto mb-6">
        </div>
        <p class="text-kancho text-lg font-medium mb-2">AI Business Intelligence — Voice & Analytics Platform</p>
        <p class="text-gray-400 text-sm mb-8">Churn Detection · Lead Scoring · Revenue Analytics</p>

        <h2 class="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight max-w-5xl mx-auto mb-12" style="color: #5BA4D4;">
          An all-in-one AI system that finds businesses, calls them automatically, collects leads, and schedules appointments.
        </h2>

        <div class="flex flex-col sm:flex-row gap-4 justify-center mb-6">
          <button onclick="selectPlan('intelligence', this)" class="kancho-btn px-10 py-4 rounded-full font-medium text-lg transition shadow-lg">
            Start Free
          </button>
          <button onclick="openBookingModal()" class="px-10 py-4 rounded-full font-medium text-lg border-2 border-gray-600 hover:border-gray-400 transition">
            Schedule a Demo
          </button>
        </div>
        <p class="text-gray-500 text-sm">Absolutely free — no credit card, no hidden fees</p>
      </div>

      <!-- Booking Modal -->
      <div id="bookingModal" class="hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] items-center justify-center p-4 overflow-y-auto">
        <div class="bg-kancho-dark-card border border-kancho-dark-border rounded-3xl w-full max-w-3xl shadow-2xl my-4 mx-auto">
          <div class="p-6 border-b border-kancho-dark-border flex items-center justify-between sticky top-0 bg-kancho-dark-card z-10 rounded-t-3xl">
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden bg-kancho-coral/20">
                <img src="${KANCHO_LOGO_URL}" alt="Kancho" class="w-10 h-10 object-contain">
              </div>
              <div>
                <h3 class="text-lg font-bold">Schedule Onboarding</h3>
                <p class="text-sm text-gray-400">Book your personalized onboarding session</p>
              </div>
            </div>
            <button onclick="closeBookingModal()" class="p-2 hover:bg-white/10 rounded-lg transition">
              <i class="fas fa-times text-gray-400"></i>
            </button>
          </div>
          <div class="p-4">
            <iframe src="https://api.leadconnectorhq.com/widget/booking/nhKuDsn2At5csiDYc4d0" style="width: 100%; height: 800px; border: none;" scrolling="yes" id="nhKuDsn2At5csiDYc4d0_1770871834450"></iframe>
          </div>
        </div>
      </div>
      <script src="https://link.msgsndr.com/js/form_embed.js" type="text/javascript"></script>

      <!-- Trial Booking Modal -->
      <div id="trialBookingModal" class="hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] items-center justify-center p-4 overflow-y-auto">
        <div class="bg-kancho-dark-card border border-kancho-dark-border rounded-3xl w-full max-w-3xl shadow-2xl my-4 mx-auto">
          <div class="p-6 border-b border-kancho-dark-border flex items-center justify-between sticky top-0 bg-kancho-dark-card z-10 rounded-t-3xl">
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden bg-green-500/20">
                <i class="fas fa-calendar-check text-green-400 text-2xl"></i>
              </div>
              <div>
                <h3 class="text-lg font-bold text-white">Book Your Free Trial</h3>
                <p class="text-sm text-gray-400">Meet our KanchoAI Specialist</p>
              </div>
            </div>
            <button onclick="closeTrialBookingModal()" class="p-2 hover:bg-white/10 rounded-lg transition">
              <i class="fas fa-times text-gray-400"></i>
            </button>
          </div>
          <div class="p-4">
            <iframe src="https://api.leadconnectorhq.com/widget/booking/nhKuDsn2At5csiDYc4d0" style="width: 100%; height: 700px; border: none;" scrolling="yes"></iframe>
          </div>
        </div>
      </div>
    </div>

    <!-- Dashboard Section -->
    <div id="dashboardSection" class="hidden fade-in">
      <!-- Tab Navigation -->
      <div class="tab-nav mb-6" id="dashboardTabs">
        <button class="tab-btn active" onclick="switchTab('overview')"><i class="fas fa-chart-pie mr-1"></i><span class="hidden sm:inline">Overview</span><span class="sm:hidden">Home</span></button>
        <button class="tab-btn" onclick="switchTab('students')"><i class="fas fa-users mr-1"></i>Students</button>
        <button class="tab-btn" onclick="switchTab('leads')"><i class="fas fa-fire mr-1"></i>Leads</button>
        <button class="tab-btn" onclick="switchTab('calendar')"><i class="fas fa-calendar mr-1"></i>Calendar</button>
        <button class="tab-btn" onclick="switchTab('payments')"><i class="fas fa-dollar-sign mr-1"></i>Payments</button>
        <button class="tab-btn" onclick="switchTab('portalAccounts')"><i class="fas fa-user-shield mr-1"></i>Portal<span id="portalBadge" class="tab-badge" style="display:none"></span></button>
        <button class="tab-btn" onclick="switchTab('merchandise')"><i class="fas fa-store mr-1"></i>Merch</button>
        <button class="tab-btn" onclick="switchTab('belts')"><i class="fas fa-award mr-1"></i>Belts</button>
        <button class="tab-btn" onclick="switchTab('classes')"><i class="fas fa-chalkboard-teacher mr-1"></i>Classes</button>
      </div>

      <!-- Tab: Overview -->
      <div id="tabOverview" class="tab-content active">
      <div class="card rounded-2xl p-6 mb-8 border-kancho-coral/30" style="border-color: rgba(232, 90, 79, 0.3);">
        <div class="flex items-start gap-4">
          <img src="${KANCHO_LOGO_URL}" alt="Kancho" class="w-12 h-12 rounded-xl object-contain">
          <div>
            <p class="text-kancho font-medium mb-1">Kancho says:</p>
            <p id="kanchoMessage" class="text-lg text-gray-200">Analyzing your business data...</p>
          </div>
        </div>
      </div>

      <!-- Stats Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
        <div class="card rounded-2xl p-6 text-center relative">
          <a href="/kanchoai/metrics-guide" target="_blank" class="absolute top-4 right-4 text-gray-500 hover:text-kancho transition" title="Learn about metrics">
            <i class="fas fa-question-circle"></i>
          </a>
          <p class="text-xs text-gray-400 uppercase mb-4">Business Health</p>
          <div class="relative w-36 h-36 mx-auto mb-4">
            <svg class="w-36 h-36 transform -rotate-90">
              <circle cx="72" cy="72" r="60" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="10"/>
              <circle id="scoreRing" cx="72" cy="72" r="60" fill="none" stroke="url(#scoreGradient)" stroke-width="10" stroke-linecap="round" class="score-ring" style="--score: 0"/>
              <defs>
                <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="#F17A70"/>
                  <stop offset="100%" stop-color="#E85A4F"/>
                </linearGradient>
              </defs>
            </svg>
            <div class="absolute inset-0 flex items-center justify-center">
              <div>
                <span id="healthScore" class="text-4xl font-bold">--</span>
                <p class="text-xs text-gray-500">/ 100</p>
              </div>
            </div>
          </div>
          <span id="healthGrade" class="inline-block px-4 py-1.5 bg-kancho-coral/20 text-kancho rounded-full text-sm font-bold">Grade: --</span>
        </div>

        <div class="card card-danger rounded-2xl p-6">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
              <i class="fas fa-arrow-trend-down text-red-400"></i>
            </div>
            <p class="text-xs text-gray-400 uppercase">Revenue at Risk</p>
          </div>
          <p id="revenueAtRisk" class="text-3xl font-bold text-red-400">$--</p>
          <p id="atRiskStudents" class="text-sm text-gray-400 mt-1">-- students at risk</p>
        </div>

        <div class="card card-success rounded-2xl p-6">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
              <i class="fas fa-arrow-trend-up text-green-400"></i>
            </div>
            <p class="text-xs text-gray-400 uppercase">Growth Potential</p>
          </div>
          <p id="growthPotential" class="text-3xl font-bold text-green-400">$--</p>
          <p id="hotLeads" class="text-sm text-gray-400 mt-1">-- hot leads</p>
        </div>

        <div class="card rounded-2xl p-6">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <i class="fas fa-dollar-sign text-blue-400"></i>
            </div>
            <p class="text-xs text-gray-400 uppercase">Monthly Revenue</p>
          </div>
          <p id="monthlyRevenue" class="text-3xl font-bold text-white">$--</p>
          <p id="revenueProgress" class="text-sm text-gray-400 mt-1">--% of target</p>
        </div>
      </div>

      <!-- KPI Metrics Section -->
      <div class="mb-8">
        <h3 class="text-lg font-bold mb-4 flex items-center justify-between">
          <span class="flex items-center gap-2">
            <i class="fas fa-chart-line text-kancho"></i>
            Key Performance Indicators
          </span>
          <a href="/kanchoai/metrics-guide" target="_blank" class="text-sm text-gray-400 hover:text-kancho transition flex items-center gap-1 font-normal">
            <i class="fas fa-question-circle"></i>
            <span class="hidden sm:inline">What do these mean?</span>
          </a>
        </h3>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <!-- Active Students -->
          <div class="card rounded-xl p-4 text-center">
            <p class="text-xs text-gray-400 uppercase mb-2">Active Students</p>
            <p id="kpiActiveStudents" class="text-2xl font-bold text-white">--</p>
            <p id="kpiStudentGrowth" class="text-xs text-gray-400 mt-1">-- net growth</p>
          </div>
          <!-- Churn Rate -->
          <div class="card rounded-xl p-4 text-center">
            <p class="text-xs text-gray-400 uppercase mb-2">Churn Rate</p>
            <p id="kpiChurnRate" class="text-2xl font-bold text-amber-400">--%</p>
            <p class="text-xs text-gray-400 mt-1">this month</p>
          </div>
          <!-- ARPS -->
          <div class="card rounded-xl p-4 text-center">
            <p class="text-xs text-gray-400 uppercase mb-2">Avg Rev/Student</p>
            <p id="kpiARPS" class="text-2xl font-bold text-green-400">$--</p>
            <p class="text-xs text-gray-400 mt-1">ARPS</p>
          </div>
          <!-- Trial Conversion -->
          <div class="card rounded-xl p-4 text-center">
            <p class="text-xs text-gray-400 uppercase mb-2">Trial Conversion</p>
            <p id="kpiTrialConversion" class="text-2xl font-bold text-blue-400">--%</p>
            <p class="text-xs text-gray-400 mt-1">conversion rate</p>
          </div>
          <!-- Revenue vs Target -->
          <div class="card rounded-xl p-4 text-center">
            <p class="text-xs text-gray-400 uppercase mb-2">vs Target</p>
            <p id="kpiRevenueTarget" class="text-2xl font-bold text-kancho">--%</p>
            <p class="text-xs text-gray-400 mt-1">of monthly goal</p>
          </div>
        </div>
      </div>

      <!-- Today's Check-ins -->
      <div class="card rounded-2xl p-6 mb-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold flex items-center gap-2"><i class="fas fa-clipboard-check text-kancho"></i> Today's Check-ins</h3>
          <span id="todayCheckinCount" class="text-sm text-gray-400"></span>
        </div>
        <div id="todayCheckinsList" class="space-y-2">
          <p class="text-gray-500 text-sm">Loading...</p>
        </div>
      </div>

      <!-- Action Lists -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="card rounded-2xl p-6">
          <h3 class="text-lg font-bold mb-4 flex items-center gap-2">
            <i class="fas fa-user-minus text-red-400"></i>
            At-Risk Members
          </h3>
          <div id="atRiskList" class="space-y-3"></div>
        </div>

        <div class="card rounded-2xl p-6">
          <h3 class="text-lg font-bold mb-4 flex items-center gap-2">
            <i class="fas fa-fire text-green-400"></i>
            Hot Leads
          </h3>
          <div id="hotLeadsList" class="space-y-3"></div>
        </div>
      </div>
      </div><!-- /tabOverview -->

      <!-- Tab: Students -->
      <div id="tabStudents" class="tab-content">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold flex items-center gap-2"><i class="fas fa-users text-kancho"></i> Students</h2>
          <div class="flex gap-2">
            <button class="btn-checkin btn-sm" onclick="openAttendanceModal()"><i class="fas fa-clipboard-check mr-1"></i> Take Attendance</button>
            <button class="btn-primary btn-sm" onclick="openStudentForm()"><i class="fas fa-plus mr-1"></i> Add Student</button>
          </div>
        </div>
        <div class="filter-bar">
          <input type="text" id="studentSearch" placeholder="Search by name, email, phone..." oninput="debouncedSearchStudents()">
          <select id="studentStatusFilter" onchange="loadStudents()">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="frozen">Frozen</option>
            <option value="cancelled">Cancelled</option>
            <option value="prospect">Prospect</option>
          </select>
          <select id="studentChurnFilter" onchange="loadStudents()">
            <option value="">All Risk</option>
            <option value="low">Low Risk</option>
            <option value="medium">Medium Risk</option>
            <option value="high">High Risk</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div class="card rounded-2xl overflow-hidden">
          <div class="overflow-x-auto">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Belt</th>
                  <th>Status</th>
                  <th class="hidden md:table-cell">Churn Risk</th>
                  <th class="hidden lg:table-cell">Last Attendance</th>
                  <th class="hidden md:table-cell">Monthly Rate</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="studentsTableBody"></tbody>
            </table>
          </div>
          <div id="studentsPagination" class="pagination p-4"></div>
        </div>
        <p id="studentsEmpty" class="hidden text-center text-gray-500 py-12">No students found</p>
      </div>

      <!-- Tab: Leads -->
      <div id="tabLeads" class="tab-content">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold flex items-center gap-2"><i class="fas fa-fire text-kancho"></i> Leads</h2>
          <button class="btn-primary btn-sm" onclick="openLeadForm()"><i class="fas fa-plus mr-1"></i> Add Lead</button>
        </div>
        <div class="filter-bar">
          <input type="text" id="leadSearch" placeholder="Search by name, email, phone..." oninput="debouncedSearchLeads()">
          <select id="leadStatusFilter" onchange="loadLeads()">
            <option value="">All Status</option>
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="trial_scheduled">Trial Scheduled</option>
            <option value="trial_completed">Trial Completed</option>
            <option value="follow_up">Follow Up</option>
            <option value="converted">Converted</option>
            <option value="lost">Lost</option>
          </select>
          <select id="leadTempFilter" onchange="loadLeads()">
            <option value="">All Temperature</option>
            <option value="hot">Hot</option>
            <option value="warm">Warm</option>
            <option value="cold">Cold</option>
          </select>
        </div>
        <div class="card rounded-2xl overflow-hidden">
          <div class="overflow-x-auto">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th class="hidden md:table-cell">Temperature</th>
                  <th class="hidden lg:table-cell">Score</th>
                  <th class="hidden md:table-cell">Follow-up</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="leadsTableBody"></tbody>
            </table>
          </div>
          <div id="leadsPagination" class="pagination p-4"></div>
        </div>
        <p id="leadsEmpty" class="hidden text-center text-gray-500 py-12">No leads found</p>
      </div>

      <!-- Tab: Calendar -->
      <div id="tabCalendar" class="tab-content">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold flex items-center gap-2"><i class="fas fa-calendar text-kancho"></i> Calendar</h2>
          <button class="btn-primary btn-sm" onclick="openAppointmentForm()"><i class="fas fa-plus mr-1"></i> Add Appointment</button>
        </div>
        <div class="card rounded-2xl p-6 mb-4">
          <div class="flex items-center justify-between mb-4">
            <button class="btn-ghost" onclick="prevMonth()"><i class="fas fa-chevron-left"></i></button>
            <h3 id="calendarMonthLabel" class="text-lg font-bold">--</h3>
            <button class="btn-ghost" onclick="nextMonth()"><i class="fas fa-chevron-right"></i></button>
          </div>
          <div class="calendar-grid">
            <div class="calendar-header-cell">Sun</div>
            <div class="calendar-header-cell">Mon</div>
            <div class="calendar-header-cell">Tue</div>
            <div class="calendar-header-cell">Wed</div>
            <div class="calendar-header-cell">Thu</div>
            <div class="calendar-header-cell">Fri</div>
            <div class="calendar-header-cell">Sat</div>
          </div>
          <div id="calendarDays" class="calendar-grid mt-1"></div>
        </div>
        <div id="calendarDayDetail" class="hidden">
          <div class="card rounded-2xl p-6">
            <h3 id="calendarDayLabel" class="text-lg font-bold mb-4"></h3>
            <div id="calendarDayAppointments" class="space-y-3"></div>
            <p id="calendarDayEmpty" class="hidden text-gray-500 text-center py-4">No appointments on this day</p>
          </div>
        </div>
      </div>

      <!-- Tab: Payments -->
      <div id="tabPayments" class="tab-content">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold flex items-center gap-2"><i class="fas fa-dollar-sign text-kancho"></i> Revenue & Payments</h2>
          <button class="btn-primary btn-sm" onclick="openPaymentForm()"><i class="fas fa-plus mr-1"></i> Record Payment</button>
        </div>
        <!-- Summary Cards -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div class="summary-card">
            <div class="label">Total Revenue</div>
            <div id="payTotalRevenue" class="value text-white">$--</div>
          </div>
          <div class="summary-card">
            <div class="label">Recurring</div>
            <div id="payRecurring" class="value text-green-400">$--</div>
          </div>
          <div class="summary-card">
            <div class="label">Avg / Student</div>
            <div id="payAvgStudent" class="value text-blue-400">$--</div>
          </div>
          <div class="summary-card">
            <div class="label">Active Students</div>
            <div id="payActiveStudents" class="value text-kancho">--</div>
          </div>
        </div>
        <div class="filter-bar">
          <select id="payTypeFilter" onchange="loadPayments()">
            <option value="">All Types</option>
            <option value="membership">Membership</option>
            <option value="retail">Retail</option>
            <option value="event">Event</option>
            <option value="private_lesson">Private Lesson</option>
            <option value="testing_fee">Testing Fee</option>
            <option value="other">Other</option>
          </select>
          <input type="date" id="payDateFrom" onchange="loadPayments()" style="color-scheme: dark;">
          <input type="date" id="payDateTo" onchange="loadPayments()" style="color-scheme: dark;">
        </div>
        <div class="card rounded-2xl overflow-hidden">
          <div class="overflow-x-auto">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th class="hidden md:table-cell">Student</th>
                  <th class="hidden lg:table-cell">Method</th>
                  <th class="hidden md:table-cell">Description</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="paymentsTableBody"></tbody>
            </table>
          </div>
          <div id="paymentsPagination" class="pagination p-4"></div>
        </div>
        <p id="paymentsEmpty" class="hidden text-center text-gray-500 py-12">No payments found</p>
      </div>

      <!-- Tab: Portal Accounts -->
      <div id="tabPortalAccounts" class="tab-content">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold flex items-center gap-2"><i class="fas fa-user-shield text-kancho"></i> Student Portal Accounts</h2>
          <select id="portalStatusFilter" onchange="loadPortalAccounts()" class="bg-gray-800 text-white border border-gray-600 rounded px-3 py-1.5 text-sm">
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
        <div class="card rounded-2xl overflow-hidden">
          <div class="overflow-x-auto">
            <table class="data-table">
              <thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Linked Student</th><th>Registered</th><th>Actions</th></tr></thead>
              <tbody id="portalAccountsBody"></tbody>
            </table>
          </div>
        </div>
        <p id="portalAccountsEmpty" class="hidden text-center text-gray-500 py-12">No portal accounts found</p>
      </div>

      <!-- Tab: Merchandise -->
      <div id="tabMerchandise" class="tab-content">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold flex items-center gap-2"><i class="fas fa-store text-kancho"></i> Merchandise</h2>
          <button class="btn-primary btn-sm" onclick="openMerchForm()"><i class="fas fa-plus mr-1"></i> Add Item</button>
        </div>
        <div class="card rounded-2xl overflow-hidden">
          <div class="overflow-x-auto">
            <table class="data-table">
              <thead><tr><th>Name</th><th>Category</th><th>Price</th><th>Sizes</th><th>In Stock</th><th>Actions</th></tr></thead>
              <tbody id="merchTableBody"></tbody>
            </table>
          </div>
        </div>
        <p id="merchEmpty" class="hidden text-center text-gray-500 py-12">No merchandise items. Click "Add Item" to start.</p>
      </div>

      <!-- Tab: Belt Requirements -->
      <div id="tabBelts" class="tab-content">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold flex items-center gap-2"><i class="fas fa-award text-kancho"></i> Belt Requirements</h2>
          <div class="flex gap-2">
            <button class="btn-primary btn-sm" onclick="openBeltForm()"><i class="fas fa-plus mr-1"></i> Add Belt</button>
            <button class="btn-ghost btn-sm" onclick="seedBeltDefaults()"><i class="fas fa-magic mr-1"></i> Seed Defaults</button>
          </div>
        </div>
        <div id="beltLadder" class="space-y-3"></div>
        <p id="beltsEmpty" class="hidden text-center text-gray-500 py-12">No belt requirements configured. Click "Seed Defaults" for a standard hierarchy.</p>
      </div>

      <!-- Tab: Classes -->
      <div id="tabClasses" class="tab-content">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold flex items-center gap-2"><i class="fas fa-chalkboard-teacher text-kancho"></i> Class Schedule</h2>
          <button class="btn-primary btn-sm" onclick="openClassForm()"><i class="fas fa-plus mr-1"></i> Add Class</button>
        </div>
        <div class="card rounded-2xl overflow-hidden">
          <div class="overflow-x-auto">
            <table class="data-table">
              <thead><tr><th>Name</th><th>Martial Art</th><th>Level</th><th>Instructor</th><th>Schedule</th><th>Capacity</th><th>Active</th><th>Actions</th></tr></thead>
              <tbody id="classesAdminTableBody"></tbody>
            </table>
          </div>
        </div>
        <p id="classesAdminEmpty" class="hidden text-center text-gray-500 py-12">No classes configured. Click "Add Class" to start.</p>
      </div>

    </div><!-- /dashboardSection -->

    <!-- Student Detail Slide Panel -->
    <div id="studentPanelOverlay" class="slide-panel-overlay" onclick="closeStudentDetail()"></div>
    <div id="studentDetailPanel" class="slide-panel">
      <div class="slide-panel-header">
        <h3 class="text-lg font-bold">Student Profile</h3>
        <div class="flex gap-2">
          <button class="btn-ghost" onclick="editStudentFromPanel()"><i class="fas fa-edit mr-1"></i> Edit</button>
          <button class="btn-ghost" onclick="closeStudentDetail()"><i class="fas fa-times"></i></button>
        </div>
      </div>
      <div id="studentDetailBody" class="slide-panel-body"></div>
    </div>

    <!-- Lead Detail Slide Panel -->
    <div id="leadPanelOverlay" class="slide-panel-overlay" onclick="closeLeadDetail()"></div>
    <div id="leadDetailPanel" class="slide-panel">
      <div class="slide-panel-header">
        <h3 class="text-lg font-bold">Lead Profile</h3>
        <div class="flex gap-2">
          <button class="btn-ghost" onclick="convertLeadFromPanel()"><i class="fas fa-user-plus mr-1"></i> Convert</button>
          <button class="btn-ghost" onclick="editLeadFromPanel()"><i class="fas fa-edit mr-1"></i> Edit</button>
          <button class="btn-ghost" onclick="closeLeadDetail()"><i class="fas fa-times"></i></button>
        </div>
      </div>
      <div id="leadDetailBody" class="slide-panel-body"></div>
    </div>

    <!-- Attendance Check-In Modal -->
    <div id="attendanceCheckInModal" class="form-modal" onclick="if(event.target===this)closeAttendanceModal()">
      <div class="form-modal-content" style="max-width:600px;">
        <h3><i class="fas fa-clipboard-check text-kancho mr-2"></i> Take Attendance</h3>
        <div class="form-row">
          <div class="form-group">
            <label>Class</label>
            <select id="attendanceClassSelect" onchange="loadClassRoster()">
              <option value="">-- All Students (No Class) --</option>
            </select>
          </div>
          <div class="form-group">
            <label>Date</label>
            <input type="date" id="attendanceDate" style="color-scheme:dark;" onchange="loadClassRoster()">
          </div>
        </div>
        <div class="checkin-actions">
          <button type="button" class="btn-ghost btn-sm" onclick="toggleAllStudents(true)"><i class="fas fa-check-double mr-1"></i> Select All</button>
          <button type="button" class="btn-ghost btn-sm" onclick="toggleAllStudents(false)"><i class="fas fa-times mr-1"></i> Deselect All</button>
          <span id="checkinCount" style="margin-left:auto;font-size:12px;color:#6B7280;">0 selected</span>
        </div>
        <div id="attendanceRoster" style="max-height:360px;overflow-y:auto;">
          <div class="roster-loading">Select a class or click Load to see students</div>
        </div>
        <div class="flex gap-3 mt-4">
          <button type="button" class="btn-checkin flex-1" onclick="saveBulkAttendance()"><i class="fas fa-save mr-1"></i> Save Attendance</button>
          <button type="button" class="btn-ghost flex-1" onclick="closeAttendanceModal()">Cancel</button>
        </div>
      </div>
    </div>

    <!-- Student Form Modal -->
    <div id="studentFormModal" class="form-modal" onclick="if(event.target===this)closeStudentForm()">
      <div class="form-modal-content">
        <h3 id="studentFormTitle">Add Student</h3>
        <form onsubmit="saveStudent(event)">
          <input type="hidden" id="studentFormId">
          <div class="form-row">
            <div class="form-group"><label>First Name *</label><input type="text" id="sfFirstName" required></div>
            <div class="form-group"><label>Last Name *</label><input type="text" id="sfLastName" required></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Email</label><input type="email" id="sfEmail"></div>
            <div class="form-group"><label>Phone</label><input type="tel" id="sfPhone"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Belt Rank</label><input type="text" id="sfBelt" placeholder="e.g. White, Yellow, Blue"></div>
            <div class="form-group">
              <label>Membership Type</label>
              <select id="sfMembership">
                <option value="Unlimited">Unlimited</option>
                <option value="2x/week">2x/week</option>
                <option value="3x/week">3x/week</option>
                <option value="Drop-in">Drop-in</option>
                <option value="Family">Family</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Monthly Rate ($)</label><input type="number" id="sfRate" step="0.01" min="0"></div>
            <div class="form-group">
              <label>Status</label>
              <select id="sfStatus">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="frozen">Frozen</option>
                <option value="prospect">Prospect</option>
              </select>
            </div>
          </div>
          <div class="form-group"><label>Notes</label><textarea id="sfNotes" rows="3"></textarea></div>
          <div class="flex gap-3 mt-4">
            <button type="submit" class="btn-primary flex-1">Save Student</button>
            <button type="button" class="btn-ghost flex-1" onclick="closeStudentForm()">Cancel</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Lead Form Modal -->
    <div id="leadFormModal" class="form-modal" onclick="if(event.target===this)closeLeadForm()">
      <div class="form-modal-content">
        <h3 id="leadFormTitle">Add Lead</h3>
        <form onsubmit="saveLead(event)">
          <input type="hidden" id="leadFormId">
          <div class="form-row">
            <div class="form-group"><label>First Name *</label><input type="text" id="lfFirstName" required></div>
            <div class="form-group"><label>Last Name</label><input type="text" id="lfLastName"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Email</label><input type="email" id="lfEmail"></div>
            <div class="form-group"><label>Phone</label><input type="tel" id="lfPhone"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Source</label><input type="text" id="lfSource" placeholder="e.g. Website, Referral, Walk-in"></div>
            <div class="form-group"><label>Interest</label><input type="text" id="lfInterest" placeholder="e.g. Kids Karate, Adult BJJ"></div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Status</label>
              <select id="lfStatus">
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="trial_scheduled">Trial Scheduled</option>
                <option value="trial_completed">Trial Completed</option>
                <option value="follow_up">Follow Up</option>
              </select>
            </div>
            <div class="form-group">
              <label>Temperature</label>
              <select id="lfTemp">
                <option value="warm">Warm</option>
                <option value="hot">Hot</option>
                <option value="cold">Cold</option>
              </select>
            </div>
          </div>
          <div class="form-group"><label>Notes</label><textarea id="lfNotes" rows="3"></textarea></div>
          <div class="flex gap-3 mt-4">
            <button type="submit" class="btn-primary flex-1">Save Lead</button>
            <button type="button" class="btn-ghost flex-1" onclick="closeLeadForm()">Cancel</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Appointment Form Modal -->
    <div id="appointmentFormModal" class="form-modal" onclick="if(event.target===this)closeAppointmentForm()">
      <div class="form-modal-content">
        <h3 id="afTitle">New Appointment</h3>
        <input type="hidden" id="afId" value="">
        <form onsubmit="saveAppointment(event)">
          <div class="form-row">
            <div class="form-group"><label>Customer Name *</label><input type="text" id="afName" required></div>
            <div class="form-group"><label>Phone *</label><input type="tel" id="afPhone" required></div>
          </div>
          <div class="form-group"><label>Email</label><input type="email" id="afEmail"></div>
          <div class="form-row">
            <div class="form-group"><label>Date *</label><input type="date" id="afDate" required style="color-scheme: dark;"></div>
            <div class="form-group"><label>Time *</label><input type="time" id="afTime" required style="color-scheme: dark;"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Duration (min)</label><input type="number" id="afDuration" value="60" min="15" step="15"></div>
            <div class="form-group">
              <label>Purpose</label>
              <select id="afPurpose">
                <option value="Class trial">Class Trial</option>
                <option value="Introductory lesson">Introductory Lesson</option>
                <option value="Belt testing">Belt Testing</option>
                <option value="Private lesson">Private Lesson</option>
                <option value="Meeting">Meeting</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>
          <div class="flex gap-3 mt-4">
            <button type="submit" class="btn-primary flex-1" id="afSubmitBtn">Book Appointment</button>
            <button type="button" class="btn-ghost flex-1" onclick="closeAppointmentForm()">Cancel</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Payment Form Modal -->
    <div id="paymentFormModal" class="form-modal" onclick="if(event.target===this)closePaymentForm()">
      <div class="form-modal-content">
        <h3>Record Payment</h3>
        <form onsubmit="savePayment(event)">
          <div class="form-row">
            <div class="form-group">
              <label>Type *</label>
              <select id="pfType" required>
                <option value="membership">Membership</option>
                <option value="retail">Retail</option>
                <option value="event">Event</option>
                <option value="private_lesson">Private Lesson</option>
                <option value="testing_fee">Testing Fee</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div class="form-group"><label>Amount ($) *</label><input type="number" id="pfAmount" step="0.01" min="0" required></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Date *</label><input type="date" id="pfDate" required style="color-scheme: dark;"></div>
            <div class="form-group">
              <label>Student</label>
              <select id="pfStudent"><option value="">-- No student --</option></select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Payment Method</label>
              <select id="pfMethod">
                <option value="credit_card">Credit Card</option>
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="check">Check</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div class="form-group" style="display:flex;align-items:flex-end;gap:8px;padding-bottom:0;">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin:0;">
                <input type="checkbox" id="pfRecurring" style="width:auto;accent-color:#E85A4F;">
                Recurring
              </label>
            </div>
          </div>
          <div class="form-group"><label>Description</label><input type="text" id="pfDescription" placeholder="Optional description"></div>
          <div class="flex gap-3 mt-4">
            <button type="submit" class="btn-primary flex-1">Save Payment</button>
            <button type="button" class="btn-ghost flex-1" onclick="closePaymentForm()">Cancel</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Signup Modal -->
    <div id="signupModal" class="signup-overlay hidden" onclick="if(event.target===this)closeSignupModal()">
      <div class="signup-modal">
        <button class="close-btn" onclick="closeSignupModal()">&times;</button>
        <h2>Start Your Free Trial</h2>
        <span id="signupPlanTag" class="plan-tag">Kancho Intelligence</span>
        <form id="signupForm" onsubmit="handleSignup(event)">
          <input type="hidden" id="signupPlan" value="intelligence">
          <div class="signup-row">
            <div>
              <label>First Name *</label>
              <input type="text" id="signupFirstName" class="login-input" placeholder="John" required>
            </div>
            <div>
              <label>Last Name *</label>
              <input type="text" id="signupLastName" class="login-input" placeholder="Smith" required>
            </div>
          </div>
          <label>Email *</label>
          <input type="email" id="signupEmail" class="login-input" placeholder="you@yourschool.com" required>
          <label>Password *</label>
          <input type="password" id="signupPassword" class="login-input" placeholder="Min 8 characters" minlength="8" required>
          <label>Phone *</label>
          <input type="tel" id="signupPhone" class="login-input" placeholder="+1 (555) 123-4567" required>
          <label>School / Business Name *</label>
          <input type="text" id="signupSchoolName" class="login-input" placeholder="Your Academy Name" required>
          <label>Martial Art Type</label>
          <select id="signupMartialArt" class="login-input" style="appearance:auto;">
            <option value="BJJ">BJJ</option>
            <option value="Karate">Karate</option>
            <option value="Taekwondo">Taekwondo</option>
            <option value="MMA">MMA</option>
            <option value="Judo">Judo</option>
            <option value="Muay Thai">Muay Thai</option>
            <option value="Kung Fu">Kung Fu</option>
            <option value="Other">Other</option>
          </select>
          <div class="signup-row" style="margin-top:16px;">
            <div>
              <label>City</label>
              <input type="text" id="signupCity" class="login-input" placeholder="City">
            </div>
            <div>
              <label>State</label>
              <input type="text" id="signupState" class="login-input" placeholder="State">
            </div>
          </div>
          <div id="signupError" class="text-red-400 text-sm mt-3 hidden"></div>
          <button type="submit" id="signupSubmitBtn" class="w-full py-3 kancho-btn rounded-xl font-semibold transition shadow-lg mt-6">
            Continue to Checkout
          </button>
          <p class="trial-note"><strong>14-day free trial</strong> — no charge until trial ends. Cancel anytime.</p>
        </form>
      </div>
    </div>

  </main>

  <!-- Footer -->
  <footer class="border-t border-kancho-dark-border bg-kancho-dark/95 mt-12 md:mt-20">
    <div class="max-w-7xl mx-auto px-4 md:px-6 py-10 md:py-16">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12 mobile-footer-grid">
        <!-- Brand -->
        <div class="col-span-2 md:col-span-1">
          <div class="flex items-center gap-3 mb-4 justify-center md:justify-start">
            <img src="${KANCHO_LOGO_URL}" alt="Kancho AI" class="w-10 h-10 rounded-lg object-contain">
            <span class="text-xl font-bold">KANCHO AI</span>
          </div>
          <p class="text-gray-400 text-sm mb-4">AI Business Intelligence Officer for martial arts schools and fitness businesses.</p>
          <p class="text-gray-500 text-xs">Powered by RinglyPro</p>
        </div>

        <!-- Product -->
        <div>
          <h4 class="font-semibold mb-3 md:mb-4 text-white text-sm md:text-base">Product</h4>
          <ul class="space-y-2 text-xs md:text-sm">
            <li><a href="/kanchoai/features" class="text-gray-400 hover:text-kancho transition">Features</a></li>
            <li><a href="/kanchoai/pricing" class="text-gray-400 hover:text-kancho transition">Pricing</a></li>
            <li><a href="/kanchoai/integrations" class="text-gray-400 hover:text-kancho transition">Integrations</a></li>
            <li><a href="/kanchoai/metrics-guide" class="text-gray-400 hover:text-kancho transition">Dashboard Guide</a></li>
          </ul>
        </div>

        <!-- Company -->
        <div>
          <h4 class="font-semibold mb-3 md:mb-4 text-white text-sm md:text-base">Company</h4>
          <ul class="space-y-2 text-xs md:text-sm">
            <li><a href="/kanchoai/about" class="text-gray-400 hover:text-kancho transition">About Us</a></li>
            <li><a href="/kanchoai/contact" class="text-gray-400 hover:text-kancho transition">Contact</a></li>
          </ul>
        </div>

        <!-- Legal -->
        <div class="col-span-2 md:col-span-1">
          <h4 class="font-semibold mb-3 md:mb-4 text-white text-sm md:text-base">Legal</h4>
          <ul class="space-y-2 text-xs md:text-sm">
            <li><a href="/kanchoai/privacy" class="text-gray-400 hover:text-kancho transition">Privacy Policy</a></li>
            <li><a href="/kanchoai/terms" class="text-gray-400 hover:text-kancho transition">Terms of Service</a></li>
            <li><a href="mailto:support@ringlypro.com" class="text-gray-400 hover:text-kancho transition">support@ringlypro.com</a></li>
          </ul>
        </div>
      </div>

      <!-- Bottom Bar -->
      <div class="border-t border-kancho-dark-border mt-12 pt-8 text-center">
        <p class="text-gray-500 text-sm">&copy; ${new Date().getFullYear()} Kancho AI. All rights reserved.</p>
      </div>
    </div>
  </footer>

  <!-- Language Toggle -->
  <div class="fixed bottom-4 left-4 md:left-4 flex gap-2 language-toggle z-50">
    <a href="/kanchoai" class="px-4 py-2 bg-kancho-coral/20 border border-kancho-dark-border rounded-lg text-sm transition font-medium">EN</a>
    <a href="/kanchoai/es" class="px-4 py-2 bg-kancho-dark-card border border-kancho-dark-border rounded-lg text-sm hover:bg-kancho-coral/20 transition">ES</a>
  </div>

  <!-- Voice Chat Modal - ElevenLabs Widget Auto-Start -->
  <div id="voiceModal" class="hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] items-center justify-center p-4">
    <div class="bg-kancho-dark-card border border-kancho-dark-border rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
      <!-- Modal Header -->
      <div class="p-6 border-b border-kancho-dark-border flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden bg-kancho-coral/20">
            <img src="${KANCHO_LOGO_URL}" alt="Kancho" class="w-10 h-10 object-contain">
          </div>
          <div>
            <h3 class="text-lg font-bold">Talk to Kancho</h3>
            <p id="voiceStatus" class="text-sm text-gray-400">Starting conversation...</p>
          </div>
        </div>
        <button onclick="closeVoiceModal()" class="p-2 hover:bg-white/10 rounded-lg transition">
          <i class="fas fa-times text-gray-400"></i>
        </button>
      </div>

      <!-- ElevenLabs Widget Container -->
      <div class="p-8 flex flex-col items-center justify-center min-h-[300px]">
        <div id="voiceWidgetContainer" class="mb-4">
          <!-- Widget inserted here by JS and auto-started -->
        </div>

        <p id="widgetSchoolName" class="text-lg font-medium text-white mb-2"></p>
        <p class="text-sm text-gray-400 text-center">
          Click the orb to talk to Kancho.<br>
          Ask about revenue, members, leads, and more.
        </p>
      </div>

      <!-- Close Button -->
      <div class="p-4 border-t border-kancho-dark-border">
        <button onclick="closeVoiceModal()" class="w-full py-3 bg-white/10 hover:bg-white/20 rounded-xl font-medium transition">
          End Conversation
        </button>
      </div>
    </div>
  </div>

  <!-- ElevenLabs Widget SDK -->
  <script src="https://elevenlabs.io/convai-widget/index.js" async type="text/javascript"></script>

  <style>
    /* Style ElevenLabs widget in modal - center it */
    #voiceWidgetContainer {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 120px;
    }
    #voiceWidgetContainer elevenlabs-convai {
      position: relative !important;
      bottom: auto !important;
      right: auto !important;
    }
    /* Hide the powered-by branding */
    elevenlabs-convai::part(powered-by) {
      display: none !important;
    }
    /* Hide the default ElevenLabs widget that auto-renders in bottom-right */
    body > elevenlabs-convai {
      display: none !important;
    }
  </style>

  <script>
    let currentSchoolId = null;
    let currentSchoolData = null;
    let currentLanguage = 'en';

    // Auth state
    let authToken = null;
    let authUser = null;
    let authSchool = null;
    let authClient = null;
    let isAuthenticated = false;
    const AUTH_TOKEN_KEY = 'kancho_token';
    const API_BASE = '/kanchoai/api/v1';

    // ==================== AUTH FUNCTIONS ====================

    async function checkAuth() {
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (!token) return false;
      try {
        const res = await fetch(API_BASE + '/bridge/auth/me', {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!res.ok) { localStorage.removeItem(AUTH_TOKEN_KEY); return false; }
        const result = await res.json();
        if (!result.success) { localStorage.removeItem(AUTH_TOKEN_KEY); return false; }
        authToken = token;
        authUser = result.data.user;
        authSchool = result.data.school;
        authClient = result.data.client;
        isAuthenticated = true;
        return true;
      } catch (e) {
        console.error('[Auth] Token validation failed:', e);
        localStorage.removeItem(AUTH_TOKEN_KEY);
        return false;
      }
    }

    async function handleLogin(event) {
      event.preventDefault();
      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;
      const errorEl = document.getElementById('loginError');
      const btn = document.getElementById('loginBtn');
      const btnText = document.getElementById('loginBtnText');
      errorEl.classList.add('hidden');
      btn.disabled = true;
      btnText.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Signing in...';
      try {
        const res = await fetch(API_BASE + '/bridge/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!data.success) {
          errorEl.textContent = data.error || 'Login failed';
          errorEl.classList.remove('hidden');
          btn.disabled = false;
          btnText.textContent = 'Sign In';
          return;
        }
        localStorage.setItem(AUTH_TOKEN_KEY, data.token);
        authToken = data.token;
        authUser = data.data.user;
        authSchool = data.data.school;
        authClient = data.data.client;
        isAuthenticated = true;
        enterAuthenticatedMode();
      } catch (e) {
        console.error('[Auth] Login error:', e);
        errorEl.textContent = 'Connection error. Please try again.';
        errorEl.classList.remove('hidden');
        btn.disabled = false;
        btnText.textContent = 'Sign In';
      }
    }

    async function enterAuthenticatedMode() {
      document.getElementById('headerUnauth').classList.add('hidden');
      document.getElementById('headerAuth').classList.remove('hidden');
      document.getElementById('headerSchoolName').textContent = authSchool?.name || '';
      document.getElementById('headerUserEmail').textContent = authUser?.email || '';
      const planBadge = document.getElementById('headerPlanBadge');
      const planLabels = { free: 'Free', starter: 'Starter', growth: 'Intelligence', professional: 'Pro', pro: 'Pro' };
      planBadge.textContent = planLabels[authSchool?.planType] || planLabels[authUser?.plan] || 'Trial';
      document.getElementById('loginSection').classList.add('hidden');
      document.getElementById('signupSuccessSection').classList.add('hidden');
      document.getElementById('welcomeSection').classList.add('hidden');
      document.getElementById('dashboardSection').classList.remove('hidden');
      currentSchoolId = authSchool?.id;
      if (currentSchoolId) await loadDashboard(currentSchoolId);
    }

    function logout() {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      authToken = null; authUser = null; authSchool = null; authClient = null;
      isAuthenticated = false; currentSchoolId = null; currentSchoolData = null;
      window.location.href = window.location.pathname;
    }

    const allSections = ['welcomeSection','loginSection','forgotPasswordSection','resetPasswordSection','signupSuccessSection','dashboardSection'];
    function hideAllSections() { allSections.forEach(id => document.getElementById(id)?.classList.add('hidden')); }

    function showLoginSection() {
      hideAllSections();
      document.getElementById('loginSection').classList.remove('hidden');
      setTimeout(() => document.getElementById('loginEmail')?.focus(), 100);
    }

    function showLandingPage() {
      hideAllSections();
      document.getElementById('welcomeSection').classList.remove('hidden');
    }

    function showForgotPassword() {
      hideAllSections();
      document.getElementById('forgotPasswordSection').classList.remove('hidden');
      document.getElementById('forgotError').classList.add('hidden');
      document.getElementById('forgotSuccess').classList.add('hidden');
      document.getElementById('forgotBtn').disabled = false;
      document.getElementById('forgotBtn').textContent = 'Send Reset Link';
      setTimeout(() => document.getElementById('forgotEmail')?.focus(), 100);
    }

    function showResetPassword(email) {
      hideAllSections();
      document.getElementById('resetPasswordSection').classList.remove('hidden');
      document.getElementById('resetEmailDisplay').textContent = email ? 'Reset password for ' + email : '';
      document.getElementById('resetError').classList.add('hidden');
      document.getElementById('resetSuccess').classList.add('hidden');
      document.getElementById('resetBtn').classList.remove('hidden');
      document.getElementById('resetBtn').disabled = false;
      document.getElementById('resetBtn').textContent = 'Reset Password';
      document.getElementById('resetPasswordForm').reset();
      setTimeout(() => document.getElementById('resetNewPassword')?.focus(), 100);
    }

    async function handleForgotPassword(event) {
      event.preventDefault();
      const btn = document.getElementById('forgotBtn');
      const errorEl = document.getElementById('forgotError');
      const successEl = document.getElementById('forgotSuccess');
      errorEl.classList.add('hidden');
      successEl.classList.add('hidden');

      const email = document.getElementById('forgotEmail').value.trim();
      try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Sending...';

        const res = await fetch(API_BASE + '/bridge/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await res.json();

        if (data.success) {
          successEl.innerHTML = '<i class="fas fa-envelope mr-2"></i>Reset link sent! Check your email inbox (and spam folder).';
          successEl.classList.remove('hidden');
          btn.classList.add('hidden');
        } else {
          errorEl.textContent = data.error || 'Failed to send reset link.';
          errorEl.classList.remove('hidden');
          btn.disabled = false;
          btn.textContent = 'Send Reset Link';
        }
      } catch (err) {
        errorEl.textContent = 'Connection error. Please try again.';
        errorEl.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = 'Send Reset Link';
      }
    }

    async function handleResetPassword(event) {
      event.preventDefault();
      const btn = document.getElementById('resetBtn');
      const errorEl = document.getElementById('resetError');
      errorEl.classList.add('hidden');

      const newPassword = document.getElementById('resetNewPassword').value;
      const confirmPassword = document.getElementById('resetConfirmPassword').value;

      if (newPassword !== confirmPassword) {
        errorEl.textContent = 'Passwords do not match.';
        errorEl.classList.remove('hidden');
        return;
      }
      if (newPassword.length < 8) {
        errorEl.textContent = 'Password must be at least 8 characters.';
        errorEl.classList.remove('hidden');
        return;
      }

      try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Resetting...';

        const res = await fetch(API_BASE + '/bridge/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: window._resetToken, newPassword })
        });
        const data = await res.json();

        if (data.success) {
          btn.classList.add('hidden');
          document.getElementById('resetSuccess').classList.remove('hidden');
          window._resetToken = null;
        } else {
          errorEl.textContent = data.error || 'Failed to reset password.';
          errorEl.classList.remove('hidden');
          btn.disabled = false;
          btn.textContent = 'Reset Password';
        }
      } catch (err) {
        errorEl.textContent = 'Connection error. Please try again.';
        errorEl.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = 'Reset Password';
      }
    }

    async function checkResetToken() {
      const urlParams = new URLSearchParams(window.location.search);
      const resetToken = urlParams.get('reset_token');
      if (!resetToken) return false;

      window.history.replaceState({}, document.title, window.location.pathname);
      window._resetToken = resetToken;

      try {
        const res = await fetch(API_BASE + '/bridge/auth/verify-reset-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: resetToken })
        });
        const data = await res.json();

        if (data.success) {
          showResetPassword(data.email);
        } else {
          hideAllSections();
          document.getElementById('resetPasswordSection').classList.remove('hidden');
          document.getElementById('resetError').textContent = data.error || 'This reset link is invalid or has expired.';
          document.getElementById('resetError').classList.remove('hidden');
          document.getElementById('resetBtn').classList.add('hidden');
          document.getElementById('resetEmailDisplay').textContent = '';
        }
      } catch (err) {
        showLoginSection();
      }
      return true;
    }

    async function checkSignupSuccess() {
      const urlParams = new URLSearchParams(window.location.search);
      const sessionId = urlParams.get('session_id');
      if (!sessionId) return false;
      hideAllSections();
      document.getElementById('signupSuccessSection').classList.remove('hidden');
      window.history.replaceState({}, document.title, window.location.pathname);
      const steps = [
        { key: 'starting', label: 'Processing payment...' },
        { key: 'creating_user', label: 'Creating your account...' },
        { key: 'provisioning_twilio', label: 'Setting up your AI phone number...' },
        { key: 'creating_client', label: 'Configuring your business profile...' },
        { key: 'creating_school', label: 'Building your school dashboard...' },
        { key: 'creating_voice_agent', label: 'Training your AI voice agent...' },
        { key: 'updating_stripe', label: 'Finalizing subscription...' },
        { key: 'done', label: 'All set!' }
      ];
      renderProvisionSteps(steps, null);
      let attempts = 0;
      const maxAttempts = 90;
      const pollInterval = setInterval(async () => {
        attempts++;
        try {
          const res = await fetch(API_BASE + '/bridge/checkout/status/' + sessionId);
          const result = await res.json();
          if (!result.success) {
            if (attempts >= maxAttempts) { clearInterval(pollInterval); showProvisionError('Taking longer than expected. Please refresh.'); }
            return;
          }
          const data = result.data;
          renderProvisionSteps(steps, data.step);
          if (data.status === 'completed') {
            clearInterval(pollInterval);
            if (data.token) { localStorage.setItem(AUTH_TOKEN_KEY, data.token); authToken = data.token; }
            document.getElementById('provisionSpinner').className = 'fas fa-check-circle text-green-400 text-3xl';
            document.getElementById('provisionTitle').textContent = 'Welcome to Kancho AI!';
            document.getElementById('provisionSubtitle').textContent = 'Your dashboard is ready. Redirecting...';
            setTimeout(async () => {
              const valid = await checkAuth();
              if (valid) { enterAuthenticatedMode(); } else { showLoginSection(); }
            }, 1500);
          } else if (data.status === 'failed') {
            clearInterval(pollInterval);
            showProvisionError(data.error || 'Setup failed. Please contact support.');
          }
        } catch (e) {
          if (attempts >= maxAttempts) { clearInterval(pollInterval); showProvisionError('Connection error. Please refresh.'); }
        }
      }, 2000);
      return true;
    }

    function renderProvisionSteps(steps, currentStep) {
      const container = document.getElementById('provisionSteps');
      let reachedCurrent = false;
      container.innerHTML = steps.map(step => {
        let state = 'done';
        if (!currentStep) { state = step.key === 'starting' ? 'active' : 'pending'; }
        else if (step.key === currentStep) { state = currentStep === 'done' ? 'done' : 'active'; reachedCurrent = true; }
        else if (reachedCurrent) { state = 'pending'; }
        const icons = { pending: 'fa-circle', active: 'fa-spinner fa-spin', done: 'fa-check' };
        const colors = { done: 'text-gray-300', active: 'text-white font-medium', pending: 'text-gray-500' };
        return '<div class="provision-step ' + state + '"><div class="step-icon"><i class="fas ' + icons[state] + ' text-sm"></i></div><span class="text-sm ' + colors[state] + '">' + step.label + '</span></div>';
      }).join('');
    }

    function showProvisionError(message) {
      document.getElementById('provisionSpinner').className = 'fas fa-exclamation-triangle text-red-400 text-3xl';
      document.getElementById('provisionTitle').textContent = 'Setup Issue';
      document.getElementById('provisionSubtitle').textContent = '';
      document.getElementById('provisionError').classList.remove('hidden');
      document.getElementById('provisionErrorMsg').textContent = message;
    }

    // ==================== EXISTING FUNCTIONS ====================

    async function loadSchools() {
      try {
        const res = await fetch('/kanchoai/api/v1/schools?tenant_id=1');
        const data = await res.json();
        const select = document.getElementById('schoolSelect');
        select.innerHTML = '<option value="">Select Your Business...</option>';
        if (data.data) {
          data.data.forEach(school => {
            select.innerHTML += '<option value="' + school.id + '">' + school.name + '</option>';
          });
        }
      } catch (e) {
        console.error('Failed to load schools:', e);
      }
    }

    // Outbound Calling Functions
    async function callMember(studentId, phone, btn) {
      if (!currentSchoolId) {
        alert('Please select a school first');
        return;
      }
      if (!phone) {
        alert('This member does not have a phone number on file');
        return;
      }

      const originalText = btn.textContent;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

      try {
        const res = await fetch('/kanchoai/api/v1/outbound/call-member', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            student_id: studentId,
            school_id: currentSchoolId,
            phone: phone
          })
        });

        const data = await res.json();

        if (data.success) {
          btn.innerHTML = '<i class="fas fa-check"></i>';
          btn.className = btn.className.replace('bg-red-500/20 text-red-400', 'bg-green-500/20 text-green-400');
          setTimeout(() => {
            btn.textContent = originalText;
            btn.disabled = false;
            btn.className = btn.className.replace('bg-green-500/20 text-green-400', 'bg-red-500/20 text-red-400');
          }, 3000);
        } else {
          alert('Error: ' + (data.error || 'Failed to initiate call'));
          btn.textContent = originalText;
          btn.disabled = false;
        }
      } catch (e) {
        console.error('Error calling:', e);
        alert('Failed to initiate call');
        btn.textContent = originalText;
        btn.disabled = false;
      }
    }

    async function callLead(leadId, phone, btn) {
      if (!currentSchoolId) {
        alert('Please select a school first');
        return;
      }
      if (!phone) {
        alert('This lead does not have a phone number on file');
        return;
      }

      const originalText = btn.textContent;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

      try {
        const res = await fetch('/kanchoai/api/v1/outbound/call-lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lead_id: leadId,
            school_id: currentSchoolId,
            phone: phone
          })
        });

        const data = await res.json();

        if (data.success) {
          btn.innerHTML = '<i class="fas fa-check"></i>';
          btn.className = btn.className.replace('bg-green-500/20 text-green-400', 'bg-blue-500/20 text-blue-400');
          setTimeout(() => {
            btn.textContent = originalText;
            btn.disabled = false;
            btn.className = btn.className.replace('bg-blue-500/20 text-blue-400', 'bg-green-500/20 text-green-400');
          }, 3000);
        } else {
          alert('Error: ' + (data.error || 'Failed to initiate call'));
          btn.textContent = originalText;
          btn.disabled = false;
        }
      } catch (e) {
        console.error('Error calling:', e);
        alert('Failed to initiate call');
        btn.textContent = originalText;
        btn.disabled = false;
      }
    }

    document.getElementById('schoolSelect').addEventListener('change', async (e) => {
      currentSchoolId = e.target.value;
      if (currentSchoolId) {
        await loadDashboard(currentSchoolId);
        loadClasses();
      } else {
        document.getElementById('welcomeSection').classList.remove('hidden');
        document.getElementById('dashboardSection').classList.add('hidden');
        loadClasses();
      }
    });

    async function loadDashboard(schoolId) {
      document.getElementById('welcomeSection').classList.add('hidden');
      document.getElementById('dashboardSection').classList.remove('hidden');

      try {
        const res = await fetch('/kanchoai/api/v1/dashboard?school_id=' + schoolId);
        const data = await res.json();
        const d = data.data;

        // Store data for voice widget
        currentSchoolData = d;

        // Update health score
        const score = d.health?.overall_score || 0;
        document.getElementById('healthScore').textContent = score;
        document.getElementById('healthGrade').textContent = 'Grade: ' + (d.health?.grade || '--');
        document.getElementById('scoreRing').style.setProperty('--score', score);

        // Update ring color based on health score
        const gradient = document.getElementById('scoreGradient');
        if (gradient) {
          const stops = gradient.querySelectorAll('stop');
          let color1, color2;
          if (score >= 80) {
            color1 = '#22C55E'; color2 = '#16A34A'; // Green
          } else if (score >= 60) {
            color1 = '#FBBF24'; color2 = '#F59E0B'; // Yellow/Amber
          } else {
            color1 = '#F87171'; color2 = '#EF4444'; // Red
          }
          if (stops[0]) stops[0].setAttribute('stop-color', color1);
          if (stops[1]) stops[1].setAttribute('stop-color', color2);
        }

        // Revenue at risk
        const atRiskCount = d.students?.at_risk || 0;
        const revenueAtRisk = atRiskCount * 175;
        document.getElementById('revenueAtRisk').textContent = '$' + revenueAtRisk.toLocaleString();
        document.getElementById('atRiskStudents').textContent = atRiskCount + ' students at risk';

        // Growth potential
        const hotLeadsCount = d.leads?.hot || 0;
        const growthPotential = hotLeadsCount * 175;
        document.getElementById('growthPotential').textContent = '$' + growthPotential.toLocaleString();
        document.getElementById('hotLeads').textContent = hotLeadsCount + ' hot leads';

        // Revenue
        const revenue = d.revenue?.this_month || 0;
        document.getElementById('monthlyRevenue').textContent = '$' + Math.round(revenue).toLocaleString();
        document.getElementById('revenueProgress').textContent = (d.revenue?.percent || 0) + '% of target';

        // KPI Metrics (from the new kpi object or fallback)
        const kpi = d.kpi || {};
        const activeStudents = kpi.active_students || d.students?.active || 0;
        const netGrowth = kpi.net_student_growth || 0;
        const churnRate = kpi.churn_rate || 0;
        const arps = kpi.arps || 175;
        const trialConversion = kpi.trial_conversion_rate || 0;
        const revenueVsTarget = kpi.revenue_vs_target_percent || d.revenue?.percent || 0;

        document.getElementById('kpiActiveStudents').textContent = activeStudents;
        document.getElementById('kpiStudentGrowth').textContent = (netGrowth >= 0 ? '+' : '') + netGrowth + ' net growth';
        document.getElementById('kpiChurnRate').textContent = parseFloat(churnRate).toFixed(1) + '%';
        document.getElementById('kpiARPS').textContent = '$' + Math.round(arps);
        document.getElementById('kpiTrialConversion').textContent = parseFloat(trialConversion).toFixed(1) + '%';
        document.getElementById('kpiRevenueTarget').textContent = parseFloat(revenueVsTarget).toFixed(1) + '%';

        // Color code churn rate
        const churnEl = document.getElementById('kpiChurnRate');
        if (churnRate > 10) churnEl.className = 'text-2xl font-bold text-red-400';
        else if (churnRate > 5) churnEl.className = 'text-2xl font-bold text-amber-400';
        else churnEl.className = 'text-2xl font-bold text-green-400';

        // Color code revenue vs target
        const targetEl = document.getElementById('kpiRevenueTarget');
        if (revenueVsTarget >= 100) targetEl.className = 'text-2xl font-bold text-green-400';
        else if (revenueVsTarget >= 80) targetEl.className = 'text-2xl font-bold text-amber-400';
        else targetEl.className = 'text-2xl font-bold text-red-400';

        // Kancho message — contextual AI insights
        let message = '';
        const insights = [];
        if (score >= 80) insights.push('Your dojo is performing strong at ' + score + '/100.');
        else if (score >= 60) insights.push('Health score is ' + score + '/100 — room to grow.');
        else insights.push('Health score is ' + score + '/100 — needs attention.');
        if (atRiskCount > 0 && atRiskCount >= 5) insights.push('Alert: ' + atRiskCount + ' students at risk of churning ($' + revenueAtRisk.toLocaleString() + ' revenue at stake). Prioritize outreach today.');
        else if (atRiskCount > 0) insights.push(atRiskCount + ' student' + (atRiskCount > 1 ? 's' : '') + ' at risk — a quick call could save $' + revenueAtRisk.toLocaleString() + '.');
        if (hotLeadsCount >= 3) insights.push(hotLeadsCount + ' hot leads are ready — strike while the iron is hot.');
        else if (hotLeadsCount > 0) insights.push(hotLeadsCount + ' hot lead' + (hotLeadsCount > 1 ? 's' : '') + ' ready to convert.');
        if (churnRate > 10) insights.push('Churn rate (' + parseFloat(churnRate).toFixed(1) + '%) is high. Consider a retention campaign.');
        else if (churnRate < 3 && activeStudents > 10) insights.push('Excellent retention — only ' + parseFloat(churnRate).toFixed(1) + '% churn.');
        if (revenueVsTarget >= 100) insights.push('Revenue target hit! Consider raising your goal.');
        else if (revenueVsTarget < 50 && revenueVsTarget > 0) insights.push('Revenue at ' + parseFloat(revenueVsTarget).toFixed(0) + '% of target — focus on conversions and renewals.');
        if (trialConversion > 50 && activeStudents > 5) insights.push('Trial conversion at ' + parseFloat(trialConversion).toFixed(0) + '% — your intro classes are working.');
        else if (trialConversion < 20 && trialConversion > 0) insights.push('Trial conversion is low (' + parseFloat(trialConversion).toFixed(0) + '%). Review your first-class experience.');
        message = insights.slice(0, 3).join(' ');
        document.getElementById('kanchoMessage').textContent = message;

        // At-risk list
        const atRiskList = document.getElementById('atRiskList');
        atRiskList.innerHTML = '';
        if (d.lists?.at_risk_students) {
          d.lists.at_risk_students.forEach(s => {
            atRiskList.innerHTML += '<div class="flex items-center justify-between p-3 bg-red-500/10 rounded-lg border-l-2 border-red-500">' +
              '<div><p class="font-medium">' + s.first_name + ' ' + s.last_name + '</p>' +
              '<p class="text-xs text-gray-400">' + s.churn_risk + ' risk</p></div>' +
              '<button onclick="callMember(' + s.id + ', \\'' + (s.phone || '').replace(/'/g, "\\'") + '\\', this)" class="px-3 py-1 bg-red-500/20 text-red-400 rounded text-sm hover:bg-red-500/40 transition">Call</button></div>';
          });
        }

        // Hot leads list
        const hotLeadsList = document.getElementById('hotLeadsList');
        hotLeadsList.innerHTML = '';
        if (d.lists?.hot_leads) {
          d.lists.hot_leads.forEach(l => {
            hotLeadsList.innerHTML += '<div class="flex items-center justify-between p-3 bg-green-500/10 rounded-lg border-l-2 border-green-500">' +
              '<div><p class="font-medium">' + l.first_name + ' ' + (l.last_name || '') + '</p>' +
              '<p class="text-xs text-gray-400">Score: ' + l.lead_score + '</p></div>' +
              '<button onclick="callLead(' + l.id + ', \\'' + (l.phone || '').replace(/'/g, "\\'") + '\\', this)" class="px-3 py-1 bg-green-500/20 text-green-400 rounded text-sm hover:bg-green-500/40 transition">Call</button></div>';
          });
        }
        updatePortalBadge();
        loadTodayCheckins();
      } catch (e) {
        console.error('Failed to load dashboard:', e);
      }
    }

    async function loadTodayCheckins() {
      const schoolId = currentSchoolId;
      if (!schoolId) return;
      try {
        const res = await fetch('/kanchoai/api/v1/attendance/today?school_id=' + schoolId);
        const data = await res.json();
        const container = document.getElementById('todayCheckinsList');
        const countEl = document.getElementById('todayCheckinCount');
        countEl.textContent = data.total + ' / ' + data.totalActive + ' active students';
        if (!data.data || data.data.length === 0) {
          container.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No check-ins yet today.</p>';
          return;
        }
        container.innerHTML = data.data.slice(0, 15).map(r => {
          const name = (r.student?.first_name || '') + ' ' + (r.student?.last_name || '');
          const cls = r.class?.name || 'Open Training';
          const time = r.checked_in_at ? new Date(r.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--';
          return '<div class="flex items-center justify-between p-2 rounded-lg bg-green-500/5 border-l-2 border-green-500">' +
            '<div class="flex items-center gap-3"><i class="fas fa-check-circle text-green-400 text-sm"></i><div>' +
            '<p class="font-medium text-sm">' + name.trim() + '</p>' +
            '<p class="text-xs text-gray-500">' + cls + '</p></div></div>' +
            '<span class="text-xs text-gray-400">' + time + '</span></div>';
        }).join('') +
        (data.data.length > 15 ? '<p class="text-center text-xs text-gray-500 mt-2">+ ' + (data.data.length - 15) + ' more</p>' : '');
      } catch (e) { console.error('loadTodayCheckins error:', e); }
    }

    async function seedDemoData() {
      try {
        const btn = event.target;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Loading...';

        const res = await fetch('/kanchoai/api/v1/seed-demo', { method: 'POST' });
        const data = await res.json();

        await loadSchools();
        btn.innerHTML = '<i class="fas fa-check mr-2"></i>Demo Data Loaded!';
        setTimeout(() => {
          btn.disabled = false;
          btn.innerHTML = '<i class="fas fa-rocket mr-2"></i>Load Demo Data';
        }, 2000);
      } catch (e) {
        console.error('Failed to seed demo data:', e);
      }
    }

    // =====================================================
    // KANCHO VOICE INTEGRATION - Hidden ElevenLabs Widget
    // Uses the official widget but hides it visually
    // Custom orb triggers the hidden widget
    // =====================================================

    const KANCHO_VOICE_AGENT_ID = 'agent_5601kh453hqqfz59nfemkwk02vax';
    let widgetElement = null;

    function talkToKancho() {
      if (isAuthenticated) {
        currentSchoolId = authSchool?.id;
        openVoiceModal();
        return;
      }
      if (!currentSchoolId) {
        alert('Please select a business first to talk to Kancho');
        return;
      }
      openVoiceModal();
    }

    function openVoiceModal() {
      const modal = document.getElementById('voiceModal');
      const schoolNameEl = document.getElementById('widgetSchoolName');
      const container = document.getElementById('voiceWidgetContainer');
      const statusEl = document.getElementById('voiceStatus');

      // Show modal
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      statusEl.textContent = 'Starting conversation...';

      // Update school name
      if (isAuthenticated && authSchool) {
        schoolNameEl.textContent = authSchool.name;
      } else {
        const schoolSelect = document.getElementById('schoolSelect');
        const selectedOption = schoolSelect.options[schoolSelect.selectedIndex];
        schoolNameEl.textContent = selectedOption ? selectedOption.text : '';
      }

      // Create widget with comprehensive dynamic variables
      const school = currentSchoolData?.school || {};
      const health = currentSchoolData?.health || {};
      const students = currentSchoolData?.students || {};
      const revenue = currentSchoolData?.revenue || {};
      const leads = currentSchoolData?.leads || {};

      const atRiskCount = students.at_risk || 0;
      const hotLeads = leads.hot || 0;

      const schoolId = parseInt(currentSchoolId, 10);
      const dynamicVars = {
        // ElevenLabs tool placeholder - maps to school_id
        dynamic_variable: schoolId,
        school_id: schoolId,
        language: currentLanguage || 'en',
        school_name: school.name || 'your school',
        martial_art: school.martial_art_type || 'martial arts',
        health_score: health.overall_score || 0,
        health_grade: health.grade || 'N/A',
        active_students: students.active || 0,
        at_risk_students: atRiskCount,
        revenue_at_risk: atRiskCount * 175,
        hot_leads: hotLeads,
        growth_potential: hotLeads * 175,
        monthly_revenue: revenue.this_month || 0,
        revenue_target: revenue.target || 0,
        revenue_percent: revenue.percent || 0
      };

      console.log('[Kancho] Creating widget with:', dynamicVars);

      // Clear any existing widget
      container.innerHTML = '';

      // Create the ElevenLabs widget
      widgetElement = document.createElement('elevenlabs-convai');
      const agentId = (isAuthenticated && authClient?.elevenlabsAgentId) ? authClient.elevenlabsAgentId : KANCHO_VOICE_AGENT_ID;
      widgetElement.setAttribute('agent-id', agentId);
      widgetElement.setAttribute('dynamic-variables', JSON.stringify(dynamicVars));
      container.appendChild(widgetElement);

      // Auto-click the widget to start conversation
      autoStartWidget();
    }

    function autoStartWidget() {
      let attempts = 0;
      const maxAttempts = 20;
      const statusEl = document.getElementById('voiceStatus');

      function waitForWidget() {
        attempts++;
        if (!widgetElement) return;

        const shadowRoot = widgetElement.shadowRoot;
        if (shadowRoot) {
          const btn = shadowRoot.querySelector('button');
          if (btn) {
            console.log('[Kancho] Widget ready - waiting for user click');
            statusEl.textContent = 'Ready - Click the orb to talk';
            return;
          }
        }

        if (attempts < maxAttempts) {
          setTimeout(waitForWidget, 200);
        } else {
          statusEl.textContent = 'Click the orb to start talking';
        }
      }

      setTimeout(waitForWidget, 500);
    }

    function closeVoiceModal() {
      const modal = document.getElementById('voiceModal');
      const container = document.getElementById('voiceWidgetContainer');

      // Remove widget to end conversation
      if (container) container.innerHTML = '';
      widgetElement = null;

      // Hide modal
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }

    function openBookingModal() {
      const modal = document.getElementById('bookingModal');
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }

    function closeBookingModal() {
      const modal = document.getElementById('bookingModal');
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }

    // Trial Booking Modal
    function openTrialBookingModal() {
      const modal = document.getElementById('trialBookingModal');
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }

    function closeTrialBookingModal() {
      const modal = document.getElementById('trialBookingModal');
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }

    // Class Schedule Loading
    const martialArtIcons = {
      'Karate': 'fa-hand-paper', 'Taekwondo': 'fa-running', 'BJJ': 'fa-hand-rock',
      'Muay Thai': 'fa-fire', 'MMA': 'fa-fist-raised', 'Kickboxing': 'fa-fire-alt',
      'Judo': 'fa-user-ninja', 'Krav Maga': 'fa-shield-alt', 'Boxing': 'fa-mitten',
      'Kung Fu': 'fa-yin-yang', 'Aikido': 'fa-circle-notch', 'Capoeira': 'fa-music',
      'Wrestling': 'fa-people-arrows', 'Hapkido': 'fa-bolt', 'Jeet Kune Do': 'fa-dragon'
    };
    const martialArtColors = {
      'Karate': '#3B82F6', 'Taekwondo': '#10B981', 'BJJ': '#8B5CF6',
      'Muay Thai': '#F59E0B', 'MMA': '#EF4444', 'Kickboxing': '#F97316',
      'Judo': '#6366F1', 'Krav Maga': '#64748B', 'Boxing': '#DC2626',
      'Kung Fu': '#E11D48', 'Aikido': '#0EA5E9', 'Capoeira': '#22C55E',
      'Wrestling': '#A855F7', 'Hapkido': '#14B8A6', 'Jeet Kune Do': '#FBBF24'
    };

    async function loadClasses() {
      try {
        const schoolId = currentSchoolId || '';
        const res = await fetch('/kanchoai/api/v1/classes/public?school_id=' + schoolId);
        const result = await res.json();
        if (result.success) renderClasses(result.data);
      } catch (e) {
        console.error('Error loading classes:', e);
      }
    }

    function renderClasses(classes) {
      const grid = document.getElementById('classesGrid');
      if (!classes || classes.length === 0) {
        grid.innerHTML = '<div class="text-center col-span-full py-8"><p class="text-gray-400">No classes available.</p></div>';
        return;
      }
      grid.innerHTML = classes.map(cls => {
        const icon = martialArtIcons[cls.martial_art] || 'fa-trophy';
        const color = martialArtColors[cls.martial_art] || '#E85A4F';
        return '<div class="card rounded-2xl p-6 hover:border-kancho-coral/50 transition-all duration-300 fade-in">' +
          '<div class="w-14 h-14 rounded-xl flex items-center justify-center mb-4" style="background: ' + color + '20;">' +
            '<i class="fas ' + icon + '" style="color: ' + color + '; font-size: 1.5rem;"></i></div>' +
          '<div class="flex items-center gap-2 mb-2">' +
            '<span class="text-xs font-bold px-2 py-1 rounded-full" style="background: ' + color + '20; color: ' + color + ';">' + (cls.level || 'All Levels') + '</span></div>' +
          '<h3 class="text-lg font-bold text-white mb-2">' + cls.name + '</h3>' +
          '<p class="text-gray-400 text-sm mb-4">' + (cls.description || '') + '</p>' +
          '<div class="pt-4 border-t border-kancho-dark-border text-center">' +
            '<button onclick="openTrialBookingModal()" class="w-full px-4 py-2 kancho-btn rounded-lg text-sm font-medium transition">Book Free Trial</button></div></div>';
      }).join('');
    }

    function setLanguage(lang) {
      currentLanguage = lang;
      const enBtn = document.getElementById('langEn');
      const esBtn = document.getElementById('langEs');
      if (enBtn) enBtn.classList.toggle('bg-kancho-coral/20', lang === 'en');
      if (esBtn) esBtn.classList.toggle('bg-kancho-coral/20', lang === 'es');
    }

    // Plan selection — open signup modal
    function selectPlan(plan) {
      const planNames = { intelligence: 'Kancho Intelligence', pro: 'Kancho Pro' };
      document.getElementById('signupPlan').value = plan;
      document.getElementById('signupPlanTag').textContent = planNames[plan] || plan;
      document.getElementById('signupError').classList.add('hidden');
      document.getElementById('signupForm').reset();
      document.getElementById('signupPlan').value = plan;
      document.getElementById('signupModal').classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      document.getElementById('signupFirstName').focus();
    }

    function closeSignupModal() {
      document.getElementById('signupModal').classList.add('hidden');
      document.body.style.overflow = '';
    }

    async function handleSignup(event) {
      event.preventDefault();
      const btn = document.getElementById('signupSubmitBtn');
      const errorEl = document.getElementById('signupError');
      errorEl.classList.add('hidden');

      const payload = {
        plan: document.getElementById('signupPlan').value,
        firstName: document.getElementById('signupFirstName').value.trim(),
        lastName: document.getElementById('signupLastName').value.trim(),
        email: document.getElementById('signupEmail').value.trim(),
        password: document.getElementById('signupPassword').value,
        phone: document.getElementById('signupPhone').value.trim(),
        schoolName: document.getElementById('signupSchoolName').value.trim(),
        martialArtType: document.getElementById('signupMartialArt').value,
        city: document.getElementById('signupCity').value.trim() || undefined,
        state: document.getElementById('signupState').value.trim() || undefined
      };

      try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Processing...';

        const response = await fetch('/kanchoai/api/v1/bridge/checkout/initiate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.success && data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
        } else {
          errorEl.textContent = data.error || 'Something went wrong. Please try again.';
          errorEl.classList.remove('hidden');
          btn.disabled = false;
          btn.innerHTML = 'Continue to Checkout';
        }
      } catch (error) {
        console.error('Signup error:', error);
        errorEl.textContent = 'Connection error. Please try again.';
        errorEl.classList.remove('hidden');
        btn.disabled = false;
        btn.innerHTML = 'Continue to Checkout';
      }
    }

    // Check for successful subscription and open onboarding calendar
    function checkSubscriptionSuccess() {
      const urlParams = new URLSearchParams(window.location.search);
      const subscribeStatus = urlParams.get('subscribe');
      const plan = urlParams.get('plan');

      if (subscribeStatus === 'success') {
        // Show success message
        const planName = plan === 'pro' ? 'Kancho Pro' : 'Kancho Intelligence';

        // Create success banner
        const banner = document.createElement('div');
        banner.className = 'fixed top-20 left-1/2 transform -translate-x-1/2 z-[300] bg-green-500/90 text-white px-8 py-4 rounded-xl shadow-2xl flex items-center gap-4 animate-pulse';
        banner.innerHTML = \`
          <i class="fas fa-check-circle text-2xl"></i>
          <div>
            <p class="font-bold">Welcome to \${planName}!</p>
            <p class="text-sm opacity-90">Your 14-day free trial has started. Let's schedule your onboarding call.</p>
          </div>
        \`;
        document.body.appendChild(banner);

        // Open booking modal after a short delay
        setTimeout(() => {
          openBookingModal();
          // Remove banner after modal opens
          setTimeout(() => banner.remove(), 3000);
        }, 1500);

        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (subscribeStatus === 'canceled') {
        // Show canceled message
        const banner = document.createElement('div');
        banner.className = 'fixed top-20 left-1/2 transform -translate-x-1/2 z-[300] bg-amber-500/90 text-white px-8 py-4 rounded-xl shadow-2xl flex items-center gap-4';
        banner.innerHTML = \`
          <i class="fas fa-info-circle text-2xl"></i>
          <div>
            <p class="font-bold">Checkout Canceled</p>
            <p class="text-sm opacity-90">No worries! You can try again whenever you're ready.</p>
          </div>
        \`;
        document.body.appendChild(banner);
        setTimeout(() => banner.remove(), 5000);

        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }

    // =====================================================
    // DASHBOARD TABS - Students, Leads, Calendar, Payments
    // =====================================================
    const tabsLoaded = {};
    let studentsPage = 1, leadsPage = 1, paymentsPage = 1;
    let calendarYear, calendarMonth, calendarAppointments = {};
    let currentStudentId = null, currentLeadId = null;
    const ITEMS_PER_PAGE = 20;

    function debounce(fn, ms) {
      let timer;
      return function(...args) { clearTimeout(timer); timer = setTimeout(() => fn.apply(this, args), ms); };
    }
    const debouncedSearchStudents = debounce(() => { studentsPage = 1; loadStudents(); }, 300);
    const debouncedSearchLeads = debounce(() => { leadsPage = 1; loadLeads(); }, 300);

    function formatDate(d) {
      if (!d) return '--';
      const dt = new Date(d);
      return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    function formatCurrency(v) {
      const n = parseFloat(v) || 0;
      return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function switchTab(tabName) {
      document.querySelectorAll('#dashboardSection .tab-content').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('#dashboardTabs .tab-btn').forEach(el => el.classList.remove('active'));
      const tab = document.getElementById('tab' + tabName.charAt(0).toUpperCase() + tabName.slice(1));
      if (tab) tab.classList.add('active');
      event?.target?.closest?.('.tab-btn')?.classList.add('active') ||
        document.querySelector('#dashboardTabs .tab-btn[onclick*="' + tabName + '"]')?.classList.add('active');
      if (!tabsLoaded[tabName] && currentSchoolId) {
        tabsLoaded[tabName] = true;
        if (tabName === 'students') loadStudents();
        else if (tabName === 'leads') loadLeads();
        else if (tabName === 'calendar') { const now = new Date(); calendarYear = now.getFullYear(); calendarMonth = now.getMonth() + 1; loadCalendar(); }
        else if (tabName === 'payments') loadPayments();
        else if (tabName === 'portalAccounts') loadPortalAccounts();
        else if (tabName === 'merchandise') loadMerchandiseAdmin();
        else if (tabName === 'belts') loadBeltRequirements();
        else if (tabName === 'classes') loadClassesAdmin();
      }
    }

    function renderPagination(containerId, currentPage, totalItems, loadFn) {
      const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
      const container = document.getElementById(containerId);
      if (!container || totalPages <= 1) { if (container) container.innerHTML = ''; return; }
      let html = '<button ' + (currentPage <= 1 ? 'disabled' : '') + ' onclick="' + loadFn + '(' + (currentPage - 1) + ')"><i class="fas fa-chevron-left"></i></button>';
      for (let i = 1; i <= totalPages && i <= 7; i++) {
        const p = totalPages <= 7 ? i : (currentPage <= 4 ? i : (currentPage >= totalPages - 3 ? totalPages - 7 + i : currentPage - 4 + i));
        html += '<button class="' + (p === currentPage ? 'active' : '') + '" onclick="' + loadFn + '(' + p + ')">' + p + '</button>';
      }
      html += '<button ' + (currentPage >= totalPages ? 'disabled' : '') + ' onclick="' + loadFn + '(' + (currentPage + 1) + ')"><i class="fas fa-chevron-right"></i></button>';
      container.innerHTML = html;
    }

    // ---- STUDENTS TAB ----
    async function loadStudents(page) {
      if (page) studentsPage = page;
      const schoolId = currentSchoolId;
      if (!schoolId) return;
      const search = document.getElementById('studentSearch')?.value || '';
      const status = document.getElementById('studentStatusFilter')?.value || '';
      const churn = document.getElementById('studentChurnFilter')?.value || '';
      const offset = (studentsPage - 1) * ITEMS_PER_PAGE;
      let url = '/kanchoai/api/v1/students?school_id=' + schoolId + '&limit=' + ITEMS_PER_PAGE + '&offset=' + offset;
      if (search) url += '&search=' + encodeURIComponent(search);
      if (status) url += '&status=' + status;
      if (churn) url += '&churn_risk=' + churn;
      try {
        const res = await fetch(url);
        const data = await res.json();
        const tbody = document.getElementById('studentsTableBody');
        const empty = document.getElementById('studentsEmpty');
        if (!data.data || data.data.length === 0) {
          tbody.innerHTML = '';
          empty.classList.remove('hidden');
          document.getElementById('studentsPagination').innerHTML = '';
          return;
        }
        empty.classList.add('hidden');
        tbody.innerHTML = data.data.map(s => {
          const name = (s.first_name || '') + ' ' + (s.last_name || '');
          return '<tr onclick="openStudentDetail(' + s.id + ')">' +
            '<td class="font-medium">' + name.trim() + '</td>' +
            '<td>' + (s.belt_rank || '--') + '</td>' +
            '<td><span class="badge badge-' + (s.status || 'active') + '">' + (s.status || 'active') + '</span></td>' +
            '<td class="hidden md:table-cell"><span class="badge badge-' + (s.churn_risk || 'low') + '">' + (s.churn_risk || 'low') + '</span></td>' +
            '<td class="hidden lg:table-cell">' + formatDate(s.last_attendance) + '</td>' +
            '<td class="hidden md:table-cell">' + (s.monthly_rate ? formatCurrency(s.monthly_rate) : '--') + '</td>' +
            '<td><button class="btn-ghost btn-sm" onclick="event.stopPropagation();openStudentForm(' + s.id + ')"><i class="fas fa-edit"></i></button></td>' +
            '</tr>';
        }).join('');
        renderPagination('studentsPagination', studentsPage, data.total, 'loadStudents');
      } catch (e) { console.error('loadStudents error:', e); }
    }

    async function openStudentDetail(id) {
      currentStudentId = id;
      try {
        const res = await fetch('/kanchoai/api/v1/students/' + id);
        const data = await res.json();
        const s = data.data;
        const body = document.getElementById('studentDetailBody');
        body.innerHTML =
          '<div class="text-center mb-6">' +
            '<div class="w-16 h-16 rounded-full bg-kancho-coral/20 flex items-center justify-center mx-auto mb-3"><i class="fas fa-user text-2xl text-kancho"></i></div>' +
            '<h3 class="text-xl font-bold">' + (s.first_name || '') + ' ' + (s.last_name || '') + '</h3>' +
            '<span class="badge badge-' + (s.status || 'active') + ' mt-2">' + (s.status || 'active') + '</span>' +
          '</div>' +
          '<div class="mb-6">' +
            '<h4 class="text-sm font-bold text-gray-400 uppercase mb-3">Contact Info</h4>' +
            '<div class="detail-row"><span class="label">Email</span><span class="value">' + (s.email || '--') + '</span></div>' +
            '<div class="detail-row"><span class="label">Phone</span><span class="value">' + (s.phone || '--') + '</span></div>' +
          '</div>' +
          '<div class="mb-6">' +
            '<h4 class="text-sm font-bold text-gray-400 uppercase mb-3">Training</h4>' +
            '<div class="detail-row"><span class="label">Belt Rank</span><span class="value">' + (s.belt_rank || '--') + '</span></div>' +
            '<div class="detail-row"><span class="label">Enrolled</span><span class="value">' + formatDate(s.enrollment_date) + '</span></div>' +
            '<div class="detail-row"><span class="label">Attendance Streak</span><span class="value">' + (s.attendance_streak || 0) + ' days</span></div>' +
            '<div class="detail-row"><span class="label">Total Classes</span><span class="value">' + (s.total_classes || 0) + '</span></div>' +
            '<div class="detail-row"><span class="label">Last Attendance</span><span class="value">' + formatDate(s.last_attendance) + '</span></div>' +
          '</div>' +
          '<div class="mb-6">' +
            '<h4 class="text-sm font-bold text-gray-400 uppercase mb-3">Membership</h4>' +
            '<div class="detail-row"><span class="label">Type</span><span class="value">' + (s.membership_type || '--') + '</span></div>' +
            '<div class="detail-row"><span class="label">Monthly Rate</span><span class="value">' + (s.monthly_rate ? formatCurrency(s.monthly_rate) : '--') + '</span></div>' +
            '<div class="detail-row"><span class="label">Payment Status</span><span class="value"><span class="badge badge-' + (s.payment_status === 'current' ? 'active' : s.payment_status === 'past_due' ? 'hot' : 'cancelled') + '">' + (s.payment_status || '--') + '</span></span></div>' +
            '<div class="detail-row"><span class="label">Lifetime Value</span><span class="value">' + (s.lifetime_value ? formatCurrency(s.lifetime_value) : '--') + '</span></div>' +
          '</div>' +
          '<div class="mb-6">' +
            '<h4 class="text-sm font-bold text-gray-400 uppercase mb-3">Risk Assessment</h4>' +
            '<div class="detail-row"><span class="label">Churn Risk</span><span class="value"><span class="badge badge-' + (s.churn_risk || 'low') + '">' + (s.churn_risk || 'low') + '</span></span></div>' +
            '<div class="detail-row"><span class="label">Risk Score</span><span class="value">' + (s.churn_risk_score || 0) + '%</span></div>' +
          '</div>' +
          (s.notes ? '<div class="mb-6"><h4 class="text-sm font-bold text-gray-400 uppercase mb-3">Notes</h4><p class="text-gray-300 text-sm">' + s.notes + '</p></div>' : '') +
          '<div class="mb-6">' +
            '<h4 class="text-sm font-bold text-gray-400 uppercase mb-3">Attendance</h4>' +
            (s.attendance_streak > 0 ? '<div class="mb-3"><span class="streak-badge"><i class="fas fa-fire"></i> ' + s.attendance_streak + ' day streak</span></div>' : '') +
            '<button class="btn-checkin btn-sm mb-3" onclick="quickCheckIn(' + s.id + ')"><i class="fas fa-check-circle mr-1"></i> Check In Now</button>' +
            '<div id="studentAttendanceHistory"><div class="roster-loading" style="padding:12px 0;font-size:12px;"><i class="fas fa-spinner fa-spin"></i> Loading history...</div></div>' +
          '</div>' +
          '<div class="mb-6">' +
            '<h4 class="text-sm font-bold text-gray-400 uppercase mb-3">Payment History</h4>' +
            '<div id="studentPaymentHistory"><div class="roster-loading" style="padding:12px 0;font-size:12px;"><i class="fas fa-spinner fa-spin"></i> Loading payments...</div></div>' +
          '</div>' +
          '<div class="flex gap-3 mt-6">' +
            '<button class="btn-primary flex-1 btn-sm" onclick="openStudentForm(' + s.id + ');closeStudentDetail()"><i class="fas fa-edit mr-1"></i> Edit</button>' +
            '<button class="btn-ghost flex-1 btn-sm" onclick="if(confirm(&quot;Delete this student?&quot;))deleteStudent(' + s.id + ')"><i class="fas fa-trash mr-1"></i> Delete</button>' +
          '</div>';
        document.getElementById('studentDetailPanel').classList.add('open');
        document.getElementById('studentPanelOverlay').classList.add('open');
        // Load attendance history
        loadAttendanceHistory(id, document.getElementById('studentAttendanceHistory'));
        loadStudentPaymentHistory(id, document.getElementById('studentPaymentHistory'));
      } catch (e) { console.error('openStudentDetail error:', e); }
    }

    function closeStudentDetail() {
      document.getElementById('studentDetailPanel').classList.remove('open');
      document.getElementById('studentPanelOverlay').classList.remove('open');
      currentStudentId = null;
    }
    function editStudentFromPanel() { if (currentStudentId) { openStudentForm(currentStudentId); closeStudentDetail(); } }

    async function openStudentForm(id) {
      document.getElementById('studentFormTitle').textContent = id ? 'Edit Student' : 'Add Student';
      document.getElementById('studentFormId').value = id || '';
      if (id) {
        try {
          const res = await fetch('/kanchoai/api/v1/students/' + id);
          const data = await res.json();
          const s = data.data;
          document.getElementById('sfFirstName').value = s.first_name || '';
          document.getElementById('sfLastName').value = s.last_name || '';
          document.getElementById('sfEmail').value = s.email || '';
          document.getElementById('sfPhone').value = s.phone || '';
          document.getElementById('sfBelt').value = s.belt_rank || '';
          document.getElementById('sfMembership').value = s.membership_type || 'Unlimited';
          document.getElementById('sfRate').value = s.monthly_rate || '';
          document.getElementById('sfStatus').value = s.status || 'active';
          document.getElementById('sfNotes').value = s.notes || '';
        } catch (e) { console.error(e); }
      } else {
        ['sfFirstName','sfLastName','sfEmail','sfPhone','sfBelt','sfRate','sfNotes'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('sfMembership').value = 'Unlimited';
        document.getElementById('sfStatus').value = 'active';
      }
      document.getElementById('studentFormModal').classList.add('open');
    }
    function closeStudentForm() { document.getElementById('studentFormModal').classList.remove('open'); }

    async function saveStudent(e) {
      e.preventDefault();
      const id = document.getElementById('studentFormId').value;
      const body = {
        school_id: currentSchoolId,
        first_name: document.getElementById('sfFirstName').value,
        last_name: document.getElementById('sfLastName').value,
        email: document.getElementById('sfEmail').value || null,
        phone: document.getElementById('sfPhone').value || null,
        belt_rank: document.getElementById('sfBelt').value || null,
        membership_type: document.getElementById('sfMembership').value,
        monthly_rate: parseFloat(document.getElementById('sfRate').value) || null,
        status: document.getElementById('sfStatus').value,
        notes: document.getElementById('sfNotes').value || null
      };
      try {
        const url = id ? '/kanchoai/api/v1/students/' + id : '/kanchoai/api/v1/students';
        const method = id ? 'PUT' : 'POST';
        await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        closeStudentForm();
        loadStudents();
      } catch (e) { console.error('saveStudent error:', e); }
    }

    async function deleteStudent(id) {
      try {
        await fetch('/kanchoai/api/v1/students/' + id, { method: 'DELETE' });
        closeStudentDetail();
        loadStudents();
      } catch (e) { console.error('deleteStudent error:', e); }
    }

    // ---- LEADS TAB ----
    async function loadLeads(page) {
      if (page) leadsPage = page;
      const schoolId = currentSchoolId;
      if (!schoolId) return;
      const search = document.getElementById('leadSearch')?.value || '';
      const status = document.getElementById('leadStatusFilter')?.value || '';
      const temp = document.getElementById('leadTempFilter')?.value || '';
      const offset = (leadsPage - 1) * ITEMS_PER_PAGE;
      let url = '/kanchoai/api/v1/leads?school_id=' + schoolId + '&limit=' + ITEMS_PER_PAGE + '&offset=' + offset;
      if (search) url += '&search=' + encodeURIComponent(search);
      if (status) url += '&status=' + status;
      if (temp) url += '&temperature=' + temp;
      try {
        const res = await fetch(url);
        const data = await res.json();
        const tbody = document.getElementById('leadsTableBody');
        const empty = document.getElementById('leadsEmpty');
        if (!data.data || data.data.length === 0) {
          tbody.innerHTML = '';
          empty.classList.remove('hidden');
          document.getElementById('leadsPagination').innerHTML = '';
          return;
        }
        empty.classList.add('hidden');
        tbody.innerHTML = data.data.map(l => {
          const name = (l.first_name || '') + ' ' + (l.last_name || '');
          const statusLabel = (l.status || 'new').replace(/_/g, ' ');
          return '<tr onclick="openLeadDetail(' + l.id + ')">' +
            '<td class="font-medium">' + name.trim() + '</td>' +
            '<td>' + (l.source || '--') + '</td>' +
            '<td><span class="badge badge-' + (l.status === 'new' ? 'new' : l.status === 'converted' ? 'converted' : l.status === 'lost' ? 'lost' : 'warm') + '">' + statusLabel + '</span></td>' +
            '<td class="hidden md:table-cell"><span class="badge badge-' + (l.temperature || 'warm') + '">' + (l.temperature || 'warm') + '</span></td>' +
            '<td class="hidden lg:table-cell">' + (l.lead_score || 0) + '</td>' +
            '<td class="hidden md:table-cell">' + formatDate(l.follow_up_date) + '</td>' +
            '<td>' +
              '<button class="btn-ghost btn-sm mr-1" onclick="event.stopPropagation();openLeadForm(' + l.id + ')"><i class="fas fa-edit"></i></button>' +
              (l.status !== 'converted' ? '<button class="btn-ghost btn-sm" onclick="event.stopPropagation();convertLead(' + l.id + ')" title="Convert to student"><i class="fas fa-user-plus"></i></button>' : '') +
            '</td></tr>';
        }).join('');
        renderPagination('leadsPagination', leadsPage, data.total, 'loadLeads');
      } catch (e) { console.error('loadLeads error:', e); }
    }

    async function openLeadDetail(id) {
      currentLeadId = id;
      try {
        const res = await fetch('/kanchoai/api/v1/leads/' + id);
        const data = await res.json();
        const l = data.data;
        const body = document.getElementById('leadDetailBody');
        body.innerHTML =
          '<div class="text-center mb-6">' +
            '<div class="w-16 h-16 rounded-full bg-kancho-coral/20 flex items-center justify-center mx-auto mb-3"><i class="fas fa-user-plus text-2xl text-kancho"></i></div>' +
            '<h3 class="text-xl font-bold">' + (l.first_name || '') + ' ' + (l.last_name || '') + '</h3>' +
            '<div class="flex justify-center gap-2 mt-2">' +
              '<span class="badge badge-' + (l.status === 'new' ? 'new' : l.status === 'converted' ? 'converted' : l.status === 'lost' ? 'lost' : 'warm') + '">' + (l.status || 'new').replace(/_/g, ' ') + '</span>' +
              '<span class="badge badge-' + (l.temperature || 'warm') + '">' + (l.temperature || 'warm') + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="mb-6">' +
            '<h4 class="text-sm font-bold text-gray-400 uppercase mb-3">Contact Info</h4>' +
            '<div class="detail-row"><span class="label">Email</span><span class="value">' + (l.email || '--') + '</span></div>' +
            '<div class="detail-row"><span class="label">Phone</span><span class="value">' + (l.phone || '--') + '</span></div>' +
            '<div class="detail-row"><span class="label">Preferred Contact</span><span class="value">' + (l.preferred_contact_method || 'any') + '</span></div>' +
          '</div>' +
          '<div class="mb-6">' +
            '<h4 class="text-sm font-bold text-gray-400 uppercase mb-3">Lead Info</h4>' +
            '<div class="detail-row"><span class="label">Source</span><span class="value">' + (l.source || '--') + '</span></div>' +
            '<div class="detail-row"><span class="label">Interest</span><span class="value">' + (l.interest || '--') + '</span></div>' +
            '<div class="detail-row"><span class="label">Lead Score</span><span class="value" style="font-size:18px;font-weight:700;color:' + (l.lead_score >= 70 ? '#22C55E' : l.lead_score >= 40 ? '#F59E0B' : '#EF4444') + '">' + (l.lead_score || 0) + '/100</span></div>' +
            '<div class="detail-row"><span class="label">Contact Attempts</span><span class="value">' + (l.contact_attempts || 0) + '</span></div>' +
          '</div>' +
          '<div class="mb-6">' +
            '<h4 class="text-sm font-bold text-gray-400 uppercase mb-3">Trial & Follow-up</h4>' +
            '<div class="detail-row"><span class="label">Trial Date</span><span class="value">' + formatDate(l.trial_date) + '</span></div>' +
            '<div class="detail-row"><span class="label">Trial Completed</span><span class="value">' + (l.trial_completed ? '<span class="text-green-400"><i class="fas fa-check-circle mr-1"></i>Yes</span>' : '<span class="text-gray-500">No</span> <button class="btn-primary btn-sm ml-2" style="padding:2px 8px;font-size:11px;" onclick="markTrialComplete(' + l.id + ')"><i class="fas fa-check mr-1"></i>Mark Complete</button>') + '</span></div>' +
            '<div class="detail-row"><span class="label">Follow-up Date</span><span class="value">' + formatDate(l.follow_up_date) + '</span></div>' +
            '<div class="detail-row"><span class="label">Last Contact</span><span class="value">' + formatDate(l.last_contact_date) + '</span></div>' +
          '</div>' +
          (l.notes ? '<div class="mb-6"><h4 class="text-sm font-bold text-gray-400 uppercase mb-3">Notes</h4><p class="text-gray-300 text-sm">' + l.notes + '</p></div>' : '') +
          (l.ai_notes ? '<div class="mb-6"><h4 class="text-sm font-bold text-gray-400 uppercase mb-3">AI Notes</h4><p class="text-gray-300 text-sm italic">' + l.ai_notes + '</p></div>' : '') +
          '<div class="flex gap-3 mt-6">' +
            (l.status !== 'converted' ? '<button class="btn-primary flex-1 btn-sm" onclick="convertLead(' + l.id + ');closeLeadDetail()"><i class="fas fa-user-plus mr-1"></i> Convert</button>' : '') +
            '<button class="btn-ghost flex-1 btn-sm" onclick="openLeadForm(' + l.id + ');closeLeadDetail()"><i class="fas fa-edit mr-1"></i> Edit</button>' +
            '<button class="btn-ghost flex-1 btn-sm" onclick="if(confirm(&quot;Delete this lead?&quot;))deleteLead(' + l.id + ')"><i class="fas fa-trash mr-1"></i> Delete</button>' +
          '</div>';
        document.getElementById('leadDetailPanel').classList.add('open');
        document.getElementById('leadPanelOverlay').classList.add('open');
      } catch (e) { console.error('openLeadDetail error:', e); }
    }

    function closeLeadDetail() {
      document.getElementById('leadDetailPanel').classList.remove('open');
      document.getElementById('leadPanelOverlay').classList.remove('open');
      currentLeadId = null;
    }
    function editLeadFromPanel() { if (currentLeadId) { openLeadForm(currentLeadId); closeLeadDetail(); } }
    function convertLeadFromPanel() { if (currentLeadId) { convertLead(currentLeadId); closeLeadDetail(); } }
    async function markTrialComplete(id) {
      try {
        const res = await fetch('/kanchoai/api/v1/leads/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trial_completed: true, status: 'trial_completed' }) });
        const data = await res.json();
        if (data.success) { openLeadDetail(id); tabsLoaded.leads = false; }
        else alert('Failed: ' + (data.error || 'Unknown error'));
      } catch (e) { console.error('markTrialComplete error:', e); }
    }

    async function openLeadForm(id) {
      document.getElementById('leadFormTitle').textContent = id ? 'Edit Lead' : 'Add Lead';
      document.getElementById('leadFormId').value = id || '';
      if (id) {
        try {
          const res = await fetch('/kanchoai/api/v1/leads/' + id);
          const data = await res.json();
          const l = data.data;
          document.getElementById('lfFirstName').value = l.first_name || '';
          document.getElementById('lfLastName').value = l.last_name || '';
          document.getElementById('lfEmail').value = l.email || '';
          document.getElementById('lfPhone').value = l.phone || '';
          document.getElementById('lfSource').value = l.source || '';
          document.getElementById('lfInterest').value = l.interest || '';
          document.getElementById('lfStatus').value = l.status || 'new';
          document.getElementById('lfTemp').value = l.temperature || 'warm';
          document.getElementById('lfNotes').value = l.notes || '';
        } catch (e) { console.error(e); }
      } else {
        ['lfFirstName','lfLastName','lfEmail','lfPhone','lfSource','lfInterest','lfNotes'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('lfStatus').value = 'new';
        document.getElementById('lfTemp').value = 'warm';
      }
      document.getElementById('leadFormModal').classList.add('open');
    }
    function closeLeadForm() { document.getElementById('leadFormModal').classList.remove('open'); }

    async function saveLead(e) {
      e.preventDefault();
      const id = document.getElementById('leadFormId').value;
      const body = {
        school_id: currentSchoolId,
        first_name: document.getElementById('lfFirstName').value,
        last_name: document.getElementById('lfLastName').value || null,
        email: document.getElementById('lfEmail').value || null,
        phone: document.getElementById('lfPhone').value || null,
        source: document.getElementById('lfSource').value || null,
        interest: document.getElementById('lfInterest').value || null,
        status: document.getElementById('lfStatus').value,
        temperature: document.getElementById('lfTemp').value,
        notes: document.getElementById('lfNotes').value || null
      };
      try {
        const url = id ? '/kanchoai/api/v1/leads/' + id : '/kanchoai/api/v1/leads';
        const method = id ? 'PUT' : 'POST';
        await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        closeLeadForm();
        loadLeads();
      } catch (e) { console.error('saveLead error:', e); }
    }

    async function convertLead(id) {
      if (!confirm('Convert this lead to a student?')) return;
      try {
        const res = await fetch('/kanchoai/api/v1/leads/' + id + '/convert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
        const data = await res.json();
        if (data.success) {
          loadLeads();
          tabsLoaded['students'] = false; // Force reload students tab
        }
      } catch (e) { console.error('convertLead error:', e); }
    }

    async function deleteLead(id) {
      try {
        await fetch('/kanchoai/api/v1/leads/' + id, { method: 'DELETE' });
        closeLeadDetail();
        loadLeads();
      } catch (e) { console.error('deleteLead error:', e); }
    }

    // ---- CALENDAR TAB ----
    const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    async function loadCalendar() {
      if (!currentSchoolId) return;
      const label = document.getElementById('calendarMonthLabel');
      if (label) label.textContent = MONTH_NAMES[calendarMonth - 1] + ' ' + calendarYear;

      try {
        const headers = {};
        if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
        const res = await fetch('/kanchoai/api/v1/bridge/crm/appointments/month?year=' + calendarYear + '&month=' + calendarMonth, { headers });
        const data = await res.json();
        calendarAppointments = data.data?.byDate || {};
        renderCalendarGrid();
      } catch (e) {
        console.error('loadCalendar error:', e);
        calendarAppointments = {};
        renderCalendarGrid();
      }
    }

    function renderCalendarGrid() {
      const container = document.getElementById('calendarDays');
      if (!container) return;
      const firstDay = new Date(calendarYear, calendarMonth - 1, 1).getDay();
      const daysInMonth = new Date(calendarYear, calendarMonth, 0).getDate();
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      let html = '';
      // Leading empty cells
      for (let i = 0; i < firstDay; i++) {
        html += '<div class="calendar-day other-month"></div>';
      }
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = calendarYear + '-' + String(calendarMonth).padStart(2, '0') + '-' + String(d).padStart(2, '0');
        const appts = calendarAppointments[dateStr] || [];
        const isToday = dateStr === todayStr;
        html += '<div class="calendar-day' + (isToday ? ' today' : '') + '" onclick="selectCalendarDay(&apos;' + dateStr + '&apos;)">';
        html += '<div class="calendar-day-number">' + d + '</div>';
        if (appts.length > 0) {
          html += '<div class="mt-1">';
          for (let i = 0; i < Math.min(appts.length, 3); i++) html += '<span class="calendar-dot"></span>';
          if (appts.length > 3) html += '<span style="font-size:10px;color:#6B7280;margin-left:2px">+' + (appts.length - 3) + '</span>';
          html += '</div>';
        }
        html += '</div>';
      }
      container.innerHTML = html;
      document.getElementById('calendarDayDetail').classList.add('hidden');
    }

    function selectCalendarDay(dateStr) {
      document.querySelectorAll('.calendar-day.selected').forEach(el => el.classList.remove('selected'));
      event?.target?.closest?.('.calendar-day')?.classList.add('selected');
      const detail = document.getElementById('calendarDayDetail');
      const label = document.getElementById('calendarDayLabel');
      const list = document.getElementById('calendarDayAppointments');
      const empty = document.getElementById('calendarDayEmpty');
      label.textContent = formatDate(dateStr);
      const appts = calendarAppointments[dateStr] || [];
      if (appts.length === 0) {
        list.innerHTML = '';
        empty.classList.remove('hidden');
      } else {
        empty.classList.add('hidden');
        list.innerHTML = appts.map(a => {
          const isCancelled = a.status === 'cancelled';
          return '<div class="card rounded-xl p-4' + (isCancelled ? ' opacity-50' : '') + '">' +
            '<div class="flex items-center justify-between mb-2">' +
              '<span class="font-medium">' + (a.customer_name || 'No Name') + '</span>' +
              '<div class="flex items-center gap-2">' +
                '<span class="badge badge-' + (a.status || 'confirmed') + '">' + (a.status || 'confirmed') + '</span>' +
                (!isCancelled ? '<button class="text-blue-400 hover:text-blue-300 text-xs px-1" onclick="editAppointment(' + a.id + ')" title="Edit"><i class="fas fa-edit"></i></button>' +
                '<button class="text-red-400 hover:text-red-300 text-xs px-1" onclick="cancelAppointment(' + a.id + ')" title="Cancel"><i class="fas fa-trash"></i></button>' : '') +
              '</div>' +
            '</div>' +
            '<div class="text-sm text-gray-400">' +
              '<span><i class="fas fa-clock mr-1"></i>' + (a.appointment_time || '--') + '</span>' +
              '<span class="ml-3"><i class="fas fa-tag mr-1"></i>' + (a.purpose || 'Appointment') + '</span>' +
              (a.customer_phone ? '<span class="ml-3"><i class="fas fa-phone mr-1"></i>' + a.customer_phone + '</span>' : '') +
            '</div>' +
          '</div>';
        }).join('');
      }
      detail.classList.remove('hidden');
    }

    function prevMonth() {
      calendarMonth--;
      if (calendarMonth < 1) { calendarMonth = 12; calendarYear--; }
      loadCalendar();
    }
    function nextMonth() {
      calendarMonth++;
      if (calendarMonth > 12) { calendarMonth = 1; calendarYear++; }
      loadCalendar();
    }

    function openAppointmentForm(dateStr) {
      document.getElementById('afId').value = '';
      document.getElementById('afTitle').textContent = 'New Appointment';
      document.getElementById('afSubmitBtn').textContent = 'Book Appointment';
      if (dateStr) document.getElementById('afDate').value = dateStr;
      else document.getElementById('afDate').value = new Date().toISOString().split('T')[0];
      document.getElementById('afName').value = '';
      document.getElementById('afPhone').value = '';
      document.getElementById('afEmail').value = '';
      document.getElementById('afTime').value = '10:00';
      document.getElementById('afDuration').value = '60';
      document.getElementById('afPurpose').value = 'Class trial';
      document.getElementById('appointmentFormModal').classList.add('open');
    }
    function closeAppointmentForm() { document.getElementById('appointmentFormModal').classList.remove('open'); }

    function editAppointment(id) {
      // Find appointment in stored data
      let appt = null;
      for (const dateKey of Object.keys(calendarAppointments)) {
        appt = calendarAppointments[dateKey].find(a => a.id === id);
        if (appt) break;
      }
      if (!appt) { alert('Appointment not found'); return; }
      document.getElementById('afId').value = id;
      document.getElementById('afTitle').textContent = 'Edit Appointment';
      document.getElementById('afSubmitBtn').textContent = 'Update Appointment';
      document.getElementById('afName').value = appt.customer_name || '';
      document.getElementById('afPhone').value = appt.customer_phone || '';
      document.getElementById('afEmail').value = appt.customer_email || '';
      document.getElementById('afDate').value = appt.appointment_date || '';
      document.getElementById('afTime').value = appt.appointment_time || '10:00';
      document.getElementById('afDuration').value = appt.duration || 60;
      document.getElementById('afPurpose').value = appt.purpose || 'Class trial';
      document.getElementById('appointmentFormModal').classList.add('open');
    }

    async function cancelAppointment(id) {
      if (!confirm('Cancel this appointment?')) return;
      try {
        const headers = {};
        if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
        await fetch('/kanchoai/api/v1/bridge/crm/appointments/' + id, { method: 'DELETE', headers });
        loadCalendar();
      } catch (e) { console.error('cancelAppointment error:', e); }
    }

    async function saveAppointment(e) {
      e.preventDefault();
      const editId = document.getElementById('afId').value;
      const body = {
        customerName: document.getElementById('afName').value,
        customerPhone: document.getElementById('afPhone').value,
        customerEmail: document.getElementById('afEmail').value || null,
        date: document.getElementById('afDate').value,
        time: document.getElementById('afTime').value,
        duration: parseInt(document.getElementById('afDuration').value) || 60,
        purpose: document.getElementById('afPurpose').value
      };
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
        let url, method;
        if (editId) {
          url = '/kanchoai/api/v1/bridge/crm/appointments/' + editId;
          method = 'PUT';
          body.customer_name = body.customerName;
          body.customer_phone = body.customerPhone;
          body.customer_email = body.customerEmail;
          body.appointment_date = body.date;
          body.appointment_time = body.time;
        } else {
          url = '/kanchoai/api/v1/bridge/crm/appointments';
          method = 'POST';
        }
        const res = await fetch(url, { method, headers, body: JSON.stringify(body) });
        const data = await res.json();
        if (data.success) {
          closeAppointmentForm();
          loadCalendar();
        } else {
          alert('Failed to save: ' + (data.error || 'Unknown error'));
        }
      } catch (e) { console.error('saveAppointment error:', e); }
    }

    // ---- PAYMENTS TAB ----
    async function loadPayments(page) {
      if (page) paymentsPage = page;
      const schoolId = currentSchoolId;
      if (!schoolId) return;
      const type = document.getElementById('payTypeFilter')?.value || '';
      const dateFrom = document.getElementById('payDateFrom')?.value || '';
      const dateTo = document.getElementById('payDateTo')?.value || '';
      const offset = (paymentsPage - 1) * ITEMS_PER_PAGE;
      let url = '/kanchoai/api/v1/revenue?school_id=' + schoolId + '&limit=' + ITEMS_PER_PAGE + '&offset=' + offset;
      if (type) url += '&type=' + type;
      if (dateFrom) url += '&date_from=' + dateFrom;
      if (dateTo) url += '&date_to=' + dateTo;

      // Load summary in parallel
      loadPaymentSummary();

      try {
        const res = await fetch(url);
        const data = await res.json();
        const tbody = document.getElementById('paymentsTableBody');
        const empty = document.getElementById('paymentsEmpty');
        if (!data.data || data.data.length === 0) {
          tbody.innerHTML = '';
          empty.classList.remove('hidden');
          document.getElementById('paymentsPagination').innerHTML = '';
          return;
        }
        empty.classList.add('hidden');
        tbody.innerHTML = data.data.map(r => {
          const studentName = r.student ? (r.student.first_name + ' ' + r.student.last_name) : '--';
          return '<tr>' +
            '<td>' + formatDate(r.date) + '</td>' +
            '<td><span class="badge badge-' + (r.type === 'membership' ? 'active' : 'warm') + '">' + (r.type || '--').replace(/_/g, ' ') + '</span></td>' +
            '<td class="font-bold text-green-400">' + formatCurrency(r.amount) + '</td>' +
            '<td class="hidden md:table-cell">' + studentName + '</td>' +
            '<td class="hidden lg:table-cell">' + (r.payment_method || '--').replace(/_/g, ' ') + '</td>' +
            '<td class="hidden md:table-cell text-gray-400">' + (r.description || '--') + '</td>' +
            '<td><button class="btn-ghost btn-sm" onclick="deletePayment(' + r.id + ')" title="Delete"><i class="fas fa-trash"></i></button></td>' +
            '</tr>';
        }).join('');
        renderPagination('paymentsPagination', paymentsPage, data.total, 'loadPayments');
      } catch (e) { console.error('loadPayments error:', e); }
    }

    async function loadPaymentSummary() {
      try {
        const res = await fetch('/kanchoai/api/v1/revenue/summary?school_id=' + currentSchoolId);
        const data = await res.json();
        const s = data.data;
        document.getElementById('payTotalRevenue').textContent = formatCurrency(s.total);
        document.getElementById('payRecurring').textContent = formatCurrency(s.recurring);
        document.getElementById('payAvgStudent').textContent = formatCurrency(s.avgPerStudent);
        document.getElementById('payActiveStudents').textContent = s.activeStudents || 0;
      } catch (e) { console.error('loadPaymentSummary error:', e); }
    }

    function openPaymentForm() {
      document.getElementById('pfDate').value = new Date().toISOString().split('T')[0];
      document.getElementById('pfType').value = 'membership';
      document.getElementById('pfAmount').value = '';
      document.getElementById('pfStudent').value = '';
      document.getElementById('pfMethod').value = 'credit_card';
      document.getElementById('pfRecurring').checked = false;
      document.getElementById('pfDescription').value = '';
      loadStudentDropdown();
      document.getElementById('paymentFormModal').classList.add('open');
    }
    function closePaymentForm() { document.getElementById('paymentFormModal').classList.remove('open'); }

    async function loadStudentDropdown() {
      try {
        const res = await fetch('/kanchoai/api/v1/students?school_id=' + currentSchoolId + '&status=active&limit=200');
        const data = await res.json();
        const select = document.getElementById('pfStudent');
        select.innerHTML = '<option value="">-- No student --</option>';
        (data.data || []).forEach(s => {
          select.innerHTML += '<option value="' + s.id + '">' + s.first_name + ' ' + (s.last_name || '') + '</option>';
        });
      } catch (e) { console.error(e); }
    }

    async function savePayment(e) {
      e.preventDefault();
      const body = {
        school_id: currentSchoolId,
        date: document.getElementById('pfDate').value,
        type: document.getElementById('pfType').value,
        amount: parseFloat(document.getElementById('pfAmount').value),
        student_id: document.getElementById('pfStudent').value || null,
        payment_method: document.getElementById('pfMethod').value,
        is_recurring: document.getElementById('pfRecurring').checked,
        description: document.getElementById('pfDescription').value || null
      };
      try {
        await fetch('/kanchoai/api/v1/revenue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        closePaymentForm();
        loadPayments();
      } catch (e) { console.error('savePayment error:', e); }
    }

    async function deletePayment(id) {
      if (!confirm('Delete this payment?')) return;
      try {
        await fetch('/kanchoai/api/v1/revenue/' + id, { method: 'DELETE' });
        loadPayments();
      } catch (e) { console.error('deletePayment error:', e); }
    }

    // ==================== ATTENDANCE ====================

    function getSchoolId() {
      const id = parseInt(currentSchoolId, 10);
      if (!id || isNaN(id)) return null;
      return id;
    }

    async function openAttendanceModal() {
      const schoolId = getSchoolId();
      if (!schoolId) { alert('Please log in first (no school selected)'); return; }
      // Set today's date
      document.getElementById('attendanceDate').value = new Date().toISOString().split('T')[0];
      // Load classes dropdown
      const sel = document.getElementById('attendanceClassSelect');
      sel.innerHTML = '<option value="">-- All Students (No Class) --</option>';
      try {
        const classRes = await fetch('/kanchoai/api/v1/classes/public?school_id=' + schoolId);
        const classData = await classRes.json();
        if (classData.success && classData.data) {
          classData.data.filter(c => c.is_active !== false).forEach(c => {
            sel.innerHTML += '<option value="' + c.id + '">' + c.name + '</option>';
          });
        }
      } catch (e) { console.error('loadClasses error:', e); }
      document.getElementById('attendanceCheckInModal').classList.add('open');
      await loadClassRoster();
    }

    function closeAttendanceModal() {
      document.getElementById('attendanceCheckInModal').classList.remove('open');
    }

    async function loadClassRoster() {
      const schoolId = getSchoolId();
      const classId = document.getElementById('attendanceClassSelect').value;
      const date = document.getElementById('attendanceDate').value;
      const container = document.getElementById('attendanceRoster');
      if (!schoolId) { container.innerHTML = '<div class="roster-loading">No school selected</div>'; return; }
      container.innerHTML = '<div class="roster-loading"><i class="fas fa-spinner fa-spin"></i> Loading students...</div>';

      try {
        let url = '/kanchoai/api/v1/attendance/class-roster?school_id=' + schoolId + '&date=' + date;
        if (classId) url += '&class_id=' + classId;
        const rosterRes = await fetch(url);
        if (!rosterRes.ok) {
          const errText = await rosterRes.text();
          container.innerHTML = '<div class="roster-loading">Server error (' + rosterRes.status + '): ' + errText.substring(0,100) + '</div>';
          return;
        }
        const rosterData = await rosterRes.json();

        if (!rosterData.success || !rosterData.data || rosterData.data.length === 0) {
          container.innerHTML = '<div class="roster-loading">No active students found for school ' + schoolId + '</div>';
          return;
        }

        let html = '';
        rosterData.data.forEach(s => {
          const checked = s.checked_in ? ' checked' : '';
          const rowClass = s.checked_in ? ' checked' : '';
          html += '<div class="checkin-student-row' + rowClass + '" onclick="toggleCheckinRow(this)">' +
            '<input type="checkbox" class="checkin-checkbox" data-student-id="' + s.id + '"' + checked + ' onclick="event.stopPropagation();updateCheckinCount()">' +
            '<div class="checkin-student-info">' +
              '<div class="checkin-student-name">' + (s.first_name || '') + ' ' + (s.last_name || '') + '</div>' +
              '<div class="checkin-student-meta">' + (s.belt_rank || 'No belt') + ' &middot; Streak: ' + (s.attendance_streak || 0) + ' &middot; Total: ' + (s.total_classes || 0) + '</div>' +
            '</div>' +
            (s.checked_in ? '<span class="badge badge-active" style="font-size:10px;">Already in</span>' : '') +
          '</div>';
        });
        container.innerHTML = html;
        updateCheckinCount();
      } catch (e) {
        console.error('loadClassRoster error:', e);
        container.innerHTML = '<div class="roster-loading">Error: ' + (e.message || 'Unknown') + '</div>';
      }
    }

    function toggleCheckinRow(row) {
      const cb = row.querySelector('.checkin-checkbox');
      cb.checked = !cb.checked;
      row.classList.toggle('checked', cb.checked);
      updateCheckinCount();
    }

    function toggleAllStudents(checked) {
      document.querySelectorAll('#attendanceRoster .checkin-checkbox').forEach(cb => {
        cb.checked = checked;
        cb.closest('.checkin-student-row').classList.toggle('checked', checked);
      });
      updateCheckinCount();
    }

    function updateCheckinCount() {
      const total = document.querySelectorAll('#attendanceRoster .checkin-checkbox:checked').length;
      document.getElementById('checkinCount').textContent = total + ' selected';
    }

    async function saveBulkAttendance() {
      const schoolId = getSchoolId();
      if (!schoolId) { alert('No school selected'); return; }
      const classId = document.getElementById('attendanceClassSelect').value;
      const date = document.getElementById('attendanceDate').value;
      const checkboxes = document.querySelectorAll('#attendanceRoster .checkin-checkbox:checked');
      const studentIds = Array.from(checkboxes).map(cb => parseInt(cb.dataset.studentId));

      if (studentIds.length === 0) {
        alert('Please select at least one student');
        return;
      }

      try {
        const bulkRes = await fetch('/kanchoai/api/v1/attendance/bulk-check-in', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            school_id: schoolId,
            class_id: classId ? parseInt(classId, 10) : null,
            date: date,
            student_ids: studentIds
          })
        });
        const bulkData = await bulkRes.json();
        if (bulkData.success) {
          alert(bulkData.message || 'Attendance saved!');
          closeAttendanceModal();
          if (tabsLoaded.students) loadStudents();
        } else {
          alert('Error: ' + (bulkData.error || 'Unknown error'));
        }
      } catch (e) {
        console.error('saveBulkAttendance error:', e);
        alert('Error saving attendance: ' + e.message);
      }
    }

    async function quickCheckIn(studentId) {
      const schoolId = getSchoolId();
      if (!schoolId) { alert('No school selected'); return; }
      try {
        const ciRes = await fetch('/kanchoai/api/v1/attendance/check-in', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            school_id: schoolId,
            student_id: parseInt(studentId, 10),
            date: new Date().toISOString().split('T')[0]
          })
        });
        const ciData = await ciRes.json();
        if (ciRes.status === 409) {
          alert('Already checked in today!');
          return;
        }
        if (ciData.success) {
          alert('Checked in!');
          openStudentDetail(studentId);
        } else {
          alert('Error: ' + (ciData.error || 'Unknown error'));
        }
      } catch (e) {
        console.error('quickCheckIn error:', e);
        alert('Check-in error: ' + e.message);
      }
    }

    async function loadAttendanceHistory(studentId, container) {
      try {
        const res = await fetch('/kanchoai/api/v1/attendance/student/' + studentId + '/history');
        const data = await res.json();

        if (!data.success || !data.data || data.data.length === 0) {
          container.innerHTML = '<p class="text-sm text-gray-500">No attendance records yet</p>';
          return;
        }

        let html = '';
        data.data.slice(0, 10).forEach(r => {
          const statusBadge = r.status === 'present' ? 'badge-active' : r.status === 'late' ? 'badge-warm' : r.status === 'excused' ? 'badge-medium' : 'badge-cancelled';
          html += '<div class="attendance-history-item">' +
            '<span class="date">' + formatDate(r.date) + '</span>' +
            '<span class="class-name">' + (r.class ? r.class.name : 'Quick check-in') + '</span>' +
            '<span class="badge ' + statusBadge + '" style="font-size:10px;">' + r.status + '</span>' +
          '</div>';
        });
        container.innerHTML = html;
      } catch (e) {
        console.error('loadAttendanceHistory error:', e);
        container.innerHTML = '<p class="text-sm text-gray-500">Error loading history</p>';
      }
    }

    async function loadStudentPaymentHistory(studentId, container) {
      try {
        const res = await fetch('/kanchoai/api/v1/revenue?school_id=' + currentSchoolId + '&student_id=' + studentId + '&limit=20');
        const data = await res.json();
        if (!data.success || !data.data || data.data.length === 0) {
          container.innerHTML = '<p class="text-sm text-gray-500">No payment records</p>';
          return;
        }
        let html = '';
        data.data.slice(0, 10).forEach(r => {
          const typeBadge = r.type === 'membership' ? 'badge-active' : r.type === 'retail' ? 'badge-warm' : r.type === 'belt_test' ? 'badge-medium' : 'badge-new';
          html += '<div class="attendance-history-item">' +
            '<span class="date">' + formatDate(r.date) + '</span>' +
            '<span class="class-name">' + formatCurrency(r.amount) + '</span>' +
            '<span class="badge ' + typeBadge + '" style="font-size:10px;">' + (r.type || 'payment') + '</span>' +
          '</div>';
        });
        if (data.total > 10) html += '<p class="text-xs text-gray-500 mt-2 text-center">Showing 10 of ' + data.total + ' payments</p>';
        container.innerHTML = html;
      } catch (e) {
        console.error('loadStudentPaymentHistory error:', e);
        container.innerHTML = '<p class="text-sm text-gray-500">Error loading payments</p>';
      }
    }

    // ==================== PORTAL ACCOUNTS TAB ====================
    async function loadPortalAccounts() {
      const schoolId = currentSchoolId;
      if (!schoolId) return;
      const status = document.getElementById('portalStatusFilter')?.value || '';
      let url = '/kanchoai/api/v1/student-accounts?school_id=' + schoolId;
      if (status) url += '&status=' + status;
      try {
        const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + authToken } });
        const data = await res.json();
        const tbody = document.getElementById('portalAccountsBody');
        const empty = document.getElementById('portalAccountsEmpty');
        if (!data.success || !data.data.length) { tbody.innerHTML = ''; empty.classList.remove('hidden'); return; }
        empty.classList.add('hidden');
        tbody.innerHTML = data.data.map(a => {
          const statusBadge = a.status === 'active' ? 'bg-green-600' : a.status === 'pending' ? 'bg-yellow-600' : 'bg-red-600';
          const linked = a.student ? a.student.first_name + ' ' + a.student.last_name + ' (' + (a.student.belt_rank || 'No belt') + ')' : '<span class="text-gray-500">Not linked</span>';
          let actions = '';
          if (a.status === 'pending') actions += '<button class="btn-primary btn-sm mr-1" onclick="approveAccount(' + a.id + ')">Approve</button>';
          if (a.status !== 'suspended') actions += '<button class="btn-ghost btn-sm text-red-400" onclick="suspendAccount(' + a.id + ')">Suspend</button>';
          if (!a.student_id) actions += '<button class="btn-ghost btn-sm text-blue-400 ml-1" onclick="linkAccount(' + a.id + ')">Link</button>';
          return '<tr><td>' + a.first_name + ' ' + a.last_name + '</td><td>' + a.email + '</td><td><span class="inline-block px-2 py-0.5 rounded text-xs ' + statusBadge + '">' + a.status + '</span></td><td>' + linked + '</td><td>' + new Date(a.created_at).toLocaleDateString() + '</td><td class="whitespace-nowrap">' + actions + '</td></tr>';
        }).join('');
      } catch (e) { console.error('loadPortalAccounts error:', e); }
    }
    async function updatePortalBadge() {
      try {
        if (!currentSchoolId) return;
        const res = await fetch('/kanchoai/api/v1/student-accounts?school_id=' + currentSchoolId + '&status=pending', { headers: { 'Authorization': 'Bearer ' + authToken } });
        const data = await res.json();
        const badge = document.getElementById('portalBadge');
        if (!badge) return;
        const count = Array.isArray(data.data) ? data.data.length : 0;
        if (count > 0) { badge.textContent = count; badge.style.display = 'inline-flex'; }
        else { badge.style.display = 'none'; }
      } catch (e) { console.error('updatePortalBadge error:', e); }
    }
    async function approveAccount(id) {
      if (!confirm('Approve this student portal account?')) return;
      await fetch('/kanchoai/api/v1/student-accounts/' + id + '/approve', { method: 'PUT', headers: { 'Authorization': 'Bearer ' + authToken, 'Content-Type': 'application/json' } });
      tabsLoaded.portalAccounts = false; loadPortalAccounts(); updatePortalBadge();
    }
    async function suspendAccount(id) {
      if (!confirm('Suspend this account?')) return;
      await fetch('/kanchoai/api/v1/student-accounts/' + id + '/suspend', { method: 'PUT', headers: { 'Authorization': 'Bearer ' + authToken, 'Content-Type': 'application/json' } });
      tabsLoaded.portalAccounts = false; loadPortalAccounts(); updatePortalBadge();
    }
    async function linkAccount(id) {
      const studentId = prompt('Enter Student ID to link:');
      if (!studentId) return;
      await fetch('/kanchoai/api/v1/student-accounts/' + id + '/link', { method: 'PUT', headers: { 'Authorization': 'Bearer ' + authToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ student_id: parseInt(studentId) }) });
      tabsLoaded.portalAccounts = false; loadPortalAccounts(); updatePortalBadge();
    }

    // ==================== MERCHANDISE TAB ====================
    async function loadMerchandiseAdmin() {
      const schoolId = currentSchoolId;
      if (!schoolId) return;
      try {
        const res = await fetch('/kanchoai/api/v1/merchandise?school_id=' + schoolId);
        const data = await res.json();
        const tbody = document.getElementById('merchTableBody');
        const empty = document.getElementById('merchEmpty');
        if (!data.success || !data.data.length) { tbody.innerHTML = ''; empty.classList.remove('hidden'); return; }
        empty.classList.add('hidden');
        tbody.innerHTML = data.data.map(i => {
          const stockBadge = i.in_stock ? '<span class="text-green-400">Yes</span>' : '<span class="text-red-400">No</span>';
          const sizes = i.sizes && i.sizes.length ? i.sizes.join(', ') : '-';
          return '<tr><td>' + i.name + '</td><td>' + (i.category || 'other') + '</td><td>$' + parseFloat(i.price).toFixed(2) + '</td><td class="text-xs">' + sizes + '</td><td>' + stockBadge + '</td><td class="whitespace-nowrap"><button class="btn-ghost btn-sm" onclick="editMerchItem(' + i.id + ')"><i class="fas fa-edit"></i></button> <button class="btn-ghost btn-sm text-red-400" onclick="deleteMerchItem(' + i.id + ')"><i class="fas fa-trash"></i></button></td></tr>';
        }).join('');
      } catch (e) { console.error('loadMerchandiseAdmin error:', e); }
    }
    function openMerchForm(item) {
      const existing = item || {};
      const html = '<div class="modal-backdrop" onclick="closeModal()"></div><div class="modal-content" style="max-width:500px"><h3 class="text-lg font-bold mb-4">' + (existing.id ? 'Edit' : 'Add') + ' Merchandise</h3><form onsubmit="saveMerchItem(event,' + (existing.id || 'null') + ')">' +
        '<div class="mb-3"><label class="block text-sm text-gray-400 mb-1">Name</label><input id="merchName" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white" value="' + (existing.name || '') + '" required></div>' +
        '<div class="grid grid-cols-2 gap-3 mb-3"><div><label class="block text-sm text-gray-400 mb-1">Price</label><input id="merchPrice" type="number" step="0.01" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white" value="' + (existing.price || '') + '" required></div>' +
        '<div><label class="block text-sm text-gray-400 mb-1">Category</label><select id="merchCategory" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white"><option value="gi">Gi</option><option value="gear">Gear</option><option value="apparel">Apparel</option><option value="accessories">Accessories</option><option value="supplements">Supplements</option><option value="other">Other</option></select></div></div>' +
        '<div class="mb-3"><label class="block text-sm text-gray-400 mb-1">Description</label><textarea id="merchDesc" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white" rows="2">' + (existing.description || '') + '</textarea></div>' +
        '<div class="mb-3"><label class="block text-sm text-gray-400 mb-1">Sizes (comma-separated)</label><input id="merchSizes" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white" value="' + (existing.sizes ? existing.sizes.join(',') : '') + '"></div>' +
        '<div class="mb-3"><label class="block text-sm text-gray-400 mb-1">Image URL</label><input id="merchImage" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white" value="' + (existing.image_url || '') + '"></div>' +
        '<div class="mb-4"><label class="flex items-center gap-2"><input id="merchInStock" type="checkbox"' + (existing.in_stock !== false ? ' checked' : '') + '> In Stock</label></div>' +
        '<div class="flex gap-2"><button type="submit" class="btn-primary">Save</button><button type="button" class="btn-ghost" onclick="closeModal()">Cancel</button></div></form></div>';
      let modal = document.getElementById('globalModal');
      if (!modal) { modal = document.createElement('div'); modal.id = 'globalModal'; modal.className = 'modal'; document.body.appendChild(modal); }
      modal.innerHTML = html; modal.classList.add('open');
      if (existing.category) document.getElementById('merchCategory').value = existing.category;
    }
    function closeModal() { const m = document.getElementById('globalModal'); if (m) { m.classList.remove('open'); m.innerHTML = ''; } }
    async function saveMerchItem(e, id) {
      e.preventDefault();
      const body = {
        school_id: parseInt(currentSchoolId),
        name: document.getElementById('merchName').value,
        price: parseFloat(document.getElementById('merchPrice').value),
        category: document.getElementById('merchCategory').value,
        description: document.getElementById('merchDesc').value,
        sizes: document.getElementById('merchSizes').value.split(',').map(s => s.trim()).filter(Boolean),
        image_url: document.getElementById('merchImage').value,
        in_stock: document.getElementById('merchInStock').checked
      };
      const url = id ? '/kanchoai/api/v1/merchandise/' + id : '/kanchoai/api/v1/merchandise';
      await fetch(url, { method: id ? 'PUT' : 'POST', headers: { 'Authorization': 'Bearer ' + authToken, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      closeModal(); tabsLoaded.merchandise = false; loadMerchandiseAdmin();
    }
    async function editMerchItem(id) {
      const res = await fetch('/kanchoai/api/v1/merchandise?school_id=' + currentSchoolId);
      const data = await res.json();
      const item = data.data?.find(i => i.id === id);
      if (item) openMerchForm(item);
    }
    async function deleteMerchItem(id) {
      if (!confirm('Delete this merchandise item?')) return;
      await fetch('/kanchoai/api/v1/merchandise/' + id, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + authToken } });
      tabsLoaded.merchandise = false; loadMerchandiseAdmin();
    }

    // ==================== CLASSES ADMIN TAB ====================
    async function loadClassesAdmin() {
      const schoolId = currentSchoolId;
      if (!schoolId) return;
      try {
        const res = await fetch('/kanchoai/api/v1/classes?school_id=' + schoolId);
        const data = await res.json();
        const tbody = document.getElementById('classesAdminTableBody');
        const empty = document.getElementById('classesAdminEmpty');
        if (!data.data || data.data.length === 0) { tbody.innerHTML = ''; empty.classList.remove('hidden'); return; }
        empty.classList.add('hidden');
        tbody.innerHTML = data.data.map(c => {
          const sched = c.schedule || {};
          const schedText = Object.entries(sched).map(([day, time]) => day.slice(0,3) + ' ' + time).join(', ') || '--';
          return '<tr>' +
            '<td class="font-medium">' + c.name + '</td>' +
            '<td>' + (c.martial_art || '--') + '</td>' +
            '<td>' + (c.level || '--') + '</td>' +
            '<td>' + (c.instructor || '--') + '</td>' +
            '<td class="text-xs">' + schedText + '</td>' +
            '<td>' + (c.capacity || '--') + '</td>' +
            '<td><span class="badge badge-' + (c.is_active ? 'active' : 'cancelled') + '">' + (c.is_active ? 'Yes' : 'No') + '</span></td>' +
            '<td><button class="btn-ghost btn-sm mr-1" onclick="editClass(' + c.id + ')"><i class="fas fa-edit"></i></button>' +
            '<button class="btn-ghost btn-sm text-red-400" onclick="deleteClass(' + c.id + ')"><i class="fas fa-trash"></i></button></td></tr>';
        }).join('');
      } catch (e) { console.error('loadClassesAdmin error:', e); }
    }

    function openClassForm(existing) {
      const c = existing || {};
      const schedVal = c.schedule ? Object.entries(c.schedule).map(([d,t]) => d + ' ' + t).join('\\n') : '';
      const html = '<div class="modal-backdrop" onclick="closeModal()"></div><div class="modal-content" style="max-width:520px"><h3 class="text-lg font-bold mb-4">' + (c.id ? 'Edit' : 'Add') + ' Class</h3><form onsubmit="saveClass(event,' + (c.id || 'null') + ')">' +
        '<div class="grid grid-cols-2 gap-3 mb-3"><div><label class="block text-sm text-gray-400 mb-1">Class Name</label><input id="className" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white" value="' + (c.name || '') + '" required></div>' +
        '<div><label class="block text-sm text-gray-400 mb-1">Martial Art</label><input id="classMartialArt" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white" value="' + (c.martial_art || '') + '"></div></div>' +
        '<div class="grid grid-cols-3 gap-3 mb-3"><div><label class="block text-sm text-gray-400 mb-1">Level</label><select id="classLevel" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white"><option value="All Levels">All Levels</option><option value="Beginner">Beginner</option><option value="Intermediate">Intermediate</option><option value="Advanced">Advanced</option><option value="Kids">Kids</option></select></div>' +
        '<div><label class="block text-sm text-gray-400 mb-1">Capacity</label><input id="classCapacity" type="number" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white" value="' + (c.capacity || 20) + '"></div>' +
        '<div><label class="block text-sm text-gray-400 mb-1">Duration (min)</label><input id="classDuration" type="number" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white" value="' + (c.duration_minutes || 60) + '"></div></div>' +
        '<div class="grid grid-cols-2 gap-3 mb-3"><div><label class="block text-sm text-gray-400 mb-1">Instructor</label><input id="classInstructor" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white" value="' + (c.instructor || '') + '"></div>' +
        '<div><label class="block text-sm text-gray-400 mb-1">Price</label><input id="classPrice" type="number" step="0.01" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white" value="' + (c.price || 0) + '"></div></div>' +
        '<div class="mb-3"><label class="block text-sm text-gray-400 mb-1">Description</label><textarea id="classDesc" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white" rows="2">' + (c.description || '') + '</textarea></div>' +
        '<div class="mb-3"><label class="block text-sm text-gray-400 mb-1">Schedule (one per line: Day HH:MM)</label><textarea id="classSchedule" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white" rows="3" placeholder="Monday 18:00\\nWednesday 18:00\\nFriday 17:00">' + schedVal + '</textarea></div>' +
        '<div class="mb-4"><label class="flex items-center gap-2"><input id="classActive" type="checkbox"' + (c.is_active !== false ? ' checked' : '') + '> Active</label></div>' +
        '<div class="flex gap-2"><button type="submit" class="btn-primary">Save</button><button type="button" class="btn-ghost" onclick="closeModal()">Cancel</button></div></form></div>';
      let modal = document.getElementById('globalModal');
      if (!modal) { modal = document.createElement('div'); modal.id = 'globalModal'; modal.className = 'modal'; document.body.appendChild(modal); }
      modal.innerHTML = html; modal.classList.add('open');
      if (c.level) document.getElementById('classLevel').value = c.level;
    }

    function parseScheduleText(text) {
      const schedule = {};
      text.split('\\n').map(l => l.trim()).filter(Boolean).forEach(line => {
        const parts = line.split(/\\s+/);
        if (parts.length >= 2) schedule[parts[0]] = parts.slice(1).join(' ');
      });
      return schedule;
    }

    async function saveClass(e, id) {
      e.preventDefault();
      const body = {
        school_id: parseInt(currentSchoolId),
        name: document.getElementById('className').value,
        martial_art: document.getElementById('classMartialArt').value || null,
        level: document.getElementById('classLevel').value,
        capacity: parseInt(document.getElementById('classCapacity').value) || 20,
        duration_minutes: parseInt(document.getElementById('classDuration').value) || 60,
        instructor: document.getElementById('classInstructor').value || null,
        price: parseFloat(document.getElementById('classPrice').value) || 0,
        description: document.getElementById('classDesc').value || null,
        schedule: parseScheduleText(document.getElementById('classSchedule').value),
        is_active: document.getElementById('classActive').checked
      };
      const url = id ? '/kanchoai/api/v1/classes/' + id : '/kanchoai/api/v1/classes';
      await fetch(url, { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      closeModal(); tabsLoaded.classes = false; loadClassesAdmin();
    }

    async function editClass(id) {
      const res = await fetch('/kanchoai/api/v1/classes?school_id=' + currentSchoolId);
      const data = await res.json();
      const cls = data.data?.find(c => c.id === id);
      if (cls) openClassForm(cls);
    }

    async function deleteClass(id) {
      if (!confirm('Delete this class? This will also remove related attendance and enrollment records.')) return;
      await fetch('/kanchoai/api/v1/classes/' + id, { method: 'DELETE' });
      tabsLoaded.classes = false; loadClassesAdmin();
    }

    // ==================== BELT REQUIREMENTS TAB ====================
    async function loadBeltRequirements() {
      const schoolId = currentSchoolId;
      if (!schoolId) return;
      try {
        const res = await fetch('/kanchoai/api/v1/belt-requirements?school_id=' + schoolId, { headers: { 'Authorization': 'Bearer ' + authToken } });
        const data = await res.json();
        const container = document.getElementById('beltLadder');
        const empty = document.getElementById('beltsEmpty');
        if (!data.success || !data.data.length) { container.innerHTML = ''; empty.classList.remove('hidden'); return; }
        empty.classList.add('hidden');
        container.innerHTML = data.data.map((b, idx) => {
          const color = b.belt_color || '#888';
          const reqs = (b.requirements || []);
          return '<div class="card rounded-xl p-4 flex items-start gap-4" style="border-left:4px solid ' + color + '">' +
            '<div class="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg" style="background:' + color + ';color:' + (color === '#FFFFFF' || color === '#FFD700' ? '#000' : '#fff') + '">' + (idx + 1) + '</div>' +
            '<div class="flex-1 min-w-0"><div class="flex items-center justify-between"><h4 class="font-bold">' + b.belt_name + '</h4><div class="flex gap-1">' +
            '<button class="btn-ghost btn-sm" onclick="editBelt(' + b.id + ')"><i class="fas fa-edit"></i></button>' +
            '<button class="btn-ghost btn-sm text-red-400" onclick="deleteBelt(' + b.id + ')"><i class="fas fa-trash"></i></button></div></div>' +
            '<div class="text-sm text-gray-400 mt-1">' + b.min_classes + ' classes &middot; ' + b.min_months + ' months' + (b.testing_fee > 0 ? ' &middot; $' + parseFloat(b.testing_fee).toFixed(0) + ' test fee' : '') + '</div>' +
            (reqs.length ? '<ul class="mt-2 text-xs text-gray-500 list-disc list-inside">' + reqs.map(r => '<li>' + r + '</li>').join('') + '</ul>' : '') +
            '</div></div>';
        }).join('');
      } catch (e) { console.error('loadBeltRequirements error:', e); }
    }
    function openBeltForm(existing) {
      const b = existing || {};
      const html = '<div class="modal-backdrop" onclick="closeModal()"></div><div class="modal-content" style="max-width:500px"><h3 class="text-lg font-bold mb-4">' + (b.id ? 'Edit' : 'Add') + ' Belt</h3><form onsubmit="saveBelt(event,' + (b.id || 'null') + ')">' +
        '<div class="grid grid-cols-2 gap-3 mb-3"><div><label class="block text-sm text-gray-400 mb-1">Belt Name</label><input id="beltName" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white" value="' + (b.belt_name || '') + '" required></div>' +
        '<div><label class="block text-sm text-gray-400 mb-1">Color</label><input id="beltColor" type="color" class="w-full h-10 bg-gray-800 border border-gray-600 rounded" value="' + (b.belt_color || '#FFFFFF') + '"></div></div>' +
        '<div class="grid grid-cols-3 gap-3 mb-3"><div><label class="block text-sm text-gray-400 mb-1">Sort Order</label><input id="beltOrder" type="number" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white" value="' + (b.sort_order || 0) + '"></div>' +
        '<div><label class="block text-sm text-gray-400 mb-1">Min Classes</label><input id="beltMinClasses" type="number" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white" value="' + (b.min_classes || 0) + '"></div>' +
        '<div><label class="block text-sm text-gray-400 mb-1">Min Months</label><input id="beltMinMonths" type="number" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white" value="' + (b.min_months || 0) + '"></div></div>' +
        '<div class="mb-3"><label class="block text-sm text-gray-400 mb-1">Testing Fee ($)</label><input id="beltFee" type="number" step="0.01" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white" value="' + (b.testing_fee || 0) + '"></div>' +
        '<div class="mb-4"><label class="block text-sm text-gray-400 mb-1">Requirements (one per line)</label><textarea id="beltReqs" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white" rows="4">' + (b.requirements ? b.requirements.join('\\n') : '') + '</textarea></div>' +
        '<div class="flex gap-2"><button type="submit" class="btn-primary">Save</button><button type="button" class="btn-ghost" onclick="closeModal()">Cancel</button></div></form></div>';
      let modal = document.getElementById('globalModal');
      if (!modal) { modal = document.createElement('div'); modal.id = 'globalModal'; modal.className = 'modal'; document.body.appendChild(modal); }
      modal.innerHTML = html; modal.classList.add('open');
    }
    async function saveBelt(e, id) {
      e.preventDefault();
      const body = {
        school_id: parseInt(currentSchoolId),
        belt_name: document.getElementById('beltName').value,
        belt_color: document.getElementById('beltColor').value,
        sort_order: parseInt(document.getElementById('beltOrder').value) || 0,
        min_classes: parseInt(document.getElementById('beltMinClasses').value) || 0,
        min_months: parseInt(document.getElementById('beltMinMonths').value) || 0,
        testing_fee: parseFloat(document.getElementById('beltFee').value) || 0,
        requirements: document.getElementById('beltReqs').value.split('\\n').map(s => s.trim()).filter(Boolean)
      };
      const url = id ? '/kanchoai/api/v1/belt-requirements/' + id : '/kanchoai/api/v1/belt-requirements';
      await fetch(url, { method: id ? 'PUT' : 'POST', headers: { 'Authorization': 'Bearer ' + authToken, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      closeModal(); tabsLoaded.belts = false; loadBeltRequirements();
    }
    async function editBelt(id) {
      const res = await fetch('/kanchoai/api/v1/belt-requirements?school_id=' + currentSchoolId, { headers: { 'Authorization': 'Bearer ' + authToken } });
      const data = await res.json();
      const belt = data.data?.find(b => b.id === id);
      if (belt) openBeltForm(belt);
    }
    async function deleteBelt(id) {
      if (!confirm('Delete this belt requirement?')) return;
      await fetch('/kanchoai/api/v1/belt-requirements/' + id, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + authToken } });
      tabsLoaded.belts = false; loadBeltRequirements();
    }
    async function seedBeltDefaults() {
      if (!confirm('Seed default belt hierarchy for this school?')) return;
      await fetch('/kanchoai/api/v1/seed-belt-requirements', { method: 'POST', headers: { 'Authorization': 'Bearer ' + authToken, 'Content-Type': 'application/json' } });
      tabsLoaded.belts = false; loadBeltRequirements();
    }

    // Initialize
    async function init() {
      // 1. Check for signup-success redirect (takes priority)
      const isSignupRedirect = await checkSignupSuccess();
      if (isSignupRedirect) return;

      // 2. Check for password reset token
      const isResetRedirect = await checkResetToken();
      if (isResetRedirect) return;

      // 3. Check for existing auth token
      const isLoggedIn = await checkAuth();
      if (isLoggedIn) { enterAuthenticatedMode(); return; }

      // 4. Check for ?plan= or ?action= params (from Ronin or external links)
      const urlParams = new URLSearchParams(window.location.search);
      const planParam = urlParams.get('plan');
      const actionParam = urlParams.get('action');

      if (planParam && (planParam === 'intelligence' || planParam === 'pro')) {
        window.history.replaceState({}, document.title, window.location.pathname);
        loadSchools();
        loadClasses();
        setTimeout(() => selectPlan(planParam), 300);
        return;
      }

      if (actionParam === 'schedule') {
        window.history.replaceState({}, document.title, window.location.pathname);
        loadSchools();
        loadClasses();
        setTimeout(() => openTrialBookingModal(), 300);
        return;
      }

      // 5. Not authenticated: show landing page in demo mode
      loadSchools();
      loadClasses();
      checkSubscriptionSuccess(); // Legacy ?subscribe=success flow
    }

    init();

    // Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        const swPath = window.location.hostname.includes('kanchoai.com') ? '/sw.js' : '/kanchoai/sw.js';
        navigator.serviceWorker.register(swPath)
          .then(reg => console.log('Kancho AI SW registered'))
          .catch(err => console.log('SW registration failed:', err));
      });
    }
  </script>

  <!-- WhatsApp Widget -->
  <a href="https://wa.me/18136414177" target="_blank" rel="noopener" style="position:fixed;bottom:24px;right:24px;z-index:9999;width:60px;height:60px;background:#25D366;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.3);transition:transform 0.2s;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
  </a>

</body>
</html>
  `);
});

module.exports = app;
