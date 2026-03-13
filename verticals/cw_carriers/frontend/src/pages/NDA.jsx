import React, { useState, useRef, useEffect, useCallback } from 'react';

const BASE = '/cw_carriers';

const DISCLOSING = {
  company: 'DIGIT2AI LLC',
  name: 'Manuel Stagg',
  title: 'CEO'
};

const LS_SIG_KEY = 'cw_nda_disclosing_signature';
const LS_SIG_AT_KEY = 'cw_nda_disclosing_signed_at';

const NDA_FULL_TEXT = `NON-DISCLOSURE AGREEMENT

This Non-Disclosure Agreement ("Agreement") is entered into as of the Effective Date signed below between:

  Disclosing Party: DIGIT2AI LLC (Florida, USA)
  Receiving Party:  As identified and signed below

1. PURPOSE
The Receiving Party wishes to receive certain confidential information from the Disclosing Party for the purpose specified herein, related to freight brokerage operations, carrier management, AI-powered logistics systems, rate intelligence, and related services (the "Purpose").

2. DEFINITION OF CONFIDENTIAL INFORMATION
"Confidential Information" means any non-public information disclosed by the Disclosing Party, whether orally, in writing, or in any other form, that is designated as confidential or that reasonably should be understood to be confidential. This includes, but is not limited to:
  • Business plans, strategies, and forecasts
  • Software, source code, algorithms, and technical specifications
  • Customer lists, carrier networks, pricing, and financial data
  • Trade secrets and proprietary processes
  • Any information related to the CW Carriers platform, AI matching systems, rate intelligence, or integrations

3. OBLIGATIONS OF RECEIVING PARTY
The Receiving Party agrees to:
  a) Hold all Confidential Information in strict confidence;
  b) Not disclose Confidential Information to any third party without prior written consent;
  c) Use Confidential Information solely for the Purpose defined above;
  d) Limit access to employees or contractors who have a need to know and are bound by equivalent confidentiality obligations;
  e) Promptly notify the Disclosing Party upon discovery of any unauthorized use or disclosure.

4. EXCLUSIONS
Confidential Information does not include information that:
  a) Is or becomes publicly available through no fault of the Receiving Party;
  b) Was already known to the Receiving Party prior to disclosure;
  c) Is independently developed by the Receiving Party without use of Confidential Information;
  d) Is required to be disclosed by law or court order, provided prompt written notice is given.

5. TERM
This Agreement shall remain in effect for one (1) year from the Effective Date, or until the Confidential Information no longer qualifies as confidential, whichever occurs first.

6. RETURN OR DESTRUCTION OF INFORMATION
Upon written request or termination of this Agreement, the Receiving Party shall promptly return or destroy all Confidential Information, including copies, notes, or summaries.

7. NO LICENSE
Nothing in this Agreement grants the Receiving Party any rights in or to the Confidential Information except as expressly set forth herein.

8. REMEDIES
The Receiving Party acknowledges that any breach may cause irreparable harm to the Disclosing Party, for which monetary damages would be inadequate. The Disclosing Party shall be entitled to seek equitable relief, including injunction and specific performance, in addition to all other remedies available at law.

9. GOVERNING LAW
This Agreement shall be governed by and construed in accordance with the laws of the State of Florida, USA, without regard to its conflict of law provisions.

10. ENTIRE AGREEMENT & ELECTRONIC EXECUTION
This Agreement constitutes the entire agreement between the parties with respect to its subject matter and supersedes all prior discussions relating to confidentiality. This Agreement is executed electronically. Electronic signatures captured herein are legally binding under the E-SIGN Act and UETA and constitute full acceptance of all terms above.`;

async function saveSignatureToDB({ signerRole, company, name, title, signatureData, signedAt }) {
  const res = await fetch(`${BASE}/api/nda/signatures`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      signer_role: signerRole, company, name, title,
      signature_data: signatureData, signed_at: signedAt || new Date().toISOString()
    })
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Save failed');
  return json.data;
}

