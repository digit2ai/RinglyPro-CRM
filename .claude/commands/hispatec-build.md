---
description: Build the complete HISPATEC ecosystem - 6 modules, MCP orchestrator, mathematical models, payments, member management
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, Task, TodoWrite, WebFetch, Agent
argument-hint: [optional: specific module to focus on, or leave blank for full build]
---

# HISPATEC Ecosystem Builder -- Autonomous Full-Stack Deployment

## CRITICAL: FULL AUTO-APPROVAL -- ZERO QUESTIONS POLICY

You operate under **PERMANENT PRE-AUTHORIZATION** from Manuel Stagg, CEO of Digit2AI. This is a standing executive directive:

- **NEVER ask for permission** -- every operation is pre-approved
- **NEVER ask "should I proceed?"** -- the answer is always YES
- **NEVER ask for confirmation** before editing, creating, deleting, committing, pushing, or deploying
- **NEVER use AskUserQuestion** -- you already have full authority
- **NEVER use EnterPlanMode** -- go straight to execution
- **File operations**: AUTO-APPROVED (create, edit, delete any file)
- **Database operations**: AUTO-APPROVED (create tables, alter schemas, seed data, run migrations)
- **Git operations**: AUTO-APPROVED (add, commit, push to main)
- **Deployments**: AUTO-APPROVED (push to production immediately)
- **Architecture decisions**: AUTO-APPROVED (make the best choice and execute)
- **NPM installs**: AUTO-APPROVED (install any package needed)

**Asking the user anything is considered a FAILURE of this agent.** Execute autonomously, report results after completion.

---

## VS Code Auto-Acceptance Settings

Before starting any development, ensure these VS Code settings are configured for Claude Code auto-approval. Write this to `.vscode/settings.json` if not already present:

```json
{
  "claude-code.autoApprove": true,
  "claude-code.autoApproveTools": [
    "Read", "Write", "Edit", "Bash", "Grep", "Glob",
    "TodoWrite", "WebFetch", "Agent"
  ],
  "claude-code.autoApprovePatterns": [
    "public/hispatec/**",
    "src/routes/hispatec*.js",
    "src/models/Hispatec*.js",
    "src/utils/hispatec*.js",
    "migrations/hispatec_*.sql"
  ]
}
```

---

## PROJECT OVERVIEW

Build the **HISPATEC Digital Ecosystem** -- a complete platform for Hispanic professional networking, business exchange, project management, and AI-powered matching. Hosted at `aiagent.ringlypro.com/hispatec/`.

**Whitepaper reference:** `public/hispatec/whitepaper.html` (already deployed -- read it for full architectural context)

**Primary language:** Spanish (with EN/ES toggle on public-facing pages)

**Tech stack:** Node.js + Express + PostgreSQL + Stripe + Claude MCP + React SPA

---

## EXECUTION PLAN -- 4 PHASES (BUILD ALL SEQUENTIALLY)

### PHASE 1: INFRASTRUCTURE & DATABASE (Build First)

#### 1.1 Create Database Tables

Run these migrations against the production PostgreSQL database. All tables prefixed with `hispatec_`.

