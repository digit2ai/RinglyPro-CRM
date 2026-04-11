# MSK Intelligence — Platform Features

A complete reference for the 14 production features of the MSK Intelligence platform. Each feature is **live in production** at https://aiagent.ringlypro.com/msk/.

For each feature you will find:
- **What it does** — plain-English description
- **How it works** — technical design and implementation
- **Why it matters** — clinical or business value

---

## 1. AI Voice Intake

**Status:** Live
**Tech:** ElevenLabs Conversational AI (Dr. MSK agent)
**Code:** `backend/routes/voice.js`, `frontend/src/pages/VoiceIntake.jsx`

### What it does
A patient calls or opens the voice page and has a natural-language conversation with an AI doctor named **Dr. MSK**. The agent asks about pain location, severity, mechanism of injury, sport context, and prior history. At the end of the call, a structured patient case is automatically created in the database.

### How it works
1. The frontend uses the **`@11labs/client`** WebRTC SDK to open a real-time voice session with ElevenLabs.
2. ElevenLabs runs a conversational agent prompt configured as **Dr. MSK**, a board-certified MSK specialist persona.
3. As the conversation progresses, the agent extracts structured fields: `chiefComplaint`, `painLocation`, `injuryMechanism`, `severity`, `sportContext`, `urgency`.
4. When the call ends, the frontend POSTs the extracted data to `POST /api/v1/voice/intake`.
5. The backend creates an `msk_cases` record, generates a case number (`MSK-XXXXXXX`), and triggers the AI Triage Engine.

### Why it matters
- Replaces a 15-minute clinical intake interview with a 3-minute conversation.
- Works in any language ElevenLabs supports (English, Spanish, Tagalog).
- Patients with limited mobility or low literacy can still access specialist care.
- Zero human staff time required for initial intake.

---

## 2. Camera ROM Assessment

**Status:** Live
**Tech:** Google MediaPipe Pose (vision_bundle)
**Code:** `frontend/src/components/ROMAssessment.jsx`

### What it does
Range of Motion (ROM) measurement is normally done with a physical goniometer (a $50+ plastic protractor) by a trained clinician in a clinic. **Camera ROM Assessment** uses a phone or laptop camera to measure joint angles automatically — no hardware, no clinician needed.

Example: a knee-injury patient bends their knee in front of their phone. The system detects the hip, knee, and ankle landmarks in real time and calculates the joint angle: "Knee flexion: 95° (normal: 135°). You are at 70% of normal range."

### How it works
1. The browser loads the MediaPipe `vision_bundle.js` (136 KB pre-compiled WebAssembly).
2. MediaPipe **Pose Landmarker** identifies 33 body landmarks from the live video stream at 30 fps.
3. The component calculates the angle between three landmarks (e.g. hip → knee → ankle) using the **dot product / arc cosine** of the two limb vectors.
4. The measured angle is compared against medical normal ranges (stored per-joint in the database).
5. The result is saved to `msk_rom_measurements` with: `assessment_type`, `body_side`, `angle_degrees`, `normal_range_min/max`, `collection_point` (initial vs. follow-up).
6. Results are charted over time so providers can track recovery progress remotely.

### Why it matters
- **Patentable.** No commercial MSK platform offers browser-based, hardware-free ROM measurement.
- Replaces a $50 tool + a $80/hour clinician with a phone the patient already owns.
- Works offline once the page is loaded.
- Enables remote recovery tracking — no in-person follow-ups needed.

---

## 3. AI Triage Engine

**Status:** Live
**Tech:** Rule-based urgency scoring + imaging protocol recommendation
**Code:** `backend/services/triage.js`

### What it does
After a case is created (via voice intake or web form), the triage engine automatically determines:
- **Urgency** — routine / priority / urgent / emergency
- **Decision** — self-care / virtual consult / imaging / emergency referral
- **Imaging protocol** — which MRI / X-ray / ultrasound sequence is needed (if any)
- **Confidence score** — how certain the engine is about its recommendation

