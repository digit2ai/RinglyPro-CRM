# MSK Intelligence — AI-Powered Medical Image Analysis

## What It Is

MSK Intelligence includes a built-in AI image analysis engine that reads uploaded medical images — X-rays, CT scans, MRIs, and ultrasound images — and generates a structured preliminary diagnostic report in seconds. The system acts as a tireless first reader that processes every uploaded image immediately, giving radiologists a head start and giving patients faster answers.

When a patient or provider uploads an image to a case, the AI engine automatically:

1. Identifies the imaging modality (X-ray, CT, MRI, ultrasound)
2. Detects the body region being imaged
3. Analyzes the image for anatomical structures, alignment, and abnormalities
4. Generates detailed clinical findings in radiological language
5. Produces a diagnostic impression with differential considerations
6. Flags specific abnormalities found (fractures, effusions, displacement, etc.)
7. Suggests ICD-10 diagnosis codes
8. Notes any limitations in the analysis (image quality, incomplete views)
9. Recommends follow-up imaging or clinical steps

All of this happens automatically, in the background, within seconds of upload. No button to click. No waiting.

---

## How It Works — The Patient Experience

### Step 1: Upload

The patient (or their provider) opens their case on MSK Intelligence and drags an X-ray or scan image into the upload area. Standard image formats are supported: JPEG, PNG, and DICOM. Files up to 500MB are accepted.

### Step 2: Instant Analysis

Within 10-30 seconds, the image is analyzed by the MSK Intelligence AI engine. A green "AI Analyzed" badge appears on the image thumbnail. The patient can click the image to see the full analysis.

### Step 3: View Results

The analysis panel shows:

- **Modality Detected** — What type of image the AI identified (X-ray, CT, MRI)
- **Body Region** — Where in the body the image shows (e.g., "Right hand, index finger")
- **Findings** — A detailed paragraph describing what the AI sees: bone alignment, joint spaces, soft tissue, fracture patterns, swelling, displacement
- **Impression** — A 1-3 sentence clinical summary of the key diagnosis
- **Abnormalities Detected** — Red-highlighted badges listing each specific finding (e.g., "Comminuted fracture", "Soft tissue swelling", "Cortical disruption")
- **Suggested ICD-10 Codes** — Blue-highlighted diagnostic codes with descriptions
- **Recommended Follow-Up** — What should happen next (e.g., "Urgent orthopedic surgery consultation")
- **Confidence Level** — How confident the AI is in its analysis (High, Moderate, or Low)
- **Limitations** — Honest disclosure of any factors that may affect accuracy

### Step 4: Doctor Reviews

The AI analysis feeds directly into the diagnostic copilot. When the radiologist generates a report, all image findings are included in the clinical context. The doctor reviews, edits, and finalizes the report. The AI does the heavy lifting; the doctor provides the judgment.

### Step 5: Patient Receives Report

The finalized report — informed by both the AI image analysis and the radiologist's expertise — is available in the patient's case. They can export it as a PDF, discuss it with Rachel (the AI voice assistant), or review it in their dashboard.

---

## Benefits for Radiologists

### 1. Faster Turnaround

The AI pre-reads every image before the radiologist opens it. By the time the doctor looks at the case, there is already a structured draft with findings, impression, and ICD-10 codes. What used to take 30 minutes of reading and typing now takes 5 minutes of reviewing and approving.

### 2. Never Miss a Finding

The AI examines every pixel of every image systematically. It does not get fatigued at 4 AM. It does not skip a subtle fracture because it is reading its 80th case today. The AI serves as a safety net — a second set of eyes that catches findings the human eye might miss, especially on high-volume days.

### 3. Standardized Reporting

Every AI-generated analysis follows the same structure: findings, impression, abnormalities, ICD-10 codes, follow-up. This eliminates variation in report format and ensures nothing is omitted. The radiologist can edit and personalize, but the baseline is always complete.

### 4. Clinical Context Integration

Unlike standalone image analysis tools, MSK Intelligence feeds the image findings into the full clinical picture. The AI knows the patient's chief complaint, mechanism of injury, pain severity, ROM measurements, and outcome scores when it analyzes the image. This means findings are interpreted in context — a knee effusion in a trauma patient is flagged differently than the same finding in a chronic pain patient.

### 5. ICD-10 Code Suggestions

Billing and coding is time-consuming. The AI suggests appropriate ICD-10 codes based on the image findings, saving the radiologist from looking up codes manually. The codes are ready for claims submission the moment the report is finalized.

### 6. Re-Analysis on Demand

If the clinical picture changes — new symptoms, additional history, different differential — the radiologist can hit "Re-analyze" to get a fresh AI read incorporating updated context. The AI re-examines the same image with new clinical information and may surface different findings.