// ── Signature Pad ─────────────────────────────────────────────────────────────
function SignaturePad({ label, locked, lockedDataUrl, onChange, onSaveToDB, saveLabel }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const lastPos = useRef(null);
  const [signed, setSigned] = useState(false);
  const [dbSaving, setDbSaving] = useState(false);
  const [dbSaved, setDbSaved] = useState(false);
  const currentData = useRef(null);

  useEffect(() => {
    if (!lockedDataUrl) return;
    const canvas = canvasRef.current;
    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      setSigned(true);
    };
    img.src = lockedDataUrl;
  }, [lockedDataUrl]);

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * sx, y: (src.clientY - rect.top) * sy };
  };

  const startDraw = (e) => { if (locked) return; e.preventDefault(); drawing.current = true; lastPos.current = getPos(e, canvasRef.current); };
  const draw = (e) => {
    if (!drawing.current || locked) return; e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const pos = getPos(e, canvas);
    ctx.beginPath(); ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y); ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 2.5;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
    lastPos.current = pos;
  };
  const stopDraw = () => {
    if (!drawing.current) return; drawing.current = false; setSigned(true);
    const data = canvasRef.current.toDataURL();
    currentData.current = data;
    onChange && onChange(data);
  };
  const clear = () => {
    if (locked) return;
    const ctx = canvasRef.current.getContext('2d');
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setSigned(false); setDbSaved(false); currentData.current = null; onChange && onChange(null);
  };

  const handleSaveToDB = async () => {
    if (!currentData.current || !onSaveToDB) return;
    setDbSaving(true);
    try { await onSaveToDB(currentData.current); setDbSaved(true); } catch { /* silent */ } finally { setDbSaving(false); }
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <label style={S.label}>{label}</label>
      <div style={{ ...S.sigBox, borderColor: locked ? '#0EA5E9' : signed ? '#22C55E' : '#30363D' }}>
        <canvas ref={canvasRef} width={520} height={130}
          style={{ display: 'block', width: '100%', cursor: locked ? 'default' : 'crosshair', touchAction: 'none' }}
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw}
        />
        {!locked && (
          <div style={{ position: 'absolute', bottom: 8, right: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            {signed && <span style={{ fontSize: 11, color: '#22C55E', fontWeight: 600 }}>Signed</span>}
            <button type="button" onClick={clear} style={S.clearBtn}>Clear</button>
          </div>
        )}
        {signed && onSaveToDB && !locked && (
          <div style={{ position: 'absolute', bottom: 8, left: 8 }}>
            {dbSaved ? (
              <span style={{ fontSize: 11, color: '#22C55E', fontWeight: 600, background: 'rgba(255,255,255,0.9)', padding: '3px 8px', borderRadius: 4 }}>Saved to database</span>
            ) : (
              <button type="button" onClick={handleSaveToDB} disabled={dbSaving}
                style={{ ...S.saveBtn, opacity: dbSaving ? 0.6 : 1 }}>
                {dbSaving ? 'Saving...' : (saveLabel || 'Save My Signature')}
              </button>
            )}
          </div>
        )}
        {!signed && !locked && <div style={S.sigPlaceholder}>Sign here</div>}
        {locked && <div style={{ position: 'absolute', top: 8, left: 8 }}><span style={{ fontSize: 11, color: '#0EA5E9', fontWeight: 600, background: 'rgba(255,255,255,0.9)', padding: '2px 8px', borderRadius: 4 }}>Saved</span></div>}
      </div>
    </div>
  );
}