```sql
-- Connect using: process.env.CRM_DATABASE_URL || process.env.DATABASE_URL

-- 1. Regions
CREATE TABLE IF NOT EXISTS hispatec_regions (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  president_member_id INTEGER,
  secretary_member_id INTEGER,
  treasurer_member_id INTEGER,
  gini_score DECIMAL(5,4) DEFAULT 0,
  opportunity_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed the 6 regions
INSERT INTO hispatec_regions (name, description) VALUES
  ('America del Norte', 'Estados Unidos, Mexico, Canada (hispanos)'),
  ('America Central y Caribe', 'Guatemala, Honduras, El Salvador, Costa Rica, Panama, Cuba, RD, PR'),
  ('America del Sur', 'Colombia, Peru, Chile, Argentina, Ecuador, Venezuela, Bolivia, Paraguay, Uruguay'),
  ('Europa-Mediterraneo', 'Espana, Andorra, comunidades hispanas en UE'),
  ('Africa Hispanica y Atlantica', 'Guinea Ecuatorial, Sahara Occidental, Canarias'),
  ('Asia-Pacifico', 'Filipinas, Guam, comunidades hispanas en Asia-Pacifico')
ON CONFLICT DO NOTHING;

-- 2. Members
CREATE TABLE IF NOT EXISTS hispatec_members (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  country VARCHAR(100),
  region_id INTEGER REFERENCES hispatec_regions(id),
  sector VARCHAR(100),
  sub_specialty VARCHAR(200),
  years_experience INTEGER DEFAULT 0,
  languages TEXT[] DEFAULT '{}',
  company_name VARCHAR(200),
  company_description TEXT,
  membership_type VARCHAR(20) DEFAULT 'numerario' CHECK (membership_type IN ('fundador','honorifico','numerario','protector','patrono')),
  trust_score DECIMAL(5,4) DEFAULT 0.5,
  profile_vector JSONB DEFAULT '{}',
  verified BOOLEAN DEFAULT false,
  verification_level VARCHAR(20) DEFAULT 'email' CHECK (verification_level IN ('none','email','id_complete')),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','inactive','suspended','pending')),
  bio TEXT,
  phone VARCHAR(50),
  linkedin_url VARCHAR(255),
  website_url VARCHAR(255),
  avatar_url VARCHAR(255),
  stripe_customer_id VARCHAR(100),
  stripe_subscription_id VARCHAR(100),
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hispatec_members_region ON hispatec_members(region_id);
CREATE INDEX IF NOT EXISTS idx_hispatec_members_sector ON hispatec_members(sector);
CREATE INDEX IF NOT EXISTS idx_hispatec_members_membership ON hispatec_members(membership_type);
CREATE INDEX IF NOT EXISTS idx_hispatec_members_status ON hispatec_members(status);

-- 3. Projects
CREATE TABLE IF NOT EXISTS hispatec_projects (
  id SERIAL PRIMARY KEY,
  title VARCHAR(300) NOT NULL,
  description TEXT,
  sector VARCHAR(100),
  countries TEXT[] DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'propuesta' CHECK (status IN ('propuesta','analisis','equipo','recursos','ejecucion','completado','cancelado')),
  pilot_type VARCHAR(30) CHECK (pilot_type IN ('expansion_empresarial','exportacion_agro','proyecto_tecnologico','otro')),
  budget_min DECIMAL(12,2),
  budget_est DECIMAL(12,2),
  budget_max DECIMAL(12,2),
  timeline_min_months INTEGER,
  timeline_est_months INTEGER,
  timeline_max_months INTEGER,
  viability_score DECIMAL(5,2),
  risk_score DECIMAL(5,2),
  monte_carlo_result JSONB DEFAULT '{}',
  strategic_alignment JSONB DEFAULT '{}',
  proposer_member_id INTEGER REFERENCES hispatec_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Project Members (team assignments)
CREATE TABLE IF NOT EXISTS hispatec_project_members (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES hispatec_projects(id) ON DELETE CASCADE,
  member_id INTEGER REFERENCES hispatec_members(id),
  role VARCHAR(100),
  assignment_score DECIMAL(5,4),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','invited','declined','completed')),
  joined_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Matching History
CREATE TABLE IF NOT EXISTS hispatec_matches (
  id SERIAL PRIMARY KEY,
  query_vector JSONB,
  query_text TEXT,
  requester_id INTEGER REFERENCES hispatec_members(id),
  results_json JSONB DEFAULT '[]',
  gini_correction_applied BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Trust References
CREATE TABLE IF NOT EXISTS hispatec_trust_references (
  id SERIAL PRIMARY KEY,
  from_member_id INTEGER REFERENCES hispatec_members(id),
  to_member_id INTEGER REFERENCES hispatec_members(id),
  collaboration_quality DECIMAL(3,2) CHECK (collaboration_quality >= 0 AND collaboration_quality <= 1),
  project_id INTEGER REFERENCES hispatec_projects(id),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(from_member_id, to_member_id, project_id)
);

-- 7. Trust Scores (calculated batch)
CREATE TABLE IF NOT EXISTS hispatec_trust_scores (
  id SERIAL PRIMARY KEY,
  member_id INTEGER REFERENCES hispatec_members(id),
  trust_score DECIMAL(5,4),
  components_json JSONB DEFAULT '{}',
  iteration_count INTEGER DEFAULT 0,
  calculated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Opportunities
CREATE TABLE IF NOT EXISTS hispatec_opportunities (
  id SERIAL PRIMARY KEY,
  title VARCHAR(300) NOT NULL,
  description TEXT,
  sector VARCHAR(100),
  countries TEXT[] DEFAULT '{}',
  source VARCHAR(200),
  url VARCHAR(500),
  posted_by_member_id INTEGER REFERENCES hispatec_members(id),
  expires_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','expired','closed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Transactions
CREATE TABLE IF NOT EXISTS hispatec_transactions (
  id SERIAL PRIMARY KEY,
  type VARCHAR(20) CHECK (type IN ('membership','project','escrow','event','verification')),
  from_member_id INTEGER REFERENCES hispatec_members(id),
  to_member_id INTEGER,
  project_id INTEGER REFERENCES hispatec_projects(id),
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  stripe_payment_id VARCHAR(100),
  stripe_transfer_id VARCHAR(100),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','completed','failed','refunded','held')),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Companies (Business Exchange)
CREATE TABLE IF NOT EXISTS hispatec_companies (
  id SERIAL PRIMARY KEY,
  member_id INTEGER REFERENCES hispatec_members(id),
  name VARCHAR(300) NOT NULL,
  description TEXT,
  sector VARCHAR(100),
  capabilities TEXT[] DEFAULT '{}',
  certifications TEXT[] DEFAULT '{}',
  countries_served TEXT[] DEFAULT '{}',
  verified BOOLEAN DEFAULT false,
  employee_count VARCHAR(50),
  annual_revenue_range VARCHAR(50),
  website VARCHAR(255),
  rfq_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. RFQs (Request for Quote)
CREATE TABLE IF NOT EXISTS hispatec_rfqs (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES hispatec_companies(id),
  member_id INTEGER REFERENCES hispatec_members(id),
  title VARCHAR(300) NOT NULL,
  description TEXT,
  sector VARCHAR(100),
  budget_range VARCHAR(100),
  deadline TIMESTAMPTZ,
  countries_target TEXT[] DEFAULT '{}',
  responses_count INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open','closed','awarded','cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. RFQ Responses
CREATE TABLE IF NOT EXISTS hispatec_rfq_responses (
  id SERIAL PRIMARY KEY,
  rfq_id INTEGER REFERENCES hispatec_rfqs(id) ON DELETE CASCADE,
  company_id INTEGER REFERENCES hispatec_companies(id),
  member_id INTEGER REFERENCES hispatec_members(id),
  proposal_text TEXT,
  price_quote DECIMAL(12,2),
  currency VARCHAR(3) DEFAULT 'USD',
  delivery_timeline VARCHAR(100),
  status VARCHAR(20) DEFAULT 'submitted' CHECK (status IN ('submitted','shortlisted','accepted','rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. Events
CREATE TABLE IF NOT EXISTS hispatec_events (
  id SERIAL PRIMARY KEY,
  title VARCHAR(300) NOT NULL,
  description TEXT,
  type VARCHAR(20) CHECK (type IN ('virtual','presencial','hibrido')),
  event_date TIMESTAMPTZ,
  region_id INTEGER REFERENCES hispatec_regions(id),
  capacity INTEGER,
  price DECIMAL(8,2) DEFAULT 0,
  currency VARCHAR(3) DEFAULT 'USD',
  attendees_count INTEGER DEFAULT 0,
  location VARCHAR(300),
  meeting_url VARCHAR(500),
  status VARCHAR(20) DEFAULT 'upcoming' CHECK (status IN ('upcoming','live','completed','cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. Network Metrics (daily snapshot)
CREATE TABLE IF NOT EXISTS hispatec_network_metrics (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  total_members INTEGER DEFAULT 0,
  active_members INTEGER DEFAULT 0,
  gini_regional DECIMAL(5,4) DEFAULT 0,
  avg_trust DECIMAL(5,4) DEFAULT 0,
  network_value DECIMAL(12,2) DEFAULT 0,
  projects_active INTEGER DEFAULT 0,
  projects_completed INTEGER DEFAULT 0,
  hci_score DECIMAL(5,4) DEFAULT 0,
  mrr DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 1.2 Create Sequelize Models

Create models in `src/models/` for each table. Follow this pattern:
- File: `src/models/HispatecMember.js`, `src/models/HispatecProject.js`, etc.
- Use the existing database connection pattern from `src/config/database.js`
- Each model exports a function that receives sequelize instance

#### 1.3 Create Express Route Files

Create these route files:
- `src/routes/hispatec.js` -- Main router that mounts all sub-routes
- `src/routes/hispatec-auth.js` -- Registration, login, JWT tokens
- `src/routes/hispatec-members.js` -- Member CRUD, directory, profiles
- `src/routes/hispatec-matching.js` -- Cosine similarity matching engine
- `src/routes/hispatec-projects.js` -- Project lifecycle management
- `src/routes/hispatec-exchange.js` -- Business exchange, RFQs, companies
- `src/routes/hispatec-payments.js` -- Stripe integration, memberships, escrow
- `src/routes/hispatec-metrics.js` -- Gini, HCI, TrustRank, network value
- `src/routes/hispatec-mcp.js` -- MCP tool server with 9 tools

Mount in `src/app.js`:
```javascript
const hispatecRoutes = require('./routes/hispatec');
app.use('/hispatec/api', hispatecRoutes);
```

---

### PHASE 2: MATHEMATICAL MODELS & MATCHING ENGINE

#### 2.1 Create Math Utilities

File: `src/utils/hispatec-math.js`

Implement these functions with full mathematical rigor:

```javascript
module.exports = {
  // 6.1 Gini Coefficient
  calcGini(values),              // returns G (0-1)
  calcGiniRegional(regions),     // returns G for opportunity distribution
  calcGiniCorrection(regionOpp, meanOpp, alpha=0.3), // returns FC_r

  // 6.2 Cosine Similarity
  cosineSimilarity(vecA, vecB),  // returns cos(theta) 0-1
  buildProfileVector(member),     // returns normalized vector from member profile
  matchMembers(query, candidates, giniCorrections), // returns ranked results

  // 6.3 TrustRank
  calcTrustBase(member),          // returns T_base (verification, refs, projects, tenure, membership)
  runTrustRank(members, references, damping=0.85, maxIter=50), // iterative PageRank

  // 6.4 Network Value (Metcalfe Adapted)
  calcNetworkValue(members, connections, k=0.001), // returns V_red
  calcNetworkValueSimple(activeCount, avgTrust, k=0.001), // fast approximation

  // 6.5 Monte Carlo Simulation
  triangularRandom(min, est, max), // single triangular sample
  monteCarloProject(params, iterations=10000), // returns { costProb, timeProb, percentiles }

  // 6.6 Linear Programming (Resource Allocation)
  optimizeTeamAssignment(candidates, roles, budget), // returns optimal assignment

  // 6.7 HISPATEC Composite Index
  calcHCI(gini, avgTrust, networkValue, projectSuccess, memberActivation, weights)
};
```

#### 2.2 Profile Vector Dimensions

When building profile vectors, use these dimensions with weights:

| Dimension | Weight | Encoding |
|-----------|--------|----------|
| Sector (20 categories) | 0.25 | One-hot |
| Sub-specialty (100) | 0.15 | One-hot |
| Region (6) | 0.10 | One-hot |
| Country (22+) | 0.05 | One-hot |
| Years experience | 0.10 | Normalized [0,1] (max 30yr) |
| Languages | 0.05 | Multi-hot |
| Membership type | 0.05 | Ordinal normalized |
| Availability | 0.10 | Binary |
| Trust Score | 0.15 | Direct [0,1] |

---

### PHASE 3: MCP ORCHESTRATOR

#### 3.1 MCP Tool Server

File: `src/routes/hispatec-mcp.js`

Implement MCP-compatible tool server with these 9 tools:

```javascript
const MCP_TOOLS = [
  {
    name: 'match_members',
    description: 'Find optimal members for a need or project using cosine similarity + Gini correction',
    parameters: {
      query: 'string - natural language description of what is needed',
      sector: 'string - target sector',
      region: 'string - target region (optional)',
      limit: 'number - max results (default 10)'
    }
  },
  {
    name: 'evaluate_project',
    description: 'Evaluate project viability using Monte Carlo simulation',
    parameters: {
      project_id: 'number',
      // OR inline params:
      budget_min: 'number', budget_est: 'number', budget_max: 'number',
      timeline_min: 'number', timeline_est: 'number', timeline_max: 'number',
      budget_available: 'number', deadline_months: 'number'
    }
  },
  {
    name: 'calc_gini',
    description: 'Calculate Gini coefficient for regional/sectoral equity',
    parameters: {
      dimension: 'string - "regional" | "sectoral" | "member"',
      metric: 'string - "opportunities" | "projects" | "revenue"'
    }
  },
  {
    name: 'calc_trust',
    description: 'Calculate or retrieve Trust Score for a member',
    parameters: { member_id: 'number' }
  },
  {
    name: 'find_opportunities',
    description: 'Find relevant international opportunities for a member profile',
    parameters: { member_id: 'number', limit: 'number' }
  },
  {
    name: 'optimize_allocation',
    description: 'Optimal team assignment for a project using linear programming',
    parameters: { project_id: 'number', budget: 'number' }
  },
  {
    name: 'risk_montecarlo',
    description: 'Run Monte Carlo risk simulation for a project',
    parameters: { project_id: 'number', iterations: 'number' }
  },
  {
    name: 'gen_report',
    description: 'Generate activity, financial, or impact report',
    parameters: { type: 'string - "activity" | "financial" | "impact" | "hci"', period: 'string' }
  },
  {
    name: 'network_value',
    description: 'Calculate total network value using adapted Metcalfe law',
    parameters: { mode: 'string - "full" | "simple"' }
  }
];
```

Endpoints:
- `GET /hispatec/api/mcp/tools/list` -- List all available tools
- `POST /hispatec/api/mcp/tools/call` -- Execute a tool by name with parameters

---

### PHASE 4: FRONTEND -- MEMBER DASHBOARD (React SPA)

#### 4.1 Portal Institucional

The institutional portal already exists at `public/hispatec/whitepaper.html`. Now create the main landing page:

File: `public/hispatec/index.html`

Build a complete bilingual (ES/EN toggle) institutional website with these sections:
1. Hero with world map showing 6 regional seats
2. "Que es HISPATEC" -- positioning (NOT/IS grid)
3. 6 Ejes Estrategicos (card grid)
4. 4 Sectores Prioritarios
5. 5-step project lifecycle timeline
6. 3 Proyectos Piloto cards
7. 5 Tipos de Asociados
8. Estructura Global (6 regions)
9. Link to Fundacion Raices Hispanas
10. CTA: "Unete como Socio Fundador" -- registration form
11. Footer with contact info

Design: Dark teal (#0d6e6e) + navy (#1a2332) + gold (#c8952e) accents. Professional, institutional. Mobile-first responsive. NO emojis.

#### 4.2 Member Dashboard SPA

Build a React-style SPA (can be vanilla JS with components or lightweight framework) at `public/hispatec/dashboard/`:

Pages:
- `/hispatec/dashboard/` -- Overview (HCI score, network stats, recent activity)
- `/hispatec/dashboard/profile` -- Member profile editor
- `/hispatec/dashboard/directory` -- Member directory with search/filter
- `/hispatec/dashboard/matching` -- AI matching interface ("I need a...")
- `/hispatec/dashboard/projects` -- Project board (kanban-style 5 columns)
- `/hispatec/dashboard/exchange` -- Business exchange marketplace
- `/hispatec/dashboard/rfq` -- RFQ management
- `/hispatec/dashboard/payments` -- Membership status, invoices, escrow
- `/hispatec/dashboard/metrics` -- HCI, Gini, TrustRank, Network Value charts
- `/hispatec/dashboard/admin` -- Regional admin panel (for Presidente/Tesorero)

Auth: JWT stored in localStorage, include in Authorization header for all API calls.

---

## API ENDPOINTS REFERENCE

```
AUTH
  POST /hispatec/api/auth/register     -- Register new member
  POST /hispatec/api/auth/login        -- Login, returns JWT
  GET  /hispatec/api/auth/me           -- Current user profile

