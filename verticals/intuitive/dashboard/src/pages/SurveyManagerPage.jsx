import React, { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../lib/api'

// ── Status Badge ───────────────────────────────────────────────

function StatusBadge({ status }) {
  const styles = {
    draft: 'bg-yellow-900/40 text-yellow-300 border-yellow-700',
    active: 'bg-green-900/40 text-green-300 border-green-700',
    closed: 'bg-red-900/40 text-red-300 border-red-700',
    pending: 'bg-slate-700/60 text-slate-300 border-slate-600',
    sent: 'bg-blue-900/40 text-blue-300 border-blue-700',
    opened: 'bg-purple-900/40 text-purple-300 border-purple-700',
    completed: 'bg-blue-900/40 text-blue-200 border-blue-600',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${styles[status] || styles.pending}`}>
      {status}
    </span>
  )
}

// ── Clipboard Helper ───────────────────────────────────────────

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* fallback */
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }
  return (
    <button onClick={handleCopy} className="px-2 py-1 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors">
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

// ── Spinner ────────────────────────────────────────────────────

function Spinner({ message = 'Loading...' }) {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="text-center">
        <svg className="animate-spin w-10 h-10 text-intuitive-500 mx-auto mb-3" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <p className="text-slate-400">{message}</p>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────

export default function SurveyManagerPage({ projectId: propId }) {
  const { projectId: paramId } = useParams()
  const projectId = paramId || propId

  // ── State ──
  const [project, setProject] = useState(null)
  const [surveys, setSurveys] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Create form
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({
    title: '',
    system_type: '',
    hospital_name: '',
    welcome_message: '',
    thank_you_message: '',
    closes_at: '',
  })
  const [creating, setCreating] = useState(false)

  // Selected survey panels
  const [selectedSurveyId, setSelectedSurveyId] = useState(null)
  const [activePanel, setActivePanel] = useState(null) // 'recipients' | 'links' | 'responses'

  // Recipients
  const [recipients, setRecipients] = useState([])
  const [recipientForm, setRecipientForm] = useState({ name: '', email: '', phone: '', specialty: '' })
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [addingRecipients, setAddingRecipients] = useState(false)

  // Links
  const [surveyLinks, setSurveyLinks] = useState(null)
  const [sendingLinks, setSendingLinks] = useState(false)

  // Responses
  const [responses, setResponses] = useState([])
  const [expandedResponse, setExpandedResponse] = useState(null)
  const [importingToPlan, setImportingToPlan] = useState(false)

  // Business plans for import
  const [businessPlans, setBusinessPlans] = useState([])
  const [selectedPlanId, setSelectedPlanId] = useState(null)

  // ── Data Fetching ──

  const loadSurveys = useCallback(async () => {
    if (!projectId) return
    try {
      const res = await api.listSurveys(projectId)
      setSurveys(res.surveys || [])
    } catch (e) {
      console.error('Failed to load surveys:', e)
    }
  }, [projectId])

  useEffect(() => {
    if (!projectId) { setLoading(false); return }
    Promise.all([
      api.getProject(projectId),
      api.listSurveys(projectId),
      api.listBusinessPlans(projectId),
    ])
      .then(([pRes, sRes, bRes]) => {
        setProject(pRes.project || pRes)
        setSurveys(sRes.surveys || [])
        setBusinessPlans(bRes.plans || bRes.business_plans || [])
        // Pre-fill hospital name
        const hospitalName = pRes.project?.hospital_name || pRes.hospital_name || ''
        setCreateForm(prev => ({ ...prev, hospital_name: hospitalName }))
      })
      .catch(e => { setError(e.message); console.error(e) })
      .finally(() => setLoading(false))
  }, [projectId])

  // ── Handlers ──

  const handleCreateSurvey = async (e) => {
    e.preventDefault()
    setCreating(true)
    try {
      const payload = {
        ...createForm,
        project_id: projectId,
        closes_at: createForm.closes_at || undefined,
        welcome_message: createForm.welcome_message || undefined,
        thank_you_message: createForm.thank_you_message || undefined,
      }
      await api.createSurvey(payload)
      await loadSurveys()
      setShowCreate(false)
      setCreateForm(prev => ({ ...prev, title: '', system_type: '', welcome_message: '', thank_you_message: '', closes_at: '' }))
    } catch (e) {
      setError(e.message)
    } finally {
      setCreating(false)
    }
  }

  const handleSelectPanel = async (surveyId, panel) => {
    if (selectedSurveyId === surveyId && activePanel === panel) {
      setSelectedSurveyId(null)
      setActivePanel(null)
      return
    }
    setSelectedSurveyId(surveyId)
    setActivePanel(panel)

    if (panel === 'recipients') {
      try {
        const res = await api.getSurvey(surveyId)
        setRecipients(res.survey?.recipients || res.recipients || [])
      } catch (e) { console.error(e) }
    }
    if (panel === 'responses') {
      try {
        const res = await api.getSurveyResponses(surveyId)
        setResponses(res.responses || [])
      } catch (e) { console.error(e) }
    }
    if (panel === 'links') {
      try {
        const res = await api.getSurvey(surveyId)
        setSurveyLinks(res.survey || res)
      } catch (e) { console.error(e) }
    }
  }

  const handleAddRecipient = async () => {
    if (!recipientForm.name || !recipientForm.email) return
    setAddingRecipients(true)
    try {
      await api.addRecipients(selectedSurveyId, [recipientForm])
      const res = await api.getSurvey(selectedSurveyId)
      setRecipients(res.survey?.recipients || res.recipients || [])
      setRecipientForm({ name: '', email: '', phone: '', specialty: '' })
    } catch (e) { setError(e.message) }
    finally { setAddingRecipients(false) }
  }

  const handleBulkAdd = async () => {
    const lines = bulkText.trim().split('\n').filter(Boolean)
    const parsed = lines.map(line => {
      const parts = line.split(',').map(s => s.trim())
      return {
        name: parts[0] || '',
        email: parts[1] || '',
        specialty: parts[2] || '',
      }
    }).filter(r => r.name && r.email)

    if (parsed.length === 0) return
    setAddingRecipients(true)
    try {
      await api.addRecipients(selectedSurveyId, parsed)
      const res = await api.getSurvey(selectedSurveyId)
      setRecipients(res.survey?.recipients || res.recipients || [])
      setBulkText('')
      setBulkMode(false)
    } catch (e) { setError(e.message) }
    finally { setAddingRecipients(false) }
  }

  const handleSendSurvey = async (surveyId) => {
    setSendingLinks(true)
    try {
      const res = await api.sendSurvey(surveyId)
      setSurveyLinks(res.survey || res)
      await loadSurveys()
      setSelectedSurveyId(surveyId)
      setActivePanel('links')
    } catch (e) { setError(e.message) }
    finally { setSendingLinks(false) }
  }

  const handleCloseSurvey = async (surveyId) => {
    try {
      await api.updateSurvey(surveyId, { status: 'closed' })
      await loadSurveys()
    } catch (e) { setError(e.message) }
  }

  const handleImportToPlan = async (surveyId) => {
    if (!selectedPlanId) {
      setError('Please select a business plan first')
      return
    }
    setImportingToPlan(true)
    try {
      await api.importSurveyToPlan(surveyId, selectedPlanId)
      setError(null)
      alert('Survey responses imported to business plan successfully.')
    } catch (e) { setError(e.message) }
    finally { setImportingToPlan(false) }
  }

  // ── Render Helpers ──

  const getResponseRate = (survey) => {
    const total = survey.recipient_count || survey.recipients?.length || 0
    const completed = survey.response_count || survey.responses?.length || 0
    if (total === 0) return 'No recipients'
    return `${completed} of ${total} responded`
  }

  // ── Early Returns ──

  if (!projectId) {
    return <div className="p-10 text-slate-400">No project selected. Complete the intake form first.</div>
  }
  if (loading) return <Spinner message="Loading surgeon surveys..." />

  // ── Main Render ──

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Surgeon Surveys</h1>
          <p className="text-sm text-slate-400 mt-1">
            {project?.hospital_name || 'Hospital'} &mdash; Collect surgeon commitments and preferences
          </p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 bg-intuitive-600 hover:bg-intuitive-500 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          {showCreate ? 'Cancel' : 'Create New Survey'}
        </button>
      </div>

      {/* ── Error Banner ── */}
      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 flex items-center justify-between">
          <p className="text-red-300 text-sm">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 text-xs ml-4">Dismiss</button>
        </div>
      )}

      {/* ── Create Survey Form ── */}
      {showCreate && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">New Surgeon Survey</h2>
          <form onSubmit={handleCreateSurvey} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Survey Title *</label>
                <input
                  type="text"
                  required
                  value={createForm.title}
                  onChange={e => setCreateForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. Q3 2026 Surgical Robotics Survey"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-intuitive-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">System Type</label>
                <select
                  value={createForm.system_type}
                  onChange={e => setCreateForm(p => ({ ...p, system_type: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-intuitive-500"
                >
                  <option value="">Select system...</option>
                  <option value="da Vinci 5">da Vinci 5</option>
                  <option value="da Vinci Xi">da Vinci Xi</option>
                  <option value="da Vinci X">da Vinci X</option>
                  <option value="da Vinci SP">da Vinci SP</option>
                  <option value="Ion">Ion</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Hospital Name</label>
                <input
                  type="text"
                  value={createForm.hospital_name}
                  onChange={e => setCreateForm(p => ({ ...p, hospital_name: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-intuitive-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Welcome Message (optional)</label>
                <textarea
                  value={createForm.welcome_message}
                  onChange={e => setCreateForm(p => ({ ...p, welcome_message: e.target.value }))}
                  rows={2}
                  placeholder="Custom message displayed at the start of the survey..."
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-intuitive-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Thank You Message (optional)</label>
                <textarea
                  value={createForm.thank_you_message}
                  onChange={e => setCreateForm(p => ({ ...p, thank_you_message: e.target.value }))}
                  rows={2}
                  placeholder="Custom message displayed after submission..."
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-intuitive-500 resize-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Closes At</label>
                <input
                  type="date"
                  value={createForm.closes_at}
                  onChange={e => setCreateForm(p => ({ ...p, closes_at: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-intuitive-500"
                />
              </div>
              <div className="md:col-span-2 flex justify-end">
                <button
                  type="submit"
                  disabled={creating || !createForm.title}
                  className="px-6 py-2 bg-intuitive-600 hover:bg-intuitive-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  {creating ? 'Creating...' : 'Create Survey'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ── Survey List ── */}
      {surveys.length === 0 && !showCreate ? (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-12 text-center">
          <div className="text-4xl mb-3 text-slate-600">&#128203;</div>
          <p className="text-slate-400 text-lg">No surveys yet</p>
          <p className="text-slate-500 text-sm mt-1">Create a survey to collect surgeon commitments and preferences</p>
        </div>
      ) : (
        <div className="space-y-4">
          {surveys.map(survey => {
            const isSelected = selectedSurveyId === survey.id
            return (
              <div key={survey.id} className="space-y-0">
                {/* Survey Card */}
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 hover:border-slate-600 transition-all">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="text-base font-semibold text-white truncate">{survey.title}</h3>
                        <StatusBadge status={survey.status} />
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                        {survey.system_type && <span>{survey.system_type}</span>}
                        <span>{getResponseRate(survey)}</span>
                        <span>Created {new Date(survey.created_at).toLocaleDateString()}</span>
                        {survey.closes_at && (
                          <span>Closes {new Date(survey.closes_at).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleSelectPanel(survey.id, 'recipients')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                          isSelected && activePanel === 'recipients'
                            ? 'bg-intuitive-600 text-white'
                            : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                        }`}
                      >
                        Recipients
                      </button>
                      <button
                        onClick={() => handleSendSurvey(survey.id)}
                        disabled={sendingLinks}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-800/60 hover:bg-green-700/60 text-green-200 transition-colors disabled:opacity-50"
                      >
                        {sendingLinks && selectedSurveyId === survey.id ? 'Sending...' : 'Activate & Get Links'}
                      </button>
                      <button
                        onClick={() => handleSelectPanel(survey.id, 'responses')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                          isSelected && activePanel === 'responses'
                            ? 'bg-intuitive-600 text-white'
                            : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                        }`}
                      >
                        Responses
                      </button>
                      {survey.status !== 'closed' && (
                        <button
                          onClick={() => handleCloseSurvey(survey.id)}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-900/40 hover:bg-red-800/50 text-red-300 transition-colors"
                        >
                          Close
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Manage Recipients Panel ── */}
                {isSelected && activePanel === 'recipients' && (
                  <div className="bg-slate-800/70 border border-slate-700 border-t-0 rounded-b-xl p-5 -mt-2 space-y-4">
                    <h4 className="text-sm font-semibold text-white">Manage Recipients</h4>

                    {/* Add single recipient */}
                    {!bulkMode ? (
                      <div className="flex items-end gap-3 flex-wrap">
                        <div className="flex-1 min-w-[140px]">
                          <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Surgeon Name *</label>
                          <input
                            type="text"
                            value={recipientForm.name}
                            onChange={e => setRecipientForm(p => ({ ...p, name: e.target.value }))}
                            placeholder="Dr. Jane Smith"
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-600 rounded text-xs text-white placeholder-slate-500 focus:outline-none focus:border-intuitive-500"
                          />
                        </div>
                        <div className="flex-1 min-w-[160px]">
                          <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Email *</label>
                          <input
                            type="email"
                            value={recipientForm.email}
                            onChange={e => setRecipientForm(p => ({ ...p, email: e.target.value }))}
                            placeholder="jane.smith@hospital.org"
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-600 rounded text-xs text-white placeholder-slate-500 focus:outline-none focus:border-intuitive-500"
                          />
                        </div>
                        <div className="w-32">
                          <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Phone</label>
                          <input
                            type="text"
                            value={recipientForm.phone}
                            onChange={e => setRecipientForm(p => ({ ...p, phone: e.target.value }))}
                            placeholder="555-0123"
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-600 rounded text-xs text-white placeholder-slate-500 focus:outline-none focus:border-intuitive-500"
                          />
                        </div>
                        <div className="w-36">
                          <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Specialty</label>
                          <input
                            type="text"
                            value={recipientForm.specialty}
                            onChange={e => setRecipientForm(p => ({ ...p, specialty: e.target.value }))}
                            placeholder="Urology"
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-600 rounded text-xs text-white placeholder-slate-500 focus:outline-none focus:border-intuitive-500"
                          />
                        </div>
                        <button
                          onClick={handleAddRecipient}
                          disabled={addingRecipients || !recipientForm.name || !recipientForm.email}
                          className="px-3 py-1.5 bg-intuitive-600 hover:bg-intuitive-500 disabled:opacity-50 text-white text-xs font-semibold rounded transition-colors"
                        >
                          {addingRecipients ? 'Adding...' : 'Add'}
                        </button>
                        <button
                          onClick={() => setBulkMode(true)}
                          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium rounded transition-colors"
                        >
                          Add Multiple
                        </button>
                      </div>
                    ) : (
                      /* Bulk add */
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="block text-[10px] font-medium text-slate-500">One recipient per line: Name, email, specialty</label>
                          <button
                            onClick={() => setBulkMode(false)}
                            className="text-xs text-slate-400 hover:text-slate-200"
                          >
                            Single mode
                          </button>
                        </div>
                        <textarea
                          value={bulkText}
                          onChange={e => setBulkText(e.target.value)}
                          rows={5}
                          placeholder={`Dr. Jane Smith, jane@hospital.org, Urology\nDr. John Doe, john@hospital.org, General Surgery\nDr. Sarah Lee, sarah@hospital.org, Gynecology`}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-intuitive-500 font-mono resize-none"
                        />
                        <div className="flex justify-end">
                          <button
                            onClick={handleBulkAdd}
                            disabled={addingRecipients || !bulkText.trim()}
                            className="px-4 py-1.5 bg-intuitive-600 hover:bg-intuitive-500 disabled:opacity-50 text-white text-xs font-semibold rounded transition-colors"
                          >
                            {addingRecipients ? 'Adding...' : 'Add All Recipients'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Recipients list */}
                    {recipients.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-slate-700 text-slate-400">
                              <th className="text-left py-2 px-2 font-medium">Name</th>
                              <th className="text-left py-2 px-2 font-medium">Email</th>
                              <th className="text-left py-2 px-2 font-medium">Phone</th>
                              <th className="text-left py-2 px-2 font-medium">Specialty</th>
                              <th className="text-left py-2 px-2 font-medium">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {recipients.map((r, i) => (
                              <tr key={r.id || i} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                                <td className="py-2 px-2 text-white">{r.name}</td>
                                <td className="py-2 px-2 text-slate-300">{r.email}</td>
                                <td className="py-2 px-2 text-slate-400">{r.phone || '--'}</td>
                                <td className="py-2 px-2 text-slate-400">{r.specialty || '--'}</td>
                                <td className="py-2 px-2"><StatusBadge status={r.status || 'pending'} /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {recipients.length === 0 && (
                      <p className="text-slate-500 text-xs text-center py-3">No recipients added yet</p>
                    )}
                  </div>
                )}

                {/* ── Survey Links Panel ── */}
                {isSelected && activePanel === 'links' && surveyLinks && (
                  <div className="bg-slate-800/70 border border-slate-700 border-t-0 rounded-b-xl p-5 -mt-2 space-y-4">
                    <h4 className="text-sm font-semibold text-white">Survey Links</h4>

                    {/* General link */}
                    {surveyLinks.general_link && (
                      <div className="bg-slate-900/80 border border-slate-600 rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">General Survey Link</p>
                            <p className="text-xs text-intuitive-400 mt-1 font-mono break-all">{surveyLinks.general_link}</p>
                          </div>
                          <CopyButton text={surveyLinks.general_link} />
                        </div>
                      </div>
                    )}

                    {/* Per-recipient links */}
                    {surveyLinks.recipients && surveyLinks.recipients.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-slate-700 text-slate-400">
                              <th className="text-left py-2 px-2 font-medium">Surgeon</th>
                              <th className="text-left py-2 px-2 font-medium">Email</th>
                              <th className="text-left py-2 px-2 font-medium">Personal Link</th>
                              <th className="text-left py-2 px-2 font-medium">Status</th>
                              <th className="text-right py-2 px-2 font-medium">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {surveyLinks.recipients.map((r, i) => (
                              <tr key={r.id || i} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                                <td className="py-2 px-2 text-white">{r.name}</td>
                                <td className="py-2 px-2 text-slate-300">{r.email}</td>
                                <td className="py-2 px-2 text-intuitive-400 font-mono text-[10px] break-all max-w-[200px]">
                                  {r.link || r.personal_link || '--'}
                                </td>
                                <td className="py-2 px-2"><StatusBadge status={r.status || 'sent'} /></td>
                                <td className="py-2 px-2 text-right">
                                  {(r.link || r.personal_link) && (
                                    <CopyButton text={r.link || r.personal_link} />
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {!surveyLinks.general_link && (!surveyLinks.recipients || surveyLinks.recipients.length === 0) && (
                      <p className="text-slate-500 text-xs text-center py-3">No links generated yet. Click "Activate & Get Links" to send the survey.</p>
                    )}
                  </div>
                )}

                {/* ── Responses Panel ── */}
                {isSelected && activePanel === 'responses' && (
                  <div className="bg-slate-800/70 border border-slate-700 border-t-0 rounded-b-xl p-5 -mt-2 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-white">Survey Responses ({responses.length})</h4>
                      {responses.length > 0 && (
                        <div className="flex items-center gap-2">
                          <select
                            value={selectedPlanId || ''}
                            onChange={e => setSelectedPlanId(e.target.value || null)}
                            className="px-2 py-1 bg-slate-900 border border-slate-600 rounded text-xs text-white focus:outline-none focus:border-intuitive-500"
                          >
                            <option value="">Select business plan...</option>
                            {businessPlans.map(bp => (
                              <option key={bp.id} value={bp.id}>{bp.title || bp.name || `Plan #${bp.id}`}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleImportToPlan(survey.id)}
                            disabled={importingToPlan || !selectedPlanId}
                            className="px-3 py-1.5 bg-intuitive-600 hover:bg-intuitive-500 disabled:opacity-50 text-white text-xs font-semibold rounded transition-colors"
                          >
                            {importingToPlan ? 'Importing...' : 'Import All to Business Plan'}
                          </button>
                        </div>
                      )}
                    </div>

                    {responses.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-slate-700 text-slate-400">
                              <th className="text-left py-2 px-2 font-medium">Surgeon</th>
                              <th className="text-left py-2 px-2 font-medium">Specialty</th>
                              <th className="text-right py-2 px-2 font-medium">Incr. Cases/Mo</th>
                              <th className="text-center py-2 px-2 font-medium">Willing to Commit</th>
                              <th className="text-left py-2 px-2 font-medium">Barriers</th>
                              <th className="text-left py-2 px-2 font-medium">Completed</th>
                              <th className="text-center py-2 px-2 font-medium">Detail</th>
                            </tr>
                          </thead>
                          <tbody>
                            {responses.map((resp, i) => (
                              <React.Fragment key={resp.id || i}>
                                <tr className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors cursor-pointer" onClick={() => setExpandedResponse(expandedResponse === i ? null : i)}>
                                  <td className="py-2 px-2 text-white font-medium">{resp.surgeon_name || resp.name || '--'}</td>
                                  <td className="py-2 px-2 text-slate-300">{resp.specialty || '--'}</td>
                                  <td className="py-2 px-2 text-right text-intuitive-400 font-semibold">
                                    {resp.incremental_cases_per_month ?? resp.incremental_cases ?? '--'}
                                  </td>
                                  <td className="py-2 px-2 text-center">
                                    {resp.willing_to_commit != null ? (
                                      <span className={resp.willing_to_commit ? 'text-green-400' : 'text-red-400'}>
                                        {resp.willing_to_commit ? 'Yes' : 'No'}
                                      </span>
                                    ) : '--'}
                                  </td>
                                  <td className="py-2 px-2 text-slate-400 max-w-[180px] truncate">{resp.barriers || '--'}</td>
                                  <td className="py-2 px-2 text-slate-500">
                                    {resp.completed_at ? new Date(resp.completed_at).toLocaleDateString() : '--'}
                                  </td>
                                  <td className="py-2 px-2 text-center text-slate-500">
                                    {expandedResponse === i ? '[-]' : '[+]'}
                                  </td>
                                </tr>
                                {expandedResponse === i && (
                                  <tr>
                                    <td colSpan={7} className="px-4 py-3 bg-slate-900/60">
                                      <div className="grid grid-cols-2 gap-3 text-xs">
                                        {resp.current_volume != null && (
                                          <div>
                                            <span className="text-slate-500">Current Monthly Volume:</span>{' '}
                                            <span className="text-white">{resp.current_volume}</span>
                                          </div>
                                        )}
                                        {resp.preferred_procedures && (
                                          <div>
                                            <span className="text-slate-500">Preferred Procedures:</span>{' '}
                                            <span className="text-white">{Array.isArray(resp.preferred_procedures) ? resp.preferred_procedures.join(', ') : resp.preferred_procedures}</span>
                                          </div>
                                        )}
                                        {resp.experience_level && (
                                          <div>
                                            <span className="text-slate-500">Experience Level:</span>{' '}
                                            <span className="text-white">{resp.experience_level}</span>
                                          </div>
                                        )}
                                        {resp.training_needed != null && (
                                          <div>
                                            <span className="text-slate-500">Training Needed:</span>{' '}
                                            <span className="text-white">{resp.training_needed ? 'Yes' : 'No'}</span>
                                          </div>
                                        )}
                                        {resp.notes && (
                                          <div className="col-span-2">
                                            <span className="text-slate-500">Notes:</span>{' '}
                                            <span className="text-white">{resp.notes}</span>
                                          </div>
                                        )}
                                        {resp.additional_comments && (
                                          <div className="col-span-2">
                                            <span className="text-slate-500">Additional Comments:</span>{' '}
                                            <span className="text-white">{resp.additional_comments}</span>
                                          </div>
                                        )}
                                        {/* Render any other response fields dynamically */}
                                        {Object.entries(resp)
                                          .filter(([key]) => ![
                                            'id', 'survey_id', 'recipient_id', 'surgeon_name', 'name', 'specialty',
                                            'incremental_cases_per_month', 'incremental_cases', 'willing_to_commit',
                                            'barriers', 'completed_at', 'current_volume', 'preferred_procedures',
                                            'experience_level', 'training_needed', 'notes', 'additional_comments',
                                            'created_at', 'updated_at', 'email', 'status'
                                          ].includes(key))
                                          .map(([key, val]) => val != null && val !== '' && (
                                            <div key={key}>
                                              <span className="text-slate-500">{key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}:</span>{' '}
                                              <span className="text-white">{typeof val === 'object' ? JSON.stringify(val) : String(val)}</span>
                                            </div>
                                          ))}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-slate-500 text-xs text-center py-6">No responses received yet</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