### 7. Documentation Trail

Every AI analysis is timestamped, stored permanently, and linked to the case timeline. This creates an audit trail showing when the image was analyzed, what findings were reported, and what confidence level the AI assigned. For medicolegal purposes, the AI analysis exists as a documented preliminary read.

---

## Benefits for Patients

### 1. Answers in Minutes, Not Weeks

In traditional healthcare, a patient gets an X-ray and then waits 3-14 days for a radiologist to read it and send a report to their doctor. With MSK Intelligence, the AI analysis is available within seconds of upload. The patient can see preliminary findings immediately while waiting for the radiologist to review and finalize.

### 2. Plain-Language Explanations

Patients can click on any analyzed image and read the findings. The language is clinical but comprehensible. For even simpler explanations, they can click "Talk to Rachel" — the AI voice assistant reads the image analysis and explains it in everyday language:

> "Your X-ray shows a fracture in the small bone of your index finger. The bone is broken into several pieces, which is called a comminuted fracture. The doctor will likely recommend seeing a hand surgeon to discuss whether the pieces need to be put back together with pins or a plate."

### 3. Transparency

Patients see exactly what the AI found. There is no black box. The findings, impression, abnormalities, and even the confidence level are fully visible. Patients know what their images show before their follow-up appointment, so they can arrive prepared with informed questions.

### 4. Faster Treatment Decisions

When the AI flags a finding as urgent — a displaced fracture, a large effusion, a suspicious mass — the system elevates the case priority. The radiologist sees it sooner. The patient gets a treatment plan faster. In cases where time matters (like fractures that need surgical fixation within days), this acceleration can change outcomes.

### 5. Second Opinion Built In

The AI analysis serves as an independent first read. If a patient gets a human radiologist report that seems inconsistent with the AI findings, it creates a natural checkpoint for discussion. This is not about replacing the doctor — it is about ensuring nothing falls through the cracks.

### 6. Access to Specialist-Level Imaging Interpretation

In rural areas, underserved communities, and developing countries where MSK radiologists are scarce, the AI provides a level of image interpretation that would otherwise be unavailable. A community health worker in a remote Philippine province can upload an X-ray and get preliminary findings immediately — the same quality of initial read that a patient at a major medical center would receive.

---

## Technical Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    PATIENT / PROVIDER                            │
│               Uploads X-ray, CT, MRI, Ultrasound                │
└─────────────────────────┬────────────────────────────────────────┘
                          │ HTTPS multipart upload
                          ▼
┌──────────────────────────────────────────────────────────────────┐
│              MSK INTELLIGENCE BACKEND                            │
│                                                                  │
│  1. File received via POST /api/v1/imaging/upload                │
│  2. Image stored persistently in database (base64)               │
│  3. Database record created (msk_imaging_files)                  │
│  4. Background process triggered immediately:                    │
│                                                                  │
│     ┌─────────────────────────────────────────────────────┐      │
│     │  AI IMAGE ANALYSIS ENGINE                           │      │
│     │                                                     │      │
│     │  a. Read image from storage                         │      │
│     │  b. Gather clinical context from the case:          │      │
│     │     - Chief complaint                               │      │
│     │     - Pain location & severity                      │      │
│     │     - Mechanism of injury                           │      │
│     │     - Sport/activity context                        │      │
│     │  c. Send image + context to AI vision model         │      │
│     │  d. AI returns structured JSON:                     │      │
│     │     - Modality, body region                         │      │
│     │     - Detailed findings                             │      │
│     │     - Diagnostic impression                         │      │
│     │     - Abnormality list                              │      │
│     │     - ICD-10 code suggestions                       │      │
│     │     - Follow-up recommendations                     │      │
│     │     - Confidence level                              │      │
│     │     - Limitations                                   │      │
│     │  e. Store analysis as JSONB in database             │      │
│     │  f. Create case timeline entry                      │      │
│     └─────────────────────────────────────────────────────┘      │
│                                                                  │
│  5. Upload response returned to user immediately                 │
│     (analysis runs in background — non-blocking)                 │
│                                                                  │
│  6. Analysis available via:                                      │
│     GET /api/v1/imaging/analysis/:fileId                         │
│     GET /api/v1/imaging/analysis/case/:caseId                    │
│     POST /api/v1/imaging/analyze/:fileId  (re-trigger)           │
└──────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────────┐
│              DOWNSTREAM INTEGRATIONS                             │
│                                                                  │
│  DIAGNOSTIC COPILOT                                              │
│  When the radiologist generates a report, the copilot            │
│  includes all AI image analyses in the clinical context.         │
│  The report draft is informed by imaging findings + clinical     │
│  data + triage + ROM + PROMs.                                    │
│                                                                  │
│  RACHEL VOICE ASSISTANT                                          │
│  When a patient or doctor talks to Rachel about their case,      │
│  Rachel has access to the full image analysis and can explain    │
│  findings conversationally in plain language.                    │
│                                                                  │
│  PDF CASE REPORTS                                                │
│  The exported PDF includes AI image analysis findings as part    │
│  of the comprehensive case documentation.                        │
│                                                                  │
│  CASE TIMELINE                                                   │
│  Every analysis creates a timestamped timeline entry showing     │
│  what was found and when.                                        │
└──────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