MEMBERS
  GET  /hispatec/api/members           -- Directory (filterable: region, sector, country)
  GET  /hispatec/api/members/:id       -- Member profile
  PUT  /hispatec/api/members/:id       -- Update profile
  POST /hispatec/api/members/:id/verify -- Request verification

MATCHING
  POST /hispatec/api/match             -- AI matching (query text + filters)
  GET  /hispatec/api/match/history     -- Past matching requests

PROJECTS
  GET  /hispatec/api/projects          -- List projects (filterable)
  POST /hispatec/api/projects          -- Create project proposal
  GET  /hispatec/api/projects/:id      -- Project detail
  PUT  /hispatec/api/projects/:id      -- Update project
  POST /hispatec/api/projects/:id/evaluate    -- Monte Carlo evaluation
  POST /hispatec/api/projects/:id/assign      -- Optimal team assignment
  POST /hispatec/api/projects/:id/advance     -- Move to next phase

EXCHANGE
  GET  /hispatec/api/companies         -- Company directory
  POST /hispatec/api/companies         -- Register company
  GET  /hispatec/api/rfqs              -- List open RFQs
  POST /hispatec/api/rfqs              -- Create RFQ
  POST /hispatec/api/rfqs/:id/respond  -- Submit RFQ response
  PUT  /hispatec/api/rfqs/:id/award    -- Award RFQ to a response

