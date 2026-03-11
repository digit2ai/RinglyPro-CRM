import React, { useState, useRef, useEffect, useCallback } from 'react'

const DISCLOSING = {
  company: 'DIGIT2AI LLC',
  name: 'Manuel Stagg',
  title: 'CEO'
}

const LS_SIG_KEY = 'nda_disclosing_signature'
const LS_SIG_AT_KEY = 'nda_disclosing_signed_at'

const NDA_FULL_TEXT = `NON-DISCLOSURE AGREEMENT

This Non-Disclosure Agreement ("Agreement") is entered into as of the Effective Date signed below between:

  Disclosing Party: DIGIT2AI LLC (Florida, USA)
  Receiving Party:  As identified below; signing location geo-stamped at time of execution

1. PURPOSE
The Receiving Party wishes to receive certain confidential information from the Disclosing Party for the purpose specified herein, related to warehouse analytics, logistics platform, AI systems, and related services (the "Purpose").

2. DEFINITION OF CONFIDENTIAL INFORMATION
"Confidential Information" means any non-public information disclosed by the Disclosing Party, whether orally, in writing, or in any other form, that is designated as confidential or that reasonably should be understood to be confidential. This includes, but is not limited to:
  • Business plans, strategies, and forecasts
  • Software, source code, algorithms, and technical specifications
  • Customer lists, pricing, and financial data
  • Trade secrets and proprietary processes
  • Any information related to the RinglyPro platform, AI systems, or integrations

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
This Agreement constitutes the entire agreement between the parties with respect to its subject matter and supersedes all prior discussions relating to confidentiality. This Agreement is executed electronically. Electronic signatures captured herein are legally binding under the E-SIGN Act and UETA and constitute full acceptance of all terms above.`

// ── Signature Pad ─────────────────────────────────────────────────────────────
function SignaturePad({ label, locked, lockedDataUrl, onChange }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const lastPos = useRef(null)
  const [signed, setSigned] = useState(false)

  // Paint a saved dataUrl onto the canvas (locked pre-sign)
  useEffect(() => {
    if (!lockedDataUrl) return
    const canvas = canvasRef.current
    const img = new Image()
    img.onload = () => {
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
      setSigned(true)
    }
    img.src = lockedDataUrl
  }, [lockedDataUrl])

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect()
    const sx = canvas.width / rect.width
    const sy = canvas.height / rect.height
    const src = e.touches ? e.touches[0] : e
    return { x: (src.clientX - rect.left) * sx, y: (src.clientY - rect.top) * sy }
  }

  const startDraw = (e) => { if (locked) return; e.preventDefault(); drawing.current = true; lastPos.current = getPos(e, canvasRef.current) }
  const draw = (e) => {
    if (!drawing.current || locked) return; e.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const pos = getPos(e, canvas)
    ctx.beginPath(); ctx.moveTo(lastPos.current.x, lastPos.current.y)
    ctx.lineTo(pos.x, pos.y); ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 2.5
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke()
    lastPos.current = pos
  }
  const stopDraw = () => {
    if (!drawing.current) return; drawing.current = false; setSigned(true)
    onChange && onChange(canvasRef.current.toDataURL())
  }
  const clear = () => {
    if (locked) return
    const ctx = canvasRef.current.getContext('2d')
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    setSigned(false); onChange && onChange(null)
  }

  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-slate-300">{label}</label>
      <div className={`relative border-2 rounded-xl overflow-hidden bg-white ${
        locked ? 'border-blue-400/60' : signed ? 'border-emerald-400' : 'border-slate-400'
      }`}>
        <canvas ref={canvasRef} width={520} height={130}
          className={`w-full touch-none ${locked ? 'cursor-default' : 'cursor-crosshair'}`}
          style={{ display: 'block' }}
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw}
        />
        {!locked && (
          <div className="absolute bottom-2 right-2 flex items-center gap-2">
            {signed && <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>Signed
            </span>}
            <button type="button" onClick={clear} className="text-xs text-slate-400 hover:text-red-400 px-2 py-1 rounded border border-slate-200 bg-white/80">Clear</button>
          </div>
        )}
        {!signed && !locked && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><span className="text-slate-300 text-sm italic">Sign here</span></div>}
        {locked && <div className="absolute top-2 left-2"><span className="text-xs text-blue-600 font-medium bg-white/90 px-2 py-0.5 rounded border border-blue-200">Saved ✓</span></div>}
      </div>
    </div>
  )
}

