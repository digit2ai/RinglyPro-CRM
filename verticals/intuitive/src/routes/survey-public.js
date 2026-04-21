'use strict';
const router = require('express').Router();

// GET /survey/:token - Public survey page (HTML)
router.get('/:token', async (req, res) => {
  try {
    const { IntuitiveSurvey, IntuitiveSurveyRecipient } = req.models;
    const token = req.params.token;

    // Try as recipient personal token first, then as survey general token
    let survey = null;
    let recipient = null;

    const recipientRow = await IntuitiveSurveyRecipient.findOne({ where: { personal_token: token } });
    if (recipientRow) {
      recipient = recipientRow;
      survey = await IntuitiveSurvey.findByPk(recipientRow.survey_id);
      if (recipient.status === 'sent' || recipient.status === 'pending') {
        await recipient.update({ status: 'opened', opened_at: new Date() });
      }
    } else {
      survey = await IntuitiveSurvey.findOne({ where: { survey_url_token: token } });
    }

    if (!survey) return res.status(404).send('Survey not found');
    if (survey.status === 'closed' || survey.status === 'archived') {
      return res.send(buildClosedPage());
    }

    const questionsJSON = JSON.stringify(survey.questions || []);
    const hospitalName = survey.hospital_name || 'the hospital';
    const systemType = survey.system_type || 'da Vinci';
    const surgeonName = recipient ? recipient.surgeon_name : '';
    const surgeonSpecialty = recipient ? (recipient.surgeon_specialty || '') : '';

    res.send(buildSurveyHTML(survey, questionsJSON, hospitalName, systemType, surgeonName, surgeonSpecialty, token));
  } catch (err) {
    console.error('Survey page error:', err);
    res.status(500).send('Error loading survey');
  }
});

// POST /survey/:token/submit - Submit survey response
router.post('/:token/submit', async (req, res) => {
  try {
    const { IntuitiveSurvey, IntuitiveSurveyRecipient, IntuitiveSurveyResponse } = req.models;
    const token = req.params.token;

    let survey = null;
    let recipient = null;

    const recipientRow = await IntuitiveSurveyRecipient.findOne({ where: { personal_token: token } });
    if (recipientRow) {
      recipient = recipientRow;
      survey = await IntuitiveSurvey.findByPk(recipientRow.survey_id);
    } else {
      survey = await IntuitiveSurvey.findOne({ where: { survey_url_token: token } });
    }

    if (!survey) return res.status(404).json({ error: 'Survey not found' });

    const { surgeon_name, surgeon_email, surgeon_specialty, answers,
            incremental_cases_monthly, procedure_breakdown, barriers,
            competitive_leakage_cases, competitive_hospitals,
            current_robotic_cases_monthly, willing_to_commit, additional_comments } = req.body;

    const response = await IntuitiveSurveyResponse.create({
      survey_id: survey.id,
      recipient_id: recipient ? recipient.id : null,
      surgeon_name: surgeon_name || (recipient ? recipient.surgeon_name : 'Anonymous'),
      surgeon_email: surgeon_email || (recipient ? recipient.surgeon_email : null),
      surgeon_specialty: surgeon_specialty || (recipient ? recipient.surgeon_specialty : null),
      answers: answers || {},
      incremental_cases_monthly: incremental_cases_monthly || 0,
      procedure_breakdown: procedure_breakdown || [],
      barriers: barriers || null,
      competitive_leakage_cases: competitive_leakage_cases || 0,
      competitive_hospitals: competitive_hospitals || null,
      current_robotic_cases_monthly: current_robotic_cases_monthly || 0,
      willing_to_commit: willing_to_commit || false,
      additional_comments: additional_comments || null,
      completed_via: 'web',
      ip_address: req.ip
    });

    if (recipient) {
      await recipient.update({ status: 'completed', completed_at: new Date() });
    }

    await survey.increment('response_count');

    res.json({ success: true, message: 'Thank you for your response!' });
  } catch (err) {
    console.error('Survey submit error:', err);
    res.status(500).json({ error: err.message });
  }
});