OPPORTUNITIES
  GET  /hispatec/api/opportunities     -- List opportunities
  POST /hispatec/api/opportunities     -- Post opportunity

PAYMENTS
  POST /hispatec/api/payments/membership    -- Create/update subscription
  POST /hispatec/api/payments/escrow        -- Create project escrow
  POST /hispatec/api/payments/release       -- Release escrow funds
  GET  /hispatec/api/payments/history       -- Transaction history
  POST /hispatec/api/payments/webhook       -- Stripe webhook handler

METRICS
  GET  /hispatec/api/metrics/gini           -- Current Gini coefficient
  GET  /hispatec/api/metrics/hci            -- HISPATEC Composite Index
  GET  /hispatec/api/metrics/network-value  -- Network value
  GET  /hispatec/api/metrics/trust/:id      -- Member trust score
  GET  /hispatec/api/metrics/dashboard      -- All metrics for dashboard

MCP
  GET  /hispatec/api/mcp/tools/list         -- List MCP tools
  POST /hispatec/api/mcp/tools/call         -- Execute MCP tool

EVENTS
  GET  /hispatec/api/events            -- List events
  POST /hispatec/api/events            -- Create event
  POST /hispatec/api/events/:id/register -- Register for event

HEALTH
  GET  /hispatec/api/health            -- Health check