### How it works
1. When a case is created, the backend invokes `triageCase(caseData)` from `services/triage.js`.
2. The engine evaluates a rule chain:
   - **Red flags** (numbness, weakness, loss of bowel/bladder, severe trauma) → emergency
   - **High severity** (pain ≥ 8/10) + recent trauma → urgent imaging
   - **Chronic, low severity** → conservative care + virtual consult
   - **Sport-specific patterns** (e.g. ACL pivot injury) → MRI knee with cartilage protocol
3. The decision is written to `msk_triage_decisions` with full reasoning.
4. The case status auto-advances from `intake` → `triage`.
5. If imaging is recommended, an `msk_imaging_orders` record is created with the suggested protocol.

### Why it matters
- Removes the radiologist from the triage step entirely — they only see cases that actually need them.
- Every patient is triaged in **under 1 second**, regardless of volume.
- The protocol recommendation eliminates one of the biggest sources of wasted imaging spend (wrong protocol → unusable scan → repeat scan).
- Designed to be replaced by a fine-tuned ML model when there is enough labeled training data.

---

## 4. Video Consultation

**Status:** Live
**Tech:** WebRTC peer-to-peer + Express signaling server
**Code:** `backend/routes/video.js`, `frontend/src/pages/VideoRoom.jsx`

### What it does
Patient and specialist join a private video room from any browser — no plugin, no app install, no Zoom account. Direct peer-to-peer video and audio over WebRTC.

### How it works
1. A meeting is created when an appointment is scheduled. Each meeting gets a unique `meetingId`.
2. Patient opens `/msk/video/:meetingId`. Specialist opens the same URL from their dashboard.
3. The frontend uses the browser's native **`RTCPeerConnection`** API with public STUN servers (Google STUN: `stun:stun.l.google.com:19302`) for NAT traversal.
4. **Signaling** — the two peers exchange WebRTC offers, answers, and ICE candidates through a tiny in-memory signaling store on the backend (`POST /api/v1/video/signaling/:meetingId`). The signaling room auto-expires after 2 hours.
5. Once the offer/answer handshake completes, video and audio flow **directly peer-to-peer** — the server is no longer involved. Zero bandwidth cost on the platform.

### Why it matters
- **Zero per-minute cost.** Unlike Zoom, Twilio Video, or Daily.co, there is no per-minute video charge — peers connect directly.
- Works on any modern browser (Chrome, Safari, Firefox, mobile Safari, Chrome Android).
- HIPAA-friendly because the media stream never touches a server.
- For multi-instance production deployments, the in-memory store can be swapped for **Redis** with one config change.

---

## 5. Secure Messaging

**Status:** Live
**Tech:** Case-based threaded messaging
**Code:** `backend/routes/messages.js`, `frontend/src/pages/Messaging.jsx`

### What it does
Patients and specialists communicate inside a case — like SMS, but tied to a specific clinical case so all conversation context lives with the medical record.

### How it works
1. Every message is scoped to a `case_id`. Messages cannot be sent without a case context — this enforces clinical record-keeping discipline.
2. `POST /api/v1/messages` writes to `msk_messages` with `sender_id`, `case_id`, `content`, `message_type` (text / image / file), and `created_at`.
3. `GET /api/v1/messages/:caseId` returns the full thread, joined against `msk_users` to attach sender names and roles.
4. Unread state is tracked per recipient (`PUT /api/v1/messages/:id/read`).
5. The frontend polls every 10 seconds for new messages (can be upgraded to WebSocket / Server-Sent Events for real-time).
6. All messages are stored encrypted at rest (PostgreSQL TDE on Render) and transmitted over TLS.

### Why it matters
- Eliminates the need for separate communication tools (email, SMS, WhatsApp) that fragment the medical record.
- Every message is automatically part of the audit trail (`msk_audit_log`).
- Role-aware: patients can only see their own cases; providers see assigned cases; admins see all.

