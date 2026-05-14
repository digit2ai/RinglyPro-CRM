'use strict';

// =====================================================
// PROJECT NDA — per-stakeholder magic-link signing
// =====================================================
//
// Two surfaces, mounted separately in src/index.js:
//
//   Admin (auth required): mounted at /api/v1/projects via adminRouter
//     POST   /:id/nda-tokens          mint NDA magic-link for one stakeholder
//     GET    /:id/nda-tokens          list NDAs for a project
//     DELETE /nda-tokens/:ndaId        revoke an unsigned NDA
//
//   Public (no auth): mounted at /api/v1/projects/nda via publicRouter
//     GET   /:token                    fetch project context + template
//     POST  /:token/sign               capture signature + persist
//
// The signer must:
//   - hold the token (UUID) AND
//   - submit the same email the token was bound to (case-insensitive)
//
// The NDA legal text is frozen into the row at sign time so future template
// edits cannot mutate an executed agreement.

const express = require('express');
const crypto = require('crypto');
const { Project, ProjectNda } = require('../models');
const { logActivity } = require('../services/activityService');

const NDA_TEMPLATE_EN = `NON-DISCLOSURE AGREEMENT

This Non-Disclosure Agreement ("Agreement") is entered into as of the Effective Date signed below between:

  Disclosing Party: DIGIT2AI LLC (Florida, USA)
  Receiving Party:  As identified and signed below

1. PURPOSE
The Receiving Party wishes to receive certain confidential information from the Disclosing Party for the purpose of discussing, evaluating, and/or collaborating on the technical details, architecture, business logic, integrations, and proprietary methodology of the AI-powered software solution referenced as "{{PROJECT_NAME}}" (the "Project"). The scope of disclosure includes, but is not limited to, system design, data flows, model selection, prompt engineering, vendor stack, pricing, and any related materials provided in writing, orally, or visually (the "Purpose").

2. DEFINITION OF CONFIDENTIAL INFORMATION
"Confidential Information" means any non-public information disclosed by the Disclosing Party, whether orally, in writing, or in any other form, that is designated as confidential or that reasonably should be understood to be confidential. This includes, but is not limited to:
  - Business plans, strategies, roadmaps, and forecasts
  - Software, source code, algorithms, models, and technical specifications
  - System architecture, data flows, integrations, and infrastructure
  - Customer lists, pipelines, pricing, and financial data
  - Trade secrets and proprietary processes
  - Any information related to the Project, AI matching systems, automation engines, or platform integrations

3. OBLIGATIONS OF RECEIVING PARTY
The Receiving Party agrees to:
  a) Hold all Confidential Information in strict confidence;
  b) Not disclose Confidential Information to any third party without prior written consent;
  c) Use Confidential Information solely for the Purpose defined above;
  d) Limit access to employees or contractors who have a need to know and are bound by equivalent confidentiality obligations;
  e) Promptly notify the Disclosing Party upon discovery of any unauthorized use or disclosure.

4. NO REVERSE ENGINEERING
The Receiving Party shall not, directly or indirectly, and shall not permit or authorize any third party to:
  a) Reverse engineer, decompile, disassemble, or otherwise attempt to derive the source code, models, prompts, architecture, algorithms, data schemas, training data, or trade secrets underlying any software, AI system, platform, prototype, demo, API, or other technology made available or described by the Disclosing Party;
  b) Recreate, replicate, clone, fork, or build a functionally or substantially similar product, service, agent, model, or platform based on, derived from, or informed by the Confidential Information, whether for the Receiving Party's own benefit or for the benefit of any third party;
  c) Use any Confidential Information to train, fine-tune, evaluate, benchmark, or improve any machine learning model, large language model, agent, or AI system other than as expressly authorized in writing by the Disclosing Party;
  d) Remove, alter, obscure, or circumvent any proprietary notices, watermarks, identifiers, telemetry, license keys, access controls, or technical protection measures contained in or applied to any materials, demonstrations, or environments provided by the Disclosing Party;
  e) Probe, scan, scrape, or test the vulnerability of any system, endpoint, or environment of the Disclosing Party, or attempt to gain unauthorized access to any system, account, or data.
This Section 4 shall survive termination or expiration of this Agreement and remains binding indefinitely with respect to trade secrets.

5. EXCLUSIONS
Confidential Information does not include information that:
  a) Is or becomes publicly available through no fault of the Receiving Party;
  b) Was already known to the Receiving Party prior to disclosure;
  c) Is independently developed by the Receiving Party without use of Confidential Information and without violation of Section 4 above;
  d) Is required to be disclosed by law or court order, provided prompt written notice is given.

6. TERM
This Agreement shall remain in effect for two (2) years from the Effective Date, or until the Confidential Information no longer qualifies as confidential, whichever occurs first. The obligations in Section 4 (No Reverse Engineering) survive termination or expiration.

7. RETURN OR DESTRUCTION OF INFORMATION
Upon written request or termination of this Agreement, the Receiving Party shall promptly return or destroy all Confidential Information, including copies, notes, or summaries.

8. NO LICENSE
Nothing in this Agreement grants the Receiving Party any rights in or to the Confidential Information except as expressly set forth herein. No license, express or implied, is granted to any patents, copyrights, trademarks, trade secrets, or other intellectual property of the Disclosing Party.

9. REMEDIES
The Receiving Party acknowledges that any breach may cause irreparable harm to the Disclosing Party, for which monetary damages would be inadequate. The Disclosing Party shall be entitled to seek equitable relief, including injunction and specific performance, in addition to all other remedies available at law.

10. GOVERNING LAW
This Agreement shall be governed by and construed in accordance with the laws of the State of Florida, USA, without regard to its conflict of law provisions.

11. ENTIRE AGREEMENT & ELECTRONIC EXECUTION
This Agreement constitutes the entire agreement between the parties with respect to its subject matter and supersedes all prior discussions relating to confidentiality. This Agreement is executed electronically. Electronic signatures captured herein are legally binding under the E-SIGN Act and UETA and constitute full acceptance of all terms above.`;