// ── Geo Capture ────────────────────────────────────────────────────────────────
async function captureGeo() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      async ({ coords: { latitude: lat, longitude: lon } }) => {
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`, { headers: { 'Accept-Language': 'en' } })
          const d = await r.json(); const a = d.address || {}
          const city = a.city || a.town || a.village || a.county || ''
          const region = a.state || a.region || ''
          const country = a.country || ''
          resolve({ lat, lon, label: [city, region, country].filter(Boolean).join(', ') })
        } catch { resolve({ lat, lon, label: `${lat.toFixed(4)}, ${lon.toFixed(4)}` }) }
      },
      () => resolve(null),
      { timeout: 6000 }
    )
  })
}

function GeoStamp({ geo, loading }) {
  if (loading) return <span className="text-xs text-slate-400 flex items-center gap-1"><svg className="animate-spin w-3 h-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Detecting location...</span>
  if (!geo) return <span className="text-xs text-slate-500 italic">Location not captured</span>
  return <span className="text-xs text-emerald-400 flex items-center gap-1"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>{geo.label}</span>
}

// ── Signer Block ───────────────────────────────────────────────────────────────
function SignerBlock({ index, signer, onChange, onRemove, canRemove }) {
  const [geoLoading, setGeoLoading] = useState(false)

  const handleSig = async (data) => {
    onChange(index, 'signature', data)
    if (data && !signer.geo) {
      setGeoLoading(true)
      const geo = await captureGeo()
      onChange(index, 'geo', geo)
      setGeoLoading(false)
    }
  }

  return (
    <div className="card border border-slate-600 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-white">{index === 0 ? 'Primary Signer' : `Additional Signer ${index + 1}`}</h4>
        {canRemove && <button type="button" onClick={() => onRemove(index)} className="text-xs text-red-400 hover:text-red-300">Remove</button>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[['company', 'Company / Organization *', 'Company name', true], ['name', 'Full Name *', 'Full name', true], ['title', 'Title *', 'e.g. CEO, Director', true]].map(([field, lbl, ph, req]) => (
          <div key={field}>
            <label className="block text-xs font-medium text-slate-400 mb-1">{lbl}</label>
            <input type="text" className="w-full rounded-lg px-3 py-2 text-sm font-medium text-black bg-white border border-slate-300 focus:outline-none focus:border-blue-500"
              placeholder={ph} value={signer[field] || ''} onChange={e => onChange(index, field, e.target.value)} required={req} />
          </div>
        ))}
      </div>

      <SignaturePad label="Electronic Signature *" onChange={handleSig} />

      {signer.signed_at && (
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
          <span>Signed: <span className="text-slate-300">{new Date(signer.signed_at).toLocaleString()}</span></span>
          <GeoStamp geo={signer.geo} loading={geoLoading} />
        </div>
      )}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function NDAPage() {
  // ── Phase 1: Disclosing pre-signature (persisted in localStorage) ────────────
  const [savedSig, setSavedSig] = useState(() => localStorage.getItem(LS_SIG_KEY) || null)
  const [savedSigAt, setSavedSigAt] = useState(() => localStorage.getItem(LS_SIG_AT_KEY) || null)
  const [draftSig, setDraftSig] = useState(null)
  const [savingDisc, setSavingDisc] = useState(false)
  const [discSaved, setDiscSaved] = useState(false)

  const saveDisclosingSignature = () => {
    if (!draftSig) return
    setSavingDisc(true)
    const now = new Date().toISOString()
    localStorage.setItem(LS_SIG_KEY, draftSig)
    localStorage.setItem(LS_SIG_AT_KEY, now)
    setSavedSig(draftSig)
    setSavedSigAt(now)
    setSavingDisc(false)
    setDiscSaved(true)
    setTimeout(() => setDiscSaved(false), 3000)
  }

  const clearDisclosingSignature = () => {
    localStorage.removeItem(LS_SIG_KEY)
    localStorage.removeItem(LS_SIG_AT_KEY)
    setSavedSig(null)
    setSavedSigAt(null)
    setDraftSig(null)
  }

  // ── Phase 2: Receiving party ─────────────────────────────────────────────────
  const [purpose, setPurpose] = useState('')
  const [signers, setSigners] = useState([{ company: '', name: '', title: '', signature: null, signed_at: null, geo: null }])
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [ndaId, setNdaId] = useState(null)
  const [error, setError] = useState(null)
  const [showFull, setShowFull] = useState(false)

  const updateSigner = (idx, field, value) => {
    setSigners(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      if (field === 'signature' && value) next[idx].signed_at = new Date().toISOString()
      return next
    })
  }

  // Auto-submit when all signers have complete data
  const allSignersReady = signers.length > 0 && signers.every(s =>
    s.company?.trim() && s.name?.trim() && s.title?.trim() && s.signature
  )

  const doSubmit = useCallback(async (currentSigners) => {
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/pinaxis/api/v1/nda', {
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
          purpose: purpose || 'Warehouse analytics and logistics platform evaluation'
        })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to submit NDA')
      setNdaId(json.data?.id)
      setSubmitted(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }, [savedSig, savedSigAt, purpose])

  // Auto-fire when last signer draws signature and all fields complete
  useEffect(() => {
    if (allSignersReady && !submitting && !submitted) {
      // Small delay so geo capture can complete
      const t = setTimeout(() => doSubmit(signers), 800)
      return () => clearTimeout(t)
    }
  }, [allSignersReady, signers, submitting, submitted, doSubmit])

  const resetForm = () => {
    setSigners([{ company: '', name: '', title: '', signature: null, signed_at: null, geo: null }])
    setPurpose('')
    setSubmitted(false)
    setNdaId(null)
    setError(null)
  }

  // ── Success Screen ───────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16 animate-fade-in">
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">NDA Executed</h1>
        <p className="text-slate-400 mb-2">Recorded automatically upon signature completion.</p>
        {ndaId && <p className="text-xs text-slate-500 mb-8">Reference ID: <span className="font-mono text-slate-300">NDA-{String(ndaId).padStart(6, '0')}</span></p>}
        <div className="card text-left space-y-3 mb-8">
          <h3 className="text-sm font-semibold text-white">Summary</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-slate-500">Disclosing Party</p>
              <p className="text-slate-200">{DISCLOSING.company}</p>
              <p className="text-xs text-slate-400">{DISCLOSING.name}, {DISCLOSING.title}</p>
              {savedSigAt && <p className="text-xs text-slate-500 mt-1">Signed {new Date(savedSigAt).toLocaleDateString()}</p>}
            </div>
            <div>
              <p className="text-xs text-slate-500">Receiving Party ({signers.length} signer{signers.length > 1 ? 's' : ''})</p>
              {signers.map((s, i) => (
                <div key={i} className="mb-1">
                  <p className="text-slate-200">{s.name}</p>
                  <p className="text-xs text-slate-400">{s.title} · {s.company}</p>
                  {s.geo && <p className="text-xs text-emerald-400">{s.geo.label}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
        <button onClick={resetForm} className="btn-secondary">New NDA</button>
      </div>
    )
  }

  // ── Auto-submitting overlay ──────────────────────────────────────────────────
  if (submitting) {
    return (
      <div className="max-w-2xl mx-auto text-center py-24">
        <svg className="animate-spin w-12 h-12 text-blue-400 mx-auto mb-4" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-white font-semibold text-lg">Recording NDA...</p>
        <p className="text-slate-400 text-sm mt-2">Signature detected — saving to database.</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Non-Disclosure Agreement</h1>
        <p className="text-slate-400 mt-1 text-sm">
          NDA auto-records the moment all receiving party signatures are complete.
        </p>
      </div>

      {/* Agreement Terms */}
      <div className="card bg-slate-900/60 border border-slate-600">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            Agreement Terms
          </h2>
          <button type="button" onClick={() => setShowFull(p => !p)} className="text-xs text-blue-400 hover:text-blue-300">
            {showFull ? 'Collapse' : 'Read Full Agreement'}
          </button>
        </div>
        {showFull ? (
          <pre className="text-xs text-slate-300 whitespace-pre-wrap font-sans leading-relaxed max-h-80 overflow-y-auto pr-2">{NDA_FULL_TEXT}</pre>
        ) : (
          <div className="text-xs text-slate-400 leading-relaxed space-y-1">
            <p>Governs confidential exchange of information between <span className="text-slate-200 font-medium">DIGIT2AI LLC</span> and the Receiving Party.</p>
            <p className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
              <span>· 1-year term</span><span>· Florida law</span><span>· No license granted</span><span>· Equitable remedies</span><span>· E-SIGN / UETA compliant</span>
            </p>
          </div>
        )}
      </div>

      {/* Purpose */}
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-white">Purpose of Disclosure</h2>
        <textarea className="input-field w-full resize-none" rows={2}
          placeholder="Warehouse analytics evaluation, logistics platform partnership, etc."
          value={purpose} onChange={e => setPurpose(e.target.value)} />
      </div>

      {/* ── PHASE 1: Disclosing Party (Manuel pre-signs once) ─────────────────── */}
      <div className="card border border-blue-500/30 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-400" />
            <h2 className="text-sm font-semibold text-white">Disclosing Party</h2>
          </div>
          {savedSig
            ? <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                Signature saved
              </span>
            : <span className="text-xs text-amber-400">Sign once — persists across sessions</span>
          }
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[['Company', DISCLOSING.company], ['Name', DISCLOSING.name], ['Title', DISCLOSING.title]].map(([lbl, val]) => (
            <div key={lbl}>
              <label className="block text-xs font-medium text-slate-400 mb-1">{lbl}</label>
              <div className="input-field bg-slate-700/50 text-slate-200 text-sm">{val}</div>
            </div>
          ))}
        </div>

        {savedSig ? (
          <div className="space-y-2">
            <SignaturePad label="Your Saved Signature" locked lockedDataUrl={savedSig} />
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Saved {savedSigAt ? new Date(savedSigAt).toLocaleString() : ''} · Auto-included on every NDA
              </p>
              <button type="button" onClick={clearDisclosingSignature} className="text-xs text-red-400 hover:text-red-300">Clear & re-sign</button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <SignaturePad label="Sign here (Manuel Stagg)" onChange={setDraftSig} />
            <button
              type="button"
              onClick={saveDisclosingSignature}
              disabled={!draftSig || savingDisc}
              className="btn-primary flex items-center gap-2 text-sm px-4 py-2"
            >
              {discSaved
                ? <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>Signature Saved!</>
                : <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" /></svg>Save My Signature</>
              }
            </button>
            <p className="text-xs text-slate-500">Saves to this browser. Every future NDA will include it automatically — no re-signing needed.</p>
          </div>
        )}
      </div>

      {/* ── PHASE 2: Receiving Party (auto-submits on sign) ───────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <h2 className="text-sm font-semibold text-white">Receiving Party</h2>
          <span className="text-xs text-slate-500 ml-auto">NDA records automatically on signature</span>
        </div>

        {signers.map((signer, idx) => (
          <SignerBlock key={idx} index={idx} signer={signer}
            onChange={updateSigner} onRemove={(i) => setSigners(p => p.filter((_, x) => x !== i))}
            canRemove={signers.length > 1 && idx > 0} />
        ))}

        <button type="button"
          onClick={() => setSigners(p => [...p, { company: '', name: '', title: '', signature: null, signed_at: null, geo: null }])}
          className="btn-secondary flex items-center gap-2 text-sm">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          Add Another Signer
        </button>
      </div>

      {/* Status / Error */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm flex items-center gap-2">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
          {error}
        </div>
      )}

      {/* Info footer */}
      <div className="card bg-slate-900/40 border border-slate-700">
        <p className="text-xs text-slate-500 leading-relaxed">
          Electronic signatures are legally binding under the E-SIGN Act and UETA. The NDA is recorded automatically the moment all required fields and signatures are complete — no submit button required. Signing location is geo-stamped at time of signature.
        </p>
      </div>
    </div>
  )
}
