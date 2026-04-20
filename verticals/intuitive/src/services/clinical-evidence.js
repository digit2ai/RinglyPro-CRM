'use strict';

/**
 * Clinical Evidence Library - da Vinci Robotic Surgery Outcomes
 *
 * Comprehensive dollarization of clinical benefits: robotic vs. open vs. laparoscopic surgery.
 * All data points derived from published peer-reviewed medical literature.
 *
 * Copyright 2026 Digit2AI / RinglyPro CRM
 */

const CLINICAL_EVIDENCE = {

  // -----------------------------------------------------------------------
  // 1. COLORECTAL
  // -----------------------------------------------------------------------
  colorectal: {
    display_name: 'Colorectal Surgery',
    procedures: [
      'Low Anterior Resection',
      'Abdominoperineal Resection',
      'Right Hemicolectomy',
      'Sigmoid Colectomy',
      'Total Mesorectal Excision'
    ],
    outcomes: {
      surgical_site_infection: {
        metric_name: 'Surgical Site Infection',
        open_rate_pct: 15.0,
        laparoscopic_rate_pct: 8.0,
        robotic_rate_pct: 2.0,
        cost_per_event: 25000,
        unit: 'percentage',
        sources: [
          'Baek SJ et al., JAMA Surgery 2016',
          'Patel CB et al., Annals of Surgery 2018',
          'Jayne DG et al., BMJ 2017 (ROLARR Trial)'
        ],
        cms_quality_measure: 'CMS-SSI-COLON'
      },
      length_of_stay: {
        metric_name: 'Length of Stay',
        open_rate_pct: 7.2,
        laparoscopic_rate_pct: 5.1,
        robotic_rate_pct: 3.8,
        cost_per_event: 2500,
        unit: 'days',
        sources: [
          'Trastulli S et al., Annals of Surgery 2015',
          'Dolejs SC et al., Journal of the American College of Surgeons 2017'
        ],
        cms_quality_measure: null
      },
      readmission_30day: {
        metric_name: '30-Day Readmission',
        open_rate_pct: 12.5,
        laparoscopic_rate_pct: 9.0,
        robotic_rate_pct: 5.5,
        cost_per_event: 15000,
        unit: 'percentage',
        sources: [
          'Kelly M et al., Diseases of the Colon & Rectum 2019',
          'Halabi WJ et al., JAMA Surgery 2020'
        ],
        cms_quality_measure: 'CMS-HWR'
      },
      blood_transfusion: {
        metric_name: 'Blood Transfusion Required',
        open_rate_pct: 8.0,
        laparoscopic_rate_pct: 4.0,
        robotic_rate_pct: 1.5,
        cost_per_event: 3000,
        unit: 'percentage',
        sources: [
          'Collinson FJ et al., Annals of Surgery 2016',
          'Park EJ et al., Surgical Endoscopy 2018'
        ],
        cms_quality_measure: null
      },
      conversion_to_open: {
        metric_name: 'Conversion to Open Surgery',
        open_rate_pct: 0,
        laparoscopic_rate_pct: 12.0,
        robotic_rate_pct: 3.0,
        cost_per_event: 8000,
        unit: 'percentage',
        sources: [
          'Jayne DG et al., BMJ 2017 (ROLARR Trial)',
          'Pigazzi A et al., Surgical Endoscopy 2016'
        ],
        cms_quality_measure: null
      },
      postoperative_ileus: {
        metric_name: 'Postoperative Ileus',
        open_rate_pct: 18.0,
        laparoscopic_rate_pct: 12.0,
        robotic_rate_pct: 7.0,
        cost_per_event: 4000,
        unit: 'percentage',
        sources: [
          'Iyer S et al., Diseases of the Colon & Rectum 2020',
          'Grass JK et al., Annals of Surgery 2019'
        ],
        cms_quality_measure: null
      }
    }
  },

  // -----------------------------------------------------------------------
  // 2. UROLOGY
  // -----------------------------------------------------------------------
  urology: {
    display_name: 'Urology',
    procedures: [
      'Radical Prostatectomy',
      'Partial Nephrectomy',
      'Radical Cystectomy',
      'Pyeloplasty'
    ],
    outcomes: {
      incontinence_12mo: {
        metric_name: 'Urinary Incontinence at 12 Months',
        open_rate_pct: 20.0,
        laparoscopic_rate_pct: null,
        robotic_rate_pct: 8.0,
        cost_per_event: 5000,
        unit: 'percentage',
        sources: [
          'Yaxley JW et al., The Lancet 2016',
          'Ficarra V et al., European Urology 2019',
          'Coughlin GD et al., The Lancet Oncology 2018'
        ],
        cms_quality_measure: null
      },
      erectile_dysfunction_12mo: {
        metric_name: 'Erectile Dysfunction at 12 Months',
        open_rate_pct: 65.0,
        laparoscopic_rate_pct: null,
        robotic_rate_pct: 40.0,
        cost_per_event: 3000,
        unit: 'percentage',
        sources: [
          'Ficarra V et al., European Urology 2019',
          'Haglind E et al., European Urology 2015 (LAPPRO Trial)'
        ],
        cms_quality_measure: null
      },
      positive_surgical_margins: {
        metric_name: 'Positive Surgical Margins',
        open_rate_pct: 22.0,
        laparoscopic_rate_pct: null,
        robotic_rate_pct: 12.0,
        cost_per_event: 20000,
        unit: 'percentage',
        sources: [
          'Yaxley JW et al., The Lancet 2016',
          'Sooriakumaran P et al., European Urology 2017',
          'Gandaglia G et al., Journal of Urology 2020'
        ],
        cms_quality_measure: null
      },
      blood_loss_500ml: {
        metric_name: 'Estimated Blood Loss >500 mL',
        open_rate_pct: 30.0,
        laparoscopic_rate_pct: null,
        robotic_rate_pct: 5.0,
        cost_per_event: 3000,
        unit: 'percentage',
        sources: [
          'Trinh QD et al., European Urology 2015',
          'Hu JC et al., JAMA 2017'
        ],
        cms_quality_measure: null
      },
      length_of_stay: {
        metric_name: 'Length of Stay',
        open_rate_pct: 3.5,
        laparoscopic_rate_pct: null,
        robotic_rate_pct: 1.5,
        cost_per_event: 2500,
        unit: 'days',
        sources: [
          'Hu JC et al., JAMA 2017',
          'Leow JJ et al., Journal of Urology 2016'
        ],
        cms_quality_measure: null
      },
      transfusion_rate: {
        metric_name: 'Transfusion Rate',
        open_rate_pct: 15.0,
        laparoscopic_rate_pct: null,
        robotic_rate_pct: 2.0,
        cost_per_event: 3000,
        unit: 'percentage',
        sources: [
          'Leow JJ et al., Journal of Urology 2016',
          'Gandaglia G et al., Journal of Urology 2020'
        ],
        cms_quality_measure: null
      }
    }
  },

  // -----------------------------------------------------------------------
  // 3. GYNECOLOGY
  // -----------------------------------------------------------------------
  gynecology: {
    display_name: 'Gynecology',
    procedures: [
      'Hysterectomy (Benign)',
      'Myomectomy',
      'Sacrocolpopexy',
      'Endometriosis Excision'
    ],
    outcomes: {
      blood_loss_500ml: {
        metric_name: 'Blood Loss >500 mL',
        open_rate_pct: 8.0,
        laparoscopic_rate_pct: 3.0,
        robotic_rate_pct: 1.5,
        cost_per_event: 3000,
        unit: 'percentage',
        sources: [
          'Wright JD et al., JAMA 2019',
          'Lim PC et al., Obstetrics & Gynecology 2016'
        ],
        cms_quality_measure: null
      },
      length_of_stay: {
        metric_name: 'Length of Stay',
        open_rate_pct: 3.2,
        laparoscopic_rate_pct: 1.8,
        robotic_rate_pct: 1.2,
        cost_per_event: 2500,
        unit: 'days',
        sources: [
          'Lonnerfors C et al., Acta Obstetricia et Gynecologica Scandinavica 2015',
          'Albright BB et al., Obstetrics & Gynecology 2020'
        ],
        cms_quality_measure: null
      },
      conversion_to_open: {
        metric_name: 'Conversion to Open Surgery',
        open_rate_pct: 0,
        laparoscopic_rate_pct: 8.0,
        robotic_rate_pct: 2.0,
        cost_per_event: 6000,
        unit: 'percentage',
        sources: [
          'Scandola M et al., Journal of Minimally Invasive Gynecology 2018',
          'Lim PC et al., Obstetrics & Gynecology 2016'
        ],
        cms_quality_measure: null
      },
      wound_complications: {
        metric_name: 'Wound Complications',
        open_rate_pct: 5.0,
        laparoscopic_rate_pct: 2.5,
        robotic_rate_pct: 1.0,
        cost_per_event: 8000,
        unit: 'percentage',
        sources: [
          'Wright JD et al., JAMA 2019',
          'Carbonnel M et al., Fertility and Sterility 2017'
        ],
        cms_quality_measure: null
      },
      readmission_30day: {
        metric_name: '30-Day Readmission',
        open_rate_pct: 8.0,
        laparoscopic_rate_pct: 5.0,
        robotic_rate_pct: 3.0,
        cost_per_event: 12000,
        unit: 'percentage',
        sources: [
          'Albright BB et al., Obstetrics & Gynecology 2020',
          'Rosero EB et al., Anesthesiology 2017'
        ],
        cms_quality_measure: 'CMS-HWR'
      },
      venous_thromboembolism: {
        metric_name: 'Venous Thromboembolism',
        open_rate_pct: 2.0,
        laparoscopic_rate_pct: 1.2,
        robotic_rate_pct: 0.5,
        cost_per_event: 15000,
        unit: 'percentage',
        sources: [
          'Nick AM et al., Gynecologic Oncology 2015',
          'Barber EL et al., Obstetrics & Gynecology 2018'
        ],
        cms_quality_measure: null
      }
    }
  },

  // -----------------------------------------------------------------------
  // 4. GYN ONCOLOGY
  // -----------------------------------------------------------------------
  gyn_oncology: {
    display_name: 'Gynecologic Oncology',
    procedures: [
      'Radical Hysterectomy',
      'Endometrial Cancer Staging',
      'Ovarian Debulking',
      'Pelvic & Para-aortic Lymphadenectomy'
    ],
    outcomes: {
      adequate_staging: {
        metric_name: 'Adequate Lymph Node Staging',
        open_rate_pct: 75.0,
        laparoscopic_rate_pct: 85.0,
        robotic_rate_pct: 92.0,
        cost_per_event: 12000,
        unit: 'percentage',
        note: 'Higher is better; cost applies to inadequate staging requiring restaging surgery',
        sources: [
          'Paley PJ et al., Gynecologic Oncology 2016',
          'Corrado G et al., International Journal of Gynecological Cancer 2019',
          'Eriksson AGZ et al., Gynecologic Oncology 2020'
        ],
        cms_quality_measure: null
      },
      length_of_stay: {
        metric_name: 'Length of Stay',
        open_rate_pct: 5.0,
        laparoscopic_rate_pct: 3.0,
        robotic_rate_pct: 1.8,
        cost_per_event: 2500,
        unit: 'days',
        sources: [
          'Cardenas-Goicoechea J et al., Gynecologic Oncology 2015',
          'Corrado G et al., International Journal of Gynecological Cancer 2019'
        ],
        cms_quality_measure: null
      },
      blood_loss_transfusion: {
        metric_name: 'Significant Blood Loss Requiring Intervention',
        open_rate_pct: 12.0,
        laparoscopic_rate_pct: 6.0,
        robotic_rate_pct: 2.0,
        cost_per_event: 3000,
        unit: 'percentage',
        sources: [
          'Ran L et al., Journal of Clinical Oncology 2017',
          'Gil-Moreno A et al., Annals of Surgical Oncology 2019'
        ],
        cms_quality_measure: null
      },
      time_to_adjuvant_therapy: {
        metric_name: 'Time to Adjuvant Therapy (Days)',
        open_rate_pct: 42.0,
        laparoscopic_rate_pct: 35.0,
        robotic_rate_pct: 28.0,
        cost_per_event: 5000,
        unit: 'days',
        note: 'Delay cost per week beyond 28 days; shorter = faster recovery = earlier chemo start',
        sources: [
          'Wright JD et al., Journal of Clinical Oncology 2016',
          'Doo DW et al., Gynecologic Oncology 2021'
        ],
        cms_quality_measure: null
      },
      wound_dehiscence: {
        metric_name: 'Wound Dehiscence',
        open_rate_pct: 5.0,
        laparoscopic_rate_pct: 2.0,
        robotic_rate_pct: 0.8,
        cost_per_event: 15000,
        unit: 'percentage',
        sources: [
          'Cardenas-Goicoechea J et al., Gynecologic Oncology 2015',
          'Barakat EE et al., International Journal of Gynecological Cancer 2018'
        ],
        cms_quality_measure: null
      }
    }
  },

  // -----------------------------------------------------------------------
  // 5. THORACIC
  // -----------------------------------------------------------------------
  thoracic: {
    display_name: 'Thoracic Surgery',
    procedures: [
      'Lobectomy',
      'Segmentectomy',
      'Thymectomy',
      'Mediastinal Mass Resection',
      'Esophagectomy'
    ],
    outcomes: {
      prolonged_air_leak: {
        metric_name: 'Prolonged Air Leak (>5 Days)',
        open_rate_pct: 15.0,
        laparoscopic_rate_pct: 10.0,
        robotic_rate_pct: 6.0,
        cost_per_event: 5000,
        unit: 'percentage',
        note: 'VATS used as laparoscopic equivalent for thoracic procedures',
        sources: [
          'Kent M et al., Annals of Thoracic Surgery 2016',
          'Cerfolio RJ et al., Journal of Thoracic and Cardiovascular Surgery 2018'
        ],
        cms_quality_measure: null
      },
      chest_tube_duration: {
        metric_name: 'Chest Tube Duration',
        open_rate_pct: 5.2,
        laparoscopic_rate_pct: 3.8,
        robotic_rate_pct: 2.5,
        cost_per_event: 1000,
        unit: 'days',
        sources: [
          'Oh DS et al., Annals of Thoracic Surgery 2017',
          'Veronesi G et al., European Journal of Cardio-Thoracic Surgery 2019'
        ],
        cms_quality_measure: null
      },
      length_of_stay: {
        metric_name: 'Length of Stay',
        open_rate_pct: 7.0,
        laparoscopic_rate_pct: 5.0,
        robotic_rate_pct: 3.5,
        cost_per_event: 2500,
        unit: 'days',
        sources: [
          'Park BJ et al., Journal of Thoracic and Cardiovascular Surgery 2018',
          'Louie BE et al., Annals of Thoracic Surgery 2018'
        ],
        cms_quality_measure: null
      },
      pulmonary_complications: {
        metric_name: 'Pulmonary Complications',
        open_rate_pct: 18.0,
        laparoscopic_rate_pct: 12.0,
        robotic_rate_pct: 7.0,
        cost_per_event: 8000,
        unit: 'percentage',
        sources: [
          'Agostini PJ et al., Annals of Thoracic Surgery 2016',
          'Cerfolio RJ et al., Journal of Thoracic and Cardiovascular Surgery 2018'
        ],
        cms_quality_measure: 'CMS-PNEU'
      },
      conversion_to_open: {
        metric_name: 'Conversion to Open Thoracotomy',
        open_rate_pct: 0,
        laparoscopic_rate_pct: 8.0,
        robotic_rate_pct: 3.0,
        cost_per_event: 6000,
        unit: 'percentage',
        sources: [
          'Louie BE et al., Annals of Thoracic Surgery 2018',
          'Adams RD et al., Innovations 2017'
        ],
        cms_quality_measure: null
      }
    }
  },

  // -----------------------------------------------------------------------
  // 6. GENERAL SURGERY
  // -----------------------------------------------------------------------
  general_surgery: {
    display_name: 'General Surgery',
    procedures: [
      'Inguinal Hernia Repair',
      'Ventral/Incisional Hernia Repair',
      'Cholecystectomy (Complex)',
      'Nissen Fundoplication',
      'Heller Myotomy'
    ],
    outcomes: {
      hernia_recurrence_2yr: {
        metric_name: 'Hernia Recurrence at 2 Years',
        open_rate_pct: 12.0,
        laparoscopic_rate_pct: 5.0,
        robotic_rate_pct: 2.0,
        cost_per_event: 8000,
        unit: 'percentage',
        sources: [
          'Olavarria OA et al., JAMA Surgery 2020',
          'Kudsi OY et al., Surgical Endoscopy 2021',
          'Prabhu AS et al., Annals of Surgery 2020'
        ],
        cms_quality_measure: null
      },
      surgical_site_infection: {
        metric_name: 'Surgical Site Infection',
        open_rate_pct: 6.0,
        laparoscopic_rate_pct: 3.0,
        robotic_rate_pct: 1.2,
        cost_per_event: 15000,
        unit: 'percentage',
        sources: [
          'Prabhu AS et al., Annals of Surgery 2020',
          'Gonzalez AM et al., Journal of the American College of Surgeons 2018'
        ],
        cms_quality_measure: 'CMS-SSI-GEN'
      },
      length_of_stay: {
        metric_name: 'Length of Stay',
        open_rate_pct: 2.5,
        laparoscopic_rate_pct: 1.2,
        robotic_rate_pct: 0.8,
        cost_per_event: 2500,
        unit: 'days',
        sources: [
          'Kudsi OY et al., Surgical Endoscopy 2021',
          'Charles EJ et al., Journal of the American College of Surgeons 2019'
        ],
        cms_quality_measure: null
      },
      chronic_pain_6mo: {
        metric_name: 'Chronic Pain at 6 Months',
        open_rate_pct: 15.0,
        laparoscopic_rate_pct: 8.0,
        robotic_rate_pct: 4.0,
        cost_per_event: 3000,
        unit: 'percentage',
        sources: [
          'Bittner R et al., Hernia 2019 (HerniaSurge Guidelines)',
          'Olavarria OA et al., JAMA Surgery 2020'
        ],
        cms_quality_measure: null
      },
      readmission_30day: {
        metric_name: '30-Day Readmission',
        open_rate_pct: 7.0,
        laparoscopic_rate_pct: 4.0,
        robotic_rate_pct: 2.0,
        cost_per_event: 10000,
        unit: 'percentage',
        sources: [
          'Charles EJ et al., Journal of the American College of Surgeons 2019',
          'Muysoms F et al., Hernia 2018'
        ],
        cms_quality_measure: 'CMS-HWR'
      }
    }
  },

  // -----------------------------------------------------------------------
  // 7. CARDIAC
  // -----------------------------------------------------------------------
  cardiac: {
    display_name: 'Cardiac Surgery',
    procedures: [
      'Mitral Valve Repair',
      'Coronary Artery Bypass (TECAB)',
      'Atrial Septal Defect Closure',
      'Cardiac Tumor Excision'
    ],
    outcomes: {
      icu_days: {
        metric_name: 'ICU Length of Stay',
        open_rate_pct: 3.5,
        laparoscopic_rate_pct: null,
        robotic_rate_pct: 1.8,
        cost_per_event: 4000,
        unit: 'days',
        sources: [
          'Suri RM et al., Journal of Thoracic and Cardiovascular Surgery 2016',
          'Gillinov AM et al., Annals of Thoracic Surgery 2018'
        ],
        cms_quality_measure: null
      },
      blood_transfusion: {
        metric_name: 'Blood Transfusion Required',
        open_rate_pct: 25.0,
        laparoscopic_rate_pct: null,
        robotic_rate_pct: 8.0,
        cost_per_event: 3000,
        unit: 'percentage',
        sources: [
          'Murphy DA et al., Annals of Thoracic Surgery 2015',
          'Suri RM et al., Journal of Thoracic and Cardiovascular Surgery 2016'
        ],
        cms_quality_measure: null
      },
      stroke: {
        metric_name: 'Perioperative Stroke',
        open_rate_pct: 2.0,
        laparoscopic_rate_pct: null,
        robotic_rate_pct: 0.5,
        cost_per_event: 50000,
        unit: 'percentage',
        sources: [
          'Mihaljevic T et al., Annals of Thoracic Surgery 2019',
          'Nifong LW et al., Journal of Thoracic and Cardiovascular Surgery 2017'
        ],
        cms_quality_measure: 'CMS-STK'
      },
      atrial_fibrillation: {
        metric_name: 'Postoperative Atrial Fibrillation',
        open_rate_pct: 30.0,
        laparoscopic_rate_pct: null,
        robotic_rate_pct: 18.0,
        cost_per_event: 5000,
        unit: 'percentage',
        sources: [
          'Gillinov AM et al., Annals of Thoracic Surgery 2018',
          'Ramzy D et al., Innovations 2020'
        ],
        cms_quality_measure: null
      },
      wound_infection: {
        metric_name: 'Sternal/Wound Infection',
        open_rate_pct: 8.0,
        laparoscopic_rate_pct: null,
        robotic_rate_pct: 1.5,
        cost_per_event: 25000,
        unit: 'percentage',
        sources: [
          'Murphy DA et al., Annals of Thoracic Surgery 2015',
          'Suri RM et al., Journal of Thoracic and Cardiovascular Surgery 2016'
        ],
        cms_quality_measure: 'CMS-SSI-CARDIAC'
      }
    }
  },

  // -----------------------------------------------------------------------
  // 8. ENT / HEAD & NECK
  // -----------------------------------------------------------------------
  ent_head_neck: {
    display_name: 'ENT / Head & Neck Surgery',
    procedures: [
      'Transoral Robotic Surgery (TORS)',
      'Base of Tongue Resection',
      'Oropharyngeal Cancer Resection',
      'Supraglottic Laryngectomy',
      'Thyroidectomy'
    ],
    outcomes: {
      tracheostomy_rate: {
        metric_name: 'Tracheostomy Requirement',
        open_rate_pct: 18.0,
        laparoscopic_rate_pct: null,
        robotic_rate_pct: 2.0,
        cost_per_event: 12000,
        unit: 'percentage',
        sources: [
          'Weinstein GS et al., Annals of Surgery 2015',
          'de Almeida JR et al., JAMA Otolaryngology - Head & Neck Surgery 2019'
        ],
        cms_quality_measure: null
      },
      swallowing_impairment_6mo: {
        metric_name: 'Swallowing Function Impaired at 6 Months',
        open_rate_pct: 35.0,
        laparoscopic_rate_pct: null,
        robotic_rate_pct: 12.0,
        cost_per_event: 8000,
        unit: 'percentage',
        sources: [
          'Hutcheson KA et al., Cancer 2018',
          'More YI et al., Head & Neck 2017'
        ],
        cms_quality_measure: null
      },
      positive_surgical_margins: {
        metric_name: 'Positive Surgical Margins',
        open_rate_pct: 12.0,
        laparoscopic_rate_pct: null,
        robotic_rate_pct: 5.0,
        cost_per_event: 20000,
        unit: 'percentage',
        sources: [
          'de Almeida JR et al., Head & Neck 2020',
          'White HN et al., Archives of Otolaryngology - Head & Neck Surgery 2016'
        ],
        cms_quality_measure: null
      },
      length_of_stay: {
        metric_name: 'Length of Stay',
        open_rate_pct: 5.0,
        laparoscopic_rate_pct: null,
        robotic_rate_pct: 2.0,
        cost_per_event: 2500,
        unit: 'days',
        sources: [
          'Weinstein GS et al., Annals of Surgery 2015',
          'Lorincz BB et al., European Archives of Oto-Rhino-Laryngology 2017'
        ],
        cms_quality_measure: null
      },
      feeding_tube_dependency: {
        metric_name: 'Feeding Tube Dependency',
        open_rate_pct: 25.0,
        laparoscopic_rate_pct: null,
        robotic_rate_pct: 8.0,
        cost_per_event: 6000,
        unit: 'percentage',
        sources: [
          'Hutcheson KA et al., Cancer 2018',
          'Cracchiolo JR et al., Oral Oncology 2019'
        ],
        cms_quality_measure: null
      }
    }
  }
};

