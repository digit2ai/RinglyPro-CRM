import React, { useState, useRef, useEffect } from 'react'

const DISCLOSING = {
  company: 'DIGIT2AI LLC',
  name: 'Manuel Stagg',
  title: 'CEO'
}

const NDA_FULL_TEXT = `NON-DISCLOSURE AGREEMENT

This Non-Disclosure Agreement ("Agreement") is entered into as of the date signed below between DIGIT2AI LLC ("Disclosing Party") and the undersigned Receiving Party ("Receiving Party").

1. PURPOSE. The Receiving Party wishes to receive certain confidential information from the Disclosing Party for the purpose of evaluating a potential business relationship related to warehouse analytics, logistics platform, and related services.

2. CONFIDENTIAL INFORMATION. "Confidential Information" means any non-public information disclosed by the Disclosing Party, whether orally, in writing, or in any other form, including but not limited to: business plans, software, source code, algorithms, customer data, pricing, financial data, trade secrets, and proprietary processes.

3. OBLIGATIONS. The Receiving Party agrees to: (a) hold all Confidential Information in strict confidence; (b) not disclose it to any third party without prior written consent; (c) use it solely for the Purpose above; (d) limit access to employees or contractors who have a need to know.

4. EXCLUSIONS. Confidential Information does not include information that is publicly available through no fault of the Receiving Party, was already known prior to disclosure, or is independently developed without use of Confidential Information.

5. TERM. This Agreement shall remain in effect for three (3) years from the date of execution.

6. RETURN OR DESTRUCTION. Upon written request, the Receiving Party shall promptly return or destroy all Confidential Information.

7. REMEDIES. Any breach may cause irreparable harm. The Disclosing Party is entitled to seek equitable relief in addition to all other remedies available at law.

8. GOVERNING LAW. This Agreement is governed by the laws of the State of Florida, USA.

9. ENTIRE AGREEMENT. This Agreement constitutes the entire agreement between the parties with respect to confidentiality and supersedes all prior discussions.

10. NDA EXECUTION. This Agreement is executed electronically. Electronic signatures captured herein are legally binding and constitute acceptance of all terms above.`

