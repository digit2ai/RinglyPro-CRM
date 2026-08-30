/* ─────────────────────────────────────────────────────────────────────────
   GENERATED — do not edit by hand.
     node verticals/jobmd/scripts/build-simulator-fixtures.js

   These are REAL API RESPONSES, captured by driving the real endpoints. The
   match scores, the reasons and the gaps in here came out of the matching
   engine, and the agent drafts came out of the agents. Nothing is typed.

   The people and hospitals are fictional and named "Sample" so a fixture can
   never be mistaken for a client. The rows they were captured from were
   deleted immediately afterwards.
   ───────────────────────────────────────────────────────────────────────── */
var FIXTURES = {
 "physician:/me": {
  "account": {
   "id": 62,
   "role": "physician",
   "name": "Dr Elena Marsh",
   "email": "sim_1788105058719.marsh@example.org",
   "org_id": null
  },
  "profile": {
   "id": 30,
   "tenant_id": 1,
   "account_id": 62,
   "specialty": "Robotic Surgery",
   "subspecialty": "Minimally invasive general surgery",
   "education": null,
   "residency": "General Surgery, Sample University",
   "fellowship": "Minimally Invasive Surgery, Sample University",
   "board_certified": true,
   "board_certifications": [],
   "licenses": [
    "FL",
    "GA"
   ],
   "years_experience": 11,
   "current_organization": null,
   "previous_organizations": [],
   "leadership": null,
   "clinical_interests": [],
   "procedure_expertise": [
    "robotic cholecystectomy",
    "robotic hernia repair",
    "robotic colectomy"
   ],
   "robotic_platforms": [
    "da Vinci Xi"
   ],
   "robotic_years": 6,
   "robotic_cases_annual": 240,
   "robotics_program_leadership": true,
   "academic_experience": null,
   "publications": 4,
   "geographic_preferences": [
    "FL"
   ],
   "relocation_willing": false,
   "compensation_expectation": 470000,
   "employment_preference": "employed",
   "call_tolerance": "light",
   "available_from": "2026-10-01",
   "credentialing_notes": null,
   "recruitment_status": "open_to_offers",
   "recruiter_notes": null,
   "ai_summary": "Robotic Surgery (Minimally invasive general surgery); 11 years of experience; board certified; robotic experience on da Vinci Xi over 6 years; has led a robotics programme; licensed in FL, GA.",
   "ai_summary_by": "heuristic",
   "cv_text": null,
   "source": "form",
   "created_at": "2026-08-30T15:51:01.844Z",
   "updated_at": "2026-08-30T15:51:02.614Z"
  },
  "completeness": {
   "percent": 100,
   "missing": []
  }
 },
 "physician:/reference": {
  "specialties": [
   "General Surgery",
   "Cardiac Surgery",
   "Thoracic Surgery",
   "Orthopaedic Surgery",
   "Urology",
   "Gynecology",
   "Colon & Rectal Surgery",
   "Trauma Surgery",
   "Plastic Surgery",
   "Vascular Surgery",
   "Robotic Surgery",
   "Pediatric Surgery",
   "Neurosurgery",
   "Transplant Surgery",
   "Hepatobiliary Surgery"
  ],
  "stages": [
   "Prospect",
   "Contacted",
   "Interested",
   "Qualified",
   "Matched",
   "Submitted",
   "Hospital Review",
   "Interview",
   "Offer",
   "Negotiation",
   "Accepted",
   "Credentialing",
   "Placement"
  ],
  "dimensions": [
   "Clinical Match",
   "Technology Match",
   "Geographic Match",
   "Career Match",
   "Compensation Match",
   "Availability Match",
   "Cultural / Professional Match"
  ],
  "robotic_platforms": [
   "da Vinci Xi",
   "da Vinci X",
   "da Vinci SP",
   "da Vinci Si",
   "da Vinci",
   "Hugo RAS",
   "Hugo",
   "Versius",
   "Mazor X",
   "Excelsius GPS",
   "ROSA",
   "MAKO",
   "Monarch",
   "Ion"
  ],
  "states": [
   "AL",
   "AK",
   "AZ",
   "AR",
   "CA",
   "CO",
   "CT",
   "DE",
   "FL",
   "GA",
   "HI",
   "ID",
   "IL",
   "IN",
   "IA",
   "KS",
   "KY",
   "LA",
   "ME",
   "MD",
   "MA",
   "MI",
   "MN",
   "MS",
   "MO",
   "MT",
   "NE",
   "NV",
   "NH",
   "NJ",
   "NM",
   "NY",
   "NC",
   "ND",
   "OH",
   "OK",
   "OR",
   "PA",
   "RI",
   "SC",
   "SD",
   "TN",
   "TX",
   "UT",
   "VT",
   "VA",
   "WA",
   "WV",
   "WI",
   "WY",
   "DC"
  ],
  "employment_models": [
   "employed",
   "independent",
   "academic"
  ],
  "call_levels": [
   "none",
   "light",
   "moderate",
   "heavy"
  ]
 },
 "hospital:/reference": {
  "specialties": [
   "General Surgery",
   "Cardiac Surgery",
   "Thoracic Surgery",
   "Orthopaedic Surgery",
   "Urology",
   "Gynecology",
   "Colon & Rectal Surgery",
   "Trauma Surgery",
   "Plastic Surgery",
   "Vascular Surgery",
   "Robotic Surgery",
   "Pediatric Surgery",
   "Neurosurgery",
   "Transplant Surgery",
   "Hepatobiliary Surgery"
  ],
  "stages": [
   "Prospect",
   "Contacted",
   "Interested",
   "Qualified",
   "Matched",
   "Submitted",
   "Hospital Review",
   "Interview",
   "Offer",
   "Negotiation",
   "Accepted",
   "Credentialing",
   "Placement"
  ],
  "dimensions": [
   "Clinical Match",
   "Technology Match",
   "Geographic Match",
   "Career Match",
   "Compensation Match",
   "Availability Match",
   "Cultural / Professional Match"
  ],
  "robotic_platforms": [
   "da Vinci Xi",
   "da Vinci X",
   "da Vinci SP",
   "da Vinci Si",
   "da Vinci",
   "Hugo RAS",
   "Hugo",
   "Versius",
   "Mazor X",
   "Excelsius GPS",
   "ROSA",
   "MAKO",
   "Monarch",
   "Ion"
  ],
  "states": [
   "AL",
   "AK",
   "AZ",
   "AR",
   "CA",
   "CO",
   "CT",
   "DE",
   "FL",
   "GA",
   "HI",
   "ID",
   "IL",
   "IN",
   "IA",
   "KS",
   "KY",
   "LA",
   "ME",
   "MD",
   "MA",
   "MI",
   "MN",
   "MS",
   "MO",
   "MT",
   "NE",
   "NV",
   "NH",
   "NJ",
   "NM",
   "NY",
   "NC",
   "ND",
   "OH",
   "OK",
   "OR",
   "PA",
   "RI",
   "SC",
   "SD",
   "TN",
   "TX",
   "UT",
   "VT",
   "VA",
   "WA",
   "WV",
   "WI",
   "WY",
   "DC"
  ],
  "employment_models": [
   "employed",
   "independent",
   "academic"
  ],
  "call_levels": [
   "none",
   "light",
   "moderate",
   "heavy"
  ]
 },
 "recruiter:/reference": {
  "specialties": [
   "General Surgery",
   "Cardiac Surgery",
   "Thoracic Surgery",
   "Orthopaedic Surgery",
   "Urology",
   "Gynecology",
   "Colon & Rectal Surgery",
   "Trauma Surgery",
   "Plastic Surgery",
   "Vascular Surgery",
   "Robotic Surgery",
   "Pediatric Surgery",
   "Neurosurgery",
   "Transplant Surgery",
   "Hepatobiliary Surgery"
  ],
  "stages": [
   "Prospect",
   "Contacted",
   "Interested",
   "Qualified",
   "Matched",
   "Submitted",
   "Hospital Review",
   "Interview",
   "Offer",
   "Negotiation",
   "Accepted",
   "Credentialing",
   "Placement"
  ],
  "dimensions": [
   "Clinical Match",
   "Technology Match",
   "Geographic Match",
   "Career Match",
   "Compensation Match",
   "Availability Match",
   "Cultural / Professional Match"
  ],
  "robotic_platforms": [
   "da Vinci Xi",
   "da Vinci X",
   "da Vinci SP",
   "da Vinci Si",
   "da Vinci",
   "Hugo RAS",
   "Hugo",
   "Versius",
   "Mazor X",
   "Excelsius GPS",
   "ROSA",
   "MAKO",
   "Monarch",
   "Ion"
  ],
  "states": [
   "AL",
   "AK",
   "AZ",
   "AR",
   "CA",
   "CO",
   "CT",
   "DE",
   "FL",
   "GA",
   "HI",
   "ID",
   "IL",
   "IN",
   "IA",
   "KS",
   "KY",
   "LA",
   "ME",
   "MD",
   "MA",
   "MI",
   "MN",
   "MS",
   "MO",
   "MT",
   "NE",
   "NV",
   "NH",
   "NJ",
   "NM",
   "NY",
   "NC",
   "ND",
   "OH",
   "OK",
   "OR",
   "PA",
   "RI",
   "SC",
   "SD",
   "TN",
   "TX",
   "UT",
   "VT",
   "VA",
   "WA",
   "WV",
   "WI",
   "WY",
   "DC"
  ],
  "employment_models": [
   "employed",
   "independent",
   "academic"
  ],
  "call_levels": [
   "none",
   "light",
   "moderate",
   "heavy"
  ]
 },
 "physician:/profile": {
  "profile": {
   "id": 30,
   "tenant_id": 1,
   "account_id": 62,
   "specialty": "Robotic Surgery",
   "subspecialty": "Minimally invasive general surgery",
   "education": null,
   "residency": "General Surgery, Sample University",
   "fellowship": "Minimally Invasive Surgery, Sample University",
   "board_certified": true,
   "board_certifications": [],
   "licenses": [
    "FL",
    "GA"
   ],
   "years_experience": 11,
   "current_organization": null,
   "previous_organizations": [],
   "leadership": null,
   "clinical_interests": [],
   "procedure_expertise": [
    "robotic cholecystectomy",
    "robotic hernia repair",
    "robotic colectomy"
   ],
   "robotic_platforms": [
    "da Vinci Xi"
   ],
   "robotic_years": 6,
   "robotic_cases_annual": 240,
   "robotics_program_leadership": true,
   "academic_experience": null,
   "publications": 4,
   "geographic_preferences": [
    "FL"
   ],
   "relocation_willing": false,
   "compensation_expectation": 470000,
   "employment_preference": "employed",
   "call_tolerance": "light",
   "available_from": "2026-10-01",
   "credentialing_notes": null,
   "recruitment_status": "open_to_offers",
   "recruiter_notes": null,
   "ai_summary": "Robotic Surgery (Minimally invasive general surgery); 11 years of experience; board certified; robotic experience on da Vinci Xi over 6 years; has led a robotics programme; licensed in FL, GA.",
   "ai_summary_by": "heuristic",
   "cv_text": null,
   "source": "form",
   "created_at": "2026-08-30T15:51:01.844Z",
   "updated_at": "2026-08-30T15:51:02.614Z"
  },
  "completeness": {
   "percent": 100,
   "missing": []
  },
  "specialties": [
   "General Surgery",
   "Cardiac Surgery",
   "Thoracic Surgery",
   "Orthopaedic Surgery",
   "Urology",
   "Gynecology",
   "Colon & Rectal Surgery",
   "Trauma Surgery",
   "Plastic Surgery",
   "Vascular Surgery",
   "Robotic Surgery",
   "Pediatric Surgery",
   "Neurosurgery",
   "Transplant Surgery",
   "Hepatobiliary Surgery"
  ]
 },
 "physician:/matches": {
  "completeness": {
   "percent": 100,
   "missing": []
  },
  "items": [
   {
    "position_id": 43,
    "score": 99,
    "dimensions": [
     {
      "dimension": "Clinical Match",
      "evaluates": "Specialty-specific qualifications, certifications, procedural expertise, and experience.",
      "score": 100,
      "weight": 0.3,
      "reason": "Specialty matches: Robotic Surgery. Board certified, as required. 11 years of experience against a 5-year minimum. Shared procedures: robotic cholecystectomy, robotic hernia repair.",
      "gap": null
     },
     {
      "dimension": "Technology Match",
      "evaluates": "Robotic platforms and technology experience against the position requirements.",
      "score": 100,
      "weight": 0.15,
      "reason": "Robotic experience on record. Platform match: da Vinci Xi. 6 years robotic. Has led a robotics programme.",
      "gap": null
     },
     {
      "dimension": "Geographic Match",
      "evaluates": "Geographic preferences and relocation willingness against the facility locations.",
      "score": 100,
      "weight": 0.15,
      "reason": "FL is a stated preferred location.",
      "gap": null
     },
     {
      "dimension": "Career Match",
      "evaluates": "Professional objectives, leadership and academic experience against the opportunity.",
      "score": 90,
      "weight": 0.08,
      "reason": "Leadership experience on record.",
      "gap": null
     },
     {
      "dimension": "Compensation Match",
      "evaluates": "Compensation expectations against the compensation range.",
      "score": 100,
      "weight": 0.14,
      "reason": "Expectation of $470,000 sits within the posted range.",
      "gap": null
     },
     {
      "dimension": "Availability Match",
      "evaluates": "Availability against the start-date requirements.",
      "score": 100,
      "weight": 0.08,
      "reason": "Available on or before the 2026-11-01 start date.",
      "gap": null
     },
     {
      "dimension": "Cultural / Professional Match",
      "evaluates": "Employment preferences and hospital type against the employment model and call schedule.",
      "score": 100,
      "weight": 0.1,
      "reason": "Employment model matches the stated preference (employed). Call schedule is within the stated tolerance.",
      "gap": null
     }
    ],
    "reasons": [
     "Clinical Match: Specialty matches: Robotic Surgery. Board certified, as required. 11 years of experience against a 5-year minimum. Shared procedures: robotic cholecystectomy, robotic hernia repair.",
     "Technology Match: Robotic experience on record. Platform match: da Vinci Xi. 6 years robotic. Has led a robotics programme.",
     "Geographic Match: FL is a stated preferred location.",
     "Career Match: Leadership experience on record.",
     "Compensation Match: Expectation of $470,000 sits within the posted range.",
     "Availability Match: Available on or before the 2026-11-01 start date.",
     "Cultural / Professional Match: Employment model matches the stated preference (employed). Call schedule is within the stated tolerance."
    ],
    "gaps": [],
    "stage": null,
    "position": {
     "id": 43,
     "title": "Robotic General Surgeon",
     "specialty": "Robotic Surgery",
     "city": "Tampa",
     "state": "FL",
     "employment_model": "employed",
     "compensation_min": 430000,
     "compensation_max": 510000,
     "call_schedule": "light",
     "robotics_required": true,
     "start_date": "2026-11-01",
     "organization": {
      "id": 28,
      "name": "Sample Regional Medical Center"
     }
    }
   },
   {
    "position_id": 54,
    "score": 69,
    "dimensions": [
     {
      "dimension": "Clinical Match",
      "evaluates": "Specialty-specific qualifications, certifications, procedural expertise, and experience.",
      "score": 0,
      "weight": 0.3,
      "reason": null,
      "gap": "Specialty is Robotic Surgery; the position is Colon & Rectal Surgery."
     },
     {
      "dimension": "Technology Match",
      "evaluates": "Robotic platforms and technology experience against the position requirements.",
      "score": 100,
      "weight": 0.15,
      "reason": "Robotic experience on record. Platform match: da Vinci Xi. 6 years robotic. Has led a robotics programme.",
      "gap": null
     },
     {
      "dimension": "Geographic Match",
      "evaluates": "Geographic preferences and relocation willingness against the facility locations.",
      "score": 100,
      "weight": 0.15,
      "reason": "FL is a stated preferred location.",
      "gap": null
     },
     {
      "dimension": "Career Match",
      "evaluates": "Professional objectives, leadership and academic experience against the opportunity.",
      "score": 90,
      "weight": 0.08,
      "reason": "Leadership experience on record.",
      "gap": null
     },
     {
      "dimension": "Compensation Match",
      "evaluates": "Compensation expectations against the compensation range.",
      "score": 100,
      "weight": 0.14,
      "reason": "Expectation of $470,000 sits within the posted range.",
      "gap": null
     },
     {
      "dimension": "Availability Match",
      "evaluates": "Availability against the start-date requirements.",
      "score": 100,
      "weight": 0.08,
      "reason": "Available on or before the 2026-12-01 start date.",
      "gap": null
     },
     {
      "dimension": "Cultural / Professional Match",
      "evaluates": "Employment preferences and hospital type against the employment model and call schedule.",
      "score": 100,
      "weight": 0.1,
      "reason": "Employment model matches the stated preference (employed). Call schedule is within the stated tolerance.",
      "gap": null
     }
    ],
    "reasons": [
     "Technology Match: Robotic experience on record. Platform match: da Vinci Xi. 6 years robotic. Has led a robotics programme.",
     "Geographic Match: FL is a stated preferred location.",
     "Career Match: Leadership experience on record.",
     "Compensation Match: Expectation of $470,000 sits within the posted range.",
     "Availability Match: Available on or before the 2026-12-01 start date.",
     "Cultural / Professional Match: Employment model matches the stated preference (employed). Call schedule is within the stated tolerance."
    ],
    "gaps": [
     "Clinical Match: Specialty is Robotic Surgery; the position is Colon & Rectal Surgery."
    ],
    "stage": null,
    "position": {
     "id": 54,
     "title": "Colon & Rectal Surgeon",
     "specialty": "Colon & Rectal Surgery",
     "city": "Tampa",
     "state": "FL",
     "employment_model": "employed",
     "compensation_min": 520000,
     "compensation_max": 610000,
     "call_schedule": "light",
     "robotics_required": true,
     "start_date": "2026-12-01",
     "organization": {
      "id": 28,
      "name": "Sample Regional Medical Center"
     }
    }
   },
   {
    "position_id": 44,
    "score": 67,
    "dimensions": [
     {
      "dimension": "Clinical Match",
      "evaluates": "Specialty-specific qualifications, certifications, procedural expertise, and experience.",
      "score": 0,
      "weight": 0.3,
      "reason": null,
      "gap": "Specialty is Robotic Surgery; the position is Urology."
     },
     {
      "dimension": "Technology Match",
      "evaluates": "Robotic platforms and technology experience against the position requirements.",
      "score": 100,
      "weight": 0.15,
      "reason": "Robotic experience on record. Platform match: da Vinci Xi. 6 years robotic. Has led a robotics programme.",
      "gap": null
     },
     {
      "dimension": "Geographic Match",
      "evaluates": "Geographic preferences and relocation willingness against the facility locations.",
      "score": 100,
      "weight": 0.15,
      "reason": "FL is a stated preferred location.",
      "gap": null
     },
     {
      "dimension": "Career Match",
      "evaluates": "Professional objectives, leadership and academic experience against the opportunity.",
      "score": 90,
      "weight": 0.08,
      "reason": "Leadership experience on record.",
      "gap": null
     },
     {
      "dimension": "Compensation Match",
      "evaluates": "Compensation expectations against the compensation range.",
      "score": 100,
      "weight": 0.14,
      "reason": "Expectation of $470,000 sits within the posted range.",
      "gap": null
     },
     {
      "dimension": "Availability Match",
      "evaluates": "Availability against the start-date requirements.",
      "score": 100,
      "weight": 0.08,
      "reason": "Available on or before the 2026-10-01 start date.",
      "gap": null
     },
     {
      "dimension": "Cultural / Professional Match",
      "evaluates": "Employment preferences and hospital type against the employment model and call schedule.",
      "score": 80,
      "weight": 0.1,
      "reason": "Employment model matches the stated preference (employed).",
      "gap": "Call is moderate; the stated tolerance is light."
     }
    ],
    "reasons": [
     "Technology Match: Robotic experience on record. Platform match: da Vinci Xi. 6 years robotic. Has led a robotics programme.",
     "Geographic Match: FL is a stated preferred location.",
     "Career Match: Leadership experience on record.",
     "Compensation Match: Expectation of $470,000 sits within the posted range.",
     "Availability Match: Available on or before the 2026-10-01 start date.",
     "Cultural / Professional Match: Employment model matches the stated preference (employed)."
    ],
    "gaps": [
     "Clinical Match: Specialty is Robotic Surgery; the position is Urology.",
     "Cultural / Professional Match: Call is moderate; the stated tolerance is light."
    ],
    "stage": null,
    "position": {
     "id": 44,
     "title": "Urologist",
     "specialty": "Urology",
     "city": "Tampa",
     "state": "FL",
     "employment_model": "employed",
     "compensation_min": 440000,
     "compensation_max": 550000,
     "call_schedule": "moderate",
     "robotics_required": true,
     "start_date": "2026-10-01",
     "organization": {
      "id": 28,
      "name": "Sample Regional Medical Center"
     }
    }
   },
   {
    "position_id": 45,
    "score": 53,
    "dimensions": [
     {
      "dimension": "Clinical Match",
      "evaluates": "Specialty-specific qualifications, certifications, procedural expertise, and experience.",
      "score": 0,
      "weight": 0.3,
      "reason": null,
      "gap": "Specialty is Robotic Surgery; the position is Cardiac Surgery."
     },
     {
      "dimension": "Technology Match",
      "evaluates": "Robotic platforms and technology experience against the position requirements.",
      "score": 100,
      "weight": 0.15,
      "reason": "The position does not require robotic experience.",
      "gap": null
     },
     {
      "dimension": "Geographic Match",
      "evaluates": "Geographic preferences and relocation willingness against the facility locations.",
      "score": 5,
      "weight": 0.15,
      "reason": null,
      "gap": "Prefers FL and is not open to relocation; the position is in GA."
     },
     {
      "dimension": "Career Match",
      "evaluates": "Professional objectives, leadership and academic experience against the opportunity.",
      "score": 90,
      "weight": 0.08,
      "reason": "Leadership experience on record.",
      "gap": null
     },
     {
      "dimension": "Compensation Match",
      "evaluates": "Compensation expectations against the compensation range.",
      "score": 100,
      "weight": 0.14,
      "reason": "Expectation of $470,000 sits within the posted range.",
      "gap": null
     },
     {
      "dimension": "Availability Match",
      "evaluates": "Availability against the start-date requirements.",
      "score": 100,
      "weight": 0.08,
      "reason": "Available on or before the 2027-01-15 start date.",
      "gap": null
     },
     {
      "dimension": "Cultural / Professional Match",
      "evaluates": "Employment preferences and hospital type against the employment model and call schedule.",
      "score": 80,
      "weight": 0.1,
      "reason": "Employment model matches the stated preference (employed).",
      "gap": "Call is heavy; the stated tolerance is light."
     }
    ],
    "reasons": [
     "Technology Match: The position does not require robotic experience.",
     "Career Match: Leadership experience on record.",
     "Compensation Match: Expectation of $470,000 sits within the posted range.",
     "Availability Match: Available on or before the 2027-01-15 start date.",
     "Cultural / Professional Match: Employment model matches the stated preference (employed)."
    ],
    "gaps": [
     "Clinical Match: Specialty is Robotic Surgery; the position is Cardiac Surgery.",
     "Geographic Match: Prefers FL and is not open to relocation; the position is in GA.",
     "Cultural / Professional Match: Call is heavy; the stated tolerance is light."
    ],
    "stage": null,
    "position": {
     "id": 45,
     "title": "Cardiac Surgeon",
     "specialty": "Cardiac Surgery",
     "city": "Atlanta",
     "state": "GA",
     "employment_model": "employed",
     "compensation_min": 700000,
     "compensation_max": 850000,
     "call_schedule": "heavy",
     "robotics_required": false,
     "start_date": "2027-01-15",
     "organization": {
      "id": 29,
      "name": "Sample Health System"
     }
    }
   },
   {
    "position_id": 46,
    "score": 53,
    "dimensions": [
     {
      "dimension": "Clinical Match",
      "evaluates": "Specialty-specific qualifications, certifications, procedural expertise, and experience.",
      "score": 0,
      "weight": 0.3,
      "reason": null,
      "gap": "Specialty is Robotic Surgery; the position is Thoracic Surgery."
     },
     {
      "dimension": "Technology Match",
      "evaluates": "Robotic platforms and technology experience against the position requirements.",
      "score": 100,
      "weight": 0.15,
      "reason": "Robotic experience on record. Platform match: da Vinci Xi. 6 years robotic. Has led a robotics programme.",
      "gap": null
     },
     {
      "dimension": "Geographic Match",
      "evaluates": "Geographic preferences and relocation willingness against the facility locations.",
      "score": 5,
      "weight": 0.15,
      "reason": null,
      "gap": "Prefers FL and is not open to relocation; the position is in GA."
     },
     {
      "dimension": "Career Match",
      "evaluates": "Professional objectives, leadership and academic experience against the opportunity.",
      "score": 90,
      "weight": 0.08,
      "reason": "Leadership experience on record.",
      "gap": null
     },
     {
      "dimension": "Compensation Match",
      "evaluates": "Compensation expectations against the compensation range.",
      "score": 100,
      "weight": 0.14,
      "reason": "Expectation of $470,000 sits within the posted range.",
      "gap": null
     },
     {
      "dimension": "Availability Match",
      "evaluates": "Availability against the start-date requirements.",
      "score": 100,
      "weight": 0.08,
      "reason": "Available on or before the 2026-12-01 start date.",
      "gap": null
     },
     {
      "dimension": "Cultural / Professional Match",
      "evaluates": "Employment preferences and hospital type against the employment model and call schedule.",
      "score": 80,
      "weight": 0.1,
      "reason": "Employment model matches the stated preference (employed).",
      "gap": "Call is moderate; the stated tolerance is light."
     }
    ],
    "reasons": [
     "Technology Match: Robotic experience on record. Platform match: da Vinci Xi. 6 years robotic. Has led a robotics programme.",
     "Career Match: Leadership experience on record.",
     "Compensation Match: Expectation of $470,000 sits within the posted range.",
     "Availability Match: Available on or before the 2026-12-01 start date.",
     "Cultural / Professional Match: Employment model matches the stated preference (employed)."
    ],
    "gaps": [
     "Clinical Match: Specialty is Robotic Surgery; the position is Thoracic Surgery.",
     "Geographic Match: Prefers FL and is not open to relocation; the position is in GA.",
     "Cultural / Professional Match: Call is moderate; the stated tolerance is light."
    ],
    "stage": null,
    "position": {
     "id": 46,
     "title": "Thoracic Surgeon",
     "specialty": "Thoracic Surgery",
     "city": "Atlanta",
     "state": "GA",
     "employment_model": "employed",
     "compensation_min": 620000,
     "compensation_max": 720000,
     "call_schedule": "moderate",
     "robotics_required": true,
     "start_date": "2026-12-01",
     "organization": {
      "id": 29,
      "name": "Sample Health System"
     }
    }
   },
   {
    "position_id": 49,
    "score": 53,
    "dimensions": [
     {
      "dimension": "Clinical Match",
      "evaluates": "Specialty-specific qualifications, certifications, procedural expertise, and experience.",
      "score": 0,
      "weight": 0.3,
      "reason": null,
      "gap": "Specialty is Robotic Surgery; the position is General Surgery."
     },
     {
      "dimension": "Technology Match",
      "evaluates": "Robotic platforms and technology experience against the position requirements.",
      "score": 100,
      "weight": 0.15,
      "reason": "The position does not require robotic experience.",
      "gap": null
     },
     {
      "dimension": "Geographic Match",
      "evaluates": "Geographic preferences and relocation willingness against the facility locations.",
      "score": 5,
      "weight": 0.15,
      "reason": null,
      "gap": "Prefers FL and is not open to relocation; the position is in SC."
     },
     {
      "dimension": "Career Match",
      "evaluates": "Professional objectives, leadership and academic experience against the opportunity.",
      "score": 90,
      "weight": 0.08,
      "reason": "Leadership experience on record.",
      "gap": null
     },
     {
      "dimension": "Compensation Match",
      "evaluates": "Compensation expectations against the compensation range.",
      "score": 100,
      "weight": 0.14,
      "reason": "Expectation of $470,000 sits within the posted range.",
      "gap": null
     },
     {
      "dimension": "Availability Match",
      "evaluates": "Availability against the start-date requirements.",
      "score": 100,
      "weight": 0.08,
      "reason": "Available on or before the 2026-10-15 start date.",
      "gap": null
     },
     {
      "dimension": "Cultural / Professional Match",
      "evaluates": "Employment preferences and hospital type against the employment model and call schedule.",
      "score": 80,
      "weight": 0.1,
      "reason": "Employment model matches the stated preference (employed).",
      "gap": "Call is moderate; the stated tolerance is light."
     }
    ],
    "reasons": [
     "Technology Match: The position does not require robotic experience.",
     "Career Match: Leadership experience on record.",
     "Compensation Match: Expectation of $470,000 sits within the posted range.",
     "Availability Match: Available on or before the 2026-10-15 start date.",
     "Cultural / Professional Match: Employment model matches the stated preference (employed)."
    ],
    "gaps": [
     "Clinical Match: Specialty is Robotic Surgery; the position is General Surgery.",
     "Geographic Match: Prefers FL and is not open to relocation; the position is in SC.",
     "Cultural / Professional Match: Call is moderate; the stated tolerance is light."
    ],
    "stage": null,
    "position": {
     "id": 49,
     "title": "General Surgeon",
     "specialty": "General Surgery",
     "city": "Charleston",
     "state": "SC",
     "employment_model": "employed",
     "compensation_min": 380000,
     "compensation_max": 470000,
     "call_schedule": "moderate",
     "robotics_required": false,
     "start_date": "2026-10-15",
     "organization": {
      "id": 31,
      "name": "Sample Coastal Hospital"
     }
    }
   },
   {
    "position_id": 50,
    "score": 53,
    "dimensions": [
     {
      "dimension": "Clinical Match",
      "evaluates": "Specialty-specific qualifications, certifications, procedural expertise, and experience.",
      "score": 0,
      "weight": 0.3,
      "reason": null,
      "gap": "Specialty is Robotic Surgery; the position is Trauma Surgery."
     },
     {
      "dimension": "Technology Match",
      "evaluates": "Robotic platforms and technology experience against the position requirements.",
      "score": 100,
      "weight": 0.15,
      "reason": "The position does not require robotic experience.",
      "gap": null
     },
     {
      "dimension": "Geographic Match",
      "evaluates": "Geographic preferences and relocation willingness against the facility locations.",
      "score": 5,
      "weight": 0.15,
      "reason": null,
      "gap": "Prefers FL and is not open to relocation; the position is in SC."
     },
     {
      "dimension": "Career Match",
      "evaluates": "Professional objectives, leadership and academic experience against the opportunity.",
      "score": 90,
      "weight": 0.08,
      "reason": "Leadership experience on record.",
      "gap": null
     },
     {
      "dimension": "Compensation Match",
      "evaluates": "Compensation expectations against the compensation range.",
      "score": 100,
      "weight": 0.14,
      "reason": "Expectation of $470,000 sits within the posted range.",
      "gap": null
     },
     {
      "dimension": "Availability Match",
      "evaluates": "Availability against the start-date requirements.",
      "score": 100,
      "weight": 0.08,
      "reason": "Available on or before the 2026-12-15 start date.",
      "gap": null
     },
     {
      "dimension": "Cultural / Professional Match",
      "evaluates": "Employment preferences and hospital type against the employment model and call schedule.",
      "score": 80,
      "weight": 0.1,
      "reason": "Employment model matches the stated preference (employed).",
      "gap": "Call is heavy; the stated tolerance is light."
     }
    ],
    "reasons": [
     "Technology Match: The position does not require robotic experience.",
     "Career Match: Leadership experience on record.",
     "Compensation Match: Expectation of $470,000 sits within the posted range.",
     "Availability Match: Available on or before the 2026-12-15 start date.",
     "Cultural / Professional Match: Employment model matches the stated preference (employed)."
    ],
    "gaps": [
     "Clinical Match: Specialty is Robotic Surgery; the position is Trauma Surgery.",
     "Geographic Match: Prefers FL and is not open to relocation; the position is in SC.",
     "Cultural / Professional Match: Call is heavy; the stated tolerance is light."
    ],
    "stage": null,
    "position": {
     "id": 50,
     "title": "Trauma Surgeon",
     "specialty": "Trauma Surgery",
     "city": "Charleston",
     "state": "SC",
     "employment_model": "employed",
     "compensation_min": 500000,
     "compensation_max": 580000,
     "call_schedule": "heavy",
     "robotics_required": false,
     "start_date": "2026-12-15",
     "organization": {
      "id": 31,
      "name": "Sample Coastal Hospital"
     }
    }
   },
   {
    "position_id": 51,
    "score": 51,
    "dimensions": [
     {
      "dimension": "Clinical Match",
      "evaluates": "Specialty-specific qualifications, certifications, procedural expertise, and experience.",
      "score": 0,
      "weight": 0.3,
      "reason": null,
      "gap": "Specialty is Robotic Surgery; the position is Transplant Surgery."
     },
     {
      "dimension": "Technology Match",
      "evaluates": "Robotic platforms and technology experience against the position requirements.",
      "score": 100,
      "weight": 0.15,
      "reason": "The position does not require robotic experience.",
      "gap": null
     },
     {
      "dimension": "Geographic Match",
      "evaluates": "Geographic preferences and relocation willingness against the facility locations.",
      "score": 5,
      "weight": 0.15,
      "reason": null,
      "gap": "Prefers FL and is not open to relocation; the position is in NC."
     },
     {
      "dimension": "Career Match",
      "evaluates": "Professional objectives, leadership and academic experience against the opportunity.",
      "score": 100,
      "weight": 0.08,
      "reason": "Academic background suits an academic post. Leadership experience on record.",
      "gap": null
     },
     {
      "dimension": "Compensation Match",
      "evaluates": "Compensation expectations against the compensation range.",
      "score": 100,
      "weight": 0.14,
      "reason": "Expectation of $470,000 sits within the posted range.",
      "gap": null
     },
     {
      "dimension": "Availability Match",
      "evaluates": "Availability against the start-date requirements.",
      "score": 100,
      "weight": 0.08,
      "reason": "Available on or before the 2027-03-01 start date.",
      "gap": null
     },
     {
      "dimension": "Cultural / Professional Match",
      "evaluates": "Employment preferences and hospital type against the employment model and call schedule.",
      "score": 50,
      "weight": 0.1,
      "reason": "No cultural signal either way.",
      "gap": "Prefers employed; the position is academic. Call is heavy; the stated tolerance is light."
     }
    ],
    "reasons": [
     "Technology Match: The position does not require robotic experience.",
     "Career Match: Academic background suits an academic post. Leadership experience on record.",
     "Compensation Match: Expectation of $470,000 sits within the posted range.",
     "Availability Match: Available on or before the 2027-03-01 start date.",
     "Cultural / Professional Match: No cultural signal either way."
    ],
    "gaps": [
     "Clinical Match: Specialty is Robotic Surgery; the position is Transplant Surgery.",
     "Geographic Match: Prefers FL and is not open to relocation; the position is in NC.",
     "Cultural / Professional Match: Prefers employed; the position is academic. Call is heavy; the stated tolerance is light."
    ],
    "stage": null,
    "position": {
     "id": 51,
     "title": "Transplant Surgeon",
     "specialty": "Transplant Surgery",
     "city": "Chapel Hill",
     "state": "NC",
     "employment_model": "academic",
     "compensation_min": 560000,
     "compensation_max": 660000,
     "call_schedule": "heavy",
     "robotics_required": false,
     "start_date": "2027-03-01",
     "organization": {
      "id": 32,
      "name": "Sample University Hospital"
     }
    }
   },
   {
    "position_id": 53,
    "score": 50,
    "dimensions": [
     {
      "dimension": "Clinical Match",
      "evaluates": "Specialty-specific qualifications, certifications, procedural expertise, and experience.",
      "score": 0,
      "weight": 0.3,
      "reason": null,
      "gap": "Specialty is Robotic Surgery; the position is Gynecology."
     },
     {
      "dimension": "Technology Match",
      "evaluates": "Robotic platforms and technology experience against the position requirements.",
      "score": 100,
      "weight": 0.15,
      "reason": "Robotic experience on record. Platform match: da Vinci Xi. 6 years robotic. Has led a robotics programme.",
      "gap": null
     },
     {
      "dimension": "Geographic Match",
      "evaluates": "Geographic preferences and relocation willingness against the facility locations.",
      "score": 5,
      "weight": 0.15,
      "reason": null,
      "gap": "Prefers FL and is not open to relocation; the position is in GA."
     },
     {
      "dimension": "Career Match",
      "evaluates": "Professional objectives, leadership and academic experience against the opportunity.",
      "score": 90,
      "weight": 0.08,
      "reason": "Leadership experience on record.",
      "gap": null
     },
     {
      "dimension": "Compensation Match",
      "evaluates": "Compensation expectations against the compensation range.",
      "score": 65,
      "weight": 0.14,
      "reason": null,
      "gap": "Expectation of $470,000 is about 9% above the top of the range ($430,000)."
     },
     {
      "dimension": "Availability Match",
      "evaluates": "Availability against the start-date requirements.",
      "score": 100,
      "weight": 0.08,
      "reason": "Available on or before the 2026-11-01 start date.",
      "gap": null
     },
     {
      "dimension": "Cultural / Professional Match",
      "evaluates": "Employment preferences and hospital type against the employment model and call schedule.",
      "score": 100,
      "weight": 0.1,
      "reason": "Employment model matches the stated preference (employed). Call schedule is within the stated tolerance.",
      "gap": null
     }
    ],
    "reasons": [
     "Technology Match: Robotic experience on record. Platform match: da Vinci Xi. 6 years robotic. Has led a robotics programme.",
     "Career Match: Leadership experience on record.",
     "Availability Match: Available on or before the 2026-11-01 start date.",
     "Cultural / Professional Match: Employment model matches the stated preference (employed). Call schedule is within the stated tolerance."
    ],
    "gaps": [
     "Clinical Match: Specialty is Robotic Surgery; the position is Gynecology.",
     "Geographic Match: Prefers FL and is not open to relocation; the position is in GA.",
     "Compensation Match: Expectation of $470,000 is about 9% above the top of the range ($430,000)."
    ],
    "stage": null,
    "position": {
     "id": 53,
     "title": "Gynecologic Surgeon",
     "specialty": "Gynecology",
     "city": "Atlanta",
     "state": "GA",
     "employment_model": "employed",
     "compensation_min": 340000,
     "compensation_max": 430000,
     "call_schedule": "light",
     "robotics_required": true,
     "start_date": "2026-11-01",
     "organization": {
      "id": 29,
      "name": "Sample Health System"
     }
    }
   },
   {
    "position_id": 48,
    "score": 48,
    "dimensions": [
     {
      "dimension": "Clinical Match",
      "evaluates": "Specialty-specific qualifications, certifications, procedural expertise, and experience.",
      "score": 0,
      "weight": 0.3,
      "reason": null,
      "gap": "Specialty is Robotic Surgery; the position is Neurosurgery."
     },
     {
      "dimension": "Technology Match",
      "evaluates": "Robotic platforms and technology experience against the position requirements.",
      "score": 70,
      "weight": 0.15,
      "reason": "Robotic experience on record. 6 years robotic. Has led a robotics programme.",
      "gap": "Trained on da Vinci Xi; the position uses Mazor X."
     },
     {
      "dimension": "Geographic Match",
      "evaluates": "Geographic preferences and relocation willingness against the facility locations.",
      "score": 5,
      "weight": 0.15,
      "reason": null,
      "gap": "Prefers FL and is not open to relocation; the position is in TX."
     },
     {
      "dimension": "Career Match",
      "evaluates": "Professional objectives, leadership and academic experience against the opportunity.",
      "score": 90,
      "weight": 0.08,
      "reason": "Leadership experience on record.",
      "gap": null
     },
     {
      "dimension": "Compensation Match",
      "evaluates": "Compensation expectations against the compensation range.",
      "score": 100,
      "weight": 0.14,
      "reason": "Expectation of $470,000 sits within the posted range.",
      "gap": null
     },
     {
      "dimension": "Availability Match",
      "evaluates": "Availability against the start-date requirements.",
      "score": 100,
      "weight": 0.08,
      "reason": "Available on or before the 2027-02-01 start date.",
      "gap": null
     },
     {
      "dimension": "Cultural / Professional Match",
      "evaluates": "Employment preferences and hospital type against the employment model and call schedule.",
      "score": 80,
      "weight": 0.1,
      "reason": "Employment model matches the stated preference (employed).",
      "gap": "Call is heavy; the stated tolerance is light."
     }
    ],
    "reasons": [
     "Technology Match: Robotic experience on record. 6 years robotic. Has led a robotics programme.",
     "Career Match: Leadership experience on record.",
     "Compensation Match: Expectation of $470,000 sits within the posted range.",
     "Availability Match: Available on or before the 2027-02-01 start date.",
     "Cultural / Professional Match: Employment model matches the stated preference (employed)."
    ],
    "gaps": [
     "Clinical Match: Specialty is Robotic Surgery; the position is Neurosurgery.",
     "Technology Match: Trained on da Vinci Xi; the position uses Mazor X.",
     "Geographic Match: Prefers FL and is not open to relocation; the position is in TX.",
     "Cultural / Professional Match: Call is heavy; the stated tolerance is light."
    ],
    "stage": null,
    "position": {
     "id": 48,
     "title": "Neurosurgeon - Spine",
     "specialty": "Neurosurgery",
     "city": "Dallas",
     "state": "TX",
     "employment_model": "employed",
     "compensation_min": 800000,
     "compensation_max": 950000,
     "call_schedule": "heavy",
     "robotics_required": true,
     "start_date": "2027-02-01",
     "organization": {
      "id": 30,
      "name": "Sample Integrated Delivery Network"
     }
    }
   },
   {
    "position_id": 47,
    "score": 47,
    "dimensions": [
     {
      "dimension": "Clinical Match",
      "evaluates": "Specialty-specific qualifications, certifications, procedural expertise, and experience.",
      "score": 0,
      "weight": 0.3,
      "reason": null,
      "gap": "Specialty is Robotic Surgery; the position is Orthopaedic Surgery."
     },
     {
      "dimension": "Technology Match",
      "evaluates": "Robotic platforms and technology experience against the position requirements.",
      "score": 70,
      "weight": 0.15,
      "reason": "Robotic experience on record. 6 years robotic. Has led a robotics programme.",
      "gap": "Trained on da Vinci Xi; the position uses Mazor X."
     },
     {
      "dimension": "Geographic Match",
      "evaluates": "Geographic preferences and relocation willingness against the facility locations.",
      "score": 5,
      "weight": 0.15,
      "reason": null,
      "gap": "Prefers FL and is not open to relocation; the position is in TX."
     },
     {
      "dimension": "Career Match",
      "evaluates": "Professional objectives, leadership and academic experience against the opportunity.",
      "score": 90,
      "weight": 0.08,
      "reason": "Leadership experience on record.",
      "gap": null
     },
     {
      "dimension": "Compensation Match",
      "evaluates": "Compensation expectations against the compensation range.",
      "score": 100,
      "weight": 0.14,
      "reason": "Expectation of $470,000 sits within the posted range.",
      "gap": null
     },
     {
      "dimension": "Availability Match",
      "evaluates": "Availability against the start-date requirements.",
      "score": 100,
      "weight": 0.08,
      "reason": "Available on or before the 2026-11-15 start date.",
      "gap": null
     },
     {
      "dimension": "Cultural / Professional Match",
      "evaluates": "Employment preferences and hospital type against the employment model and call schedule.",
      "score": 70,
      "weight": 0.1,
      "reason": "Call schedule is within the stated tolerance.",
      "gap": "Prefers employed; the position is independent."
     }
    ],
    "reasons": [
     "Technology Match: Robotic experience on record. 6 years robotic. Has led a robotics programme.",
     "Career Match: Leadership experience on record.",
     "Compensation Match: Expectation of $470,000 sits within the posted range.",
     "Availability Match: Available on or before the 2026-11-15 start date.",
     "Cultural / Professional Match: Call schedule is within the stated tolerance."
    ],
    "gaps": [
     "Clinical Match: Specialty is Robotic Surgery; the position is Orthopaedic Surgery.",
     "Technology Match: Trained on da Vinci Xi; the position uses Mazor X.",
     "Geographic Match: Prefers FL and is not open to relocation; the position is in TX.",
     "Cultural / Professional Match: Prefers employed; the position is independent."
    ],
    "stage": null,
    "position": {
     "id": 47,
     "title": "Orthopaedic Surgeon - Joints",
     "specialty": "Orthopaedic Surgery",
     "city": "Dallas",
     "state": "TX",
     "employment_model": "independent",
     "compensation_min": 600000,
     "compensation_max": 780000,
     "call_schedule": "light",
     "robotics_required": true,
     "start_date": "2026-11-15",
     "organization": {
      "id": 30,
      "name": "Sample Integrated Delivery Network"
     }
    }
   },
   {
    "position_id": 52,
    "score": 46,
    "dimensions": [
     {
      "dimension": "Clinical Match",
      "evaluates": "Specialty-specific qualifications, certifications, procedural expertise, and experience.",
      "score": 0,
      "weight": 0.3,
      "reason": null,
      "gap": "Specialty is Robotic Surgery; the position is Hepatobiliary Surgery."
     },
     {
      "dimension": "Technology Match",
      "evaluates": "Robotic platforms and technology experience against the position requirements.",
      "score": 70,
      "weight": 0.15,
      "reason": "Robotic experience on record. 6 years robotic. Has led a robotics programme.",
      "gap": "Trained on da Vinci Xi; the position uses da Vinci Si."
     },
     {
      "dimension": "Geographic Match",
      "evaluates": "Geographic preferences and relocation willingness against the facility locations.",
      "score": 5,
      "weight": 0.15,
      "reason": null,
      "gap": "Prefers FL and is not open to relocation; the position is in NC."
     },
     {
      "dimension": "Career Match",
      "evaluates": "Professional objectives, leadership and academic experience against the opportunity.",
      "score": 100,
      "weight": 0.08,
      "reason": "Academic background suits an academic post. Leadership experience on record.",
      "gap": null
     },
     {
      "dimension": "Compensation Match",
      "evaluates": "Compensation expectations against the compensation range.",
      "score": 100,
      "weight": 0.14,
      "reason": "Expectation of $470,000 sits within the posted range.",
      "gap": null
     },
     {
      "dimension": "Availability Match",
      "evaluates": "Availability against the start-date requirements.",
      "score": 100,
      "weight": 0.08,
      "reason": "Available on or before the 2027-01-01 start date.",
      "gap": null
     },
     {
      "dimension": "Cultural / Professional Match",
      "evaluates": "Employment preferences and hospital type against the employment model and call schedule.",
      "score": 50,
      "weight": 0.1,
      "reason": "No cultural signal either way.",
      "gap": "Prefers employed; the position is academic. Call is moderate; the stated tolerance is light."
     }
    ],
    "reasons": [
     "Technology Match: Robotic experience on record. 6 years robotic. Has led a robotics programme.",
     "Career Match: Academic background suits an academic post. Leadership experience on record.",
     "Compensation Match: Expectation of $470,000 sits within the posted range.",
     "Availability Match: Available on or before the 2027-01-01 start date.",
     "Cultural / Professional Match: No cultural signal either way."
    ],
    "gaps": [
     "Clinical Match: Specialty is Robotic Surgery; the position is Hepatobiliary Surgery.",
     "Technology Match: Trained on da Vinci Xi; the position uses da Vinci Si.",
     "Geographic Match: Prefers FL and is not open to relocation; the position is in NC.",
     "Cultural / Professional Match: Prefers employed; the position is academic. Call is moderate; the stated tolerance is light."
    ],
    "stage": null,
    "position": {
     "id": 52,
     "title": "Hepatobiliary Surgeon",
     "specialty": "Hepatobiliary Surgery",
     "city": "Chapel Hill",
     "state": "NC",
     "employment_model": "academic",
     "compensation_min": 540000,
     "compensation_max": 640000,
     "call_schedule": "moderate",
     "robotics_required": true,
     "start_date": "2027-01-01",
     "organization": {
      "id": 32,
      "name": "Sample University Hospital"
     }
    }
   }
  ]
 },
 "physician:/matches:applied": {
  "completeness": {
   "percent": 100,
   "missing": []
  },
  "items": [
   {
    "position_id": 43,
    "score": 99,
    "dimensions": [
     {
      "dimension": "Clinical Match",
      "evaluates": "Specialty-specific qualifications, certifications, procedural expertise, and experience.",
      "score": 100,
      "weight": 0.3,
      "reason": "Specialty matches: Robotic Surgery. Board certified, as required. 11 years of experience against a 5-year minimum. Shared procedures: robotic cholecystectomy, robotic hernia repair.",
      "gap": null
     },
     {
      "dimension": "Technology Match",
      "evaluates": "Robotic platforms and technology experience against the position requirements.",
      "score": 100,
      "weight": 0.15,
      "reason": "Robotic experience on record. Platform match: da Vinci Xi. 6 years robotic. Has led a robotics programme.",
      "gap": null
     },
     {
      "dimension": "Geographic Match",
      "evaluates": "Geographic preferences and relocation willingness against the facility locations.",
      "score": 100,
      "weight": 0.15,
      "reason": "FL is a stated preferred location.",
      "gap": null
     },
     {
      "dimension": "Career Match",
      "evaluates": "Professional objectives, leadership and academic experience against the opportunity.",
      "score": 90,
      "weight": 0.08,
      "reason": "Leadership experience on record.",
      "gap": null
     },
     {
      "dimension": "Compensation Match",
      "evaluates": "Compensation expectations against the compensation range.",
      "score": 100,
      "weight": 0.14,
      "reason": "Expectation of $470,000 sits within the posted range.",
      "gap": null
     },
     {
      "dimension": "Availability Match",
      "evaluates": "Availability against the start-date requirements.",
      "score": 100,
      "weight": 0.08,
      "reason": "Available on or before the 2026-11-01 start date.",
      "gap": null
     },
     {
      "dimension": "Cultural / Professional Match",
      "evaluates": "Employment preferences and hospital type against the employment model and call schedule.",
      "score": 100,
      "weight": 0.1,
      "reason": "Employment model matches the stated preference (employed). Call schedule is within the stated tolerance.",
      "gap": null
     }
    ],
    "reasons": [
     "Clinical Match: Specialty matches: Robotic Surgery. Board certified, as required. 11 years of experience against a 5-year minimum. Shared procedures: robotic cholecystectomy, robotic hernia repair.",
     "Technology Match: Robotic experience on record. Platform match: da Vinci Xi. 6 years robotic. Has led a robotics programme.",
     "Geographic Match: FL is a stated preferred location.",
     "Career Match: Leadership experience on record.",
     "Compensation Match: Expectation of $470,000 sits within the posted range.",
     "Availability Match: Available on or before the 2026-11-01 start date.",
     "Cultural / Professional Match: Employment model matches the stated preference (employed). Call schedule is within the stated tolerance."
    ],
    "gaps": [],
    "stage": "Interested",
    "position": {
     "id": 43,
     "title": "Robotic General Surgeon",
     "specialty": "Robotic Surgery",
     "city": "Tampa",
     "state": "FL",
     "employment_model": "employed",
     "compensation_min": 430000,
     "compensation_max": 510000,
     "call_schedule": "light",
     "robotics_required": true,
     "start_date": "2026-11-01",
     "organization": {
      "id": 28,
      "name": "Sample Regional Medical Center"
     }
    }
   },
   {
    "position_id": 54,
    "score": 69,
    "dimensions": [
     {
      "dimension": "Clinical Match",
      "evaluates": "Specialty-specific qualifications, certifications, procedural expertise, and experience.",
      "score": 0,
      "weight": 0.3,
      "reason": null,
      "gap": "Specialty is Robotic Surgery; the position is Colon & Rectal Surgery."
     },
     {
      "dimension": "Technology Match",
      "evaluates": "Robotic platforms and technology experience against the position requirements.",
      "score": 100,
      "weight": 0.15,
      "reason": "Robotic experience on record. Platform match: da Vinci Xi. 6 years robotic. Has led a robotics programme.",
      "gap": null
     },
     {
      "dimension": "Geographic Match",
      "evaluates": "Geographic preferences and relocation willingness against the facility locations.",
      "score": 100,
      "weight": 0.15,
      "reason": "FL is a stated preferred location.",
      "gap": null
     },
     {
      "dimension": "Career Match",
      "evaluates": "Professional objectives, leadership and academic experience against the opportunity.",
      "score": 90,
      "weight": 0.08,
      "reason": "Leadership experience on record.",
      "gap": null
     },
     {
      "dimension": "Compensation Match",
      "evaluates": "Compensation expectations against the compensation range.",
      "score": 100,
      "weight": 0.14,
      "reason": "Expectation of $470,000 sits within the posted range.",
      "gap": null
     },
     {
      "dimension": "Availability Match",
      "evaluates": "Availability against the start-date requirements.",
      "score": 100,
      "weight": 0.08,
      "reason": "Available on or before the 2026-12-01 start date.",
      "gap": null
     },
     {
      "dimension": "Cultural / Professional Match",
      "evaluates": "Employment preferences and hospital type against the employment model and call schedule.",
      "score": 100,
      "weight": 0.1,
      "reason": "Employment model matches the stated preference (employed). Call schedule is within the stated tolerance.",
      "gap": null
     }
    ],
    "reasons": [
     "Technology Match: Robotic experience on record. Platform match: da Vinci Xi. 6 years robotic. Has led a robotics programme.",
     "Geographic Match: FL is a stated preferred location.",
     "Career Match: Leadership experience on record.",
     "Compensation Match: Expectation of $470,000 sits within the posted range.",
     "Availability Match: Available on or before the 2026-12-01 start date.",
     "Cultural / Professional Match: Employment model matches the stated preference (employed). Call schedule is within the stated tolerance."
    ],
    "gaps": [
     "Clinical Match: Specialty is Robotic Surgery; the position is Colon & Rectal Surgery."
    ],
    "stage": null,
    "position": {
     "id": 54,
     "title": "Colon & Rectal Surgeon",
     "specialty": "Colon & Rectal Surgery",
     "city": "Tampa",
     "state": "FL",
     "employment_model": "employed",
     "compensation_min": 520000,
     "compensation_max": 610000,
     "call_schedule": "light",
     "robotics_required": true,
     "start_date": "2026-12-01",
     "organization": {
      "id": 28,
      "name": "Sample Regional Medical Center"
     }
    }
   },
   {
    "position_id": 44,
    "score": 67,
    "dimensions": [
     {
      "dimension": "Clinical Match",
      "evaluates": "Specialty-specific qualifications, certifications, procedural expertise, and experience.",
      "score": 0,
      "weight": 0.3,
      "reason": null,
      "gap": "Specialty is Robotic Surgery; the position is Urology."
     },
     {
      "dimension": "Technology Match",
      "evaluates": "Robotic platforms and technology experience against the position requirements.",
      "score": 100,
      "weight": 0.15,
      "reason": "Robotic experience on record. Platform match: da Vinci Xi. 6 years robotic. Has led a robotics programme.",
      "gap": null
     },
     {
      "dimension": "Geographic Match",
      "evaluates": "Geographic preferences and relocation willingness against the facility locations.",
      "score": 100,
      "weight": 0.15,
      "reason": "FL is a stated preferred location.",
      "gap": null
     },
     {
      "dimension": "Career Match",
      "evaluates": "Professional objectives, leadership and academic experience against the opportunity.",
      "score": 90,
      "weight": 0.08,
      "reason": "Leadership experience on record.",
      "gap": null
     },
     {
      "dimension": "Compensation Match",
      "evaluates": "Compensation expectations against the compensation range.",
      "score": 100,
      "weight": 0.14,
      "reason": "Expectation of $470,000 sits within the posted range.",
      "gap": null
     },
     {
      "dimension": "Availability Match",
      "evaluates": "Availability against the start-date requirements.",
      "score": 100,
      "weight": 0.08,
      "reason": "Available on or before the 2026-10-01 start date.",
      "gap": null
     },
     {
      "dimension": "Cultural / Professional Match",
      "evaluates": "Employment preferences and hospital type against the employment model and call schedule.",
      "score": 80,
      "weight": 0.1,
      "reason": "Employment model matches the stated preference (employed).",
      "gap": "Call is moderate; the stated tolerance is light."
     }
    ],
    "reasons": [
     "Technology Match: Robotic experience on record. Platform match: da Vinci Xi. 6 years robotic. Has led a robotics programme.",
     "Geographic Match: FL is a stated preferred location.",
     "Career Match: Leadership experience on record.",
     "Compensation Match: Expectation of $470,000 sits within the posted range.",
     "Availability Match: Available on or before the 2026-10-01 start date.",
     "Cultural / Professional Match: Employment model matches the stated preference (employed)."
    ],
    "gaps": [
     "Clinical Match: Specialty is Robotic Surgery; the position is Urology.",
     "Cultural / Professional Match: Call is moderate; the stated tolerance is light."
    ],
    "stage": null,
    "position": {
     "id": 44,
     "title": "Urologist",
     "specialty": "Urology",
     "city": "Tampa",
     "state": "FL",
     "employment_model": "employed",
     "compensation_min": 440000,
     "compensation_max": 550000,
     "call_schedule": "moderate",
     "robotics_required": true,
     "start_date": "2026-10-01",
     "organization": {
      "id": 28,
      "name": "Sample Regional Medical Center"
     }
    }
   },
   {
    "position_id": 45,
    "score": 53,
    "dimensions": [
     {
      "dimension": "Clinical Match",
      "evaluates": "Specialty-specific qualifications, certifications, procedural expertise, and experience.",
      "score": 0,
      "weight": 0.3,
      "reason": null,
      "gap": "Specialty is Robotic Surgery; the position is Cardiac Surgery."
     },
     {
      "dimension": "Technology Match",
      "evaluates": "Robotic platforms and technology experience against the position requirements.",
      "score": 100,
      "weight": 0.15,
      "reason": "The position does not require robotic experience.",
      "gap": null
     },
     {
      "dimension": "Geographic Match",
      "evaluates": "Geographic preferences and relocation willingness against the facility locations.",
      "score": 5,
      "weight": 0.15,
      "reason": null,
      "gap": "Prefers FL and is not open to relocation; the position is in GA."
     },
     {
      "dimension": "Career Match",
      "evaluates": "Professional objectives, leadership and academic experience against the opportunity.",
      "score": 90,
      "weight": 0.08,
      "reason": "Leadership experience on record.",
      "gap": null
     },
     {
      "dimension": "Compensation Match",
      "evaluates": "Compensation expectations against the compensation range.",
      "score": 100,
      "weight": 0.14,
      "reason": "Expectation of $470,000 sits within the posted range.",
      "gap": null
     },
     {
      "dimension": "Availability Match",
      "evaluates": "Availability against the start-date requirements.",
      "score": 100,
      "weight": 0.08,
      "reason": "Available on or before the 2027-01-15 start date.",
      "gap": null
     },
     {
      "dimension": "Cultural / Professional Match",
      "evaluates": "Employment preferences and hospital type against the employment model and call schedule.",
      "score": 80,
      "weight": 0.1,
      "reason": "Employment model matches the stated preference (employed).",
      "gap": "Call is heavy; the stated tolerance is light."
     }
    ],
    "reasons": [
     "Technology Match: The position does not require robotic experience.",
     "Career Match: Leadership experience on record.",
     "Compensation Match: Expectation of $470,000 sits within the posted range.",
     "Availability Match: Available on or before the 2027-01-15 start date.",
     "Cultural / Professional Match: Employment model matches the stated preference (employed)."
    ],
    "gaps": [
     "Clinical Match: Specialty is Robotic Surgery; the position is Cardiac Surgery.",
     "Geographic Match: Prefers FL and is not open to relocation; the position is in GA.",
     "Cultural / Professional Match: Call is heavy; the stated tolerance is light."
    ],
    "stage": null,
    "position": {
     "id": 45,
     "title": "Cardiac Surgeon",
     "specialty": "Cardiac Surgery",
     "city": "Atlanta",
     "state": "GA",
     "employment_model": "employed",
     "compensation_min": 700000,
     "compensation_max": 850000,
     "call_schedule": "heavy",
     "robotics_required": false,
     "start_date": "2027-01-15",
     "organization": {
      "id": 29,
      "name": "Sample Health System"
     }
    }
   },
   {
    "position_id": 46,
    "score": 53,
    "dimensions": [
     {
      "dimension": "Clinical Match",
      "evaluates": "Specialty-specific qualifications, certifications, procedural expertise, and experience.",
      "score": 0,
      "weight": 0.3,
      "reason": null,
      "gap": "Specialty is Robotic Surgery; the position is Thoracic Surgery."
     },
     {
      "dimension": "Technology Match",
      "evaluates": "Robotic platforms and technology experience against the position requirements.",
      "score": 100,
      "weight": 0.15,
      "reason": "Robotic experience on record. Platform match: da Vinci Xi. 6 years robotic. Has led a robotics programme.",
      "gap": null
     },
     {
      "dimension": "Geographic Match",
      "evaluates": "Geographic preferences and relocation willingness against the facility locations.",
      "score": 5,
      "weight": 0.15,
      "reason": null,
      "gap": "Prefers FL and is not open to relocation; the position is in GA."
     },
     {
      "dimension": "Career Match",
      "evaluates": "Professional objectives, leadership and academic experience against the opportunity.",
      "score": 90,
      "weight": 0.08,
      "reason": "Leadership experience on record.",
      "gap": null
     },
     {
      "dimension": "Compensation Match",
      "evaluates": "Compensation expectations against the compensation range.",
      "score": 100,
      "weight": 0.14,
      "reason": "Expectation of $470,000 sits within the posted range.",
      "gap": null
     },
     {
      "dimension": "Availability Match",
      "evaluates": "Availability against the start-date requirements.",
      "score": 100,
      "weight": 0.08,
      "reason": "Available on or before the 2026-12-01 start date.",
      "gap": null
     },
     {
      "dimension": "Cultural / Professional Match",
      "evaluates": "Employment preferences and hospital type against the employment model and call schedule.",
      "score": 80,
      "weight": 0.1,
      "reason": "Employment model matches the stated preference (employed).",
      "gap": "Call is moderate; the stated tolerance is light."
     }
    ],
    "reasons": [
     "Technology Match: Robotic experience on record. Platform match: da Vinci Xi. 6 years robotic. Has led a robotics programme.",
     "Career Match: Leadership experience on record.",
     "Compensation Match: Expectation of $470,000 sits within the posted range.",
     "Availability Match: Available on or before the 2026-12-01 start date.",
     "Cultural / Professional Match: Employment model matches the stated preference (employed)."
    ],
    "gaps": [
     "Clinical Match: Specialty is Robotic Surgery; the position is Thoracic Surgery.",
     "Geographic Match: Prefers FL and is not open to relocation; the position is in GA.",
     "Cultural / Professional Match: Call is moderate; the stated tolerance is light."
    ],
    "stage": null,
    "position": {
     "id": 46,
     "title": "Thoracic Surgeon",
     "specialty": "Thoracic Surgery",
     "city": "Atlanta",
     "state": "GA",
     "employment_model": "employed",
     "compensation_min": 620000,
     "compensation_max": 720000,
     "call_schedule": "moderate",
     "robotics_required": true,
     "start_date": "2026-12-01",
     "organization": {
      "id": 29,
      "name": "Sample Health System"
     }
    }
   },
   {
    "position_id": 49,
    "score": 53,
    "dimensions": [
     {
      "dimension": "Clinical Match",
      "evaluates": "Specialty-specific qualifications, certifications, procedural expertise, and experience.",
      "score": 0,
      "weight": 0.3,
      "reason": null,
      "gap": "Specialty is Robotic Surgery; the position is General Surgery."
     },
     {
      "dimension": "Technology Match",
      "evaluates": "Robotic platforms and technology experience against the position requirements.",
      "score": 100,
      "weight": 0.15,
      "reason": "The position does not require robotic experience.",
      "gap": null
     },
     {
      "dimension": "Geographic Match",
      "evaluates": "Geographic preferences and relocation willingness against the facility locations.",
      "score": 5,
      "weight": 0.15,
      "reason": null,
      "gap": "Prefers FL and is not open to relocation; the position is in SC."
     },
     {
      "dimension": "Career Match",
      "evaluates": "Professional objectives, leadership and academic experience against the opportunity.",
      "score": 90,
      "weight": 0.08,
      "reason": "Leadership experience on record.",
      "gap": null
     },
     {
      "dimension": "Compensation Match",
      "evaluates": "Compensation expectations against the compensation range.",
      "score": 100,
      "weight": 0.14,
      "reason": "Expectation of $470,000 sits within the posted range.",
      "gap": null
     },
     {
      "dimension": "Availability Match",
      "evaluates": "Availability against the start-date requirements.",
      "score": 100,
      "weight": 0.08,
      "reason": "Available on or before the 2026-10-15 start date.",
      "gap": null
     },
     {
      "dimension": "Cultural / Professional Match",
      "evaluates": "Employment preferences and hospital type against the employment model and call schedule.",
      "score": 80,
      "weight": 0.1,
      "reason": "Employment model matches the stated preference (employed).",
      "gap": "Call is moderate; the stated tolerance is light."
     }
    ],
    "reasons": [
     "Technology Match: The position does not require robotic experience.",
     "Career Match: Leadership experience on record.",
     "Compensation Match: Expectation of $470,000 sits within the posted range.",
     "Availability Match: Available on or before the 2026-10-15 start date.",
     "Cultural / Professional Match: Employment model matches the stated preference (employed)."
    ],
    "gaps": [
     "Clinical Match: Specialty is Robotic Surgery; the position is General Surgery.",
     "Geographic Match: Prefers FL and is not open to relocation; the position is in SC.",
     "Cultural / Professional Match: Call is moderate; the stated tolerance is light."
    ],
    "stage": null,
    "position": {
     "id": 49,
     "title": "General Surgeon",
     "specialty": "General Surgery",
     "city": "Charleston",
     "state": "SC",
     "employment_model": "employed",
     "compensation_min": 380000,
     "compensation_max": 470000,
     "call_schedule": "moderate",
     "robotics_required": false,
     "start_date": "2026-10-15",
     "organization": {
      "id": 31,
      "name": "Sample Coastal Hospital"
     }
    }
   },
   {
    "position_id": 50,
    "score": 53,
    "dimensions": [
     {
      "dimension": "Clinical Match",
      "evaluates": "Specialty-specific qualifications, certifications, procedural expertise, and experience.",
      "score": 0,
      "weight": 0.3,
      "reason": null,
      "gap": "Specialty is Robotic Surgery; the position is Trauma Surgery."
     },
     {
      "dimension": "Technology Match",
      "evaluates": "Robotic platforms and technology experience against the position requirements.",
      "score": 100,
      "weight": 0.15,
      "reason": "The position does not require robotic experience.",
      "gap": null
     },
     {
      "dimension": "Geographic Match",
      "evaluates": "Geographic preferences and relocation willingness against the facility locations.",
      "score": 5,
      "weight": 0.15,
      "reason": null,
      "gap": "Prefers FL and is not open to relocation; the position is in SC."
     },
     {
      "dimension": "Career Match",
      "evaluates": "Professional objectives, leadership and academic experience against the opportunity.",
      "score": 90,
      "weight": 0.08,
      "reason": "Leadership experience on record.",
      "gap": null
     },
     {
      "dimension": "Compensation Match",
      "evaluates": "Compensation expectations against the compensation range.",
      "score": 100,
      "weight": 0.14,
      "reason": "Expectation of $470,000 sits within the posted range.",
      "gap": null
     },
     {
      "dimension": "Availability Match",
      "evaluates": "Availability against the start-date requirements.",
      "score": 100,
      "weight": 0.08,
      "reason": "Available on or before the 2026-12-15 start date.",
      "gap": null
     },
     {
      "dimension": "Cultural / Professional Match",
      "evaluates": "Employment preferences and hospital type against the employment model and call schedule.",
      "score": 80,
      "weight": 0.1,
      "reason": "Employment model matches the stated preference (employed).",
      "gap": "Call is heavy; the stated tolerance is light."
     }
    ],
    "reasons": [
     "Technology Match: The position does not require robotic experience.",
     "Career Match: Leadership experience on record.",
     "Compensation Match: Expectation of $470,000 sits within the posted range.",
     "Availability Match: Available on or before the 2026-12-15 start date.",
     "Cultural / Professional Match: Employment model matches the stated preference (employed)."
    ],
    "gaps": [
     "Clinical Match: Specialty is Robotic Surgery; the position is Trauma Surgery.",
     "Geographic Match: Prefers FL and is not open to relocation; the position is in SC.",
     "Cultural / Professional Match: Call is heavy; the stated tolerance is light."
    ],
    "stage": null,
    "position": {
     "id": 50,
     "title": "Trauma Surgeon",
     "specialty": "Trauma Surgery",
     "city": "Charleston",
     "state": "SC",
     "employment_model": "employed",
     "compensation_min": 500000,
     "compensation_max": 580000,
     "call_schedule": "heavy",
     "robotics_required": false,
     "start_date": "2026-12-15",
     "organization": {
      "id": 31,
      "name": "Sample Coastal Hospital"
     }
    }
   },
   {
    "position_id": 51,
    "score": 51,
    "dimensions": [
     {
      "dimension": "Clinical Match",
      "evaluates": "Specialty-specific qualifications, certifications, procedural expertise, and experience.",
      "score": 0,
      "weight": 0.3,
      "reason": null,
      "gap": "Specialty is Robotic Surgery; the position is Transplant Surgery."
     },
     {
      "dimension": "Technology Match",
      "evaluates": "Robotic platforms and technology experience against the position requirements.",
      "score": 100,
      "weight": 0.15,
      "reason": "The position does not require robotic experience.",
      "gap": null
     },
     {
      "dimension": "Geographic Match",
      "evaluates": "Geographic preferences and relocation willingness against the facility locations.",
      "score": 5,
      "weight": 0.15,
      "reason": null,
      "gap": "Prefers FL and is not open to relocation; the position is in NC."
     },
     {
      "dimension": "Career Match",
      "evaluates": "Professional objectives, leadership and academic experience against the opportunity.",
      "score": 100,
      "weight": 0.08,
      "reason": "Academic background suits an academic post. Leadership experience on record.",
      "gap": null
     },
     {
      "dimension": "Compensation Match",
      "evaluates": "Compensation expectations against the compensation range.",
      "score": 100,
      "weight": 0.14,
      "reason": "Expectation of $470,000 sits within the posted range.",
      "gap": null
     },
     {
      "dimension": "Availability Match",
      "evaluates": "Availability against the start-date requirements.",
      "score": 100,
      "weight": 0.08,
      "reason": "Available on or before the 2027-03-01 start date.",
      "gap": null
     },
     {
      "dimension": "Cultural / Professional Match",
      "evaluates": "Employment preferences and hospital type against the employment model and call schedule.",
      "score": 50,
      "weight": 0.1,
      "reason": "No cultural signal either way.",
      "gap": "Prefers employed; the position is academic. Call is heavy; the stated tolerance is light."
     }
    ],
    "reasons": [
     "Technology Match: The position does not require robotic experience.",
     "Career Match: Academic background suits an academic post. Leadership experience on record.",
     "Compensation Match: Expectation of $470,000 sits within the posted range.",
     "Availability Match: Available on or before the 2027-03-01 start date.",
     "Cultural / Professional Match: No cultural signal either way."
    ],
    "gaps": [
     "Clinical Match: Specialty is Robotic Surgery; the position is Transplant Surgery.",
     "Geographic Match: Prefers FL and is not open to relocation; the position is in NC.",
     "Cultural / Professional Match: Prefers employed; the position is academic. Call is heavy; the stated tolerance is light."
    ],
    "stage": null,
    "position": {
     "id": 51,
     "title": "Transplant Surgeon",
     "specialty": "Transplant Surgery",
     "city": "Chapel Hill",
     "state": "NC",
     "employment_model": "academic",
     "compensation_min": 560000,
     "compensation_max": 660000,
     "call_schedule": "heavy",
     "robotics_required": false,
     "start_date": "2027-03-01",
     "organization": {
      "id": 32,
      "name": "Sample University Hospital"
     }
    }
   },
   {
    "position_id": 53,
    "score": 50,
    "dimensions": [
     {
      "dimension": "Clinical Match",
      "evaluates": "Specialty-specific qualifications, certifications, procedural expertise, and experience.",
      "score": 0,
      "weight": 0.3,
      "reason": null,
      "gap": "Specialty is Robotic Surgery; the position is Gynecology."
     },
     {
      "dimension": "Technology Match",
      "evaluates": "Robotic platforms and technology experience against the position requirements.",
      "score": 100,
      "weight": 0.15,
      "reason": "Robotic experience on record. Platform match: da Vinci Xi. 6 years robotic. Has led a robotics programme.",
      "gap": null
     },
     {
      "dimension": "Geographic Match",
      "evaluates": "Geographic preferences and relocation willingness against the facility locations.",
      "score": 5,
      "weight": 0.15,
      "reason": null,
      "gap": "Prefers FL and is not open to relocation; the position is in GA."
     },
     {
      "dimension": "Career Match",
      "evaluates": "Professional objectives, leadership and academic experience against the opportunity.",
      "score": 90,
      "weight": 0.08,
      "reason": "Leadership experience on record.",
      "gap": null
     },
     {
      "dimension": "Compensation Match",
      "evaluates": "Compensation expectations against the compensation range.",
      "score": 65,
      "weight": 0.14,
      "reason": null,
      "gap": "Expectation of $470,000 is about 9% above the top of the range ($430,000)."
     },
     {
      "dimension": "Availability Match",
      "evaluates": "Availability against the start-date requirements.",
      "score": 100,
      "weight": 0.08,
      "reason": "Available on or before the 2026-11-01 start date.",
      "gap": null
     },
     {
      "dimension": "Cultural / Professional Match",
      "evaluates": "Employment preferences and hospital type against the employment model and call schedule.",
      "score": 100,
      "weight": 0.1,
      "reason": "Employment model matches the stated preference (employed). Call schedule is within the stated tolerance.",
      "gap": null
     }
    ],
    "reasons": [
     "Technology Match: Robotic experience on record. Platform match: da Vinci Xi. 6 years robotic. Has led a robotics programme.",
     "Career Match: Leadership experience on record.",
     "Availability Match: Available on or before the 2026-11-01 start date.",
     "Cultural / Professional Match: Employment model matches the stated preference (employed). Call schedule is within the stated tolerance."
    ],
    "gaps": [
     "Clinical Match: Specialty is Robotic Surgery; the position is Gynecology.",
     "Geographic Match: Prefers FL and is not open to relocation; the position is in GA.",
     "Compensation Match: Expectation of $470,000 is about 9% above the top of the range ($430,000)."
    ],
    "stage": null,
    "position": {
     "id": 53,
     "title": "Gynecologic Surgeon",
     "specialty": "Gynecology",
     "city": "Atlanta",
     "state": "GA",
     "employment_model": "employed",
     "compensation_min": 340000,
     "compensation_max": 430000,
     "call_schedule": "light",
     "robotics_required": true,
     "start_date": "2026-11-01",
     "organization": {
      "id": 29,
      "name": "Sample Health System"
     }
    }
   },
   {
    "position_id": 48,
    "score": 48,
    "dimensions": [
     {
      "dimension": "Clinical Match",
      "evaluates": "Specialty-specific qualifications, certifications, procedural expertise, and experience.",
      "score": 0,
      "weight": 0.3,
      "reason": null,
      "gap": "Specialty is Robotic Surgery; the position is Neurosurgery."
     },
     {
      "dimension": "Technology Match",
      "evaluates": "Robotic platforms and technology experience against the position requirements.",
      "score": 70,
      "weight": 0.15,
      "reason": "Robotic experience on record. 6 years robotic. Has led a robotics programme.",
      "gap": "Trained on da Vinci Xi; the position uses Mazor X."
     },
     {
      "dimension": "Geographic Match",
      "evaluates": "Geographic preferences and relocation willingness against the facility locations.",
      "score": 5,
      "weight": 0.15,
      "reason": null,
      "gap": "Prefers FL and is not open to relocation; the position is in TX."
     },
     {
      "dimension": "Career Match",
      "evaluates": "Professional objectives, leadership and academic experience against the opportunity.",
      "score": 90,
      "weight": 0.08,
      "reason": "Leadership experience on record.",
      "gap": null
     },
     {
      "dimension": "Compensation Match",
      "evaluates": "Compensation expectations against the compensation range.",
      "score": 100,
      "weight": 0.14,
      "reason": "Expectation of $470,000 sits within the posted range.",
      "gap": null
     },
     {
      "dimension": "Availability Match",
      "evaluates": "Availability against the start-date requirements.",
      "score": 100,
      "weight": 0.08,
      "reason": "Available on or before the 2027-02-01 start date.",
      "gap": null
     },
     {
      "dimension": "Cultural / Professional Match",
      "evaluates": "Employment preferences and hospital type against the employment model and call schedule.",
      "score": 80,
      "weight": 0.1,
      "reason": "Employment model matches the stated preference (employed).",
      "gap": "Call is heavy; the stated tolerance is light."
     }
    ],
    "reasons": [
     "Technology Match: Robotic experience on record. 6 years robotic. Has led a robotics programme.",
     "Career Match: Leadership experience on record.",
     "Compensation Match: Expectation of $470,000 sits within the posted range.",
     "Availability Match: Available on or before the 2027-02-01 start date.",
     "Cultural / Professional Match: Employment model matches the stated preference (employed)."
    ],
    "gaps": [
     "Clinical Match: Specialty is Robotic Surgery; the position is Neurosurgery.",
     "Technology Match: Trained on da Vinci Xi; the position uses Mazor X.",
     "Geographic Match: Prefers FL and is not open to relocation; the position is in TX.",
     "Cultural / Professional Match: Call is heavy; the stated tolerance is light."
    ],
    "stage": null,
    "position": {
     "id": 48,
     "title": "Neurosurgeon - Spine",
     "specialty": "Neurosurgery",
     "city": "Dallas",
     "state": "TX",
     "employment_model": "employed",
     "compensation_min": 800000,
     "compensation_max": 950000,
     "call_schedule": "heavy",
     "robotics_required": true,
     "start_date": "2027-02-01",
     "organization": {
      "id": 30,
      "name": "Sample Integrated Delivery Network"
     }
    }
   },
   {
    "position_id": 47,
    "score": 47,
    "dimensions": [
     {
      "dimension": "Clinical Match",
      "evaluates": "Specialty-specific qualifications, certifications, procedural expertise, and experience.",
      "score": 0,
      "weight": 0.3,
      "reason": null,
      "gap": "Specialty is Robotic Surgery; the position is Orthopaedic Surgery."
     },
     {
      "dimension": "Technology Match",
      "evaluates": "Robotic platforms and technology experience against the position requirements.",
      "score": 70,
      "weight": 0.15,
      "reason": "Robotic experience on record. 6 years robotic. Has led a robotics programme.",
      "gap": "Trained on da Vinci Xi; the position uses Mazor X."
     },
     {
      "dimension": "Geographic Match",
      "evaluates": "Geographic preferences and relocation willingness against the facility locations.",
      "score": 5,
      "weight": 0.15,
      "reason": null,
      "gap": "Prefers FL and is not open to relocation; the position is in TX."
     },
     {
      "dimension": "Career Match",
      "evaluates": "Professional objectives, leadership and academic experience against the opportunity.",
      "score": 90,
      "weight": 0.08,
      "reason": "Leadership experience on record.",
      "gap": null
     },
     {
      "dimension": "Compensation Match",
      "evaluates": "Compensation expectations against the compensation range.",
      "score": 100,
      "weight": 0.14,
      "reason": "Expectation of $470,000 sits within the posted range.",
      "gap": null
     },
     {
      "dimension": "Availability Match",
      "evaluates": "Availability against the start-date requirements.",
      "score": 100,
      "weight": 0.08,
      "reason": "Available on or before the 2026-11-15 start date.",
      "gap": null
     },
     {
      "dimension": "Cultural / Professional Match",
      "evaluates": "Employment preferences and hospital type against the employment model and call schedule.",
      "score": 70,
      "weight": 0.1,
      "reason": "Call schedule is within the stated tolerance.",
      "gap": "Prefers employed; the position is independent."
     }
    ],
    "reasons": [
     "Technology Match: Robotic experience on record. 6 years robotic. Has led a robotics programme.",
     "Career Match: Leadership experience on record.",
     "Compensation Match: Expectation of $470,000 sits within the posted range.",
     "Availability Match: Available on or before the 2026-11-15 start date.",
     "Cultural / Professional Match: Call schedule is within the stated tolerance."
    ],
    "gaps": [
     "Clinical Match: Specialty is Robotic Surgery; the position is Orthopaedic Surgery.",
     "Technology Match: Trained on da Vinci Xi; the position uses Mazor X.",
     "Geographic Match: Prefers FL and is not open to relocation; the position is in TX.",
     "Cultural / Professional Match: Prefers employed; the position is independent."
    ],
    "stage": null,
    "position": {
     "id": 47,
     "title": "Orthopaedic Surgeon - Joints",
     "specialty": "Orthopaedic Surgery",
     "city": "Dallas",
     "state": "TX",
     "employment_model": "independent",
     "compensation_min": 600000,
     "compensation_max": 780000,
     "call_schedule": "light",
     "robotics_required": true,
     "start_date": "2026-11-15",
     "organization": {
      "id": 30,
      "name": "Sample Integrated Delivery Network"
     }
    }
   },
   {
    "position_id": 52,
    "score": 46,
    "dimensions": [
     {
      "dimension": "Clinical Match",
      "evaluates": "Specialty-specific qualifications, certifications, procedural expertise, and experience.",
      "score": 0,
      "weight": 0.3,
      "reason": null,
      "gap": "Specialty is Robotic Surgery; the position is Hepatobiliary Surgery."
     },
     {
      "dimension": "Technology Match",
      "evaluates": "Robotic platforms and technology experience against the position requirements.",
      "score": 70,
      "weight": 0.15,
      "reason": "Robotic experience on record. 6 years robotic. Has led a robotics programme.",
      "gap": "Trained on da Vinci Xi; the position uses da Vinci Si."
     },
     {
      "dimension": "Geographic Match",
      "evaluates": "Geographic preferences and relocation willingness against the facility locations.",
      "score": 5,
      "weight": 0.15,
      "reason": null,
      "gap": "Prefers FL and is not open to relocation; the position is in NC."
     },
     {
      "dimension": "Career Match",
      "evaluates": "Professional objectives, leadership and academic experience against the opportunity.",
      "score": 100,
      "weight": 0.08,
      "reason": "Academic background suits an academic post. Leadership experience on record.",
      "gap": null
     },
     {
      "dimension": "Compensation Match",
      "evaluates": "Compensation expectations against the compensation range.",
      "score": 100,
      "weight": 0.14,
      "reason": "Expectation of $470,000 sits within the posted range.",
      "gap": null
     },
     {
      "dimension": "Availability Match",
      "evaluates": "Availability against the start-date requirements.",
      "score": 100,
      "weight": 0.08,
      "reason": "Available on or before the 2027-01-01 start date.",
      "gap": null
     },
     {
      "dimension": "Cultural / Professional Match",
      "evaluates": "Employment preferences and hospital type against the employment model and call schedule.",
      "score": 50,
      "weight": 0.1,
      "reason": "No cultural signal either way.",
      "gap": "Prefers employed; the position is academic. Call is moderate; the stated tolerance is light."
     }
    ],
    "reasons": [
     "Technology Match: Robotic experience on record. 6 years robotic. Has led a robotics programme.",
     "Career Match: Academic background suits an academic post. Leadership experience on record.",
     "Compensation Match: Expectation of $470,000 sits within the posted range.",
     "Availability Match: Available on or before the 2027-01-01 start date.",
     "Cultural / Professional Match: No cultural signal either way."
    ],
    "gaps": [
     "Clinical Match: Specialty is Robotic Surgery; the position is Hepatobiliary Surgery.",
     "Technology Match: Trained on da Vinci Xi; the position uses da Vinci Si.",
     "Geographic Match: Prefers FL and is not open to relocation; the position is in NC.",
     "Cultural / Professional Match: Prefers employed; the position is academic. Call is moderate; the stated tolerance is light."
    ],
    "stage": null,
    "position": {
     "id": 52,
     "title": "Hepatobiliary Surgeon",
     "specialty": "Hepatobiliary Surgery",
     "city": "Chapel Hill",
     "state": "NC",
     "employment_model": "academic",
     "compensation_min": 540000,
     "compensation_max": 640000,
     "call_schedule": "moderate",
     "robotics_required": true,
     "start_date": "2027-01-01",
     "organization": {
      "id": 32,
      "name": "Sample University Hospital"
     }
    }
   }
  ]
 },
 "hospital:/me": {
  "account": {
   "id": 63,
   "role": "hospital",
   "name": "Sample Regional Medical Center",
   "email": "sim_1788105058719.regional@example.org",
   "org_id": 28
  },
  "organization": {
   "id": 28,
   "tenant_id": 1,
   "name": "Sample Regional Medical Center",
   "org_type": "hospital",
   "health_system": null,
   "city": "Tampa",
   "state": "FL",
   "facilities": 3,
   "robotics_platforms": [
    "da Vinci Xi"
   ],
   "recruiting_priorities": "Robotic general surgery and urology.",
   "created_at": "2026-08-30T15:46:12.877Z"
  }
 },
 "hospital:/positions": {
  "items": [
   {
    "id": 54,
    "tenant_id": 1,
    "org_id": 28,
    "title": "Colon & Rectal Surgeon",
    "specialty": "Colon & Rectal Surgery",
    "subspecialty": null,
    "city": "Tampa",
    "state": "FL",
    "employment_model": "employed",
    "compensation_min": 520000,
    "compensation_max": 610000,
    "call_schedule": "light",
    "relocation_assistance": false,
    "robotics_required": true,
    "robotic_platforms": [
     "da Vinci Xi"
    ],
    "min_years_experience": 4,
    "board_certification_required": true,
    "procedures": [
     "robotic colectomy"
    ],
    "start_date": "2026-12-01",
    "status": "open",
    "created_by": null,
    "created_at": "2026-08-30T15:46:14.023Z",
    "organization": {
     "id": 28,
     "name": "Sample Regional Medical Center",
     "city": "Tampa",
     "state": "FL"
    }
   },
   {
    "id": 44,
    "tenant_id": 1,
    "org_id": 28,
    "title": "Urologist",
    "specialty": "Urology",
    "subspecialty": null,
    "city": "Tampa",
    "state": "FL",
    "employment_model": "employed",
    "compensation_min": 440000,
    "compensation_max": 550000,
    "call_schedule": "moderate",
    "relocation_assistance": false,
    "robotics_required": true,
    "robotic_platforms": [
     "da Vinci Xi"
    ],
    "min_years_experience": 3,
    "board_certification_required": true,
    "procedures": [
     "robotic prostatectomy"
    ],
    "start_date": "2026-10-01",
    "status": "open",
    "created_by": null,
    "created_at": "2026-08-30T15:46:13.305Z",
    "organization": {
     "id": 28,
     "name": "Sample Regional Medical Center",
     "city": "Tampa",
     "state": "FL"
    }
   },
   {
    "id": 43,
    "tenant_id": 1,
    "org_id": 28,
    "title": "Robotic General Surgeon",
    "specialty": "Robotic Surgery",
    "subspecialty": null,
    "city": "Tampa",
    "state": "FL",
    "employment_model": "employed",
    "compensation_min": 430000,
    "compensation_max": 510000,
    "call_schedule": "light",
    "relocation_assistance": false,
    "robotics_required": true,
    "robotic_platforms": [
     "da Vinci Xi"
    ],
    "min_years_experience": 5,
    "board_certification_required": true,
    "procedures": [
     "robotic cholecystectomy",
     "robotic hernia repair"
    ],
    "start_date": "2026-11-01",
    "status": "open",
    "created_by": null,
    "created_at": "2026-08-30T15:46:13.235Z",
    "organization": {
     "id": 28,
     "name": "Sample Regional Medical Center",
     "city": "Tampa",
     "state": "FL"
    }
   }
  ]
 },
 "hospital:/pipeline": {
  "stages": [
   "Prospect",
   "Contacted",
   "Interested",
   "Qualified",
   "Matched",
   "Submitted",
   "Hospital Review",
   "Interview",
   "Offer",
   "Negotiation",
   "Accepted",
   "Credentialing",
   "Placement"
  ],
  "agent_authority": [
   {
    "agent": "Candidate Intake Agent",
    "maySet": []
   },
   {
    "agent": "CV / Resume Intelligence Agent",
    "maySet": []
   },
   {
    "agent": "Hospital Intake Agent",
    "maySet": []
   },
   {
    "agent": "Candidate Matching Agent",
    "maySet": [
     "Matched"
    ]
   },
   {
    "agent": "Clinical Qualification Agent",
    "maySet": [
     "Qualified"
    ]
   },
   {
    "agent": "Robotics Intelligence Agent",
    "maySet": []
   },
   {
    "agent": "Candidate Ranking Agent",
    "maySet": []
   },
   {
    "agent": "Recruitment Outreach Agent",
    "maySet": [
     "Contacted",
     "Interested"
    ]
   },
   {
    "agent": "Scheduling Agent",
    "maySet": [
     "Interview"
    ]
   },
   {
    "agent": "Follow-Up Agent",
    "maySet": []
   },
   {
    "agent": "Recruiter Copilot",
    "maySet": []
   }
  ],
  "items": [
   {
    "id": 43,
    "stage": "Interested",
    "set_by_kind": "person",
    "updated_at": "2026-08-30T15:51:04.357Z",
    "candidate": {
     "id": 30,
     "name": "Dr Elena Marsh",
     "specialty": "Robotic Surgery",
     "years_experience": 11
    },
    "position": {
     "id": 43,
     "title": "Robotic General Surgeon",
     "specialty": "Robotic Surgery",
     "city": "Tampa",
     "state": "FL"
    }
   }
  ]
 },
 "hospital:/positions/43/candidates": {
  "position": {
   "id": 43,
   "tenant_id": 1,
   "org_id": 28,
   "title": "Robotic General Surgeon",
   "specialty": "Robotic Surgery",
   "subspecialty": null,
   "city": "Tampa",
   "state": "FL",
   "employment_model": "employed",
   "compensation_min": 430000,
   "compensation_max": 510000,
   "call_schedule": "light",
   "relocation_assistance": false,
   "robotics_required": true,
   "robotic_platforms": [
    "da Vinci Xi"
   ],
   "min_years_experience": 5,
   "board_certification_required": true,
   "procedures": [
    "robotic cholecystectomy",
    "robotic hernia repair"
   ],
   "start_date": "2026-11-01",
   "status": "open",
   "created_by": null,
   "created_at": "2026-08-30T15:46:13.235Z"
  },
  "items": [
   {
    "physician_id": 30,
    "score": 99,
    "dimensions": [
     {
      "dimension": "Clinical Match",
      "evaluates": "Specialty-specific qualifications, certifications, procedural expertise, and experience.",
      "score": 100,
      "weight": 0.3,
      "reason": "Specialty matches: Robotic Surgery. Board certified, as required. 11 years of experience against a 5-year minimum. Shared procedures: robotic cholecystectomy, robotic hernia repair.",
      "gap": null
     },
     {
      "dimension": "Technology Match",
      "evaluates": "Robotic platforms and technology experience against the position requirements.",
      "score": 100,
      "weight": 0.15,
      "reason": "Robotic experience on record. Platform match: da Vinci Xi. 6 years robotic. Has led a robotics programme.",
      "gap": null
     },
     {
      "dimension": "Geographic Match",
      "evaluates": "Geographic preferences and relocation willingness against the facility locations.",
      "score": 100,
      "weight": 0.15,
      "reason": "FL is a stated preferred location.",
      "gap": null
     },
     {
      "dimension": "Career Match",
      "evaluates": "Professional objectives, leadership and academic experience against the opportunity.",
      "score": 90,
      "weight": 0.08,
      "reason": "Leadership experience on record.",
      "gap": null
     },
     {
      "dimension": "Compensation Match",
      "evaluates": "Compensation expectations against the compensation range.",
      "score": 100,
      "weight": 0.14,
      "reason": "Expectation of $470,000 sits within the posted range.",
      "gap": null
     },
     {
      "dimension": "Availability Match",
      "evaluates": "Availability against the start-date requirements.",
      "score": 100,
      "weight": 0.08,
      "reason": "Available on or before the 2026-11-01 start date.",
      "gap": null
     },
     {
      "dimension": "Cultural / Professional Match",
      "evaluates": "Employment preferences and hospital type against the employment model and call schedule.",
      "score": 100,
      "weight": 0.1,
      "reason": "Employment model matches the stated preference (employed). Call schedule is within the stated tolerance.",
      "gap": null
     }
    ],
    "reasons": [
     "Clinical Match: Specialty matches: Robotic Surgery. Board certified, as required. 11 years of experience against a 5-year minimum. Shared procedures: robotic cholecystectomy, robotic hernia repair.",
     "Technology Match: Robotic experience on record. Platform match: da Vinci Xi. 6 years robotic. Has led a robotics programme.",
     "Geographic Match: FL is a stated preferred location.",
     "Career Match: Leadership experience on record.",
     "Compensation Match: Expectation of $470,000 sits within the posted range.",
     "Availability Match: Available on or before the 2026-11-01 start date.",
     "Cultural / Professional Match: Employment model matches the stated preference (employed). Call schedule is within the stated tolerance."
    ],
    "gaps": [],
    "stage": "Interested",
    "pipeline_id": 43,
    "candidate": {
     "name": "Dr Elena Marsh",
     "specialty": "Robotic Surgery",
     "years_experience": 11,
     "board_certified": true,
     "robotic_platforms": [
      "da Vinci Xi"
     ],
     "licenses": [
      "FL",
      "GA"
     ],
     "ai_summary": "Robotic Surgery (Minimally invasive general surgery); 11 years of experience; board certified; robotic experience on da Vinci Xi over 6 years; has led a robotics programme; licensed in FL, GA."
    }
   }
  ]
 },
 "hospital:/positions/44/candidates": {
  "position": {
   "id": 44,
   "tenant_id": 1,
   "org_id": 28,
   "title": "Urologist",
   "specialty": "Urology",
   "subspecialty": null,
   "city": "Tampa",
   "state": "FL",
   "employment_model": "employed",
   "compensation_min": 440000,
   "compensation_max": 550000,
   "call_schedule": "moderate",
   "relocation_assistance": false,
   "robotics_required": true,
   "robotic_platforms": [
    "da Vinci Xi"
   ],
   "min_years_experience": 3,
   "board_certification_required": true,
   "procedures": [
    "robotic prostatectomy"
   ],
   "start_date": "2026-10-01",
   "status": "open",
   "created_by": null,
   "created_at": "2026-08-30T15:46:13.305Z"
  },
  "items": [
   {
    "physician_id": 30,
    "score": 67,
    "dimensions": [
     {
      "dimension": "Clinical Match",
      "evaluates": "Specialty-specific qualifications, certifications, procedural expertise, and experience.",
      "score": 0,
      "weight": 0.3,
      "reason": null,
      "gap": "Specialty is Robotic Surgery; the position is Urology."
     },
     {
      "dimension": "Technology Match",
      "evaluates": "Robotic platforms and technology experience against the position requirements.",
      "score": 100,
      "weight": 0.15,
      "reason": "Robotic experience on record. Platform match: da Vinci Xi. 6 years robotic. Has led a robotics programme.",
      "gap": null
     },
     {
      "dimension": "Geographic Match",
      "evaluates": "Geographic preferences and relocation willingness against the facility locations.",
      "score": 100,
      "weight": 0.15,
      "reason": "FL is a stated preferred location.",
      "gap": null
     },
     {
      "dimension": "Career Match",
      "evaluates": "Professional objectives, leadership and academic experience against the opportunity.",
      "score": 90,
      "weight": 0.08,
      "reason": "Leadership experience on record.",
      "gap": null
     },
     {
      "dimension": "Compensation Match",
      "evaluates": "Compensation expectations against the compensation range.",
      "score": 100,
      "weight": 0.14,
      "reason": "Expectation of $470,000 sits within the posted range.",
      "gap": null
     },
     {
      "dimension": "Availability Match",
      "evaluates": "Availability against the start-date requirements.",
      "score": 100,
      "weight": 0.08,
      "reason": "Available on or before the 2026-10-01 start date.",
      "gap": null
     },
     {
      "dimension": "Cultural / Professional Match",
      "evaluates": "Employment preferences and hospital type against the employment model and call schedule.",
      "score": 80,
      "weight": 0.1,
      "reason": "Employment model matches the stated preference (employed).",
      "gap": "Call is moderate; the stated tolerance is light."
     }
    ],
    "reasons": [
     "Technology Match: Robotic experience on record. Platform match: da Vinci Xi. 6 years robotic. Has led a robotics programme.",
     "Geographic Match: FL is a stated preferred location.",
     "Career Match: Leadership experience on record.",
     "Compensation Match: Expectation of $470,000 sits within the posted range.",
     "Availability Match: Available on or before the 2026-10-01 start date.",
     "Cultural / Professional Match: Employment model matches the stated preference (employed)."
    ],
    "gaps": [
     "Clinical Match: Specialty is Robotic Surgery; the position is Urology.",
     "Cultural / Professional Match: Call is moderate; the stated tolerance is light."
    ],
    "stage": null,
    "pipeline_id": null,
    "candidate": {
     "name": "Dr Elena Marsh",
     "specialty": "Robotic Surgery",
     "years_experience": 11,
     "board_certified": true,
     "robotic_platforms": [
      "da Vinci Xi"
     ],
     "licenses": [
      "FL",
      "GA"
     ],
     "ai_summary": "Robotic Surgery (Minimally invasive general surgery); 11 years of experience; board certified; robotic experience on da Vinci Xi over 6 years; has led a robotics programme; licensed in FL, GA."
    }
   }
  ]
 },
 "hospital:/positions/54/candidates": {
  "position": {
   "id": 54,
   "tenant_id": 1,
   "org_id": 28,
   "title": "Colon & Rectal Surgeon",
   "specialty": "Colon & Rectal Surgery",
   "subspecialty": null,
   "city": "Tampa",
   "state": "FL",
   "employment_model": "employed",
   "compensation_min": 520000,
   "compensation_max": 610000,
   "call_schedule": "light",
   "relocation_assistance": false,
   "robotics_required": true,
   "robotic_platforms": [
    "da Vinci Xi"
   ],
   "min_years_experience": 4,
   "board_certification_required": true,
   "procedures": [
    "robotic colectomy"
   ],
   "start_date": "2026-12-01",
   "status": "open",
   "created_by": null,
   "created_at": "2026-08-30T15:46:14.023Z"
  },
  "items": [
   {
    "physician_id": 30,
    "score": 69,
    "dimensions": [
     {
      "dimension": "Clinical Match",
      "evaluates": "Specialty-specific qualifications, certifications, procedural expertise, and experience.",
      "score": 0,
      "weight": 0.3,
      "reason": null,
      "gap": "Specialty is Robotic Surgery; the position is Colon & Rectal Surgery."
     },
     {
      "dimension": "Technology Match",
      "evaluates": "Robotic platforms and technology experience against the position requirements.",
      "score": 100,
      "weight": 0.15,
      "reason": "Robotic experience on record. Platform match: da Vinci Xi. 6 years robotic. Has led a robotics programme.",
      "gap": null
     },
     {
      "dimension": "Geographic Match",
      "evaluates": "Geographic preferences and relocation willingness against the facility locations.",
      "score": 100,
      "weight": 0.15,
      "reason": "FL is a stated preferred location.",
      "gap": null
     },
     {
      "dimension": "Career Match",
      "evaluates": "Professional objectives, leadership and academic experience against the opportunity.",
      "score": 90,
      "weight": 0.08,
      "reason": "Leadership experience on record.",
      "gap": null
     },
     {
      "dimension": "Compensation Match",
      "evaluates": "Compensation expectations against the compensation range.",
      "score": 100,
      "weight": 0.14,
      "reason": "Expectation of $470,000 sits within the posted range.",
      "gap": null
     },
     {
      "dimension": "Availability Match",
      "evaluates": "Availability against the start-date requirements.",
      "score": 100,
      "weight": 0.08,
      "reason": "Available on or before the 2026-12-01 start date.",
      "gap": null
     },
     {
      "dimension": "Cultural / Professional Match",
      "evaluates": "Employment preferences and hospital type against the employment model and call schedule.",
      "score": 100,
      "weight": 0.1,
      "reason": "Employment model matches the stated preference (employed). Call schedule is within the stated tolerance.",
      "gap": null
     }
    ],
    "reasons": [
     "Technology Match: Robotic experience on record. Platform match: da Vinci Xi. 6 years robotic. Has led a robotics programme.",
     "Geographic Match: FL is a stated preferred location.",
     "Career Match: Leadership experience on record.",
     "Compensation Match: Expectation of $470,000 sits within the posted range.",
     "Availability Match: Available on or before the 2026-12-01 start date.",
     "Cultural / Professional Match: Employment model matches the stated preference (employed). Call schedule is within the stated tolerance."
    ],
    "gaps": [
     "Clinical Match: Specialty is Robotic Surgery; the position is Colon & Rectal Surgery."
    ],
    "stage": null,
    "pipeline_id": null,
    "candidate": {
     "name": "Dr Elena Marsh",
     "specialty": "Robotic Surgery",
     "years_experience": 11,
     "board_certified": true,
     "robotic_platforms": [
      "da Vinci Xi"
     ],
     "licenses": [
      "FL",
      "GA"
     ],
     "ai_summary": "Robotic Surgery (Minimally invasive general surgery); 11 years of experience; board certified; robotic experience on da Vinci Xi over 6 years; has led a robotics programme; licensed in FL, GA."
    }
   }
  ]
 },
 "recruiter:/me": {
  "account": {
   "id": 64,
   "role": "recruiter",
   "name": "Dan Whitfield",
   "email": "sim_1788105058719.recruiter@example.org",
   "org_id": null
  }
 },
 "recruiter:/organizations": {
  "items": [
   {
    "id": 31,
    "tenant_id": 1,
    "name": "Sample Coastal Hospital",
    "org_type": "hospital",
    "health_system": null,
    "city": "Charleston",
    "state": "SC",
    "facilities": 2,
    "robotics_platforms": [],
    "recruiting_priorities": "General and trauma surgery.",
    "created_at": "2026-08-30T15:46:13.098Z"
   },
   {
    "id": 29,
    "tenant_id": 1,
    "name": "Sample Health System",
    "org_type": "health_system",
    "health_system": null,
    "city": "Atlanta",
    "state": "GA",
    "facilities": 9,
    "robotics_platforms": [
     "da Vinci Xi",
     "Hugo RAS"
    ],
    "recruiting_priorities": "Cardiac and thoracic coverage.",
    "created_at": "2026-08-30T15:46:12.959Z"
   },
   {
    "id": 30,
    "tenant_id": 1,
    "name": "Sample Integrated Delivery Network",
    "org_type": "idn",
    "health_system": null,
    "city": "Dallas",
    "state": "TX",
    "facilities": 14,
    "robotics_platforms": [
     "da Vinci X",
     "Mazor X"
    ],
    "recruiting_priorities": "Orthopaedics and spine.",
    "created_at": "2026-08-30T15:46:13.029Z"
   },
   {
    "id": 28,
    "tenant_id": 1,
    "name": "Sample Regional Medical Center",
    "org_type": "hospital",
    "health_system": null,
    "city": "Tampa",
    "state": "FL",
    "facilities": 3,
    "robotics_platforms": [
     "da Vinci Xi"
    ],
    "recruiting_priorities": "Robotic general surgery and urology.",
    "created_at": "2026-08-30T15:46:12.877Z"
   },
   {
    "id": 36,
    "tenant_id": 1,
    "name": "Sample Regional Medical Center",
    "org_type": "hospital",
    "health_system": null,
    "city": "Tampa",
    "state": "FL",
    "facilities": null,
    "robotics_platforms": [],
    "recruiting_priorities": null,
    "created_at": "2026-08-30T15:51:01.923Z"
   },
   {
    "id": 32,
    "tenant_id": 1,
    "name": "Sample University Hospital",
    "org_type": "health_system",
    "health_system": null,
    "city": "Chapel Hill",
    "state": "NC",
    "facilities": 5,
    "robotics_platforms": [
     "da Vinci Si"
    ],
    "recruiting_priorities": "Academic transplant and hepatobiliary.",
    "created_at": "2026-08-30T15:46:13.166Z"
   }
  ]
 },
 "recruiter:/pipeline": {
  "stages": [
   "Prospect",
   "Contacted",
   "Interested",
   "Qualified",
   "Matched",
   "Submitted",
   "Hospital Review",
   "Interview",
   "Offer",
   "Negotiation",
   "Accepted",
   "Credentialing",
   "Placement"
  ],
  "agent_authority": [
   {
    "agent": "Candidate Intake Agent",
    "maySet": []
   },
   {
    "agent": "CV / Resume Intelligence Agent",
    "maySet": []
   },
   {
    "agent": "Hospital Intake Agent",
    "maySet": []
   },
   {
    "agent": "Candidate Matching Agent",
    "maySet": [
     "Matched"
    ]
   },
   {
    "agent": "Clinical Qualification Agent",
    "maySet": [
     "Qualified"
    ]
   },
   {
    "agent": "Robotics Intelligence Agent",
    "maySet": []
   },
   {
    "agent": "Candidate Ranking Agent",
    "maySet": []
   },
   {
    "agent": "Recruitment Outreach Agent",
    "maySet": [
     "Contacted",
     "Interested"
    ]
   },
   {
    "agent": "Scheduling Agent",
    "maySet": [
     "Interview"
    ]
   },
   {
    "agent": "Follow-Up Agent",
    "maySet": []
   },
   {
    "agent": "Recruiter Copilot",
    "maySet": []
   }
  ],
  "items": [
   {
    "id": 43,
    "stage": "Interested",
    "set_by_kind": "person",
    "updated_at": "2026-08-30T15:51:04.357Z",
    "candidate": {
     "id": 30,
     "name": "Dr Elena Marsh",
     "specialty": "Robotic Surgery",
     "years_experience": 11
    },
    "position": {
     "id": 43,
     "title": "Robotic General Surgeon",
     "specialty": "Robotic Surgery",
     "city": "Tampa",
     "state": "FL"
    }
   }
  ]
 },
 "recruiter:/positions": {
  "items": [
   {
    "id": 54,
    "tenant_id": 1,
    "org_id": 28,
    "title": "Colon & Rectal Surgeon",
    "specialty": "Colon & Rectal Surgery",
    "subspecialty": null,
    "city": "Tampa",
    "state": "FL",
    "employment_model": "employed",
    "compensation_min": 520000,
    "compensation_max": 610000,
    "call_schedule": "light",
    "relocation_assistance": false,
    "robotics_required": true,
    "robotic_platforms": [
     "da Vinci Xi"
    ],
    "min_years_experience": 4,
    "board_certification_required": true,
    "procedures": [
     "robotic colectomy"
    ],
    "start_date": "2026-12-01",
    "status": "open",
    "created_by": null,
    "created_at": "2026-08-30T15:46:14.023Z",
    "organization": {
     "id": 28,
     "name": "Sample Regional Medical Center",
     "city": "Tampa",
     "state": "FL"
    }
   },
   {
    "id": 53,
    "tenant_id": 1,
    "org_id": 29,
    "title": "Gynecologic Surgeon",
    "specialty": "Gynecology",
    "subspecialty": null,
    "city": "Atlanta",
    "state": "GA",
    "employment_model": "employed",
    "compensation_min": 340000,
    "compensation_max": 430000,
    "call_schedule": "light",
    "relocation_assistance": false,
    "robotics_required": true,
    "robotic_platforms": [
     "da Vinci Xi"
    ],
    "min_years_experience": 3,
    "board_certification_required": true,
    "procedures": [
     "robotic hysterectomy"
    ],
    "start_date": "2026-11-01",
    "status": "open",
    "created_by": null,
    "created_at": "2026-08-30T15:46:13.942Z",
    "organization": {
     "id": 29,
     "name": "Sample Health System",
     "city": "Atlanta",
     "state": "GA"
    }
   },
   {
    "id": 52,
    "tenant_id": 1,
    "org_id": 32,
    "title": "Hepatobiliary Surgeon",
    "specialty": "Hepatobiliary Surgery",
    "subspecialty": null,
    "city": "Chapel Hill",
    "state": "NC",
    "employment_model": "academic",
    "compensation_min": 540000,
    "compensation_max": 640000,
    "call_schedule": "moderate",
    "relocation_assistance": false,
    "robotics_required": true,
    "robotic_platforms": [
     "da Vinci Si"
    ],
    "min_years_experience": 4,
    "board_certification_required": true,
    "procedures": [
     "Whipple",
     "hepatectomy"
    ],
    "start_date": "2027-01-01",
    "status": "open",
    "created_by": null,
    "created_at": "2026-08-30T15:46:13.870Z",
    "organization": {
     "id": 32,
     "name": "Sample University Hospital",
     "city": "Chapel Hill",
     "state": "NC"
    }
   },
   {
    "id": 51,
    "tenant_id": 1,
    "org_id": 32,
    "title": "Transplant Surgeon",
    "specialty": "Transplant Surgery",
    "subspecialty": null,
    "city": "Chapel Hill",
    "state": "NC",
    "employment_model": "academic",
    "compensation_min": 560000,
    "compensation_max": 660000,
    "call_schedule": "heavy",
    "relocation_assistance": false,
    "robotics_required": false,
    "robotic_platforms": [],
    "min_years_experience": 5,
    "board_certification_required": true,
    "procedures": [
     "kidney transplant",
     "liver transplant"
    ],
    "start_date": "2027-03-01",
    "status": "open",
    "created_by": null,
    "created_at": "2026-08-30T15:46:13.799Z",
    "organization": {
     "id": 32,
     "name": "Sample University Hospital",
     "city": "Chapel Hill",
     "state": "NC"
    }
   },
   {
    "id": 50,
    "tenant_id": 1,
    "org_id": 31,
    "title": "Trauma Surgeon",
    "specialty": "Trauma Surgery",
    "subspecialty": null,
    "city": "Charleston",
    "state": "SC",
    "employment_model": "employed",
    "compensation_min": 500000,
    "compensation_max": 580000,
    "call_schedule": "heavy",
    "relocation_assistance": false,
    "robotics_required": false,
    "robotic_platforms": [],
    "min_years_experience": 3,
    "board_certification_required": true,
    "procedures": [
     "damage control laparotomy"
    ],
    "start_date": "2026-12-15",
    "status": "open",
    "created_by": null,
    "created_at": "2026-08-30T15:46:13.727Z",
    "organization": {
     "id": 31,
     "name": "Sample Coastal Hospital",
     "city": "Charleston",
     "state": "SC"
    }
   },
   {
    "id": 49,
    "tenant_id": 1,
    "org_id": 31,
    "title": "General Surgeon",
    "specialty": "General Surgery",
    "subspecialty": null,
    "city": "Charleston",
    "state": "SC",
    "employment_model": "employed",
    "compensation_min": 380000,
    "compensation_max": 470000,
    "call_schedule": "moderate",
    "relocation_assistance": false,
    "robotics_required": false,
    "robotic_platforms": [],
    "min_years_experience": 2,
    "board_certification_required": true,
    "procedures": [
     "appendectomy",
     "cholecystectomy"
    ],
    "start_date": "2026-10-15",
    "status": "open",
    "created_by": null,
    "created_at": "2026-08-30T15:46:13.658Z",
    "organization": {
     "id": 31,
     "name": "Sample Coastal Hospital",
     "city": "Charleston",
     "state": "SC"
    }
   },
   {
    "id": 48,
    "tenant_id": 1,
    "org_id": 30,
    "title": "Neurosurgeon - Spine",
    "specialty": "Neurosurgery",
    "subspecialty": null,
    "city": "Dallas",
    "state": "TX",
    "employment_model": "employed",
    "compensation_min": 800000,
    "compensation_max": 950000,
    "call_schedule": "heavy",
    "relocation_assistance": false,
    "robotics_required": true,
    "robotic_platforms": [
     "Mazor X"
    ],
    "min_years_experience": 6,
    "board_certification_required": true,
    "procedures": [
     "spinal fusion"
    ],
    "start_date": "2027-02-01",
    "status": "open",
    "created_by": null,
    "created_at": "2026-08-30T15:46:13.586Z",
    "organization": {
     "id": 30,
     "name": "Sample Integrated Delivery Network",
     "city": "Dallas",
     "state": "TX"
    }
   },
   {
    "id": 47,
    "tenant_id": 1,
    "org_id": 30,
    "title": "Orthopaedic Surgeon - Joints",
    "specialty": "Orthopaedic Surgery",
    "subspecialty": null,
    "city": "Dallas",
    "state": "TX",
    "employment_model": "independent",
    "compensation_min": 600000,
    "compensation_max": 780000,
    "call_schedule": "light",
    "relocation_assistance": false,
    "robotics_required": true,
    "robotic_platforms": [
     "Mazor X"
    ],
    "min_years_experience": 4,
    "board_certification_required": true,
    "procedures": [
     "total knee",
     "total hip"
    ],
    "start_date": "2026-11-15",
    "status": "open",
    "created_by": null,
    "created_at": "2026-08-30T15:46:13.515Z",
    "organization": {
     "id": 30,
     "name": "Sample Integrated Delivery Network",
     "city": "Dallas",
     "state": "TX"
    }
   },
   {
    "id": 46,
    "tenant_id": 1,
    "org_id": 29,
    "title": "Thoracic Surgeon",
    "specialty": "Thoracic Surgery",
    "subspecialty": null,
    "city": "Atlanta",
    "state": "GA",
    "employment_model": "employed",
    "compensation_min": 620000,
    "compensation_max": 720000,
    "call_schedule": "moderate",
    "relocation_assistance": false,
    "robotics_required": true,
    "robotic_platforms": [
     "da Vinci Xi",
     "Hugo RAS"
    ],
    "min_years_experience": 5,
    "board_certification_required": true,
    "procedures": [
     "robotic lobectomy"
    ],
    "start_date": "2026-12-01",
    "status": "open",
    "created_by": null,
    "created_at": "2026-08-30T15:46:13.443Z",
    "organization": {
     "id": 29,
     "name": "Sample Health System",
     "city": "Atlanta",
     "state": "GA"
    }
   },
   {
    "id": 45,
    "tenant_id": 1,
    "org_id": 29,
    "title": "Cardiac Surgeon",
    "specialty": "Cardiac Surgery",
    "subspecialty": null,
    "city": "Atlanta",
    "state": "GA",
    "employment_model": "employed",
    "compensation_min": 700000,
    "compensation_max": 850000,
    "call_schedule": "heavy",
    "relocation_assistance": false,
    "robotics_required": false,
    "robotic_platforms": [],
    "min_years_experience": 7,
    "board_certification_required": true,
    "procedures": [
     "CABG",
     "valve repair"
    ],
    "start_date": "2027-01-15",
    "status": "open",
    "created_by": null,
    "created_at": "2026-08-30T15:46:13.373Z",
    "organization": {
     "id": 29,
     "name": "Sample Health System",
     "city": "Atlanta",
     "state": "GA"
    }
   },
   {
    "id": 44,
    "tenant_id": 1,
    "org_id": 28,
    "title": "Urologist",
    "specialty": "Urology",
    "subspecialty": null,
    "city": "Tampa",
    "state": "FL",
    "employment_model": "employed",
    "compensation_min": 440000,
    "compensation_max": 550000,
    "call_schedule": "moderate",
    "relocation_assistance": false,
    "robotics_required": true,
    "robotic_platforms": [
     "da Vinci Xi"
    ],
    "min_years_experience": 3,
    "board_certification_required": true,
    "procedures": [
     "robotic prostatectomy"
    ],
    "start_date": "2026-10-01",
    "status": "open",
    "created_by": null,
    "created_at": "2026-08-30T15:46:13.305Z",
    "organization": {
     "id": 28,
     "name": "Sample Regional Medical Center",
     "city": "Tampa",
     "state": "FL"
    }
   },
   {
    "id": 43,
    "tenant_id": 1,
    "org_id": 28,
    "title": "Robotic General Surgeon",
    "specialty": "Robotic Surgery",
    "subspecialty": null,
    "city": "Tampa",
    "state": "FL",
    "employment_model": "employed",
    "compensation_min": 430000,
    "compensation_max": 510000,
    "call_schedule": "light",
    "relocation_assistance": false,
    "robotics_required": true,
    "robotic_platforms": [
     "da Vinci Xi"
    ],
    "min_years_experience": 5,
    "board_certification_required": true,
    "procedures": [
     "robotic cholecystectomy",
     "robotic hernia repair"
    ],
    "start_date": "2026-11-01",
    "status": "open",
    "created_by": null,
    "created_at": "2026-08-30T15:46:13.235Z",
    "organization": {
     "id": 28,
     "name": "Sample Regional Medical Center",
     "city": "Tampa",
     "state": "FL"
    }
   }
  ]
 },
 "recruiter:/positions/43/candidates": {
  "position": {
   "id": 43,
   "tenant_id": 1,
   "org_id": 28,
   "title": "Robotic General Surgeon",
   "specialty": "Robotic Surgery",
   "subspecialty": null,
   "city": "Tampa",
   "state": "FL",
   "employment_model": "employed",
   "compensation_min": 430000,
   "compensation_max": 510000,
   "call_schedule": "light",
   "relocation_assistance": false,
   "robotics_required": true,
   "robotic_platforms": [
    "da Vinci Xi"
   ],
   "min_years_experience": 5,
   "board_certification_required": true,
   "procedures": [
    "robotic cholecystectomy",
    "robotic hernia repair"
   ],
   "start_date": "2026-11-01",
   "status": "open",
   "created_by": null,
   "created_at": "2026-08-30T15:46:13.235Z"
  },
  "items": [
   {
    "physician_id": 30,
    "score": 99,
    "dimensions": [
     {
      "dimension": "Clinical Match",
      "evaluates": "Specialty-specific qualifications, certifications, procedural expertise, and experience.",
      "score": 100,
      "weight": 0.3,
      "reason": "Specialty matches: Robotic Surgery. Board certified, as required. 11 years of experience against a 5-year minimum. Shared procedures: robotic cholecystectomy, robotic hernia repair.",
      "gap": null
     },
     {
      "dimension": "Technology Match",
      "evaluates": "Robotic platforms and technology experience against the position requirements.",
      "score": 100,
      "weight": 0.15,
      "reason": "Robotic experience on record. Platform match: da Vinci Xi. 6 years robotic. Has led a robotics programme.",
      "gap": null
     },
     {
      "dimension": "Geographic Match",
      "evaluates": "Geographic preferences and relocation willingness against the facility locations.",
      "score": 100,
      "weight": 0.15,
      "reason": "FL is a stated preferred location.",
      "gap": null
     },
     {
      "dimension": "Career Match",
      "evaluates": "Professional objectives, leadership and academic experience against the opportunity.",
      "score": 90,
      "weight": 0.08,
      "reason": "Leadership experience on record.",
      "gap": null
     },
     {
      "dimension": "Compensation Match",
      "evaluates": "Compensation expectations against the compensation range.",
      "score": 100,
      "weight": 0.14,
      "reason": "Expectation of $470,000 sits within the posted range.",
      "gap": null
     },
     {
      "dimension": "Availability Match",
      "evaluates": "Availability against the start-date requirements.",
      "score": 100,
      "weight": 0.08,
      "reason": "Available on or before the 2026-11-01 start date.",
      "gap": null
     },
     {
      "dimension": "Cultural / Professional Match",
      "evaluates": "Employment preferences and hospital type against the employment model and call schedule.",
      "score": 100,
      "weight": 0.1,
      "reason": "Employment model matches the stated preference (employed). Call schedule is within the stated tolerance.",
      "gap": null
     }
    ],
    "reasons": [
     "Clinical Match: Specialty matches: Robotic Surgery. Board certified, as required. 11 years of experience against a 5-year minimum. Shared procedures: robotic cholecystectomy, robotic hernia repair.",
     "Technology Match: Robotic experience on record. Platform match: da Vinci Xi. 6 years robotic. Has led a robotics programme.",
     "Geographic Match: FL is a stated preferred location.",
     "Career Match: Leadership experience on record.",
     "Compensation Match: Expectation of $470,000 sits within the posted range.",
     "Availability Match: Available on or before the 2026-11-01 start date.",
     "Cultural / Professional Match: Employment model matches the stated preference (employed). Call schedule is within the stated tolerance."
    ],
    "gaps": [],
    "stage": "Interested",
    "pipeline_id": 43,
    "candidate": {
     "name": "Dr Elena Marsh",
     "specialty": "Robotic Surgery",
     "years_experience": 11,
     "board_certified": true,
     "robotic_platforms": [
      "da Vinci Xi"
     ],
     "licenses": [
      "FL",
      "GA"
     ],
     "ai_summary": "Robotic Surgery (Minimally invasive general surgery); 11 years of experience; board certified; robotic experience on da Vinci Xi over 6 years; has led a robotics programme; licensed in FL, GA."
    }
   }
  ]
 },
 "recruiter:/positions/44/candidates": {
  "position": {
   "id": 44,
   "tenant_id": 1,
   "org_id": 28,
   "title": "Urologist",
   "specialty": "Urology",
   "subspecialty": null,
   "city": "Tampa",
   "state": "FL",
   "employment_model": "employed",
   "compensation_min": 440000,
   "compensation_max": 550000,
   "call_schedule": "moderate",
   "relocation_assistance": false,
   "robotics_required": true,
   "robotic_platforms": [
    "da Vinci Xi"
   ],
   "min_years_experience": 3,
   "board_certification_required": true,
   "procedures": [
    "robotic prostatectomy"
   ],
   "start_date": "2026-10-01",
   "status": "open",
   "created_by": null,
   "created_at": "2026-08-30T15:46:13.305Z"
  },
  "items": [
   {
    "physician_id": 30,
    "score": 67,
    "dimensions": [
     {
      "dimension": "Clinical Match",
      "evaluates": "Specialty-specific qualifications, certifications, procedural expertise, and experience.",
      "score": 0,
      "weight": 0.3,
      "reason": null,
      "gap": "Specialty is Robotic Surgery; the position is Urology."
     },
     {
      "dimension": "Technology Match",
      "evaluates": "Robotic platforms and technology experience against the position requirements.",
      "score": 100,
      "weight": 0.15,
      "reason": "Robotic experience on record. Platform match: da Vinci Xi. 6 years robotic. Has led a robotics programme.",
      "gap": null
     },
     {
      "dimension": "Geographic Match",
      "evaluates": "Geographic preferences and relocation willingness against the facility locations.",
      "score": 100,
      "weight": 0.15,
      "reason": "FL is a stated preferred location.",
      "gap": null
     },
     {
      "dimension": "Career Match",
      "evaluates": "Professional objectives, leadership and academic experience against the opportunity.",
      "score": 90,
      "weight": 0.08,
      "reason": "Leadership experience on record.",
      "gap": null
     },
     {
      "dimension": "Compensation Match",
      "evaluates": "Compensation expectations against the compensation range.",
      "score": 100,
      "weight": 0.14,
      "reason": "Expectation of $470,000 sits within the posted range.",
      "gap": null
     },
     {
      "dimension": "Availability Match",
      "evaluates": "Availability against the start-date requirements.",
      "score": 100,
      "weight": 0.08,
      "reason": "Available on or before the 2026-10-01 start date.",
      "gap": null
     },
     {
      "dimension": "Cultural / Professional Match",
      "evaluates": "Employment preferences and hospital type against the employment model and call schedule.",
      "score": 80,
      "weight": 0.1,
      "reason": "Employment model matches the stated preference (employed).",
      "gap": "Call is moderate; the stated tolerance is light."
     }
    ],
    "reasons": [
     "Technology Match: Robotic experience on record. Platform match: da Vinci Xi. 6 years robotic. Has led a robotics programme.",
     "Geographic Match: FL is a stated preferred location.",
     "Career Match: Leadership experience on record.",
     "Compensation Match: Expectation of $470,000 sits within the posted range.",
     "Availability Match: Available on or before the 2026-10-01 start date.",
     "Cultural / Professional Match: Employment model matches the stated preference (employed)."
    ],
    "gaps": [
     "Clinical Match: Specialty is Robotic Surgery; the position is Urology.",
     "Cultural / Professional Match: Call is moderate; the stated tolerance is light."
    ],
    "stage": null,
    "pipeline_id": null,
    "candidate": {
     "name": "Dr Elena Marsh",
     "specialty": "Robotic Surgery",
     "years_experience": 11,
     "board_certified": true,
     "robotic_platforms": [
      "da Vinci Xi"
     ],
     "licenses": [
      "FL",
      "GA"
     ],
     "ai_summary": "Robotic Surgery (Minimally invasive general surgery); 11 years of experience; board certified; robotic experience on da Vinci Xi over 6 years; has led a robotics programme; licensed in FL, GA."
    }
   }
  ]
 },
 "recruiter:/positions/54/candidates": {
  "position": {
   "id": 54,
   "tenant_id": 1,
   "org_id": 28,
   "title": "Colon & Rectal Surgeon",
   "specialty": "Colon & Rectal Surgery",
   "subspecialty": null,
   "city": "Tampa",
   "state": "FL",
   "employment_model": "employed",
   "compensation_min": 520000,
   "compensation_max": 610000,
   "call_schedule": "light",
   "relocation_assistance": false,
   "robotics_required": true,
   "robotic_platforms": [
    "da Vinci Xi"
   ],
   "min_years_experience": 4,
   "board_certification_required": true,
   "procedures": [
    "robotic colectomy"
   ],
   "start_date": "2026-12-01",
   "status": "open",
   "created_by": null,
   "created_at": "2026-08-30T15:46:14.023Z"
  },
  "items": [
   {
    "physician_id": 30,
    "score": 69,
    "dimensions": [
     {
      "dimension": "Clinical Match",
      "evaluates": "Specialty-specific qualifications, certifications, procedural expertise, and experience.",
      "score": 0,
      "weight": 0.3,
      "reason": null,
      "gap": "Specialty is Robotic Surgery; the position is Colon & Rectal Surgery."
     },
     {
      "dimension": "Technology Match",
      "evaluates": "Robotic platforms and technology experience against the position requirements.",
      "score": 100,
      "weight": 0.15,
      "reason": "Robotic experience on record. Platform match: da Vinci Xi. 6 years robotic. Has led a robotics programme.",
      "gap": null
     },
     {
      "dimension": "Geographic Match",
      "evaluates": "Geographic preferences and relocation willingness against the facility locations.",
      "score": 100,
      "weight": 0.15,
      "reason": "FL is a stated preferred location.",
      "gap": null
     },
     {
      "dimension": "Career Match",
      "evaluates": "Professional objectives, leadership and academic experience against the opportunity.",
      "score": 90,
      "weight": 0.08,
      "reason": "Leadership experience on record.",
      "gap": null
     },
     {
      "dimension": "Compensation Match",
      "evaluates": "Compensation expectations against the compensation range.",
      "score": 100,
      "weight": 0.14,
      "reason": "Expectation of $470,000 sits within the posted range.",
      "gap": null
     },
     {
      "dimension": "Availability Match",
      "evaluates": "Availability against the start-date requirements.",
      "score": 100,
      "weight": 0.08,
      "reason": "Available on or before the 2026-12-01 start date.",
      "gap": null
     },
     {
      "dimension": "Cultural / Professional Match",
      "evaluates": "Employment preferences and hospital type against the employment model and call schedule.",
      "score": 100,
      "weight": 0.1,
      "reason": "Employment model matches the stated preference (employed). Call schedule is within the stated tolerance.",
      "gap": null
     }
    ],
    "reasons": [
     "Technology Match: Robotic experience on record. Platform match: da Vinci Xi. 6 years robotic. Has led a robotics programme.",
     "Geographic Match: FL is a stated preferred location.",
     "Career Match: Leadership experience on record.",
     "Compensation Match: Expectation of $470,000 sits within the posted range.",
     "Availability Match: Available on or before the 2026-12-01 start date.",
     "Cultural / Professional Match: Employment model matches the stated preference (employed). Call schedule is within the stated tolerance."
    ],
    "gaps": [
     "Clinical Match: Specialty is Robotic Surgery; the position is Colon & Rectal Surgery."
    ],
    "stage": null,
    "pipeline_id": null,
    "candidate": {
     "name": "Dr Elena Marsh",
     "specialty": "Robotic Surgery",
     "years_experience": 11,
     "board_certified": true,
     "robotic_platforms": [
      "da Vinci Xi"
     ],
     "licenses": [
      "FL",
      "GA"
     ],
     "ai_summary": "Robotic Surgery (Minimally invasive general surgery); 11 years of experience; board certified; robotic experience on da Vinci Xi over 6 years; has led a robotics programme; licensed in FL, GA."
    }
   }
  ]
 },
 "recruiter:POST:/search:robotic surgeons in Florida on da Vinci": {
  "agent": "Recruiter Copilot",
  "query": "robotic surgeons in Florida on da Vinci",
  "applied": [
   "state is FL",
   "has robotic experience",
   "trained on da Vinci"
  ],
  "ignored": [],
  "searched": 1,
  "items": [
   {
    "physician_id": 30,
    "name": "Dr Elena Marsh",
    "specialty": "Robotic Surgery",
    "years_experience": 11,
    "board_certified": true,
    "licenses": [
     "FL",
     "GA"
    ],
    "robotic_platforms": [
     "da Vinci Xi"
    ],
    "ai_summary": "Robotic Surgery (Minimally invasive general surgery); 11 years of experience; board certified; robotic experience on da Vinci Xi over 6 years; has led a robotics programme; licensed in FL, GA."
   }
  ],
  "note": "Every part of the question was applied as a filter."
 },
 "recruiter:POST:/search:urologists in the southeast": {
  "agent": "Recruiter Copilot",
  "query": "urologists in the southeast",
  "applied": [
   "specialty is Urology"
  ],
  "ignored": [
   "southeast"
  ],
  "searched": 1,
  "items": [],
  "note": "These words were not understood and were NOT used as filters: southeast."
 },
 "recruiter:POST:/search:board certified surgeons with 10 years experience": {
  "agent": "Recruiter Copilot",
  "query": "board certified surgeons with 10 years experience",
  "applied": [
   "board certified"
  ],
  "ignored": [],
  "searched": 1,
  "items": [
   {
    "physician_id": 30,
    "name": "Dr Elena Marsh",
    "specialty": "Robotic Surgery",
    "years_experience": 11,
    "board_certified": true,
    "licenses": [
     "FL",
     "GA"
    ],
    "robotic_platforms": [
     "da Vinci Xi"
    ],
    "ai_summary": "Robotic Surgery (Minimally invasive general surgery); 11 years of experience; board certified; robotic experience on da Vinci Xi over 6 years; has led a robotics programme; licensed in FL, GA."
   }
  ],
  "note": "Every part of the question was applied as a filter."
 },
 "recruiter:POST:/agents/outreach/43": {
  "ok": true,
  "action": {
   "created_at": "2026-08-30T15:51:07.615Z",
   "id": 27,
   "tenant_id": 1,
   "pipeline_id": 43,
   "agent": "Recruitment Outreach Agent",
   "kind": "outreach",
   "subject": "Robotic General Surgeon at Sample Regional Medical Center",
   "body": "Hello Dr Elena Marsh,\n\nI am recruiting for Robotic General Surgeon at Sample Regional Medical Center in Tampa, FL.\n\nI am contacting you because:\n  - Specialty matches: Robotic Surgery. Board certified, as required. 11 years of experience against a 5-year minimum. Shared procedures: robotic cholecystectomy, robotic hernia repair.\n  - Robotic experience on record. Platform match: da Vinci Xi. 6 years robotic. Has led a robotics programme.\n  - FL is a stated preferred location.\n\nThe posted range is $430,000 to $510,000.\nCall is light.\nThey are looking to start around 2026-11-01.\n\nIf the timing is wrong I would still value a short conversation.\n\nBest regards",
   "payload": {
    "score": 99,
    "grounded_in": [
     "Clinical Match: Specialty matches: Robotic Surgery. Board certified, as required. 11 years of experience against a 5-year minimum. Shared procedures: robotic cholecystectomy, robotic hernia repair.",
     "Technology Match: Robotic experience on record. Platform match: da Vinci Xi. 6 years robotic. Has led a robotics programme.",
     "Geographic Match: FL is a stated preferred location."
    ],
    "gaps_for_recruiter": []
   },
   "status": "draft",
   "created_by": 64,
   "reviewed_by": null,
   "reviewed_at": null
  },
  "note": "Draft only. Nothing is sent by the platform; approve it and send it yourself."
 },
 "recruiter:POST:/agents/schedule/43": {
  "ok": true,
  "action": {
   "created_at": "2026-08-30T15:51:07.892Z",
   "id": 28,
   "tenant_id": 1,
   "pipeline_id": 43,
   "agent": "Scheduling Agent",
   "kind": "scheduling",
   "subject": "Proposed interview times",
   "body": "Proposed times for Dr Elena Marsh and Robotic General Surgeon:\n  - 2026-09-01 09:00-10:00\n  - 2026-09-02 14:00-15:00\n  - 2026-09-03 09:00-10:00\n\nThese are suggestions only. No calendar has been read and nothing is booked.",
   "payload": {
    "slots": [
     {
      "date": "2026-09-01",
      "window": "09:00-10:00"
     },
     {
      "date": "2026-09-02",
      "window": "14:00-15:00"
     },
     {
      "date": "2026-09-03",
      "window": "09:00-10:00"
     }
    ]
   },
   "status": "draft",
   "created_by": 64,
   "reviewed_by": null,
   "reviewed_at": null
  },
  "note": "Proposed only. The platform holds no calendar access and has booked nothing."
 },
 "recruiter:/agents/followup": {
  "agent": "Follow-Up Agent",
  "items": [],
  "thresholds": {
   "Prospect": 14,
   "Contacted": 7,
   "Interested": 5,
   "Qualified": 7,
   "Matched": 5,
   "Submitted": 7,
   "Hospital Review": 10,
   "Interview": 7,
   "Offer": 5,
   "Negotiation": 7,
   "Accepted": 14,
   "Credentialing": 21,
   "Placement": 0
  },
  "note": "These are flags. Nothing has been moved; only a person can advance a stage."
 },
 "recruiter:/agents/actions": {
  "items": [
   {
    "id": 28,
    "tenant_id": 1,
    "pipeline_id": 43,
    "agent": "Scheduling Agent",
    "kind": "scheduling",
    "subject": "Proposed interview times",
    "body": "Proposed times for Dr Elena Marsh and Robotic General Surgeon:\n  - 2026-09-01 09:00-10:00\n  - 2026-09-02 14:00-15:00\n  - 2026-09-03 09:00-10:00\n\nThese are suggestions only. No calendar has been read and nothing is booked.",
    "payload": {
     "slots": [
      {
       "date": "2026-09-01",
       "window": "09:00-10:00"
      },
      {
       "date": "2026-09-02",
       "window": "14:00-15:00"
      },
      {
       "date": "2026-09-03",
       "window": "09:00-10:00"
      }
     ]
    },
    "status": "draft",
    "created_by": 64,
    "reviewed_by": null,
    "reviewed_at": null,
    "created_at": "2026-08-30T15:51:07.892Z"
   },
   {
    "id": 27,
    "tenant_id": 1,
    "pipeline_id": 43,
    "agent": "Recruitment Outreach Agent",
    "kind": "outreach",
    "subject": "Robotic General Surgeon at Sample Regional Medical Center",
    "body": "Hello Dr Elena Marsh,\n\nI am recruiting for Robotic General Surgeon at Sample Regional Medical Center in Tampa, FL.\n\nI am contacting you because:\n  - Specialty matches: Robotic Surgery. Board certified, as required. 11 years of experience against a 5-year minimum. Shared procedures: robotic cholecystectomy, robotic hernia repair.\n  - Robotic experience on record. Platform match: da Vinci Xi. 6 years robotic. Has led a robotics programme.\n  - FL is a stated preferred location.\n\nThe posted range is $430,000 to $510,000.\nCall is light.\nThey are looking to start around 2026-11-01.\n\nIf the timing is wrong I would still value a short conversation.\n\nBest regards",
    "payload": {
     "score": 99,
     "grounded_in": [
      "Clinical Match: Specialty matches: Robotic Surgery. Board certified, as required. 11 years of experience against a 5-year minimum. Shared procedures: robotic cholecystectomy, robotic hernia repair.",
      "Technology Match: Robotic experience on record. Platform match: da Vinci Xi. 6 years robotic. Has led a robotics programme.",
      "Geographic Match: FL is a stated preferred location."
     ],
     "gaps_for_recruiter": []
    },
    "status": "draft",
    "created_by": 64,
    "reviewed_by": null,
    "reviewed_at": null,
    "created_at": "2026-08-30T15:51:07.615Z"
   }
  ],
  "note": "Approving marks a draft ready to send by hand. This platform sends nothing itself."
 }
};
var FIXTURE_META = {"posIds":[43,44,54],"pipelineId":43,"topMatchId":43};
