# Twilio Voice Bot CRM Integration

A comprehensive CRM system with Twilio voice bot integration, built with Node.js, PostgreSQL, and Twilio services.

## 🚀 Features

- **Voice Bot Integration** - Intelligent phone system with speech recognition
- **SMS Messaging** - Two-way SMS communication with customers
- **Contact Management** - Complete CRM functionality with PostgreSQL
- **Appointment Scheduling** - Integrated booking system
- **Real-time Dashboard** - Web-based admin interface
- **Webhook Support** - Twilio webhook handlers for voice and SMS

## 🛠️ Technology Stack

- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL with Sequelize ORM
- **Telephony**: Twilio (Voice, SMS, Messaging)
- **Frontend**: EJS templates, Tailwind CSS
- **Deployment**: Render.com ready

## 📋 Prerequisites

- Node.js 16+ 
- PostgreSQL database (local or cloud)
- Twilio account with phone number
- Git for version control

## 🌐 Render.com Deployment

### Step 1: Render Service Settings
- **Service Type**: Web Service
- **Environment**: Node.js
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Region**: Choose closest to your users

### Step 2: Environment Variables in Render
Set these environment variables in your Render service dashboard:

```bash
# Database Configuration (REQUIRED)
DATABASE_URL=postgresql://user:password@hostname:port/database_name

# Twilio Configuration (REQUIRED)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_MESSAGING_SERVICE_SID=MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+1234567890

# Application Configuration (REQUIRED)
NODE_ENV=production
PORT=3000
JWT_SECRET=your-super-secure-random-jwt-secret-key-here
WEBHOOK_BASE_URL=https://your-app-name.onrender.com

# Optional
FRONTEND_URL=https://your-app-name.onrender.com
```

### Step 3: PostgreSQL Database Setup
1. In Render Dashboard → Create → PostgreSQL
2. Choose your plan (Free tier available)
3. Copy the **External Database URL** as your `DATABASE_URL`

### Step 4: Get Twilio Credentials
1. Sign up at [Twilio Console](https://console.twilio.com/)
2. Get **Account SID** and **Auth Token** from main dashboard
3. Buy a phone number with Voice and SMS capabilities
4. Create a Messaging Service and get the SID

### Step 5: Configure Twilio Webhooks
After deployment, configure these webhook URLs in Twilio Console:

1. **Phone Numbers** → **Active Numbers** → **Your Number**
2. Set webhooks:
   - **Voice**: `https://your-app-name.onrender.com/webhook/twilio/voice`
   - **Messaging**: `https://your-app-name.onrender.com/webhook/twilio/sms`

## 🔗 API Endpoints

### Webhooks
- `POST /webhook/twilio/voice` - Voice call handling
- `POST /webhook/twilio/sms` - SMS message handling
- `POST /webhook/twilio/gather` - Voice input processing
- `POST /webhook/twilio/recording` - Voice recording handling

### API Routes
- `GET /api/contacts` - List contacts
- `POST /api/contacts` - Create contact
- `GET /api/appointments` - List appointments
- `POST /api/appointments` - Create appointment
- `POST /api/messages/sms` - Send SMS
- `GET /api/messages/test` - Test Twilio connection

### System
- `GET /health` - Health check
- `GET /` - Dashboard interface

## 🧪 Testing Your Deployment

### 1. Check Health Status
```bash
curl https://your-app-name.onrender.com/health
```

### 2. Test Twilio Connection
```bash
curl https://your-app-name.onrender.com/api/messages/test
```

### 3. Send Test SMS
```bash
curl -X POST https://your-app-name.onrender.com/api/messages/sms \
  -H "Content-Type: application/json" \
  -d '{"to": "+1234567890", "message": "Test message"}'
```

### 4. Test Voice Bot
Call your Twilio phone number and follow the voice prompts:
- Say "sales" or press 1 for sales
- Say "support" or press 2 for support
- Say "appointment" or press 3 for appointments

## 📱 Voice Bot Features

When customers call your Twilio number, they'll hear:
> "Hello! Welcome to our CRM system. Please tell me how I can help you today, or press 1 for sales, 2 for support, or 3 to schedule an appointment."

**Voice Commands:**
- **Sales**: "sales", "1" → Transfers to sales team
- **Support**: "support", "2" → Records support request
- **Appointments**: "appointment", "3" → Scheduling assistance
- **Other**: Any other input → Connects to representative

## 🎯 Dashboard Features

Access your dashboard at: `https://your-app-name.onrender.com`

**Features:**
- **Status Cards**: Contact counts, appointments, messages, calls
- **Twilio Connection Test**: Verify your credentials
- **Send Test SMS**: Send messages directly from dashboard
- **Webhook URLs**: Copy-paste for Twilio configuration
- **System Status**: Real-time health monitoring

## ⚙️ Local Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/twilio-voice-bot-crm.git
   cd twilio-voice-bot-crm
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your actual values
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

## 🔧 Project Structure
```
twilio-voice-bot-crm/
├── package.json              # Dependencies and scripts
├── .env.example              # Environment variables template
├── .gitignore               # Git ignore rules
├── README.md                # This file
├── src/
│   ├── app.js              # Express app configuration
│   ├── server.js           # Server startup
│   ├── config/
│   │   └── database.js     # Database configuration
│   └── routes/
│       ├── contacts.js     # Contact management routes
│       ├── appointments.js # Appointment routes
│       └── messages.js     # Messaging routes
└── views/
    └── dashboard.ejs       # Dashboard template
```

## 🚀 Deployment Checklist

- [ ] Upload all files to GitHub repository
- [ ] Create Render Web Service
- [ ] Set all environment variables in Render
- [ ] Create PostgreSQL database on Render
- [ ] Get Twilio account and phone number
- [ ] Configure Twilio webhooks with your Render URL
- [ ] Test health endpoint
- [ ] Test Twilio connection
- [ ] Test voice bot by calling your number
- [ ] Test SMS functionality

## ⚠️ Important Notes

### Security
- Never commit `.env` files to GitHub
- Use strong, random JWT secrets
- Keep Twilio credentials secure

### Render Free Tier
- App sleeps after 15 minutes of inactivity
- First request after sleep takes ~30 seconds
- 750 hours/month limit
- Consider paid plan for production

### Twilio Requirements
- Webhook URLs **must** use HTTPS (Render provides this)
- Webhook URLs **must** be publicly accessible
- Phone numbers need Voice and SMS capabilities

## 🆘 Support

- Check [Issues](https://github.com/yourusername/twilio-voice-bot-crm/issues)
- Review [Twilio Documentation](https://www.twilio.com/docs)
- Check [Render Documentation](https://render.com/docs)

## 📄 License

This project is licensed under the MIT License.

---

**Your CRM will be live at: `https://your-chosen-app-name.onrender.com`**