const NDA_TEMPLATE_ES = `ACUERDO DE CONFIDENCIALIDAD

Este Acuerdo de Confidencialidad ("Acuerdo") se celebra a partir de la Fecha de Vigencia firmada a continuacion entre:

  Parte Reveladora:  DIGIT2AI LLC (Florida, EE.UU.)
  Parte Receptora:   Identificada y firmada a continuacion

1. PROPOSITO
La Parte Receptora desea recibir cierta informacion confidencial de la Parte Reveladora con el proposito de discutir, evaluar y/o colaborar sobre los detalles tecnicos, arquitectura, logica de negocio, integraciones y metodologia propietaria de la solucion de software impulsada por IA referenciada como "{{PROJECT_NAME}}" (el "Proyecto"). El alcance de la divulgacion incluye, sin limitarse a, diseno del sistema, flujos de datos, seleccion de modelos, ingenieria de prompts, stack de proveedores, precios y cualquier material relacionado entregado por escrito, oralmente o de forma visual (el "Proposito").

2. DEFINICION DE INFORMACION CONFIDENCIAL
"Informacion Confidencial" significa cualquier informacion no publica revelada por la Parte Reveladora, ya sea oralmente, por escrito o en cualquier otra forma, que sea designada como confidencial o que razonablemente deba entenderse como confidencial. Esto incluye, sin limitarse a:
  - Planes de negocio, estrategias, hojas de ruta y proyecciones
  - Software, codigo fuente, algoritmos, modelos y especificaciones tecnicas
  - Arquitectura del sistema, flujos de datos, integraciones e infraestructura
  - Listas de clientes, pipelines, precios y datos financieros
  - Secretos comerciales y procesos propietarios
  - Cualquier informacion relacionada con el Proyecto, sistemas de matching con IA, motores de automatizacion o integraciones de la plataforma

3. OBLIGACIONES DE LA PARTE RECEPTORA
La Parte Receptora se obliga a:
  a) Mantener toda la Informacion Confidencial bajo estricta confidencialidad;
  b) No revelar la Informacion Confidencial a ningun tercero sin consentimiento previo por escrito;
  c) Utilizar la Informacion Confidencial unicamente para el Proposito definido anteriormente;
  d) Limitar el acceso a empleados o contratistas que tengan necesidad de conocer y que esten obligados por obligaciones equivalentes de confidencialidad;
  e) Notificar de inmediato a la Parte Reveladora al descubrir cualquier uso o divulgacion no autorizada.

4. PROHIBICION DE INGENIERIA INVERSA
La Parte Receptora no podra, directa o indirectamente, ni permitira o autorizara a ningun tercero a:
  a) Realizar ingenieria inversa, descompilar, desensamblar o intentar de cualquier forma derivar el codigo fuente, modelos, prompts, arquitectura, algoritmos, esquemas de datos, datos de entrenamiento o secretos comerciales subyacentes a cualquier software, sistema de IA, plataforma, prototipo, demo, API u otra tecnologia puesta a disposicion o descrita por la Parte Reveladora;
  b) Recrear, replicar, clonar, bifurcar o construir un producto, servicio, agente, modelo o plataforma funcionalmente o sustancialmente similar basado en, derivado de o informado por la Informacion Confidencial, ya sea en beneficio propio o de cualquier tercero;
  c) Utilizar cualquier Informacion Confidencial para entrenar, ajustar, evaluar, comparar o mejorar cualquier modelo de aprendizaje automatico, modelo de lenguaje grande, agente o sistema de IA, salvo autorizacion expresa por escrito de la Parte Reveladora;
  d) Eliminar, alterar, ocultar o eludir avisos de propiedad, marcas de agua, identificadores, telemetria, claves de licencia, controles de acceso o medidas de proteccion tecnica contenidas en o aplicadas a cualquier material, demostracion o entorno proporcionado por la Parte Reveladora;
  e) Sondear, escanear, raspar o probar la vulnerabilidad de cualquier sistema, endpoint o entorno de la Parte Reveladora, o intentar obtener acceso no autorizado a cualquier sistema, cuenta o dato.
Esta Seccion 4 sobrevivira la terminacion o expiracion de este Acuerdo y se mantendra vinculante indefinidamente respecto de los secretos comerciales.

5. EXCLUSIONES
La Informacion Confidencial no incluye informacion que:
  a) Sea o llegue a ser publicamente disponible sin culpa de la Parte Receptora;
  b) Ya era conocida por la Parte Receptora antes de la divulgacion;
  c) Sea desarrollada de forma independiente por la Parte Receptora sin uso de la Informacion Confidencial y sin violacion de la Seccion 4 anterior;
  d) Deba ser revelada por ley u orden judicial, siempre que se entregue aviso previo por escrito.

6. PLAZO
Este Acuerdo permanecera en vigor durante dos (2) anos a partir de la Fecha de Vigencia, o hasta que la Informacion Confidencial deje de ser confidencial, lo que ocurra primero. Las obligaciones de la Seccion 4 (Prohibicion de Ingenieria Inversa) sobreviven la terminacion o expiracion.

7. DEVOLUCION O DESTRUCCION DE LA INFORMACION
Previa solicitud por escrito o terminacion de este Acuerdo, la Parte Receptora devolvera o destruira de inmediato toda la Informacion Confidencial, incluidas copias, notas o resumenes.

8. SIN LICENCIA
Nada en este Acuerdo otorga a la Parte Receptora derecho alguno sobre la Informacion Confidencial salvo lo expresamente establecido en este documento. No se otorga ninguna licencia, expresa o implicita, sobre patentes, derechos de autor, marcas registradas, secretos comerciales u otra propiedad intelectual de la Parte Reveladora.

9. RECURSOS
La Parte Receptora reconoce que cualquier incumplimiento puede causar un dano irreparable a la Parte Reveladora, para el cual los danos monetarios serian inadecuados. La Parte Reveladora tendra derecho a buscar reparacion equitativa, incluyendo medidas cautelares y ejecucion especifica, ademas de todos los demas recursos disponibles por ley.

10. LEY APLICABLE
Este Acuerdo se regira e interpretara conforme a las leyes del Estado de Florida, EE.UU., sin tener en cuenta sus disposiciones sobre conflicto de leyes.

11. ACUERDO COMPLETO Y EJECUCION ELECTRONICA
Este Acuerdo constituye el acuerdo completo entre las partes respecto a su objeto y reemplaza todas las discusiones previas relacionadas con la confidencialidad. Este Acuerdo se ejecuta electronicamente. Las firmas electronicas capturadas en este documento son legalmente vinculantes bajo la Ley E-SIGN y UETA y constituyen la plena aceptacion de todos los terminos anteriores.`;