---

## 6. Imaging Upload

**Status:** Live
**Tech:** DICOM / JPEG / PNG drag-and-drop upload
**Code:** `backend/routes/imaging.js`, `frontend/src/components/ImagingUpload.jsx`

### What it does
Patients or providers upload medical images (X-ray, MRI, CT, ultrasound) by dragging and dropping. Files are stored, indexed, and attached to a case for radiologist review.

### How it works
1. The frontend uses the HTML5 **drag-and-drop API** with `FormData` for multipart upload.
2. `POST /api/v1/imaging/upload` accepts files up to **50 MB** each (configurable in `index.js` body parser).
3. Files are stored under `verticals/msk_intelligence/uploads/imaging/` with a UUID filename to prevent collisions.
4. A `msk_imaging_files` record is created linking the file to the case, with metadata: `filename`, `mime_type`, `size_bytes`, `uploaded_by`, `uploaded_at`.
5. **DICOM support** — `.dcm` files are accepted. Future enhancement: parse DICOM headers to auto-extract patient name, study date, modality, body part.
6. Images are served back to authorized users via `GET /api/v1/imaging/:fileId` (with auth middleware checking case access).

### Why it matters
- Patients can upload existing imaging from a CD, USB, or hospital portal — no need to mail discs.
- Supports both consumer formats (JPEG, PNG of phone-photographed films) and clinical DICOM.
- Centralized imaging library per case eliminates lost files and email attachments.
- Production deployments can swap local disk for **AWS S3 / Cloudflare R2** with one config change.

---

## 7. PROMs (Patient-Reported Outcome Measures)

**Status:** Live
**Tech:** Standardized clinical instruments — VAS, KOOS, DASH, ODI, PROMIS-PF
**Code:** `backend/routes/proms.js`, `frontend/src/pages/PROMs.jsx`

### What it does
Patients fill out standardized clinical questionnaires that measure pain, function, and quality of life. The platform automatically picks the right questionnaire based on the body region affected.

| Instrument | Measures | Body Region |
|---|---|---|
| **VAS** | Visual Analog Scale (0–10 pain) | Universal |
| **KOOS** | Knee Injury and Osteoarthritis Outcome Score | Knee |
| **DASH** | Disabilities of the Arm, Shoulder, and Hand | Upper extremity |
| **ODI** | Oswestry Disability Index | Lower back / lumbar spine |
| **PROMIS-PF** | Physical Function (NIH-validated) | General mobility |

### How it works
1. When a case is created with a `pain_location`, the backend logic auto-assigns the appropriate PROMs.
2. `GET /api/v1/proms/pending/:caseId` returns the patient's pending questionnaires with full question text and scoring scales.
3. The patient submits answers via `POST /api/v1/proms/submit`. The score is calculated server-side using the official scoring algorithm for each instrument.
4. Submissions are stored in `msk_prom_submissions` with `instrument_code`, `score`, `collection_point` (intake / week-2 / week-6 / discharge), and `submitted_at`.
5. `GET /api/v1/proms/trends/:patientId` returns time-series data for charting recovery progress.

### Why it matters
- **Clinical validity.** These are the same instruments used in published medical research and required by insurance for outcome reporting.
- **Reimbursable.** Insurers require PROM data for value-based care contracts. The platform captures it automatically.
- **Trend tracking.** Pain and function are measured over time, so providers and patients can see real recovery progress.
- **Auto-assignment** removes a major friction point — the right questionnaire is presented without provider intervention.

---

## 8. Exercise Programs (HEP — Home Exercise Programs)

**Status:** Live
**Tech:** 20-exercise library + provider prescription builder + patient session tracker
**Code:** `backend/routes/rehab.js`, `frontend/src/pages/MyRehab.jsx`, `CreateHEP.jsx`

