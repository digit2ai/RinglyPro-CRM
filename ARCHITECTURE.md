# RinglyPro CRM - System Architecture

```
                                    INTERNET
                                       |
                            ┌──────────┴──────────┐
                            │   Render Platform    │
                            │   Port: 10000        │
                            │   Auto-deploy: main  │
                            └──────────┬──────────┘
                                       |
                    https://aiagent.ringlypro.com
                                       |
                ┌──────────────────────┬┘
                |                      |
         ┌──────┴──────┐     ┌────────┴────────┐
         │ Custom Domain│     │  Main Express    │
         │ kanchoai.com │────▶│  src/app.js      │
         └─────────────┘     │  Port: 10000     │
                              └────────┬────────┘
                                       |
     ┌─────────────────────────────────┤
     |                                 |
     ▼                                 ▼
┌─────────────┐          ┌──────────────────────────────────────────┐
│  MIDDLEWARE  │          │          ROUTE MOUNTS                    │
├─────────────┤          ├──────────────────────────────────────────┤
│ Helmet      │          │                                          │
│ CORS        │          │  /ronin ─────────────▶ Ronin Brotherhood │
│ Morgan      │          │  /kanchoai ──────────▶ KanchoAI          │
│ Sessions    │          │  /aiastore ──────────▶ Store Health AI   │
│ Body Parser │          │  /tunjoracing ───────▶ TunjoRacing       │
│ JWT Auth    │          │  /spark ─────────────▶ Spark AI          │
│ Static Files│          │  /enruta ────────────▶ ENRUTA            │
└─────────────┘          │  /quicktask ─────────▶ QuickTask         │
                          │                                          │
                          │  /api/auth ─────────▶ CRM Auth          │
                          │  /api/contacts ─────▶ Contact Mgmt      │
                          │  /api/calls ────────▶ Call Management    │
                          │  /api/messages ─────▶ SMS/WhatsApp      │
                          │  /api/credits ──────▶ Billing           │
                          │  /api/voice ────────▶ Voice Bot Core    │
                          │  /api/email ────────▶ Email Marketing   │
                          │  /api/storefront ───▶ E-Commerce        │
                          │  /api/mcp ──────────▶ AI Copilot        │
                          │  /api/admin ────────▶ Admin Portal      │
                          │                                          │
                          │  /voice/elevenlabs ─▶ ElevenLabs Voice  │
                          │  / (root) ──────────▶ Rachel/Ana/Lina   │
                          │  /webhook/twilio ───▶ Twilio Webhooks   │
                          │  /webhooks ─────────▶ Stripe Webhooks   │
                          └──────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════
                        SUB-APPLICATIONS
═══════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────┐
│                      /ronin - RONIN BROTHERHOOD                     │
│                      ronin/src/index.js                              │
├─────────────────────────────────────────────────────────────────────┤
│  GET  /              Landing Page (EN) + Geo-redirect               │
│  GET  /es            Landing Page (Spanish)                         │
│  GET  /fil           Landing Page (Filipino)                        │
│  GET  /red-belt-society   Red Belt Society Page                     │
│  GET  /admin         Admin Dashboard (inline HTML)                  │
│                                                                     │
│  API: /api/v1/members     Membership (register/login/profile)       │
│  API: /api/v1/products    E-commerce store                          │
│  API: /api/v1/orders      Order management                          │
│  API: /api/v1/training    RPDTA courses                             │
│  API: /api/v1/events      Events & seminars                         │
│  API: /api/v1/sponsors    Sponsorship inquiries (SendGrid email)    │
│  API: /api/v1/admin       Admin auth & dashboard stats              │
│  API: /api/v1/press       Press releases                            │
│                                                                     │
│  Features: ElevenLabs AI Widget, Multi-language, IP Geo-detection   │
│  Auth: JWT (members) + Hardcoded admin credentials                  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      /kanchoai - KANCHO AI                          │
│                      kancho-ai/src/index.js                         │
├─────────────────────────────────────────────────────────────────────┤
│  GET  /              School Admin Dashboard (React PWA)             │
│  GET  /student       Student Portal (React PWA)                     │
│                                                                     │
│  API: /api/v1/schools          School management                    │
│  API: /api/v1/students         Student CRUD + churn scoring         │
│  API: /api/v1/classes          Class scheduling                     │
│  API: /api/v1/attendance       Attendance tracking                  │
│  API: /api/v1/belt-requirements Belt progression system             │
│  API: /api/v1/merchandise      School merchandise/shop              │
│  API: /api/v1/revenue          Revenue analytics                    │
│  API: /api/v1/leads            Lead capture & management            │
│  API: /api/v1/student/auth     Student portal auth (register/login) │
│  API: /api/v1/student/payments Student payments (Stripe)            │
│  API: /api/v1/student/portal   Student portal data                  │
│  API: /api/v1/bridge/auth      CRM bridge auth (signup/login)       │
│  API: /api/v1/bridge/billing   Bridge billing (Stripe checkout)     │
│  API: /api/v1/voice            AI voice receptionist                │
│  API: /api/v1/health-metrics   Business health scoring              │
│  API: /api/v1/outbound         Outbound AI calls                    │
│                                                                     │
│  Auth: JWT (school owners via CRM bridge + students separate)       │
│  Payments: Stripe (checkout sessions, subscriptions)                │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      /aiastore - STORE HEALTH AI                    │
│                      store-health-ai/src/index.js                   │
├─────────────────────────────────────────────────────────────────────┤
│  GET  /              React Dashboard                                │
│  API: /api/v1/stores       Store management                         │
│  API: /api/v1/health       Health checks & KPIs                     │
│  API: /api/v1/alerts       Alert system                             │
│  API: /api/v1/tasks        Task management                          │
│  API: /api/v1/escalations  Escalation workflows                     │
│  API: /api/v1/dashboard    Analytics                                │
│  Auth: JWT                                                          │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      /tunjoracing - TUNJORACING                     │
│                      tunjoracing/src/index.js                       │
├─────────────────────────────────────────────────────────────────────┤
│  GET  /              React Dashboard (Vite)                         │
│  API: /api/v1/sponsors     Sponsorship management                   │
│  API: /api/v1/fans         Fan engagement                           │
│  API: /api/v1/products     Merchandise                              │
│  API: /api/v1/orders       E-commerce orders                        │
│  API: /api/v1/races        Race events                              │
│  API: /api/v1/press        Press releases                           │
│  Auth: JWT                                                          │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────┐
│ /spark - SPARK AI    │ │ /enruta - ENRUTA     │ │ /quicktask       │
│ School analytics,    │ │ Vehicle document     │ │ Voice-powered    │
│ churn detection,     │ │ management with AI   │ │ to-do PWA with   │
│ revenue tracking     │ │ (Spanish focus)      │ │ calendar sync    │
│ React Dashboard      │ │                      │ │                  │
└──────────────────────┘ └──────────────────────┘ └──────────────────┘

═══════════════════════════════════════════════════════════════════════
                     VOICE AI AGENTS
═══════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────────┐   │
│  │  Rachel   │  │   Ana     │  │   Lina    │  │ Kancho Voice  │   │
│  │ (English) │  │ (Spanish) │  │ (Spanish) │  │ Receptionist  │   │
│  │           │  │           │  │  Legacy   │  │               │   │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └──────┬────────┘   │
│        │              │              │               │             │
│        └──────────────┴──────────────┴───────────────┘             │
│                              │                                      │
│                    ┌─────────┴─────────┐                           │
│                    │  Twilio (Calls)   │                           │
│                    │  ElevenLabs (TTS) │                           │
│                    │  WebRTC (Browser) │                           │
│                    └───────────────────┘                           │
└─────────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════
                         DATABASE
═══════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────┐
│                  PostgreSQL (Render)                                 │
│                  ringlypro_crm_database                              │
│                                                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────┐   │
│  │   CRM Tables    │  │  Ronin Tables   │  │  Kancho Tables   │   │
│  │                 │  │                 │  │                  │   │
│  │ Users           │  │ ronin_members   │  │ kancho_schools   │   │
│  │ Clients         │  │ ronin_orders    │  │ kancho_students  │   │
│  │ Contacts        │  │ ronin_products  │  │ kancho_classes   │   │
│  │ Appointments    │  │ ronin_groups    │  │ kancho_attendance│   │
│  │ Messages        │  │ ronin_events    │  │ kancho_leads     │   │
│  │ Calls           │  │ ronin_sponsors  │  │ kancho_revenue   │   │
│  │ Credits         │  │ ronin_training  │  │ kancho_merch     │   │
│  │ Projects        │  │ ronin_press     │  │ kancho_belt_reqs │   │
│  └─────────────────┘  └─────────────────┘  │ kancho_payments  │   │
│                                              │ kancho_student_  │   │
│  ┌─────────────────┐  ┌─────────────────┐  │   auth           │   │
│  │  Tunjo Tables   │  │  Store Health   │  └──────────────────┘   │
│  │                 │  │    Tables       │                          │
│  │ tunjo_sponsors  │  │                 │  ┌──────────────────┐   │
│  │ tunjo_fans      │  │ stores          │  │  Other Tables    │   │
│  │ tunjo_products  │  │ health_scores   │  │                  │   │
│  │ tunjo_orders    │  │ alerts          │  │ spark_*          │   │
│  │ tunjo_races     │  │ tasks           │  │ enruta_*         │   │
│  │ tunjo_media     │  │ escalations     │  │ quicktask_*      │   │
│  │ tunjo_press     │  │ kpis            │  │                  │   │
│  └─────────────────┘  └─────────────────┘  └──────────────────┘   │
│                                                                     │
│  Connection: CRM_DATABASE_URL || DATABASE_URL                       │
│  ORM: Sequelize | SSL: Required | Auto-sync on startup              │
└─────────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════
                    EXTERNAL INTEGRATIONS
═══════════════════════════════════════════════════════════════════════

┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐
│   Twilio     │  │  ElevenLabs  │  │   Stripe     │  │  SendGrid  │
│              │  │              │  │              │  │            │
│ Voice calls  │  │ Voice AI TTS │  │ Payments     │  │ Email      │
│ SMS          │  │ Convai Widget│  │ Subscriptions│  │ Marketing  │
│ WhatsApp     │  │ WebRTC       │  │ Checkout     │  │ Campaigns  │
│ Phone nums   │  │ Agent embed  │  │ Webhooks     │  │ Sponsor    │
│              │  │              │  │              │  │ alerts     │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘
       │                 │                 │               │
       └─────────────────┴─────────────────┴───────────────┘
                                │
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐
│   OpenAI     │  │ GoHighLevel  │  │   AWS S3     │  │  Google    │
│              │  │   (GHL)      │  │              │  │  Calendar  │
│ DALL-E       │  │ CRM sync     │  │ File storage │  │  OAuth     │
│ GPT content  │  │ Contact sync │  │ Photo uploads│  │  Event sync│
│ PixlyPro     │  │ Payments     │  │ All services │  │            │
└──────────────┘  └──────────────┘  └──────────────┘  └────────────┘

═══════════════════════════════════════════════════════════════════════
                      FRONTEND APPS
═══════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────┐
│                     React Dashboards (Vite)                         │
│                                                                     │
│  /kanchoai/        KanchoAI School Admin Dashboard (PWA)            │
│  /kanchoai/student KanchoAI Student Portal (PWA)                    │
│  /aiastore/        Store Health AI Dashboard                        │
│  /tunjoracing/     TunjoRacing Dashboard                            │
│  /spark/           Spark AI Dashboard                               │
├─────────────────────────────────────────────────────────────────────┤
│                     Inline HTML Pages                                │
│                                                                     │
│  /ronin/           Ronin Landing (EN/ES/FI + geo-redirect)          │
│  /ronin/admin      Ronin Admin Dashboard                            │
│  /ronin/red-belt-society  Red Belt Society Page                     │
├─────────────────────────────────────────────────────────────────────┤
│                     EJS Server-Rendered                              │
│                                                                     │
│  /                 CRM Dashboard                                    │
│  /login            CRM Login                                        │
│  /admin            Admin Portal                                     │
│  /photo-studio*    Photo Studio UI                                  │
│  /pixlypro*        PixlyPro AI Photo Enhancement                    │
│  /settings/*       Integration Settings                             │
│  /storefront/:slug Public Storefronts                               │
│  /ordergopro*      OrderGoPro SaaS                                  │
├─────────────────────────────────────────────────────────────────────┤
│                     Static Pages                                    │
│                                                                     │
│  /digit2ai         Investor Page (EN)                               │
│  /digit2ai-es      Investor Page (ES)                               │
│  /privacy          Privacy Policy                                   │
│  /terms            Terms of Service                                 │
│  /partnership*     Partnership Pages                                │
│  /all-in-one       LaunchStack Landing                              │
└─────────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════
                    DEPLOYMENT PIPELINE
═══════════════════════════════════════════════════════════════════════

  Developer ──▶ git push origin main ──▶ Render Auto-Deploy (~2 min)
                                              │
                                    ┌─────────┴──────────┐
                                    │    build.sh         │
                                    │                     │
                                    │ 1. npm install      │
                                    │ 2. Build dashboards │
                                    │    (Vite)           │
                                    │ 3. DB auto-sync     │
                                    │    (Sequelize)      │
                                    │ 4. Start server     │
                                    │    (node src/app.js)│
                                    └─────────────────────┘
```