function buildNdaText(projectName, language) {
  const tpl = (language === 'es') ? NDA_TEMPLATE_ES : NDA_TEMPLATE_EN;
  const fallback = (language === 'es') ? 'el Proyecto' : 'the Project';
  return tpl.replace('{{PROJECT_NAME}}', projectName || fallback);
}

function normalizeLanguage(input) {
  const v = String(input || '').toLowerCase().trim();
  return v === 'es' ? 'es' : 'en';
}

function normEmail(e) { return (e || '').toString().trim().toLowerCase(); }

function safeRow(row) {
  if (!row) return null;
  const j = row.toJSON ? row.toJSON() : row;
  delete j.signed_ip;
  delete j.signed_user_agent;
  return j;
}

// =====================================================
// ADMIN ROUTER (authenticated — mounted under /api/v1/projects)
// =====================================================
const adminRouter = express.Router();

// POST /api/v1/projects/:id/nda-tokens
// Body: { email, name?, company?, title?, purpose?, language? }
adminRouter.post('/:id/nda-tokens', async (req, res) => {
  try {
    const { email, name, company, title, purpose, language } = req.body || {};
    if (!email) return res.status(400).json({ success: false, error: 'Stakeholder email required' });
    const project = await Project.findOne({ where: { id: req.params.id, workspace_id: 1 } });
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    const token = crypto.randomUUID();
    const expires_at = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days
    const row = await ProjectNda.create({
      workspace_id: 1,
      project_id: project.id,
      token,
      stakeholder_email: normEmail(email),
      stakeholder_name: name || null,
      stakeholder_company: company || null,
      stakeholder_title: title || null,
      language: normalizeLanguage(language),
      purpose: purpose || null,
      status: 'pending',
      created_by: req.user ? req.user.email : null,
      expires_at
    });
    await logActivity(
      req.user ? req.user.userId : null,
      'nda_token_created',
      'project',
      project.id,
      `${project.name} -> ${email}`
    );
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json({
      success: true,
      data: safeRow(row),
      share_url: `${baseUrl}/projects/nda/${token}`,
      expires_at
    });
  } catch (error) {
    console.error('[D2AI] NDA mint error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/projects/:id/nda-tokens — list all NDAs for a project
adminRouter.get('/:id/nda-tokens', async (req, res) => {
  try {
    const project = await Project.findOne({ where: { id: req.params.id, workspace_id: 1 } });
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    const rows = await ProjectNda.findAll({
      where: { project_id: project.id },
      order: [['created_at', 'DESC']]
    });
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const data = rows.map(r => {
      const j = safeRow(r);
      j.share_url = `${baseUrl}/projects/nda/${r.token}`;
      // Don't ship the signature blob in the list view (heavy + sensitive)
      if (j.signature_data) j.signature_data = j.signed_at ? '[signed]' : null;
      return j;
    });
    res.json({ success: true, data });
  } catch (error) {
    console.error('[D2AI] NDA list error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/projects/nda-tokens/:ndaId — admin fetch a single NDA (with signature)
adminRouter.get('/nda-tokens/:ndaId', async (req, res) => {
  try {
    const row = await ProjectNda.findOne({
      where: { id: req.params.ndaId, workspace_id: 1 }
    });
    if (!row) return res.status(404).json({ success: false, error: 'NDA not found' });
    res.json({ success: true, data: safeRow(row) });
  } catch (error) {
    console.error('[D2AI] NDA admin fetch error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/v1/projects/nda-tokens/:ndaId — revoke (only if unsigned)
adminRouter.delete('/nda-tokens/:ndaId', async (req, res) => {
  try {
    const row = await ProjectNda.findOne({
      where: { id: req.params.ndaId, workspace_id: 1 }
    });
    if (!row) return res.status(404).json({ success: false, error: 'NDA not found' });
    if (row.status === 'signed') {
      return res.status(400).json({ success: false, error: 'Cannot revoke a signed NDA' });
    }
    row.status = 'revoked';
    await row.save();
    await logActivity(
      req.user ? req.user.userId : null,
      'nda_token_revoked',
      'project',
      row.project_id,
      `${row.stakeholder_email}`
    );
    res.json({ success: true });
  } catch (error) {
    console.error('[D2AI] NDA revoke error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// PUBLIC ROUTER (no auth — mounted at /api/v1/projects/nda)
// =====================================================
const publicRouter = express.Router();

// GET /api/v1/projects/nda/:token — fetch context + template
publicRouter.get('/:token', async (req, res) => {
  try {
    const row = await ProjectNda.findOne({ where: { token: req.params.token } });
    if (!row) return res.status(404).json({ success: false, error: 'Invalid NDA link' });
    if (row.status === 'revoked') {
      return res.status(410).json({ success: false, error: 'This NDA link was revoked' });
    }
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return res.status(410).json({ success: false, error: 'This NDA link has expired' });
    }
    const project = await Project.findByPk(row.project_id);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    const lang = normalizeLanguage(row.language);
    const nda_text = row.nda_text || buildNdaText(project.name, lang);
    res.json({
      success: true,
      data: {
        id: row.id,
        token: row.token,
        status: row.status,
        language: lang,
        stakeholder_email: row.stakeholder_email,
        stakeholder_name: row.stakeholder_name,
        stakeholder_company: row.stakeholder_company,
        stakeholder_title: row.stakeholder_title,
        purpose: row.purpose,
        signed_at: row.signed_at,
        signature_data: row.status === 'signed' ? row.signature_data : null,
        nda_text,
        project: {
          id: project.id,
          name: project.name,
          code: project.code
        },
        disclosing: {
          company: 'DIGIT2AI LLC',
          jurisdiction: 'Florida, USA',
          signatory_name: 'Manuel Stagg',
          signatory_title: 'CEO'
        }
      }
    });
  } catch (error) {
    console.error('[D2AI] NDA public fetch error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/projects/nda/:token/sign
// Body: { email, name, company, title, signature_data, purpose? }
// Email must match the bound stakeholder_email (case-insensitive) to sign.
publicRouter.post('/:token/sign', async (req, res) => {
  try {
    const { email, name, company, title, signature_data, purpose } = req.body || {};
    if (!email) return res.status(400).json({ success: false, error: 'Email required' });
    if (!name || !title || !company) {
      return res.status(400).json({ success: false, error: 'Name, title, and company are required' });
    }
    if (!signature_data || !/^data:image\//.test(signature_data)) {
      return res.status(400).json({ success: false, error: 'Drawn signature required' });
    }
    const row = await ProjectNda.findOne({ where: { token: req.params.token } });
    if (!row) return res.status(404).json({ success: false, error: 'Invalid NDA link' });
    if (row.status === 'signed') {
      return res.status(400).json({ success: false, error: 'This NDA has already been signed' });
    }
    if (row.status === 'revoked') {
      return res.status(410).json({ success: false, error: 'This NDA link was revoked' });
    }
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return res.status(410).json({ success: false, error: 'This NDA link has expired' });
    }
    if (normEmail(email) !== normEmail(row.stakeholder_email)) {
      return res.status(403).json({ success: false, error: 'This NDA link is bound to a different email address.' });
    }
    const project = await Project.findByPk(row.project_id);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    row.stakeholder_name = name;
    row.stakeholder_company = company;
    row.stakeholder_title = title;
    if (purpose) row.purpose = purpose;
    row.signature_data = signature_data;
    // Freeze the language-specific template at sign-time so future template
    // edits cannot mutate an executed agreement.
    row.nda_text = buildNdaText(project.name, normalizeLanguage(row.language));
    row.signed_at = new Date();
    row.signed_ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim().slice(0, 64);
    row.signed_user_agent = (req.headers['user-agent'] || '').toString().slice(0, 1000);
    row.status = 'signed';
    await row.save();

    await logActivity(
      null,
      'nda_signed',
      'project',
      row.project_id,
      `${row.stakeholder_email} signed NDA`
    );

    res.json({
      success: true,
      data: {
        id: row.id,
        status: row.status,
        signed_at: row.signed_at,
        project_name: project.name
      }
    });
  } catch (error) {
    console.error('[D2AI] NDA sign error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = { adminRouter, publicRouter, buildNdaText };