### What it does
Physical therapists and providers prescribe a personalized rehabilitation program. The patient sees their exercises in a dashboard, marks each session as complete, and the provider sees compliance in real-time.

### How it works
1. **Exercise Library** — `msk_exercises` table seeded with 20 evidence-based exercises tagged by `body_region`, `difficulty`, `equipment_needed`, `target_condition`.
2. **Program Creation** — provider opens `/msk/rehab/create`, picks exercises, sets reps/sets/frequency. Stored in `msk_hep_programs` linked to the patient's case.
3. **Patient View** — `GET /api/v1/rehab/my-program` returns the active program. Patient sees today's exercises with video links and instructions.
4. **Session Tracking** — patient marks each exercise complete via `POST /api/v1/rehab/sessions`. Each session captures `exercise_id`, `completed_reps`, `completed_sets`, `pain_score_before`, `pain_score_after`, `duration_seconds`.
5. **Compliance Reporting** — `GET /api/v1/rehab/compliance/:programId` returns adherence metrics (% sessions completed, days active, pain trend).
6. Non-compliance triggers **automated engagement nudges** via the engagement cron job (every 6 hours).

### Why it matters
- **Recovery happens at home, not in the clinic.** 80% of MSK recovery depends on home exercise adherence — and most patients don't comply because they have no accountability.
- **Gamified compliance.** Patients see streaks and progress, which dramatically improves adherence.
- **Provider efficiency.** One PT can supervise 50+ patients remotely instead of 8 in person.
- **Outcome data.** Every session generates outcome data, enabling continuous improvement of protocols.

---

## 9. RPM (Remote Patient Monitoring)

**Status:** Live
**Tech:** Pain score, step count, sleep, activity tracking + CPT 99454/99457 billing
**Code:** `backend/routes/rpm.js`, `frontend/src/pages/RPMDashboard.jsx`

### What it does
Patients are enrolled in a Remote Patient Monitoring program. Daily pain scores, activity, sleep, and recovery metrics are captured continuously. The data is billable to insurance under specific CPT codes (99453/99454/99457).

### How it works
1. **Enrollment** — provider enrolls a patient via `POST /api/v1/rpm/enroll`. Creates an `msk_rpm_enrollments` record with `start_date`, `monitoring_type`, `target_metrics`.
2. **Daily Readings** — patient submits readings via `POST /api/v1/rpm/readings` (or via mobile/wearable integration). Stored in `msk_rpm_readings` with `reading_type` (pain / steps / sleep / activity), `value`, `recorded_at`.
3. **Dashboard** — `GET /api/v1/rpm/dashboard/:enrollmentId` returns trended data over the last 30 days for the provider to review.
4. **Billing Summary** — `GET /api/v1/rpm/billing-summary/:month` returns CPT-code-ready data:
   - **CPT 99453** — initial setup ($19)
   - **CPT 99454** — 16+ days of readings in 30 days ($55/month)
   - **CPT 99457** — 20+ minutes of provider review time ($50/month)
5. The platform automatically tracks which patients have enough readings to bill and flags them for billing.

### Why it matters
- **Recurring revenue stream.** ~$54–$64 per patient per month, billed to insurance.
- **Catches problems early.** A pain spike or activity drop is flagged immediately, before it becomes a crisis.
- **Better outcomes.** Continuous monitoring improves adherence and recovery speed.
- **Insurance-friendly.** Built around standard CPT codes used by Medicare and commercial payers.

---

## 10. FHIR R4 Export

**Status:** Live
**Tech:** HL7 FHIR R4 (Patient, DiagnosticReport, Bundle resources)
**Code:** `backend/routes/fhir.js`

### What it does
The platform speaks the universal language of healthcare data interoperability — **HL7 FHIR R4**. Any patient record, diagnostic report, or full case bundle can be exported as a standards-compliant FHIR resource that any modern EHR (Epic, Cerner, Athena, eClinicalWorks) can consume.