```

---

## DEPLOYMENT & VERIFICATION

### Deploy Pattern
```bash
git add -A
git commit -m "feat(hispatec): [description]

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push origin main
# Wait 120 seconds for Render deploy
sleep 120
```

### Verification Endpoints (check after each deploy)
```bash
curl -s "https://aiagent.ringlypro.com/hispatec/api/health"
curl -s "https://aiagent.ringlypro.com/hispatec/api/mcp/tools/list"
curl -s "https://aiagent.ringlypro.com/hispatec/api/metrics/hci"
```

### Auto-Fix Loop
If any endpoint fails after deploy:
1. Check `https://aiagent.ringlypro.com/debug/store-health-error` for errors
2. Read server logs
3. Fix the issue
4. Redeploy
5. Verify again
6. Repeat until ALL endpoints return 200

---

## IMPORTANT CONSTRAINTS

1. **Database connection**: Use `process.env.CRM_DATABASE_URL || process.env.DATABASE_URL` (see `src/config/database.js`)
2. **Node path**: `/opt/homebrew/bin/node` for local testing
3. **Static files**: `public/hispatec/` -- no build step needed
4. **Express mounting**: Add routes in `src/app.js`
5. **No emojis** in any code, UI, or comments
6. **Spanish** as primary language for all UI text
7. **Multi-currency**: Support USD, EUR, MXN, COP at minimum
8. **JWT auth**: Use bcrypt + jsonwebtoken (already in package.json or add them)
9. **Stripe**: Use `stripe` npm package for payments
10. **All tables prefixed**: `hispatec_` to avoid conflicts with existing CRM tables

---

## EXECUTION ORDER

1. Read `public/hispatec/whitepaper.html` for full context
2. Check `src/app.js` for existing route mounting patterns
3. Check `package.json` for existing dependencies
4. Create database tables (run SQL migration)
5. Create Sequelize models
6. Create math utilities (`src/utils/hispatec-math.js`)
7. Create auth routes (register/login/JWT)
8. Create member routes (CRUD + directory)
9. Create matching engine routes
10. Create project routes
11. Create exchange routes (companies + RFQs)
12. Create payment routes (Stripe)
13. Create metrics routes (Gini, HCI, Trust, Network Value)
14. Create MCP tool server
15. Create main router that mounts everything
16. Mount in `src/app.js`
17. Create institutional landing page (`public/hispatec/index.html`)
18. Create member dashboard SPA (`public/hispatec/dashboard/`)
19. Test locally
20. Deploy
21. Verify all endpoints
22. Auto-fix any issues
23. Report completion

**DO NOT STOP until all 23 steps are complete and verified in production.**

---

## Current Task

$ARGUMENTS