function buildClosedPage() {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Survey Closed</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0f172a;color:#e2e8f0;font-family:'Inter',system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
.card{background:#1e293b;border:1px solid #334155;border-radius:16px;padding:48px;text-align:center;max-width:500px}h1{font-size:24px;margin-bottom:16px}p{color:#94a3b8}</style>
</head><body><div class="card"><h1>Survey Closed</h1><p>This survey is no longer accepting responses. Thank you for your interest.</p></div></body></html>`;
}

function buildSurveyHTML(survey, questionsJSON, hospitalName, systemType, surgeonName, surgeonSpecialty, token) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${survey.title} - SurgicalMind AI</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0f172a;color:#e2e8f0;font-family:'Inter',system-ui,sans-serif;min-height:100vh;padding:20px}
.container{max-width:680px;margin:0 auto}
.header{text-align:center;padding:32px 0;border-bottom:1px solid #1e293b;margin-bottom:32px}
.header img{width:80px;height:80px;border-radius:16px;margin-bottom:12px}
.header h1{font-size:22px;margin-bottom:8px}
.header p{color:#94a3b8;font-size:14px}
.badge{display:inline-block;padding:4px 12px;border-radius:999px;background:rgba(14,165,233,0.1);border:1px solid rgba(14,165,233,0.3);color:#0ea5e9;font-size:12px;font-weight:600;margin-top:8px}
.welcome{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:20px;margin-bottom:24px;font-size:14px;line-height:1.6;color:#94a3b8}
.question-card{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:24px;margin-bottom:16px;transition:border-color .2s}
.question-card:focus-within{border-color:#0ea5e9}
.q-num{font-size:11px;color:#0ea5e9;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px}
.q-text{font-size:15px;font-weight:600;margin-bottom:16px;line-height:1.5}
.required{color:#ef4444;margin-left:4px}
input[type="number"],input[type="text"],input[type="email"],textarea{width:100%;background:#0f172a;border:1px solid #334155;border-radius:8px;padding:12px 16px;color:#e2e8f0;font-size:14px;font-family:inherit;transition:border-color .2s}
input:focus,textarea:focus{outline:none;border-color:#0ea5e9}
textarea{min-height:100px;resize:vertical}
.checkbox-group{display:flex;flex-direction:column;gap:10px}
.checkbox-group label{display:flex;align-items:center;gap:10px;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;cursor:pointer;font-size:14px;transition:all .2s}
.checkbox-group label:hover{border-color:#0ea5e9}
.checkbox-group input[type="checkbox"]{width:18px;height:18px;accent-color:#0ea5e9}
.bool-group{display:flex;gap:12px}
.bool-group label{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:14px;background:#0f172a;border:2px solid #334155;border-radius:10px;cursor:pointer;font-weight:600;transition:all .2s}
.bool-group input{display:none}
.bool-group input:checked+span{color:#0ea5e9}
.bool-group label:has(input:checked){border-color:#0ea5e9;background:rgba(14,165,233,0.08)}
.proc-row{display:grid;grid-template-columns:1fr 80px;gap:8px;margin-bottom:8px;align-items:center}
.proc-row .proc-name{font-size:13px;color:#94a3b8}
.proc-row input{text-align:center}
.submit-section{text-align:center;padding:32px 0}
.btn-submit{background:linear-gradient(135deg,#0ea5e9,#6366f1);color:#fff;border:none;padding:16px 48px;border-radius:12px;font-size:16px;font-weight:700;cursor:pointer;transition:all .2s}
.btn-submit:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(14,165,233,0.3)}
.btn-submit:disabled{opacity:.5;cursor:not-allowed;transform:none}
.progress{position:fixed;top:0;left:0;height:3px;background:#0ea5e9;transition:width .3s;z-index:100}
.success{display:none;text-align:center;padding:60px 20px}
.success h2{font-size:28px;margin-bottom:16px;color:#10b981}
.success p{color:#94a3b8;font-size:16px}
@media(max-width:640px){.proc-row{grid-template-columns:1fr 60px}}
</style>
</head>
<body>
<div class="progress" id="progress"></div>

<div class="container" id="surveyForm">
  <div class="header">
    <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69e6c537c56ad279084e2bb6.png" alt="SurgicalMind AI">
    <h1>${survey.title}</h1>
    <p>Surgical Volume Assessment for ${hospitalName}</p>
    <div class="badge">${systemType} System Evaluation</div>
  </div>

  ${survey.welcome_message ? `<div class="welcome">${survey.welcome_message}</div>` : ''}

  <div id="nameSection" style="margin-bottom:24px">
    <div class="question-card">
      <div class="q-num">Your Information</div>
      <div style="display:grid;gap:12px">
        <input type="text" id="fSurgeonName" placeholder="Your Name" value="${surgeonName}">
        <input type="email" id="fSurgeonEmail" placeholder="Email Address">
        <input type="text" id="fSurgeonSpecialty" placeholder="Specialty" value="${surgeonSpecialty}">
      </div>
    </div>
  </div>

  <div id="questionsContainer"></div>

  <div class="submit-section">
    <button class="btn-submit" id="btnSubmit" onclick="submitSurvey()">Submit Response</button>
    <p style="margin-top:12px;font-size:12px;color:#475569">Your responses are confidential and will be used for business planning purposes only.</p>
  </div>
</div>

<div class="success" id="successMsg">
  <h2>Thank You!</h2>
  <p>${survey.thank_you_message || 'Your response has been recorded. The surgical team will review your input as part of the technology assessment.'}</p>
</div>

<script>
const questions = ${questionsJSON};
const hospitalName = ${JSON.stringify(hospitalName)};
const systemType = ${JSON.stringify(systemType)};
const token = ${JSON.stringify(token)};

const PROCEDURE_TYPES = {
  urology: ['Radical Prostatectomy','Partial Nephrectomy','Cystectomy','Pyeloplasty'],
  gynecology: ['Hysterectomy (Benign)','Myomectomy','Sacrocolpopexy','Endometriosis Excision'],
  general: ['Inguinal Hernia','Ventral Hernia','Cholecystectomy','Nissen Fundoplication'],
  colorectal: ['Low Anterior Resection','Right Hemicolectomy','Sigmoid Colectomy','Total Colectomy'],
  thoracic: ['Lobectomy','Segmentectomy','Thymectomy'],
  cardiac: ['Mitral Valve Repair','CABG (Robotic Harvest)'],
  ent: ['TORS Oropharyngeal','TORS Base of Tongue','Thyroidectomy'],
  hepatobiliary: ['Liver Resection','Pancreatectomy']
};

function renderQuestions() {
  const container = document.getElementById('questionsContainer');
  let html = '';
  questions.forEach((q, i) => {
    const text = q.text.replace(/\\{hospital_name\\}/g, hospitalName).replace(/\\{system_type\\}/g, systemType);
    const req = q.required ? '<span class="required">*</span>' : '';
    html += '<div class="question-card" data-qid="'+q.id+'">';
    html += '<div class="q-num">Question '+(i+1)+' of '+questions.length+'</div>';
    html += '<div class="q-text">'+text+req+'</div>';

    if (q.type === 'number') {
      html += '<input type="number" id="q_'+q.id+'" min="0" placeholder="Enter a number">';
    } else if (q.type === 'text' || q.type === 'textarea') {
      html += q.type === 'textarea'
        ? '<textarea id="q_'+q.id+'" placeholder="Type your response..."></textarea>'
        : '<input type="text" id="q_'+q.id+'" placeholder="Type your response...">';
    } else if (q.type === 'boolean') {
      html += '<div class="bool-group">';
      html += '<label><input type="radio" name="q_'+q.id+'" value="true"><span>Yes</span></label>';
      html += '<label><input type="radio" name="q_'+q.id+'" value="false"><span>No</span></label>';
      html += '</div>';
    } else if (q.type === 'checkbox_text') {
      html += '<div class="checkbox-group">';
      (q.options || []).forEach(opt => {
        html += '<label><input type="checkbox" name="q_'+q.id+'" value="'+opt+'">'+opt+'</label>';
      });
      html += '<input type="text" id="q_'+q.id+'_other" placeholder="Other (please specify)" style="margin-top:8px">';
      html += '</div>';
    } else if (q.type === 'procedure_mix') {
      const spec = (document.getElementById('fSurgeonSpecialty')?.value || '').toLowerCase();
      const procs = PROCEDURE_TYPES[spec] || Object.values(PROCEDURE_TYPES).flat().slice(0, 8);
      html += '<div id="procMixContainer">';
      procs.forEach(p => {
        html += '<div class="proc-row"><span class="proc-name">'+p+'</span><input type="number" name="proc_'+p.replace(/[^a-zA-Z0-9]/g,'_')+'" min="0" max="100" placeholder="%" style="width:80px"></div>';
      });
      html += '</div>';
    }

    html += '</div>';
  });
  container.innerHTML = html;
}

function updateProgress() {
  const total = questions.length + 1;
  let filled = 0;
  if (document.getElementById('fSurgeonName').value) filled++;
  questions.forEach(q => {
    const el = document.getElementById('q_'+q.id);
    if (el && el.value) filled++;
    else if (q.type === 'boolean') {
      const checked = document.querySelector('input[name="q_'+q.id+'"]:checked');
      if (checked) filled++;
    }
  });
  document.getElementById('progress').style.width = Math.round((filled/total)*100) + '%';
}

async function submitSurvey() {
  const btn = document.getElementById('btnSubmit');
  btn.disabled = true;
  btn.textContent = 'Submitting...';

  const answers = {};
  questions.forEach(q => {
    const el = document.getElementById('q_'+q.id);
    if (el) answers[q.id] = q.type === 'number' ? parseInt(el.value) || 0 : el.value;
    if (q.type === 'boolean') {
      const checked = document.querySelector('input[name="q_'+q.id+'"]:checked');
      answers[q.id] = checked ? checked.value === 'true' : false;
    }
    if (q.type === 'checkbox_text') {
      const checked = document.querySelectorAll('input[name="q_'+q.id+'"]:checked');
      const vals = Array.from(checked).map(c => c.value);
      const other = document.getElementById('q_'+q.id+'_other')?.value;
      if (other) vals.push(other);
      answers[q.id] = vals;
    }
  });

  // Build procedure breakdown
  const procBreakdown = [];
  document.querySelectorAll('#procMixContainer .proc-row').forEach(row => {
    const name = row.querySelector('.proc-name').textContent;
    const input = row.querySelector('input');
    const pct = parseInt(input?.value) || 0;
    if (pct > 0) {
      procBreakdown.push({ procedure_type: name.toLowerCase().replace(/[^a-z0-9]/g, '_'), procedure_name: name, percentage: pct });
    }
  });

  const body = {
    surgeon_name: document.getElementById('fSurgeonName').value || 'Anonymous',
    surgeon_email: document.getElementById('fSurgeonEmail').value || null,
    surgeon_specialty: document.getElementById('fSurgeonSpecialty').value || null,
    answers,
    incremental_cases_monthly: answers.incremental_volume || 0,
    procedure_breakdown: procBreakdown,
    barriers: Array.isArray(answers.barriers) ? answers.barriers.join(', ') : (answers.barriers || ''),
    competitive_leakage_cases: answers.competitive_leakage || 0,
    competitive_hospitals: answers.competitive_hospitals || '',
    current_robotic_cases_monthly: answers.current_robotic_volume || 0,
    willing_to_commit: answers.commit || false,
    additional_comments: answers.comments || ''
  };

  try {
    const res = await fetch('/intuitive/survey/'+token+'/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      document.getElementById('surveyForm').style.display = 'none';
      document.getElementById('successMsg').style.display = 'block';
      document.getElementById('progress').style.width = '100%';
    } else {
      const err = await res.json();
      alert('Error: ' + (err.error || 'Unknown error'));
      btn.disabled = false;
      btn.textContent = 'Submit Response';
    }
  } catch (e) {
    alert('Network error. Please try again.');
    btn.disabled = false;
    btn.textContent = 'Submit Response';
  }
}

renderQuestions();
document.addEventListener('input', updateProgress);
</script>
</body>
</html>`;
}

module.exports = router;
