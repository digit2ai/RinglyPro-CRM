const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false // Allow inline scripts for dashboard
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL 
    : 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 1000,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', './views');

// Basic health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Dashboard route
app.get('/', (req, res) => {
  res.render('dashboard', { 
    title: 'Twilio Voice Bot CRM Dashboard',
    apiUrl: process.env.WEBHOOK_BASE_URL || `http://localhost:${process.env.PORT || 3000}`
  });
});

// Twilio webhook routes
app.post('/webhook/twilio/voice', (req, res) => {
  console.log('Voice webhook received:', req.body);
  
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech dtmf" timeout="3" speechTimeout="auto" action="/webhook/twilio/gather">
        <Say voice="alice">Hello! Welcome to our CRM system. Please tell me how I can help you today, or press 1 for sales, 2 for support, or 3 to schedule an appointment.</Say>
    </Gather>
    <Say voice="alice">I didn't receive any input. Please call back when you're ready.</Say>
</Response>`;

  res.type('text/xml');
  res.send(twiml);
});

app.post('/webhook/twilio/gather', (req, res) => {
  const { SpeechResult, Digits } = req.body;
  console.log('Gather result:', { SpeechResult, Digits });

  let response = '';
  
  if (Digits === '1' || (SpeechResult && SpeechResult.toLowerCase().includes('sales'))) {
    response = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice">Connecting you to our sales team. Please hold while we transfer your call.</Say>
    <Dial>+1234567890</Dial>
</Response>`;
  } else if (Digits === '2' || (SpeechResult && SpeechResult.toLowerCase().includes('support'))) {
    response = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice">Let me help you with support. Please describe your issue after the beep.</Say>
    <Record maxLength="60" action="/webhook/twilio/recording"/>
</Response>`;
  } else if (Digits === '3' || (SpeechResult && SpeechResult.toLowerCase().includes('appointment'))) {
    response = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice">I'd be happy to help you schedule an appointment. Please visit our website or stay on the line to speak with a representative.</Say>
    <Dial>+1234567890</Dial>
</Response>`;
  } else {
    response = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice">I understand you said: ${SpeechResult || 'nothing'}. Let me connect you to a representative who can better assist you.</Say>
    <Dial>+1234567890</Dial>
</Response>`;
  }

  res.type('text/xml');
  res.send(response);
});

app.post('/webhook/twilio/recording', (req, res) => {
  const { RecordingUrl, From } = req.body;
  console.log('Recording received:', { RecordingUrl, From });

  const response = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice">Thank you for your message. We've recorded your request and will get back to you shortly. Have a great day!</Say>
</Response>`;

  res.type('text/xml');
  res.send(response);
});

app.post('/webhook/twilio/sms', (req, res) => {
  const { Body, From, To } = req.body;
  console.log('SMS received:', { Body, From, To });

  // Auto-response for SMS
  const twilio = require('twilio')(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

  twilio.messages.create({
    body: `Thank you for your message: "${Body}". We'll respond shortly!`,
    from: To,
    to: From
  }).catch(err => console.error('SMS response error:', err));

  res.status(200).send('OK');
});

// API routes
app.use('/api/contacts', require('./routes/contacts'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/messages', require('./routes/messages'));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message 
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

module.exports = app;
