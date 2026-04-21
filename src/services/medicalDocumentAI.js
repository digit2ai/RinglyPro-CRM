const axios = require('axios');

class MedicalDocumentAI {
  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY;
    this.apiUrl = 'https://api.anthropic.com/v1/messages';
    this.model = 'claude-sonnet-4-20250514';
  }

  async extractFromImage(base64Image, mimeType, existingContext) {
    if (!this.apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

    const systemPrompt = `You are a medical document extraction assistant. Your job is to read medical documents (visit summaries, lab orders, imaging orders, prescription lists, appointment details, insurance info) and extract structured data.

IMPORTANT RULES:
- Extract ONLY information clearly visible in the document.
- If something is unclear, use null instead of guessing.
- Return valid JSON only, no markdown or explanation.
- Dates should be in YYYY-MM-DD format.
- Do not give medical advice.

${existingContext ? 'EXISTING PATIENT CONTEXT (use to merge/avoid duplicates):\n' + existingContext : ''}

Return a JSON object with these keys (include only sections that have data in the document):

{
  "document_type": "visit_summary|lab_order|imaging_order|prescription_list|appointment|insurance|other",
  "summary": "1-2 sentence description of what this document is",
  "patient": {
    "name": "", "dob": "", "sex": "", "mrn": "", "ceid": "",
    "address": "", "phone": "",
    "primary_clinic": "", "primary_doctor": "",
    "insurance_name": "", "insurance_plan": "", "insurance_policy": "", "insurance_group": "", "insurance_address": "",
    "allergies": "",
    "pharmacy_name": "", "pharmacy_address": "", "pharmacy_phone": ""
  },
  "diagnoses": [
    { "condition_name": "", "icd_code": "", "status": "Active", "diagnosed_date": "", "notes": "" }
  ],
  "medications": [
    { "medication_name": "", "brand_name": "", "dose": "", "instructions": "", "prescribing_doctor": "", "start_date": "", "status": "Active|Started", "notes": "" }
  ],
  "appointments": [
    { "appointment_type": "doctor|test|lab|imaging|procedure", "appointment_date": "", "appointment_time": "", "arrive_by": "", "doctor_name": "", "specialty": "", "location": "", "reason": "", "status": "Scheduled|Completed", "notes": "" }
  ],
  "lab_orders": [
    { "order_date": "", "test_name": "", "test_code": "", "facility": "", "facility_account": "", "lab_ref": "", "ordering_doctor": "", "diagnosis_reason": "", "specimen_source": "", "expected_date": "", "status": "Ordered", "result_value": "", "result_date": "", "notes": "" }
  ],
  "imaging_orders": [
    { "order_date": "", "imaging_test": "", "body_area": "", "contrast": "", "facility": "", "ordering_doctor": "", "order_id": "", "reason": "", "priority": "Routine|Urgent|STAT", "expiration_date": "", "status": "Ordered", "notes": "" }
  ],
  "providers": [
    { "provider_name": "", "specialty": "", "clinic": "", "phone": "", "fax": "", "npi": "", "notes": "" }
  ],
  "vitals": [
    { "measured_date": "", "blood_pressure": "", "pulse": null, "oxygen_saturation": "", "weight": "", "height": "", "bmi": null, "notes": "" }
  ],
  "followups": [
    { "item": "", "due_date": "", "related_to": "", "status": "Pending|Scheduled", "notes": "" }
  ],
  "notes": [
    { "note_text": "", "category": "General|Clinical|Action Item|Insurance|Other", "source_document": "" }
  ],
  "action_items": ["list of things patient may need to do based on this document"]
}`;

    const response = await axios.post(
      this.apiUrl,
      {
        model: this.model,
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mimeType, data: base64Image }
              },
              {
                type: 'text',
                text: 'Extract all medical information from this document. Return structured JSON only.'
              }
            ]
          }
        ],
        system: systemPrompt
      },
      {
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        timeout: 60000
      }
    );

    const text = response.data.content[0].text.trim();
    // Strip markdown code fences if present
    const cleaned = text.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '');
    return JSON.parse(cleaned);
  }

  async extractFromPDF(base64PDF, existingContext) {
    if (!this.apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

    const systemPrompt = `You are a medical document extraction assistant. Extract structured medical data from this PDF document. Return valid JSON only following the same schema as image extraction.

${existingContext ? 'EXISTING PATIENT CONTEXT:\n' + existingContext : ''}

Return the same JSON structure as described for image documents.`;

    const response = await axios.post(
      this.apiUrl,
      {
        model: this.model,
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: base64PDF }
              },
              {
                type: 'text',
                text: 'Extract all medical information from this document. Return structured JSON only.'
              }
            ]
          }
        ],
        system: systemPrompt
      },
      {
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        timeout: 60000
      }
    );

    const text = response.data.content[0].text.trim();
    const cleaned = text.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '');
    return JSON.parse(cleaned);
  }
}

module.exports = MedicalDocumentAI;
