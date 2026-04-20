const BASE = '/intuitive/api/v1';

async function request(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const api = {
  // Projects
  createProject: (data) => request('/projects', { method: 'POST', body: JSON.stringify(data) }),
  listProjects: () => request('/projects'),
  getProject: (id) => request(`/projects/${id}`),
  updateProject: (id, data) => request(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Analysis
  runAnalysis: (projectId) => request(`/analysis/${projectId}/run`, { method: 'POST' }),
  getResults: (projectId) => request(`/analysis/${projectId}/all`),
  getSystems: () => request('/analysis/systems'),

  // Demo
  generateDemo: () => request('/demo/generate', { method: 'POST' }),
  generateSingleDemo: () => request('/demo/generate-single', { method: 'POST' }),

  // Proposal
  generateProposal: (projectId) => request(`/proposal/${projectId}/generate`, { method: 'POST' }),
  getProposalStatus: (projectId) => request(`/proposal/${projectId}/status`),

  // Business Plans
  createBusinessPlan: (data) => request('/business-plans', { method: 'POST', body: JSON.stringify(data) }),
  listBusinessPlans: (projectId) => request(`/business-plans?project_id=${projectId}`),
  getBusinessPlan: (id) => request(`/business-plans/${id}`),
  updateBusinessPlan: (id, data) => request(`/business-plans/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteBusinessPlan: (id) => request(`/business-plans/${id}`, { method: 'DELETE' }),
  calculatePlan: (planId) => request(`/business-plans/${planId}/calculate`, { method: 'POST' }),

  // Surgeon Commitments
  addSurgeon: (planId, data) => request(`/business-plans/${planId}/surgeons`, { method: 'POST', body: JSON.stringify(data) }),
  listSurgeons: (planId) => request(`/business-plans/${planId}/surgeons`),
  updateSurgeon: (planId, id, data) => request(`/business-plans/${planId}/surgeons/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteSurgeon: (planId, id) => request(`/business-plans/${planId}/surgeons/${id}`, { method: 'DELETE' }),

  // Surveys
  createSurvey: (data) => request('/surveys', { method: 'POST', body: JSON.stringify(data) }),
  listSurveys: (projectId) => request(`/surveys?project_id=${projectId}`),
  getSurvey: (id) => request(`/surveys/${id}`),
  updateSurvey: (id, data) => request(`/surveys/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  addRecipients: (surveyId, recipients) => request(`/surveys/${surveyId}/recipients`, { method: 'POST', body: JSON.stringify({ recipients }) }),
  sendSurvey: (surveyId) => request(`/surveys/${surveyId}/send`, { method: 'POST' }),
  getSurveyResponses: (surveyId) => request(`/surveys/${surveyId}/responses`),
  importSurveyToPlan: (surveyId, businessPlanId) => request(`/surveys/${surveyId}/import-to-plan`, { method: 'POST', body: JSON.stringify({ business_plan_id: businessPlanId }) }),

  // DRG
  listDRGProcedures: () => request('/drg/procedures'),
  lookupDRG: (procedureType) => request(`/drg/lookup?procedure_type=${encodeURIComponent(procedureType)}`),
  calculateReimbursement: (procedureType, payerMix) => request('/drg/calculate-reimbursement', { method: 'POST', body: JSON.stringify({ procedure_type: procedureType, payer_mix: payerMix }) }),

  // Clinical Evidence
  getClinicalLibrary: () => request('/clinical-evidence/library'),
  getClinicalSpecialties: () => request('/clinical-evidence/specialties'),
  getClinicalEvidence: (specialty) => request(`/clinical-evidence/${specialty}`),
  dollarize: (hospitalCaseData, options) => request('/clinical-evidence/dollarize', { method: 'POST', body: JSON.stringify({ hospital_case_data: hospitalCaseData, options }) }),
  dollarizeSpecialty: (specialty, caseData, options) => request(`/clinical-evidence/dollarize/${specialty}`, { method: 'POST', body: JSON.stringify({ case_data: caseData, options }) }),
  saveClinicalOutcomes: (planId, hospitalCaseData, cmsData, options) => request(`/clinical-evidence/business-plan/${planId}/outcomes`, { method: 'POST', body: JSON.stringify({ hospital_case_data: hospitalCaseData, cms_data: cmsData, options }) }),
  getClinicalOutcomes: (planId) => request(`/clinical-evidence/business-plan/${planId}/outcomes`),

  // AI Research
  startResearch: (hospitalName) => request('/ai-research/generate', { method: 'POST', body: JSON.stringify({ hospital_name: hospitalName }) }),
  getResearchStatus: (jobId) => request(`/ai-research/status/${jobId}`),
  researchOnly: (hospitalName) => request('/ai-research/research-only', { method: 'POST', body: JSON.stringify({ hospital_name: hospitalName }) }),

  // Proforma Tracking
  importActuals: (planId, data) => request(`/tracking/${planId}/actuals`, { method: 'POST', body: JSON.stringify(data) }),
  getActuals: (planId) => request(`/tracking/${planId}/actuals`),
  getComparison: (planId) => request(`/tracking/${planId}/comparison`),
  takeSnapshot: (planId, data) => request(`/tracking/${planId}/snapshot`, { method: 'POST', body: JSON.stringify(data || {}) }),
  getSnapshots: (planId) => request(`/tracking/${planId}/snapshots`),
  getExecutiveSummary: (planId) => request(`/tracking/${planId}/executive-summary`),
};