**Non-blocking upload.** The image upload returns immediately. The AI analysis runs in the background so the user is never waiting. By the time they scroll down to view the image, the analysis is usually already complete.

**Persistent storage.** Images are stored as base64 in the PostgreSQL database, not on the filesystem. This ensures images survive server restarts, redeployments, and infrastructure changes. The database is the source of truth.

**Clinical context injection.** The AI does not analyze images in isolation. Before sending the image to the vision model, the system gathers the patient's clinical data — complaint, mechanism, severity, sport context. This contextual information significantly improves the accuracy and relevance of findings. A knee image from a trauma case is interpreted differently than the same image from a degenerative case.

**Structured JSON output.** The AI returns a defined schema, not free text. This allows the platform to render findings consistently, extract ICD-10 codes for billing, flag abnormalities as visual badges, and feed structured data into downstream systems.

**Re-analysis capability.** As the clinical picture evolves (new symptoms, updated history, additional imaging), any image can be re-analyzed with the current case context. The AI re-reads the same image with fresh clinical information and may produce different findings.

**Disclaimer by design.** Every analysis includes a clear statement that it is an AI-assisted preliminary read that must be reviewed and finalized by a qualified radiologist. This is not optional — it is embedded in every response, every UI panel, and every API output.

---

## Supported Image Types

| Format | Extension | Use Case |
|---|---|---|
| JPEG | .jpg, .jpeg | Photographed films, phone-captured X-rays, exported scans |
| PNG | .png | Screenshots, exported imaging, annotated images |
| DICOM | .dcm, .dicom | Native medical imaging format from hospital PACS systems |
| PDF | .pdf | Exported radiology reports with embedded images |
| WebP | .webp | Web-optimized medical images |

Maximum file size: 500MB per file, 20 files per upload.

---

## Example Output

**Input:** JPEG image of a right index finger X-ray from a patient who reported a crush injury while cutting a tree.

**Output:**

```
Modality: CT
Body Region: Right hand, index finger
Confidence: High

FINDINGS:
Sagittal CT imaging of the right index finger demonstrates a comminuted
fracture of the proximal phalanx with multiple bone fragments and
significant displacement. The fracture demonstrates disruption of normal
cortical architecture with a characteristic crush injury pattern extending
through the shaft of the proximal phalanx. There is associated angulation
and shortening of the bone with surrounding soft tissue swelling. The
middle and distal phalanges appear intact on this sagittal view. Joint
spaces at the metacarpophalangeal and proximal interphalangeal joints
show some irregularity, likely secondary to the traumatic mechanism and
associated soft tissue injury.

IMPRESSION:
Comminuted displaced fracture of the right index finger proximal phalanx
secondary to crush injury. The fracture pattern and degree of comminution
suggest high-energy trauma requiring orthopedic surgical evaluation for
potential open reduction and internal fixation.

ABNORMALITIES DETECTED:
- Comminuted fracture of proximal phalanx
- Significant bone fragment displacement
- Cortical disruption
- Angulation and shortening
- Surrounding soft tissue swelling

ICD-10 CODES:
- S62.610A: Displaced fracture of proximal phalanx of right index finger,
  initial encounter for closed fracture
- W20.8XXA: Other cause of strike by thrown, projected or falling object,
  initial encounter

RECOMMENDED FOLLOW-UP:
Urgent orthopedic surgery consultation for surgical planning. Follow-up
CT or MRI if surgical intervention planned. Post-operative monitoring
at 2, 6, and 12 weeks with serial radiographs.

LIMITATIONS:
Single sagittal view limits complete assessment of fracture extent.
Additional views recommended for surgical planning.
```

---

## Summary

MSK Intelligence AI Image Analysis transforms every uploaded medical image into a structured diagnostic starting point — automatically, in seconds, with full clinical context. It does not replace the radiologist. It makes the radiologist faster, more thorough, and more consistent. For patients, it means faster answers, clearer explanations, and access to specialist-level imaging interpretation regardless of where they live.

Every image. Every case. Analyzed immediately.

---

*MSK Intelligence is built and operated by Digit2AI LLC.*
*AI-assisted preliminary reads must be reviewed and finalized by a qualified radiologist.*
*Contact: mstagg@digit2ai.com*