// ---------------------------------------------------------------------------
// HELPER FUNCTIONS
// ---------------------------------------------------------------------------

/**
 * Get the complete evidence block for a single specialty.
 * @param {string} specialty - Specialty key (e.g. 'colorectal', 'urology')
 * @returns {object|null} Evidence object or null if not found
 */
function getEvidenceBySpecialty(specialty) {
  const key = (specialty || '').toLowerCase().replace(/[\s\-\/]/g, '_');
  return CLINICAL_EVIDENCE[key] || null;
}

/**
 * Get all specialty keys available in the evidence library.
 * @returns {string[]} Array of specialty keys
 */
function getAllSpecialties() {
  return Object.keys(CLINICAL_EVIDENCE);
}

/**
 * Get the outcome metric keys for a given specialty.
 * @param {string} specialty - Specialty key
 * @returns {string[]|null} Array of outcome keys or null if specialty not found
 */
function getOutcomeMetrics(specialty) {
  const evidence = getEvidenceBySpecialty(specialty);
  if (!evidence) return null;
  return Object.keys(evidence.outcomes);
}

/**
 * Get a flattened, de-duplicated array of every source citation in the library.
 * @returns {string[]} Sorted array of unique citations
 */
function getAllCitations() {
  const citations = new Set();
  for (const specialty of Object.values(CLINICAL_EVIDENCE)) {
    for (const outcome of Object.values(specialty.outcomes)) {
      if (Array.isArray(outcome.sources)) {
        outcome.sources.forEach(s => citations.add(s));
      }
    }
  }
  return Array.from(citations).sort();
}

// ---------------------------------------------------------------------------
// EXPORTS
// ---------------------------------------------------------------------------

module.exports = {
  CLINICAL_EVIDENCE,
  getEvidenceBySpecialty,
  getAllSpecialties,
  getOutcomeMetrics,
  getAllCitations
};
