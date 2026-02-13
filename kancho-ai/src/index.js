// kancho-ai/src/index.js
// Kancho Martial Arts AI - Main Entry Point
// Mounted at /kanchoai in the main RinglyPro app

const express = require('express');
const path = require('path');
const app = express();

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
        <a href="https://checkout.stripe.com/c/pay/cs_live_a18grG2h3V8gz0gUChQ3o2R1FfHPo5GCMNtzTW5c0lLLThzQdOPHu0Zyfs#fidnandhYHdWcXxpYCc%2FJ2FgY2RwaXEnKSdkdWxOYHwnPyd1blppbHNgWjA0V012N2RDNlRHaUF3Yn19MUkzQ2R2SFRvQVVAVVJtMVJJNkhcQ1RURGlgQUdgQ2FUfWcwN2JGakJ3VmFWQHBIQEAzSXY2QGg1N310Y31LQHdiNTBBbjw0NTVIVzxdRGlNTCcpJ2N3amhWYHdzYHcnP3F3cGApJ2dkZm5id2pwa2FGamlqdyc%2FJyZjY2NjY2MnKSdpZHxqcHFRfHVgJz8ndmxrYmlgWmxxYGgnKSdga2RnaWBVaWRmYG1qaWFgd3YnP3F3cGB4JSUl" class="block w-full py-3 text-center bg-white/10 hover:bg-kancho-coral/20 border border-kancho-dark-border rounded-xl font-medium transition text-white no-underline">Get Started</a>
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
        <a href="https://checkout.stripe.com/c/pay/cs_live_a18grG2h3V8gz0gUChQ3o2R1FfHPo5GCMNtzTW5c0lLLThzQdOPHu0Zyfs#fidnandhYHdWcXxpYCc%2FJ2FgY2RwaXEnKSdkdWxOYHwnPyd1blppbHNgWjA0V012N2RDNlRHaUF3Yn19MUkzQ2R2SFRvQVVAVVJtMVJJNkhcQ1RURGlgQUdgQ2FUfWcwN2JGakJ3VmFWQHBIQEAzSXY2QGg1N310Y31LQHdiNTBBbjw0NTVIVzxdRGlNTCcpJ2N3amhWYHdzYHcnP3F3cGApJ2dkZm5id2pwa2FGamlqdyc%2FJyZjY2NjY2MnKSdpZHxqcHFRfHVgJz8ndmxrYmlgWmxxYGgnKSdga2RnaWBVaWRmYG1qaWFgd3YnP3F3cGB4JSUl" class="block w-full py-3 text-center bg-kancho-coral hover:bg-kancho-coral/80 rounded-xl font-medium transition text-white no-underline">Get Started</a>
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

  app.use('/api/v1/schools', schoolsRoutes);
  app.use('/api/v1/students', studentsRoutes);
  app.use('/api/v1/leads', leadsRoutes);
  app.use('/api/v1/dashboard', dashboardRoutes);
  app.use('/api/v1/health', healthRoutes);
  app.use('/api/v1/voice', voiceRoutes);
  app.use('/api/v1/health-metrics', healthMetricsRoutes);
  app.use('/api/v1/outbound', outboundRoutes);
  app.use('/api/v1/classes', classesRoutes);
  console.log('📞 Kancho Outbound Calling routes mounted at /api/v1/outbound');
  console.log('📅 Kancho Classes routes mounted at /api/v1/classes');

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
  app.post('/api/v1/seed-demo', async (req, res) => {
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

  console.log('Kancho AI API routes mounted:');
  console.log('  - /kanchoai/api/v1/schools');
  console.log('  - /kanchoai/api/v1/students');
  console.log('  - /kanchoai/api/v1/leads');
  console.log('  - /kanchoai/api/v1/dashboard');
  console.log('  - /kanchoai/api/v1/health');
  console.log('  - /kanchoai/api/v1/voice');
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
        padding-top: max(12px, env(safe-area-inset-top));
      }
      .mobile-main {
        padding: 16px !important;
        padding-bottom: calc(80px + env(safe-area-inset-bottom));
      }
      body {
        padding-bottom: calc(70px + env(safe-area-inset-bottom));
      }
      /* Touch-friendly buttons */
      button, .kancho-btn, a.kancho-btn {
        min-height: 44px;
        padding-left: 16px;
        padding-right: 16px;
      }
      select {
        min-height: 44px;
        font-size: 16px; /* Prevents iOS zoom */
      }
      /* Language toggle positioning for safe area */
      .fixed.bottom-4.left-4 {
        bottom: max(16px, env(safe-area-inset-bottom));
        left: max(16px, env(safe-area-inset-left));
      }
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
  <header class="border-b border-kancho-dark-border sticky top-0 z-50 bg-kancho-dark/95 backdrop-blur-xl">
    <div class="max-w-7xl mx-auto flex items-center justify-between px-6 py-4 mobile-header">
      <div class="flex items-center gap-3">
        <img src="${KANCHO_LOGO_URL}" alt="Kancho AI" class="w-10 h-10 md:w-12 md:h-12 rounded-lg object-contain">
        <div>
          <h1 class="text-xl md:text-2xl font-bold text-white tracking-tight">KANCHO AI</h1>
          <p class="text-xs text-gray-500">Inteligencia de Negocio con IA</p>
        </div>
      </div>
      <div class="flex items-center gap-4">
        <span class="text-gray-400 text-sm font-medium">DEMO</span>
        <i class="fas fa-chevron-right text-gray-500 text-xs"></i>
        <select id="schoolSelect" class="bg-kancho-dark-card border border-kancho-dark-border rounded-lg px-4 py-2.5 text-sm focus:border-kancho-coral focus:outline-none transition">
          <option value="">Selecciona tu Negocio...</option>
        </select>
        <elevenlabs-convai agent-id="agent_9201khc1vq3wfk1as9qyrt5fhrmw"></elevenlabs-convai>
        <script src="https://unpkg.com/@elevenlabs/convai-widget-embed" async type="text/javascript"></script>
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <main class="max-w-7xl mx-auto px-6 py-8 mobile-main">
    <!-- Welcome Section -->
    <div id="welcomeSection" class="py-16">
      <div class="text-center mb-16">
        <div class="w-80 h-80 md:w-96 md:h-96 rounded-3xl flex items-center justify-center mx-auto mb-8 glow-pulse overflow-hidden bg-kancho-dark-card border border-kancho-dark-border">
          <img src="${KANCHO_LOGO_URL}" alt="Kancho AI" class="w-64 h-64 md:w-80 md:h-80 object-contain">
        </div>
        <h2 class="text-4xl font-bold mb-4">Conoce a <span class="text-kancho">Kancho AI</span></h2>
        <p class="text-xl text-gray-300 mb-2">Tu Oficial de Inteligencia de Negocio con IA</p>
        <p class="text-gray-400 max-w-2xl mx-auto">
          Se conecta a los datos de tu empresa, entiende cómo funciona realmente tu negocio,
          y te entrega información clara sobre dónde estás perdiendo dinero, dónde puedes crecer,
          y qué acciones maximizarán tus ganancias y rendimiento.
        </p>
      </div>

      <!-- Value Props -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
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
          <h2 class="text-3xl font-bold mb-4">¿Listo Para Comenzar Tu <span class="text-kancho">Viaje en Artes Marciales?</span></h2>
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
          <h2 class="text-3xl font-bold mb-4">Explora Nuestros <span class="text-kancho">Programas</span></h2>
          <p class="text-gray-400 max-w-2xl mx-auto">Entrenamiento de artes marciales de clase mundial para todas las edades y niveles.</p>
        </div>
        <div id="classesGridEs" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          <div class="text-center col-span-full py-8">
            <i class="fas fa-spinner fa-spin text-kancho text-3xl mb-4 block"></i>
            <p class="text-gray-400">Cargando clases...</p>
          </div>
        </div>
      </div>

      <!-- Onboarding Section -->
      <div class="mt-16 pt-16 border-t border-kancho-dark-border">
        <div class="text-center mb-12">
          <h2 class="text-3xl font-bold mb-4">Comenzar con <span class="text-kancho">Kancho AI</span> es Muy Fácil</h2>
          <p class="text-gray-400 max-w-2xl mx-auto">Nuestro equipo dedicado te guía personalmente en cada paso del proceso.</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
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
          <h2 class="text-3xl font-bold mb-4">Cómo <span class="text-kancho">Kancho AI</span> Trabaja Para Ti</h2>
          <p class="text-gray-400 max-w-2xl mx-auto">Un sistema de IA completamente automatizado que monitorea, retiene y hace crecer tu escuela de artes marciales — 24/7, sin mover un dedo.</p>
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
          <h2 class="text-3xl font-bold mb-4">Elige Tu Plan de <span class="text-kancho">Kancho AI</span></h2>
          <p class="text-gray-400 max-w-2xl mx-auto">Potencia tu escuela de artes marciales con inteligencia de negocio impulsada por IA, recepcionista automatizada y soluciones CRM completas.</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
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
          <h2 class="text-3xl font-bold mb-4">Valor de Negocio para <span class="text-kancho">Tu Escuela</span></h2>
          <p class="text-gray-400 max-w-2xl mx-auto">Métricas reales que generan resultados reales. Así es como Kancho AI entrega valor medible a tu escuela de artes marciales.</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
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
        <div class="mt-12 bg-kancho-dark-card border border-kancho-dark-border rounded-2xl p-8">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <p class="text-3xl font-bold text-kancho">40%</p>
              <p class="text-gray-400 text-sm">Reducción Promedio de Abandono</p>
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
          <p class="text-xs font-medium mb-2" style="color: #E85A4F;">Powered by:</p>
          <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/68ec2cfb385c9833a43e685f.png" alt="Kancho AI" class="max-w-2xl w-full mx-auto mb-6">
        </div>
        <p class="text-kancho text-lg font-medium mb-2">Inteligencia de Negocio con IA — Plataforma de Voz y Analítica</p>
        <p class="text-gray-400 text-sm mb-8">Detección de Abandono · Puntuación de Prospectos · Analítica de Ingresos</p>

        <h2 class="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight max-w-5xl mx-auto mb-12" style="color: #5BA4D4;">
          Un sistema de IA todo-en-uno que encuentra negocios, los llama automáticamente, recolecta prospectos y agenda citas.
        </h2>

        <div class="flex flex-col sm:flex-row gap-4 justify-center mb-6">
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
  <footer class="border-t border-kancho-dark-border bg-kancho-dark/95 mt-20">
    <div class="max-w-7xl mx-auto px-6 py-16">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-12">
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

        let message = 'El puntaje de salud de tu negocio es ' + score + '. ';
        if (atRiskCount > 0) message += atRiskCount + ' estudiantes en riesgo ($' + revenueAtRisk.toLocaleString() + '). ';
        if (hotLeadsCount > 0) message += hotLeadsCount + ' prospectos calientes listos para convertir. ';
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

      function tryAutoStart() {
        attempts++;
        if (!widgetElement) return;

        const shadowRoot = widgetElement.shadowRoot;
        if (shadowRoot) {
          const btn = shadowRoot.querySelector('button');
          if (btn) {
            console.log('[Kancho] Auto-clic en botón del widget');
            statusEl.textContent = 'Conectado - Haz clic en el orbe para hablar';
            btn.click();
            return;
          }
        }

        if (attempts < maxAttempts) {
          setTimeout(tryAutoStart, 200);
        } else {
          console.log('[Kancho] Widget listo - haz clic en el orbe para comenzar');
          statusEl.textContent = 'Haz clic en el orbe para comenzar a hablar';
        }
      }

      setTimeout(tryAutoStart, 500);
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
      'BJJ': 'fa-hand-rock', 'Muay Thai': 'fa-fire', 'MMA': 'fa-fist-raised',
      'Karate': 'fa-hand-paper', 'Taekwondo': 'fa-running', 'Judo': 'fa-user-ninja',
      'Boxing': 'fa-mitten', 'Kickboxing': 'fa-fire-alt', 'Mixed': 'fa-shapes'
    };
    const martialArtColors = {
      'BJJ': '#8B5CF6', 'Muay Thai': '#F59E0B', 'MMA': '#EF4444',
      'Karate': '#3B82F6', 'Taekwondo': '#10B981', 'Judo': '#6366F1',
      'Boxing': '#DC2626', 'Kickboxing': '#F97316', 'Mixed': '#8B5CF6'
    };
    const classNamesEs = {
      'Brazilian Jiu-Jitsu Fundamentals': 'Jiu-Jitsu Brasileño Fundamentales',
      'Muay Thai Kickboxing': 'Muay Thai Kickboxing',
      'Kids Martial Arts': 'Artes Marciales para Niños',
      'Advanced MMA': 'MMA Avanzado',
      'Boxing Fundamentals': 'Boxeo Fundamentales',
      "Women's Self-Defense": 'Defensa Personal para Mujeres'
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
        const schedule = cls.schedule && typeof cls.schedule === 'object'
          ? Object.entries(cls.schedule).map(([d, t]) => d.charAt(0).toUpperCase() + d.slice(1, 3) + ': ' + t).join(' · ')
          : 'Horario por confirmar';
        return '<div class="card rounded-2xl p-6 hover:border-kancho-coral/50 transition-all duration-300 fade-in">' +
          '<div class="w-14 h-14 rounded-xl flex items-center justify-center mb-4" style="background: ' + color + '20;">' +
            '<i class="fas ' + icon + '" style="color: ' + color + '; font-size: 1.5rem;"></i></div>' +
          '<div class="flex items-center gap-2 mb-2">' +
            '<span class="text-xs font-bold px-2 py-1 rounded-full" style="background: ' + color + '20; color: ' + color + ';">' + cls.level + '</span>' +
            '<span class="text-xs text-gray-500">' + (cls.duration_minutes || 60) + ' min</span></div>' +
          '<h3 class="text-lg font-bold text-white mb-2">' + name + '</h3>' +
          '<p class="text-gray-400 text-sm mb-3">' + (cls.description || '') + '</p>' +
          '<div class="flex items-center gap-2 mb-2 text-sm"><i class="fas fa-user-circle text-kancho"></i>' +
            '<span class="text-gray-300">' + (cls.instructor || 'Por confirmar') + '</span></div>' +
          '<div class="flex items-center gap-2 mb-4 text-sm"><i class="fas fa-clock text-kancho"></i>' +
            '<span class="text-gray-400 text-xs">' + schedule + '</span></div>' +
          '<div class="flex items-center justify-between pt-4 border-t border-kancho-dark-border">' +
            '<div><p class="text-xl font-bold text-kancho">$' + (cls.price || 0) + '</p><p class="text-xs text-gray-500">por mes</p></div>' +
            '<button onclick="openTrialBookingModal()" class="px-4 py-2 kancho-btn rounded-lg text-sm font-medium transition">Reservar Prueba</button></div></div>';
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

  <!-- Kancho AI Text Chatbot -->
  <elevenlabs-convai agent-id="agent_9201khc1vq3wfk1as9qyrt5fhrmw"></elevenlabs-convai>
  <script src="https://unpkg.com/@elevenlabs/convai-widget-embed" async type="text/javascript"></script>
</body>
</html>
  `);
});

// Serve dashboard for all other routes (SPA fallback)
app.get('*', (req, res) => {
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
        <span class="text-gray-400 text-sm font-medium demo-label hidden md:inline">DEMO</span>
        <i class="fas fa-chevron-right text-gray-500 text-xs demo-label hidden md:inline"></i>
        <select id="schoolSelect" class="bg-kancho-dark-card border border-kancho-dark-border rounded-lg px-3 md:px-4 py-2 md:py-2.5 text-sm focus:border-kancho-coral focus:outline-none transition">
          <option value="">Select Business...</option>
        </select>
        <elevenlabs-convai agent-id="agent_9201khc1vq3wfk1as9qyrt5fhrmw"></elevenlabs-convai>
        <script src="https://unpkg.com/@elevenlabs/convai-widget-embed" async type="text/javascript"></script>
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

      <!-- CTA -->
      <div class="text-center mb-16">
        <p class="text-gray-400 mb-6">Select a business above to see Kancho in action, or:</p>
        <button onclick="seedDemoData()" class="kancho-btn px-8 py-4 rounded-xl font-medium transition shadow-lg">
          <i class="fas fa-rocket mr-2"></i>Load Demo Data
        </button>
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
        <div id="classesGrid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
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
          <p class="text-xs font-medium mb-2" style="color: #E85A4F;">Powered by:</p>
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
  </style>

  <script>
    let currentSchoolId = null;
    let currentSchoolData = null;
    let currentLanguage = 'en';

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

        // Kancho message
        let message = 'Your business health score is ' + score + '. ';
        if (atRiskCount > 0) message += atRiskCount + ' students at risk ($' + revenueAtRisk.toLocaleString() + '). ';
        if (hotLeadsCount > 0) message += hotLeadsCount + ' hot leads ready to convert. ';
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
      } catch (e) {
        console.error('Failed to load dashboard:', e);
      }
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
      const schoolSelect = document.getElementById('schoolSelect');
      const selectedOption = schoolSelect.options[schoolSelect.selectedIndex];
      schoolNameEl.textContent = selectedOption ? selectedOption.text : '';

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
      widgetElement.setAttribute('agent-id', KANCHO_VOICE_AGENT_ID);
      widgetElement.setAttribute('dynamic-variables', JSON.stringify(dynamicVars));
      container.appendChild(widgetElement);

      // Auto-click the widget to start conversation
      autoStartWidget();
    }

    function autoStartWidget() {
      let attempts = 0;
      const maxAttempts = 20;
      const statusEl = document.getElementById('voiceStatus');

      function tryAutoStart() {
        attempts++;
        if (!widgetElement) return;

        const shadowRoot = widgetElement.shadowRoot;
        if (shadowRoot) {
          const btn = shadowRoot.querySelector('button');
          if (btn) {
            console.log('[Kancho] Auto-clicking widget button');
            statusEl.textContent = 'Connected - Click orb to talk';
            btn.click();
            return;
          }
        }

        if (attempts < maxAttempts) {
          setTimeout(tryAutoStart, 200);
        } else {
          console.log('[Kancho] Widget ready - click orb to start');
          statusEl.textContent = 'Click the orb to start talking';
        }
      }

      setTimeout(tryAutoStart, 500);
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
      'BJJ': 'fa-hand-rock', 'Muay Thai': 'fa-fire', 'MMA': 'fa-fist-raised',
      'Karate': 'fa-hand-paper', 'Taekwondo': 'fa-running', 'Judo': 'fa-user-ninja',
      'Boxing': 'fa-mitten', 'Kickboxing': 'fa-fire-alt', 'Mixed': 'fa-shapes'
    };
    const martialArtColors = {
      'BJJ': '#8B5CF6', 'Muay Thai': '#F59E0B', 'MMA': '#EF4444',
      'Karate': '#3B82F6', 'Taekwondo': '#10B981', 'Judo': '#6366F1',
      'Boxing': '#DC2626', 'Kickboxing': '#F97316', 'Mixed': '#8B5CF6'
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
        const schedule = cls.schedule && typeof cls.schedule === 'object'
          ? Object.entries(cls.schedule).map(([d, t]) => d.charAt(0).toUpperCase() + d.slice(1, 3) + ': ' + t).join(' · ')
          : 'Schedule TBA';
        return '<div class="card rounded-2xl p-6 hover:border-kancho-coral/50 transition-all duration-300 fade-in">' +
          '<div class="w-14 h-14 rounded-xl flex items-center justify-center mb-4" style="background: ' + color + '20;">' +
            '<i class="fas ' + icon + '" style="color: ' + color + '; font-size: 1.5rem;"></i></div>' +
          '<div class="flex items-center gap-2 mb-2">' +
            '<span class="text-xs font-bold px-2 py-1 rounded-full" style="background: ' + color + '20; color: ' + color + ';">' + cls.level + '</span>' +
            '<span class="text-xs text-gray-500">' + (cls.duration_minutes || 60) + ' min</span></div>' +
          '<h3 class="text-lg font-bold text-white mb-2">' + cls.name + '</h3>' +
          '<p class="text-gray-400 text-sm mb-3">' + (cls.description || '') + '</p>' +
          '<div class="flex items-center gap-2 mb-2 text-sm"><i class="fas fa-user-circle text-kancho"></i>' +
            '<span class="text-gray-300">' + (cls.instructor || 'TBA') + '</span></div>' +
          '<div class="flex items-center gap-2 mb-4 text-sm"><i class="fas fa-clock text-kancho"></i>' +
            '<span class="text-gray-400 text-xs">' + schedule + '</span></div>' +
          '<div class="flex items-center justify-between pt-4 border-t border-kancho-dark-border">' +
            '<div><p class="text-xl font-bold text-kancho">$' + (cls.price || 0) + '</p><p class="text-xs text-gray-500">per month</p></div>' +
            '<button onclick="openTrialBookingModal()" class="px-4 py-2 kancho-btn rounded-lg text-sm font-medium transition">Book Trial</button></div></div>';
      }).join('');
    }

    function setLanguage(lang) {
      currentLanguage = lang;
      document.getElementById('langEn').classList.toggle('bg-kancho-coral/20', lang === 'en');
      document.getElementById('langEs').classList.toggle('bg-kancho-coral/20', lang === 'es');
    }

    // Plan selection and Stripe checkout
    async function selectPlan(plan, btn) {
      const planNames = {
        intelligence: 'Kancho Intelligence',
        pro: 'Kancho Pro'
      };

      const planPrices = {
        intelligence: 197,
        pro: 397
      };

      try {
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Processing...';

        // Create Stripe checkout session
        const response = await fetch('/kanchoai/api/v1/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan })
        });

        const data = await response.json();

        if (data.success && data.url) {
          // Redirect to Stripe Checkout
          window.location.href = data.url;
        } else {
          alert(data.error || 'Failed to create checkout session. Please try again.');
          btn.disabled = false;
          btn.innerHTML = originalText;
        }
      } catch (error) {
        console.error('Checkout error:', error);
        alert('Something went wrong. Please try again.');
        btn.disabled = false;
        btn.innerHTML = 'Get Started';
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

    // Initialize
    loadSchools();
    loadClasses();
    checkSubscriptionSuccess();

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

  <!-- Kancho AI Text Chatbot -->
  <elevenlabs-convai agent-id="agent_9201khc1vq3wfk1as9qyrt5fhrmw"></elevenlabs-convai>
  <script src="https://unpkg.com/@elevenlabs/convai-widget-embed" async type="text/javascript"></script>
</body>
</html>
  `);
});

module.exports = app;