// ── Signature Pad ─────────────────────────────────────────────────────────────
function SignaturePad({ label, locked, lockedValue, onChange }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const lastPos = useRef(null)
  const [signed, setSigned] = useState(false)

  useEffect(() => {
    if (locked && lockedValue) {
      const canvas = canvasRef.current
      const img = new Image()
      img.onload = () => {
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0)
      }
      img.src = lockedValue
      setSigned(true)
    }
  }, [locked, lockedValue])

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if (e.touches) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY
      }
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    }
  }

  const startDraw = (e) => {
    if (locked) return
    e.preventDefault()
    drawing.current = true
    const canvas = canvasRef.current
    lastPos.current = getPos(e, canvas)
  }

  const draw = (e) => {
    if (!drawing.current || locked) return
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const pos = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(lastPos.current.x, lastPos.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
    lastPos.current = pos
  }

  const stopDraw = (e) => {
    if (!drawing.current) return
    drawing.current = false
    setSigned(true)
    const data = canvasRef.current.toDataURL()
    onChange(data)
  }

  const clear = () => {
    if (locked) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setSigned(false)
    onChange(null)
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-300">{label}</label>
      <div className={`relative border-2 rounded-xl overflow-hidden bg-white ${
        locked ? 'border-slate-300 opacity-80' : signed ? 'border-emerald-400' : 'border-slate-400'
      }`}>
        <canvas
          ref={canvasRef}
          width={520}
          height={130}
          className="w-full cursor-crosshair touch-none"
          style={{ display: 'block' }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={stopDraw}
          onMouseLeave={stopDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={stopDraw}
        />
        {!locked && (
          <div className="absolute bottom-2 right-2 flex items-center gap-2">
            {signed && (
              <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Signed
              </span>
            )}
            <button
              type="button"
              onClick={clear}
              className="text-xs text-slate-400 hover:text-red-400 px-2 py-1 rounded border border-slate-200 bg-white/80"
            >
              Clear
            </button>
          </div>
        )}
        {!signed && !locked && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-slate-300 text-sm italic">Sign here</span>
          </div>
        )}
        {locked && (
          <div className="absolute top-2 right-2">
            <span className="text-xs text-emerald-600 font-medium bg-white/80 px-2 py-0.5 rounded">
              Pre-signed
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Signer Block ───────────────────────────────────────────────────────────────
function SignerBlock({ index, signer, onChange, onRemove, canRemove }) {
  const handleSig = (data) => onChange(index, 'signature', data)

  return (
    <div className="card border border-slate-600 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-white">
          {index === 0 ? 'Primary Signer' : `Additional Signer ${index + 1}`}
        </h4>
        {canRemove && (
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="text-xs text-red-400 hover:text-red-300"
          >
            Remove
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Full Name *</label>
          <input
            type="text"
            className="w-full rounded-lg px-3 py-2 text-sm font-medium text-black bg-white border border-slate-300 focus:outline-none focus:border-blue-500"
            placeholder="Full name"
            value={signer.name}
            onChange={e => onChange(index, 'name', e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Title *</label>
          <input
            type="text"
            className="w-full rounded-lg px-3 py-2 text-sm font-medium text-black bg-white border border-slate-300 focus:outline-none focus:border-blue-500"
            placeholder="e.g. CEO, Director, VP Sales"
            value={signer.title}
            onChange={e => onChange(index, 'title', e.target.value)}
            required
          />
        </div>
      </div>

      <SignaturePad
        label="Electronic Signature *"
        onChange={handleSig}
      />

      {signer.signed_at && (
        <p className="text-xs text-slate-500">
          Signed at: <span className="text-slate-300">{new Date(signer.signed_at).toLocaleString()}</span>
        </p>
      )}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function NDAPage() {
  const disclosingSigned_at = useRef(new Date().toISOString())
  const [disclosingSignature, setDisclosingSignature] = useState(null)
  const [purpose, setPurpose] = useState('')

  const [signers, setSigners] = useState([
    { name: '', title: '', signature: null, signed_at: null }
  ])

  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [ndaId, setNdaId] = useState(null)
  const [error, setError] = useState(null)
  const [showFull, setShowFull] = useState(false)

  const updateSigner = (idx, field, value) => {
    setSigners(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      // Auto-stamp time when signature is added
      if (field === 'signature' && value) {
        next[idx].signed_at = new Date().toISOString()
      }
      return next
    })
  }

  const addSigner = () => {
    setSigners(prev => [...prev, { name: '', title: '', signature: null, signed_at: null }])
  }

  const removeSigner = (idx) => {
    setSigners(prev => prev.filter((_, i) => i !== idx))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    // Validate
    for (let i = 0; i < signers.length; i++) {
      if (!signers[i].name.trim()) return setError(`Signer ${i + 1}: Name is required`)
      if (!signers[i].title.trim()) return setError(`Signer ${i + 1}: Title is required`)
      if (!signers[i].signature) return setError(`Signer ${i + 1}: Signature is required`)
    }

    setSubmitting(true)
    try {
      const res = await fetch('/pinaxis/api/v1/nda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          disclosing_company: DISCLOSING.company,
          disclosing_name: DISCLOSING.name,
          disclosing_title: DISCLOSING.title,
          disclosing_signature: disclosingSignature,
          disclosing_signed_at: disclosingSigned_at.current,
          receiving_signers: signers.map(s => ({
            ...s,
            signed_at: s.signed_at || new Date().toISOString()
          })),
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
  }

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">NDA Signed Successfully</h1>
        <p className="text-slate-400 mb-2">
          The Non-Disclosure Agreement has been executed and stored securely.
        </p>
        {ndaId && (
          <p className="text-xs text-slate-500 mb-8">Reference ID: <span className="font-mono text-slate-300">NDA-{String(ndaId).padStart(6, '0')}</span></p>
        )}
        <div className="card text-left space-y-3 mb-8">
          <h3 className="text-sm font-semibold text-white">Summary</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-slate-500">Disclosing Party</p>
              <p className="text-slate-200">{DISCLOSING.company}</p>
              <p className="text-xs text-slate-400">{DISCLOSING.name}, {DISCLOSING.title}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Receiving Party ({signers.length} signer{signers.length > 1 ? 's' : ''})</p>
              {signers.map((s, i) => (
                <div key={i}>
                  <p className="text-slate-200">{s.name}</p>
                  <p className="text-xs text-slate-400">{s.title}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        <button
          onClick={() => { setSubmitted(false); setSigners([{ name: '', title: '', signature: null, signed_at: null }]); setPurpose('') }}
          className="btn-secondary"
        >
          Create Another NDA
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Non-Disclosure Agreement</h1>
        <p className="text-slate-400 mt-1 text-sm">
          Electronic execution — legally binding upon signature by all parties.
        </p>
      </div>

      {/* NDA Text Preview */}
      <div className="card bg-slate-900/60 border border-slate-600">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            Agreement Terms
          </h2>
          <button
            type="button"
            onClick={() => setShowFull(p => !p)}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            {showFull ? 'Collapse' : 'Read Full Agreement'}
          </button>
        </div>

        {showFull ? (
          <pre className="text-xs text-slate-300 whitespace-pre-wrap font-sans leading-relaxed max-h-80 overflow-y-auto pr-2">
            {NDA_FULL_TEXT}
          </pre>
        ) : (
          <p className="text-xs text-slate-400 leading-relaxed">
            This NDA governs the confidential exchange of information between DIGIT2AI LLC and the Receiving Party. Covers a 3-year term, governed by Florida law. Click "Read Full Agreement" to view all 10 sections.
          </p>
        )}
      </div>

      {/* Purpose */}
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-white">Purpose of Disclosure</h2>
        <textarea
          className="input-field w-full resize-none"
          rows={2}
          placeholder="Warehouse analytics evaluation, logistics platform partnership, etc."
          value={purpose}
          onChange={e => setPurpose(e.target.value)}
        />
      </div>

      {/* Disclosing Party */}
      <div className="card border border-blue-500/30 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-400" />
          <h2 className="text-sm font-semibold text-white">Disclosing Party</h2>
          <span className="text-xs text-blue-400 ml-auto">Pre-filled — DIGIT2AI LLC</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Company</label>
            <div className="input-field bg-slate-700/50 text-slate-200 text-sm">{DISCLOSING.company}</div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Name</label>
            <div className="input-field bg-slate-700/50 text-slate-200 text-sm">{DISCLOSING.name}</div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Title</label>
            <div className="input-field bg-slate-700/50 text-slate-200 text-sm">{DISCLOSING.title}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
          <SignaturePad
            label="Signature (Manuel Stagg — optional pre-sign)"
            onChange={setDisclosingSignature}
          />
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Date &amp; Time Signed</label>
            <div className="input-field bg-slate-700/50 text-slate-300 text-sm">
              {new Date(disclosingSigned_at.current).toLocaleString('en-US', {
                year: 'numeric', month: 'long', day: 'numeric',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
                timeZoneName: 'short'
              })}
            </div>
            <p className="text-xs text-slate-500 mt-1">Auto-captured at page load</p>
          </div>
        </div>
      </div>

      {/* Receiving Party */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <h2 className="text-sm font-semibold text-white">Receiving Party — Gebhardt / Pinaxis</h2>
        </div>

        {signers.map((signer, idx) => (
          <SignerBlock
            key={idx}
            index={idx}
            signer={signer}
            onChange={updateSigner}
            onRemove={removeSigner}
            canRemove={signers.length > 1 && idx > 0}
          />
        ))}

        <button
          type="button"
          onClick={addSigner}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Another Signer
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm flex items-center gap-2">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          {error}
        </div>
      )}

      {/* Submit */}
      <div className="card bg-slate-900/60 border border-slate-600">
        <p className="text-xs text-slate-400 mb-4">
          By clicking "Execute NDA", all parties agree to be bound by the terms of this Non-Disclosure Agreement. Electronic signatures are legally binding under the E-SIGN Act and UETA.
        </p>
        <button
          type="submit"
          disabled={submitting}
          className="btn-primary w-full flex items-center justify-center gap-2 py-3"
        >
          {submitting ? (
            <>
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Saving NDA...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
              </svg>
              Execute NDA — All Parties
            </>
          )}
        </button>
      </div>
    </form>
  )
}