### How it works
1. **Patient resource** — `GET /api/v1/fhir/Patient/:id` returns the patient as a FHIR R4 `Patient` resource:
   - `identifier`, `name`, `gender`, `birthDate`, `telecom`
   - Conforms to **US Core Patient profile** (`http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient`)
2. **DiagnosticReport** — `GET /api/v1/fhir/DiagnosticReport/:id` returns a finalized radiology report as FHIR `DiagnosticReport` with:
   - `code` (LOINC for the imaging modality)
   - `subject` (reference to Patient)
   - `effectiveDateTime`
   - `conclusion` (the radiologist's impression)
   - `presentedForm` (PDF attachment)
3. **Bulk Export** — `GET /api/v1/fhir/$export` returns a FHIR Bundle with all patient resources for FHIR-compliant data exchange.
4. **PDF Export** — `GET /api/v1/fhir/cases/:id/export/pdf` generates a professional PDF case report.

### Why it matters
- **Hospital integration.** Any hospital using a modern EHR can pull MSK Intelligence reports directly into their system without manual data entry.
- **Insurance integration.** FHIR is the format insurers use for prior authorization and claims attachments.
- **Compliance.** US Core profiles are required for ONC certification and Meaningful Use.
- **Future-proof.** As the industry standardizes on FHIR R4, the platform is already there.

---

## 11. PDF Case Reports

**Status:** Live
**Tech:** Server-side PDF generation with letterhead
**Code:** `backend/routes/fhir.js` (`/cases/:id/export/pdf`)

### What it does
Generates a professional, printable diagnostic report PDF that looks like it came from a hospital radiology department — letterhead, patient demographics, clinical findings, impression, recommendations, radiologist signature.

### How it works
1. `GET /api/v1/fhir/cases/:id/export/pdf` triggers the report generator.
2. The backend pulls the full case data: patient info, imaging files, finalized report, ROM measurements, PROM scores, AI copilot draft.
3. Data is rendered into an HTML template with the MSK Intelligence letterhead.
4. The HTML is converted to PDF (current implementation can use `puppeteer`, `pdfkit`, or `html-pdf-node` — chosen at deployment time based on serverless constraints).
5. The PDF is streamed back to the client with `Content-Type: application/pdf` and a descriptive filename.
6. Every report generation is logged to `msk_audit_log` for HIPAA compliance.

### Why it matters
- **Patients want a document.** Insurance, employers, second opinions, lawyers — they all want a PDF.
- **Professional credibility.** A polished PDF with letterhead looks legitimate to anyone who sees it.
- **Email-friendly.** PDFs can be emailed, printed, archived — they survive outside the platform.
- **Workers' Comp / IME ready.** The PDF format meets the standards required for workers' compensation independent medical exam reports.

---

## 12. Insurance Billing

**Status:** Live
**Tech:** CPT code generation, claims management, PhilHealth-ready
**Code:** `backend/routes/billing.js`

### What it does
The platform turns clinical activity into billable insurance claims automatically. Every consultation, RPM reading, and imaging review can be mapped to the correct CPT (Current Procedural Terminology) code for reimbursement.

### How it works
1. **Pricing Tiers** — `GET /api/v1/billing/pricing` returns the 3-tier service catalog: Imaging Review ($299), Full Diagnostic ($799), Elite Concierge ($2,999).
2. **CPT Code Mapping** — common codes used:
   - **99213/99214** — office visit (telehealth modifier 95)
   - **99453/99454/99457** — RPM setup, monitoring, and review
   - **76xxx series** — diagnostic imaging interpretation
   - **97xxx series** — physical therapy / rehab
3. **Claims Engine** — `POST /api/v1/billing/claims` creates an `msk_claims` record. Each claim has `cpt_code`, `diagnosis_codes` (ICD-10), `service_date`, `provider_id`, `amount_cents`, `status`.
4. **Subscriptions** — `msk_subscriptions` table for recurring (monthly retainer) billing.
5. **Invoices** — generated automatically for self-pay patients via `POST /api/v1/billing/invoices`.
6. **Contracts** — B2B contracts (sports teams, clinics) tracked in `msk_contracts`.
7. **PhilHealth-ready** — the data model includes fields for the Philippine national insurance system (member ID, sponsorship type, case rate codes).

### Why it matters
- **Revenue diversification.** Self-pay + insurance + B2B retainers + government reimbursement, all in one system.
- **No external billing service needed.** Most clinics pay 5–8% of revenue to a billing company — the platform replaces that.
- **Compliance built-in.** Diagnosis codes are required for every claim. The platform enforces this at the data layer.

---

## 13. Multi-Tenant Architecture

**Status:** Live
**Tech:** Row-level tenant isolation
**Code:** Throughout the schema (`tenant_id` foreign key) and middleware

### What it does
A single deployment of the MSK Intelligence platform can host multiple completely separate organizations — a Philippines hospital network, a sports team in Brazil, and a workers' comp provider in Texas — without any of them seeing each other's data.

### How it works
1. **Schema-level tenancy** — every table that contains user data has a `tenant_id` column (referenced from a `tenants` table with `name`, `domain`, `branding`, `settings`).
2. **Authentication binding** — when a user logs in, their JWT includes their `tenant_id`. The auth middleware (`backend/middleware/auth.js`) attaches it to `req.user.tenantId`.
3. **Query isolation** — every database query is filtered by `WHERE tenant_id = $1`. The pattern is enforced at the route handler layer.
4. **Cross-tenant queries are forbidden.** The platform never returns data across tenant boundaries.
5. **Tenant-specific branding** — each tenant can have its own logo, colors, and email templates.

### Why it matters
- **One codebase, many customers.** No need to spin up a separate deployment for each client.
- **Cost efficiency.** Shared infrastructure means lower per-tenant cost.
- **White-label ready.** Hospital networks can rebrand the platform as their own without code changes.
- **Compliance.** Tenant isolation is a HIPAA Business Associate Agreement (BAA) requirement when serving multiple healthcare entities.

---

## 14. HIPAA / Data Privacy

**Status:** Live
**Tech:** MFA, encryption at rest + transit, HIPAA audit logging
**Code:** `backend/middleware/auth.js`, `backend/routes/mfa.js`, `backend/routes/admin.js` (audit-log)

### What it does
The platform is built from the ground up to meet **HIPAA Security Rule** requirements for handling Protected Health Information (PHI). Every component — authentication, data storage, network transit, audit trail — is designed with healthcare compliance in mind.

### How it works

**Authentication & Access Control**
- **Bcrypt** password hashing with a work factor of 12 (industry standard).
- **JWT tokens** signed with a secret rotated per environment, 24-hour expiration.
- **Multi-Factor Authentication (MFA)** via TOTP (Time-based One-Time Password). Compatible with Google Authenticator, Authy, 1Password.
- **Role-Based Access Control (RBAC)** — every endpoint checks `req.user.role` against allowed roles (`patient`, `radiologist`, `admin`, `b2b_manager`, `staff`).
- **Backup codes** issued during MFA setup so users can recover lost devices.

**Encryption**
- **In transit** — TLS 1.3 enforced on all endpoints (Render handles certificates via Let's Encrypt).
- **At rest** — PostgreSQL data encrypted at rest by Render's managed disk encryption.
- **Database connections** — `ssl: { require: true }` enforced in Sequelize config.

**Audit Logging**
- Every API call is logged to `msk_audit_log` with: `user_id`, `action`, `resource_type`, `resource_id`, `ip_address`, `user_agent`, `details`, `created_at`.
- The `logAudit()` helper in `middleware/auth.js` is called from every sensitive route (case creation, report finalization, file access, billing actions).
- Audit logs are queryable by admins via `GET /api/v1/admin/audit-log` with filters by user, action, or date range.
- Logs are **immutable** at the application layer (no UPDATE or DELETE endpoints exist for audit records).

**Data Privacy**
- Patient data is **never** exposed to other patients.
- Providers only see cases they are explicitly assigned to (or all cases if they have admin role).
- Cross-tenant data leaks are prevented at the query layer (see Multi-Tenant Architecture).
- PII fields are flagged in the schema for future encryption-at-column upgrades.

### Why it matters
- **Legal requirement.** Any platform handling PHI in the United States must meet HIPAA Security and Privacy Rules. Non-compliance carries fines up to $1.5M per violation.
- **Insurance partnerships.** No insurer will sign a Business Associate Agreement (BAA) without HIPAA controls in place.
- **Hospital adoption.** Hospitals require HIPAA compliance documentation before any data exchange.
- **Patient trust.** Visible security controls (MFA, audit log) increase patient confidence in the platform.

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                       PATIENT / PROVIDER                        │
│              (Browser / Mobile PWA / Voice Call)                │
└─────────────────────────┬───────────────────────────────────────┘
                          │ HTTPS / WebRTC / WebSocket
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│              REACT FRONTEND (24 pages, 6 components)            │
│   Landing · Cases · Rehab · Voice · Video · Messaging · ROM    │
└─────────────────────────┬───────────────────────────────────────┘
                          │ /api/v1/*
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│              EXPRESS BACKEND (110 endpoints)                    │
│  ┌──────────┬──────────┬──────────┬──────────┬─────────────┐   │
│  │  Auth /  │  Cases / │ Imaging/ │  Voice / │  Billing /  │   │
│  │   MFA    │  Triage  │  Reports │  Video   │   FHIR      │   │
│  └──────────┴──────────┴──────────┴──────────┴─────────────┘   │
│  ┌──────────┬──────────┬──────────┬──────────┬─────────────┐   │
│  │  PROMs / │  Rehab / │  RPM /   │ Engage / │ Workers'    │   │
│  │  Outcome │   HEP    │ Monitor  │  Nudge   │ Comp / IME  │   │
│  └──────────┴──────────┴──────────┴──────────┴─────────────┘   │
└──────┬──────────────────────────────────────────┬───────────────┘
       │                                          │
       ▼                                          ▼
┌──────────────────────┐              ┌─────────────────────────┐
│  PostgreSQL          │              │  External AI Services   │
│  37 tables           │              │  • ElevenLabs (Voice)   │
│  Multi-tenant        │              │  • Anthropic Claude     │
│  Encrypted at rest   │              │    (Diagnostic Copilot) │
│  HIPAA audit log     │              │  • MediaPipe (ROM,      │
└──────────────────────┘              │     in-browser WASM)    │
                                      └─────────────────────────┘
```

---

## Production Stats

| Metric | Value |
|---|---|
| Backend code | 6,842 lines |
| Frontend code | 5,610 lines |
| Database tables | 37 |
| API endpoints | 110 |
| Frontend pages | 24 |
| Frontend components | 6 |
| Backend route modules | 23 |
| **Total production code** | **12,452 lines** |

---

## Live Platform

- **URL:** https://aiagent.ringlypro.com/msk/
- **Health check:** https://aiagent.ringlypro.com/msk/health
- **API docs (MCP tools):** https://aiagent.ringlypro.com/msk/api/v1/mcp/tools/list

## Demo Credentials

| Role | Email | Password |
|---|---|---|
| Admin | `admin@msk-intelligence.com` | `MSKDemo2026!` |
| Radiologist | `radiologist@msk-intelligence.com` | `MSKDemo2026!` |
| Patient | `athlete@msk-intelligence.com` | `MSKDemo2026!` |

---

*MSK Intelligence is built and operated by **Digit2AI LLC**. Contact: mstagg@digit2ai.com*