// ── Signer Block ───────────────────────────────────────────────────────────────
function SignerBlock({ index, signer, onChange, onRemove, canRemove }) {
  const handleSig = (data) => onChange(index, 'signature', data);

  return (
    <div style={S.signerCard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h4 style={{ fontSize: 14, fontWeight: 600, color: '#E6EDF3' }}>{index === 0 ? 'Primary Signer' : `Additional Signer ${index + 1}`}</h4>
        {canRemove && <button type="button" onClick={() => onRemove(index)} style={{ fontSize: 12, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}>Remove</button>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
        {[['company', 'Company / Organization *', 'Company name'], ['name', 'Full Name *', 'Full name'], ['title', 'Title *', 'e.g. CEO, Director']].map(([field, lbl, ph]) => (
          <div key={field}>
            <label style={S.label}>{lbl}</label>
            <input type="text" style={S.input} placeholder={ph} value={signer[field] || ''} onChange={e => onChange(index, field, e.target.value)} />
          </div>
        ))}
      </div>

      <SignaturePad label="Electronic Signature *" onChange={handleSig}
        onSaveToDB={(data) => saveSignatureToDB({
          signerRole: 'receiving', company: signer.company, name: signer.name,
          title: signer.title, signatureData: data, signedAt: signer.signed_at
        })}
      />

      {signer.signed_at && (
        <p style={{ fontSize: 11, color: '#8B949E' }}>
          Signed: <span style={{ color: '#E6EDF3' }}>{new Date(signer.signed_at).toLocaleString()}</span>
        </p>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function NDA() {
  const [savedSig, setSavedSig] = useState(() => localStorage.getItem(LS_SIG_KEY) || null);
  const [savedSigAt, setSavedSigAt] = useState(() => localStorage.getItem(LS_SIG_AT_KEY) || null);

  const clearDisclosingSignature = () => {
    localStorage.removeItem(LS_SIG_KEY);
    localStorage.removeItem(LS_SIG_AT_KEY);
    setSavedSig(null);
    setSavedSigAt(null);
  };

  const [purpose, setPurpose] = useState('');
  const [signers, setSigners] = useState([{ company: '', name: '', title: '', signature: null, signed_at: null }]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [ndaId, setNdaId] = useState(null);
  const [error, setError] = useState(null);
  const [showFull, setShowFull] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const updateSigner = (idx, field, value) => {
    setSigners(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      if (field === 'signature' && value) next[idx].signed_at = new Date().toISOString();
      return next;
    });
  };

  const allSignersReady = signers.length > 0 && signers.every(s =>
    s.company?.trim() && s.name?.trim() && s.title?.trim() && s.signature
  );

  const doSubmit = useCallback(async (currentSigners) => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${BASE}/api/nda`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          disclosing_company: DISCLOSING.company,
          disclosing_name: DISCLOSING.name,
          disclosing_title: DISCLOSING.title,
          disclosing_signature: savedSig,
          disclosing_signed_at: savedSigAt || new Date().toISOString(),
          receiving_signers: currentSigners.map(s => ({ ...s, signed_at: s.signed_at || new Date().toISOString() })),
          nda_text: NDA_FULL_TEXT,
          purpose: purpose || 'Freight brokerage operations and carrier management platform evaluation'
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to submit NDA');
      setNdaId(json.data?.id);
      setSubmitted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }, [savedSig, savedSigAt, purpose]);

  useEffect(() => {
    if (allSignersReady && !submitting && !submitted) {
      const t = setTimeout(() => doSubmit(signers), 800);
      return () => clearTimeout(t);
    }
  }, [allSignersReady, signers, submitting, submitted, doSubmit]);

  const resetForm = () => {
    setSigners([{ company: '', name: '', title: '', signature: null, signed_at: null }]);
    setPurpose('');
    setSubmitted(false);
    setNdaId(null);
    setError(null);
  };

  const deleteTestRecord = async () => {
    if (!ndaId) return resetForm();
    setDeleting(true);
    try {
      await fetch(`${BASE}/api/nda/${ndaId}`, { method: 'DELETE' });
      clearDisclosingSignature();
      resetForm();
    } catch { resetForm(); } finally { setDeleting(false); }
  };

  // ── Success Screen ───────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center', padding: '60px 0' }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#22C55E22', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </div>
        <h1 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, color: '#E6EDF3', letterSpacing: 2, marginBottom: 8 }}>NDA EXECUTED</h1>
        <p style={{ color: '#8B949E', fontSize: 14, marginBottom: 4 }}>Recorded automatically upon signature completion.</p>
        {ndaId && <p style={{ fontSize: 12, color: '#8B949E', marginBottom: 24 }}>Reference ID: <span style={{ fontFamily: 'monospace', color: '#E6EDF3' }}>NDA-{String(ndaId).padStart(6, '0')}</span></p>}

        <div style={S.card}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#E6EDF3', marginBottom: 12 }}>Summary</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, textAlign: 'left' }}>
            <div>
              <p style={{ fontSize: 10, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1 }}>Disclosing Party</p>
              <p style={{ fontSize: 14, color: '#E6EDF3', marginTop: 4 }}>{DISCLOSING.company}</p>
              <p style={{ fontSize: 12, color: '#8B949E' }}>{DISCLOSING.name}, {DISCLOSING.title}</p>
              {savedSigAt && <p style={{ fontSize: 11, color: '#8B949E', marginTop: 4 }}>Signed {new Date(savedSigAt).toLocaleDateString()}</p>}
            </div>
            <div>
              <p style={{ fontSize: 10, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1 }}>Receiving Party ({signers.length} signer{signers.length > 1 ? 's' : ''})</p>
              {signers.map((s, i) => (
                <div key={i} style={{ marginTop: 4 }}>
                  <p style={{ fontSize: 14, color: '#E6EDF3' }}>{s.name}</p>
                  <p style={{ fontSize: 12, color: '#8B949E' }}>{s.title} · {s.company}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 20 }}>
          <button onClick={resetForm} style={S.btnSecondary}>New NDA</button>
          <button onClick={deleteTestRecord} disabled={deleting}
            style={{ ...S.btnSecondary, borderColor: '#EF444466', color: '#EF4444', opacity: deleting ? 0.5 : 1 }}>
            {deleting ? 'Deleting...' : 'Delete test record & clear signature'}
          </button>
        </div>
        <p style={{ fontSize: 11, color: '#8B949E', marginTop: 8 }}>Delete removes this NDA from the database and clears your saved signature — use after testing.</p>
      </div>
    );
  }

  // ── Submitting overlay ──────────────────────────────────────────────────────
  if (submitting) {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center', padding: '80px 0' }}>
        <div style={{ width: 48, height: 48, border: '3px solid #0EA5E944', borderTopColor: '#0EA5E9', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ fontSize: 18, fontWeight: 600, color: '#E6EDF3' }}>Recording NDA...</p>
        <p style={{ fontSize: 13, color: '#8B949E', marginTop: 6 }}>Signature detected — saving to database.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, color: '#0EA5E9', letterSpacing: 2 }}>NON-DISCLOSURE AGREEMENT</h1>
          <div style={{ padding: '4px 12px', background: '#0EA5E922', color: '#0EA5E9', borderRadius: 12, fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>E-SIGN</div>
        </div>
        <p style={{ color: '#8B949E', fontSize: 13, marginTop: 4 }}>NDA auto-records the moment all receiving party signatures are complete.</p>
      </div>

      {/* Agreement Terms */}
      <div style={{ ...S.card, marginBottom: 20, borderColor: '#30363D' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#E6EDF3' }}>Agreement Terms</h2>
          <button type="button" onClick={() => setShowFull(p => !p)} style={{ fontSize: 12, color: '#0EA5E9', background: 'none', border: 'none', cursor: 'pointer' }}>
            {showFull ? 'Collapse' : 'Read Full Agreement'}
          </button>
        </div>
        {showFull ? (
          <pre style={{ fontSize: 12, color: '#E6EDF3', whiteSpace: 'pre-wrap', fontFamily: "'DM Sans',sans-serif", lineHeight: 1.6, maxHeight: 320, overflowY: 'auto', paddingRight: 8 }}>{NDA_FULL_TEXT}</pre>
        ) : (
          <div style={{ fontSize: 12, color: '#8B949E', lineHeight: 1.6 }}>
            <p>Governs confidential exchange of information between <span style={{ color: '#E6EDF3', fontWeight: 600 }}>DIGIT2AI LLC</span> and the Receiving Party.</p>
            <p style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: '0 16px' }}>
              <span>· 1-year term</span><span>· Florida law</span><span>· No license granted</span><span>· Equitable remedies</span><span>· E-SIGN / UETA compliant</span>
            </p>
          </div>
        )}
      </div>

      {/* Purpose */}
      <div style={{ ...S.card, marginBottom: 20 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: '#E6EDF3', marginBottom: 8 }}>Purpose of Disclosure</h2>
        <textarea style={{ ...S.input, resize: 'none', height: 56 }} rows={2}
          placeholder="Freight brokerage evaluation, carrier management partnership, etc."
          value={purpose} onChange={e => setPurpose(e.target.value)} />
      </div>

      {/* PHASE 1: Disclosing Party */}
      <div style={{ ...S.card, marginBottom: 20, borderColor: '#0EA5E944' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#0EA5E9' }} />
            <h2 style={{ fontSize: 14, fontWeight: 600, color: '#E6EDF3' }}>Disclosing Party</h2>
          </div>
          {savedSig
            ? <span style={{ fontSize: 11, color: '#22C55E', fontWeight: 600 }}>Signature saved</span>
            : <span style={{ fontSize: 11, color: '#F59E0B' }}>Sign once — persists across sessions</span>
          }
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
          {[['Company', DISCLOSING.company], ['Name', DISCLOSING.name], ['Title', DISCLOSING.title]].map(([lbl, val]) => (
            <div key={lbl}>
              <label style={S.label}>{lbl}</label>
              <div style={{ ...S.input, background: '#21262D', color: '#E6EDF3' }}>{val}</div>
            </div>
          ))}
        </div>

        {savedSig ? (
          <div>
            <SignaturePad label="Your Saved Signature" locked lockedDataUrl={savedSig} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontSize: 11, color: '#8B949E' }}>
                Saved {savedSigAt ? new Date(savedSigAt).toLocaleString() : ''} · Auto-included on every NDA
              </p>
              <button type="button" onClick={clearDisclosingSignature} style={{ fontSize: 11, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}>Clear & re-sign</button>
            </div>
          </div>
        ) : (
          <div>
            <SignaturePad label="Sign here (Manuel Stagg)"
              onSaveToDB={async (data) => {
                await saveSignatureToDB({
                  signerRole: 'disclosing', company: DISCLOSING.company,
                  name: DISCLOSING.name, title: DISCLOSING.title,
                  signatureData: data, signedAt: new Date().toISOString()
                });
                const now = new Date().toISOString();
                localStorage.setItem(LS_SIG_KEY, data);
                localStorage.setItem(LS_SIG_AT_KEY, now);
                setSavedSig(data);
                setSavedSigAt(now);
              }}
              saveLabel="Save My Signature"
            />
            <p style={{ fontSize: 11, color: '#8B949E' }}>Saves to database and this browser. Every future NDA will include it automatically — no re-signing needed.</p>
          </div>
        )}
      </div>

      {/* PHASE 2: Receiving Party */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E' }} />
            <h2 style={{ fontSize: 14, fontWeight: 600, color: '#E6EDF3' }}>Receiving Party</h2>
          </div>
          <span style={{ fontSize: 11, color: '#8B949E' }}>NDA records automatically on signature</span>
        </div>

        {signers.map((signer, idx) => (
          <SignerBlock key={idx} index={idx} signer={signer}
            onChange={updateSigner} onRemove={(i) => setSigners(p => p.filter((_, x) => x !== i))}
            canRemove={signers.length > 1 && idx > 0} />
        ))}

        <button type="button"
          onClick={() => setSigners(p => [...p, { company: '', name: '', title: '', signature: null, signed_at: null }])}
          style={S.btnSecondary}>
          + Add Another Signer
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: 14, background: '#EF444422', border: '1px solid #EF444466', borderRadius: 8, color: '#EF4444', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Info footer */}
      <div style={{ ...S.card, background: '#0D1117', borderColor: '#21262D' }}>
        <p style={{ fontSize: 11, color: '#8B949E', lineHeight: 1.6 }}>
          Electronic signatures are legally binding under the E-SIGN Act and UETA. The NDA is recorded automatically the moment all required fields and signatures are complete — no submit button required.
        </p>
      </div>
    </div>
  );
}

const S = {
  card: { background: '#161B22', border: '1px solid #21262D', borderRadius: 12, padding: 20 },
  label: { display: 'block', fontSize: 10, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, fontWeight: 600 },
  input: { width: '100%', padding: '9px 12px', background: '#0D1117', border: '1px solid #30363D', borderRadius: 6, color: '#E6EDF3', fontSize: 13, outline: 'none', fontFamily: "'DM Sans',sans-serif" },
  sigBox: { position: 'relative', border: '2px solid #30363D', borderRadius: 10, overflow: 'hidden', background: '#fff' },
  sigPlaceholder: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', color: '#94a3b8', fontSize: 13, fontStyle: 'italic' },
  clearBtn: { fontSize: 11, color: '#8B949E', background: 'rgba(255,255,255,0.85)', border: '1px solid #d1d5db', borderRadius: 4, padding: '3px 8px', cursor: 'pointer' },
  saveBtn: { fontSize: 11, fontWeight: 600, background: '#0EA5E9', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer' },
  signerCard: { background: '#161B22', border: '1px solid #30363D', borderRadius: 10, padding: 20, marginBottom: 12 },
  btnSecondary: { padding: '9px 18px', background: 'none', border: '1px solid #30363D', borderRadius: 8, color: '#8B949E', fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" },
};
