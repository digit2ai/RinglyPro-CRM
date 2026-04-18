import React from 'react';
import { Link } from 'react-router-dom';
const mskLogo = 'https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69e2cb1b50b9a3263ab4677c.png';

export default function Landing() {
  return (
    <div className="min-h-screen bg-dark-950">
      {/* Hero */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69c7fbd05eea8363cb559a83.jpg" alt="" className="w-full h-full object-cover" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-dark-950/95 via-dark-950/80 to-dark-950/40" />
        <div className="absolute inset-0 bg-gradient-to-t from-dark-950 via-transparent to-transparent" />

        <nav className="relative z-10 max-w-7xl mx-auto px-4 lg:px-6 py-3 lg:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center min-w-0 flex-shrink">
            <img src={mskLogo} alt="ImagingMind AI Diagnostics" className="h-28 sm:h-36 lg:h-44 w-auto object-contain" />
          </div>
          <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
            <Link to="/login" className="text-dark-300 hover:text-white transition-colors font-medium text-sm sm:text-base">Sign In</Link>
            <Link to="/register" className="btn-primary text-xs sm:text-sm whitespace-nowrap">Get Started</Link>
          </div>
        </nav>

        <div className="relative z-10 max-w-7xl mx-auto px-4 lg:px-6 py-16 lg:py-36">
          <div className="max-w-3xl">
            <a href="/imagingmind-demo.html" className="group inline-flex items-center gap-3 mb-6 sm:mb-8">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-msk-400 to-msk-600 border-2 border-msk-300/50 flex items-center justify-center shadow-lg shadow-msk-500/30 group-hover:shadow-msk-500/50 group-hover:scale-105 transition-all duration-300">
                <svg className="w-6 h-6 sm:w-7 sm:h-7 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              </div>
              <span className="text-msk-400 text-sm sm:text-base font-medium group-hover:text-msk-300 transition-colors">Watch AI Demo</span>
            </a>

            <h2 className="text-4xl sm:text-5xl lg:text-7xl font-bold text-white leading-tight mb-6">
              AI Diagnostic<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-msk-400 to-msk-600">Imaging.</span><br />
              In Seconds.
            </h2>

            <p className="text-lg sm:text-xl text-dark-300 mb-8 sm:mb-10 max-w-xl leading-relaxed">
              X-Ray, CT, MRI, Mammography, DEXA, Dental — upload any imaging study. Get AI-powered findings, ICD-10 codes, and structured diagnostic reports automatically.
            </p>

            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:gap-4">
              <Link to="/register" className="btn-primary text-base sm:text-lg px-6 sm:px-8 py-3 sm:py-4 text-center">Upload Study</Link>
              <Link to="/voice" className="btn-secondary text-base sm:text-lg px-6 sm:px-8 py-3 sm:py-4 flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" /><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" /></svg>
                Talk to AI
              </Link>
              <Link to="/login" className="btn-secondary text-base sm:text-lg px-6 sm:px-8 py-3 sm:py-4 text-center">Sign In</Link>
            </div>
          </div>
        </div>
      </header>

      {/* Modalities */}
      <section className="border-y border-dark-800 bg-dark-900/50">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 py-12 lg:py-16">
          <h3 className="text-lg font-bold text-white text-center mb-8">6 Modalities — One Platform</h3>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
            {[
              { name: 'X-Ray', num: '01', desc: '2-4 views' },
              { name: 'CT', num: '02', desc: '20-30 key slices' },
              { name: 'MRI', num: '03', desc: '20-30 key slices' },
              { name: 'Mammography', num: '04', desc: '4 standard views' },
              { name: 'DEXA', num: '05', desc: 'Bone density' },
              { name: 'Dental', num: '06', desc: 'Panoramic & periapical' }
            ].map((mod, i) => (
              <div key={i} className="text-center p-4 rounded-xl bg-dark-800/50 border border-dark-700 hover:border-msk-500/30 transition-all">
                <div className="text-msk-400 font-mono text-xs font-bold mb-2">{mod.num}</div>
                <div className="text-white font-bold text-sm">{mod.name}</div>
                <div className="text-dark-400 text-xs mt-1">{mod.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-dark-900/30">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 py-12 lg:py-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { value: '<30s', label: 'AI Analysis Time', sub: 'Any modality' },
              { value: '6', label: 'Modalities', sub: 'X-Ray, CT, MRI, Mammo, DEXA, Dental' },
              { value: 'ICD-10', label: 'Auto-Coded', sub: 'Billing-ready output' },
              { value: 'HIPAA', label: 'Compliant', sub: 'End-to-end encrypted' }
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-3xl lg:text-4xl font-bold text-msk-400 mb-2">{stat.value}</div>
                <div className="text-white font-medium">{stat.label}</div>
                <div className="text-sm text-dark-400">{stat.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Visual Showcase */}
      <section className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 py-12 lg:py-16">
          <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-dark-700">
            <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69c7fbd05eea837aca559a82.jpg" alt="ImagingMind" className="w-full h-auto object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-dark-950/60 via-transparent to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-8">
              <p className="text-white text-lg font-semibold">AI Diagnostic Imaging Platform</p>
              <p className="text-dark-300 text-sm mt-1">X-Ray, CT, MRI, Mammography, DEXA, Dental — one platform, all modalities, AI-powered analysis in seconds.</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="max-w-7xl mx-auto px-4 lg:px-6 py-16 lg:py-24">
        <h3 className="text-2xl sm:text-3xl font-bold text-white text-center mb-4">How It Works</h3>
        <p className="text-dark-400 text-center mb-12 lg:mb-16 max-w-xl mx-auto px-4">Upload. Analyze. Report. Any modality, in minutes.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-8">
          {[
            { step: '01', title: 'Upload', desc: 'Upload X-rays, CT slices, MRI sequences, mammograms, DEXA scans, or dental imaging. DICOM and standard formats supported.', color: 'from-blue-500 to-blue-600' },
            { step: '02', title: 'AI Analysis', desc: 'ImagingMind AI reads every image automatically. Structured findings, impressions, abnormality detection, and ICD-10 coding generated in seconds.', color: 'from-purple-500 to-purple-600' },
            { step: '03', title: 'AI Copilot Report', desc: 'The platform creates a draft diagnostic report. Clinicians review, edit, and finalize with AI-assisted annotations and structured formatting.', color: 'from-cyan-500 to-cyan-600' },
            { step: '04', title: 'Export & Deliver', desc: 'Export a professional PDF report with HIPAA compliance. Full audit trail with timestamps for uploads, analysis, and final approval. EMR-ready.', color: 'from-green-500 to-green-600' }
          ].map((item, i) => (
            <div key={i} className="card group hover:border-dark-500 transition-all duration-300">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center text-white font-bold text-sm mb-4 shadow-lg`}>{item.step}</div>
              <h4 className="text-lg font-bold text-white mb-2">{item.title}</h4>
              <p className="text-dark-400 text-sm leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* The Problem */}
      <section className="bg-dark-900/50 border-y border-dark-800">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 py-16 lg:py-24">
          <div className="text-center mb-12">
            <span className="text-msk-400 font-mono text-sm font-bold tracking-wider">THE PROBLEM</span>
            <h3 className="text-2xl sm:text-3xl font-bold text-white mt-3">Radiology Bottleneck Is Costing You</h3>
          </div>
          <div className="grid sm:grid-cols-3 gap-6 lg:gap-8 mb-10">
            {[
              { value: '36h', label: 'Average imaging report turnaround at community hospitals' },
              { value: '30%', label: 'Of radiologists report burnout due to volume overload' },
              { value: '12%', label: 'Of incidental findings missed in high-volume reading sessions' }
            ].map((stat, i) => (
              <div key={i} className="card text-center">
                <div className="text-4xl lg:text-5xl font-bold text-msk-400 mb-3">{stat.value}</div>
                <p className="text-dark-400 text-sm leading-relaxed">{stat.label}</p>
              </div>
            ))}
          </div>
          <p className="text-dark-300 text-center max-w-2xl mx-auto leading-relaxed">
            Every hour of delay increases patient anxiety, postpones treatment, and reduces your practice's throughput.
          </p>
        </div>
      </section>

      {/* Advanced Modalities — CT & MRI */}
      <section className="max-w-7xl mx-auto px-4 lg:px-6 py-16 lg:py-24">
        <div className="text-center mb-12">
          <span className="text-msk-400 font-mono text-sm font-bold tracking-wider">ADVANCED IMAGING</span>
          <h3 className="text-2xl sm:text-3xl font-bold text-white mt-3">CT & MRI: Slice-by-Slice AI</h3>
        </div>
        <div className="grid md:grid-cols-2 gap-6 lg:gap-8 mb-8">
          <div className="card group hover:border-dark-500 transition-all duration-300">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm mb-4 shadow-lg">CT</div>
            <h4 className="text-lg font-bold text-white mb-4">CT Scan</h4>
            <div className="space-y-3">
              {[
                { label: 'Slices analyzed', value: '20-30 key slices' },
                { label: 'Analysis time', value: '<45 seconds' },
                { label: 'Slice selection', value: 'AI-optimized' },
                { label: 'Output', value: 'Structured findings + ICD-10' },
                { label: 'Use cases', value: 'Trauma, tumors, fractures' }
              ].map((row, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-dark-800/50 border border-dark-700">
                  <span className="text-dark-400 text-sm">{row.label}</span>
                  <span className="text-white text-sm font-medium">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card group hover:border-dark-500 transition-all duration-300">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center text-white font-bold text-sm mb-4 shadow-lg">MRI</div>
            <h4 className="text-lg font-bold text-white mb-4">MRI</h4>
            <div className="space-y-3">
              {[
                { label: 'Slices analyzed', value: '20-30 key slices' },
                { label: 'Analysis time', value: '<45 seconds' },
                { label: 'Sequence support', value: 'T1, T2, FLAIR, DWI' },
                { label: 'Output', value: 'Structured findings + ICD-10' },
                { label: 'Use cases', value: 'ACL tears, meniscus, spine' }
              ].map((row, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-dark-800/50 border border-dark-700">
                  <span className="text-dark-400 text-sm">{row.label}</span>
                  <span className="text-white text-sm font-medium">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="text-dark-400 text-center text-sm">DICOM and standard image formats supported. AI selects diagnostically relevant slices automatically.</p>
      </section>

      {/* Specialized Modalities */}
      <section className="bg-dark-900/50 border-y border-dark-800">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 py-16 lg:py-24">
          <div className="text-center mb-12">
            <span className="text-msk-400 font-mono text-sm font-bold tracking-wider">SPECIALIZED MODALITIES</span>
            <h3 className="text-2xl sm:text-3xl font-bold text-white mt-3">Mammography. DEXA. Dental.</h3>
          </div>
          <div className="grid sm:grid-cols-3 gap-6 lg:gap-8 mb-8">
            {[
              {
                title: 'Mammography',
                color: 'from-pink-500 to-pink-600',
                rows: [
                  { label: 'Views', value: 'CC + MLO (4 standard)' },
                  { label: 'AI output', value: 'BI-RADS scoring' },
                  { label: 'Detects', value: 'Masses, calcifications, asymmetry' },
                  { label: 'Time', value: '<30 seconds' }
                ]
              },
              {
                title: 'DEXA Scan',
                color: 'from-amber-500 to-amber-600',
                rows: [
                  { label: 'Regions', value: 'Spine, hip, forearm' },
                  { label: 'AI output', value: 'T-score, Z-score, BMD' },
                  { label: 'Detects', value: 'Osteoporosis, osteopenia risk' },
                  { label: 'Time', value: '<30 seconds' }
                ]
              },
              {
                title: 'Dental X-Ray',
                color: 'from-teal-500 to-teal-600',
                rows: [
                  { label: 'Types', value: 'Panoramic, periapical, bitewing' },
                  { label: 'AI output', value: 'Tooth-by-tooth findings' },
                  { label: 'Detects', value: 'Caries, fractures, periapical lesions' },
                  { label: 'Time', value: '<30 seconds' }
                ]
              }
            ].map((mod, i) => (
              <div key={i} className="card group hover:border-dark-500 transition-all duration-300">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${mod.color} flex items-center justify-center text-white font-bold text-xs mb-4 shadow-lg`}>{String(i + 4).padStart(2, '0')}</div>
                <h4 className="text-lg font-bold text-white mb-4">{mod.title}</h4>
                <div className="space-y-3">
                  {mod.rows.map((row, j) => (
                    <div key={j} className="flex items-center justify-between p-3 rounded-lg bg-dark-800/50 border border-dark-700">
                      <span className="text-dark-400 text-sm">{row.label}</span>
                      <span className="text-white text-sm font-medium">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="text-dark-400 text-center text-sm">All modalities generate structured findings, clinical impressions, and ICD-10 codes.</p>
        </div>
      </section>

      {/* Real Case Study */}
      <section className="max-w-7xl mx-auto px-4 lg:px-6 py-16 lg:py-24">
        <div className="text-center mb-12">
          <span className="text-msk-400 font-mono text-sm font-bold tracking-wider">REAL CASE STUDY</span>
          <h3 className="text-2xl sm:text-3xl font-bold text-white mt-3">From Upload to Diagnosis in 7 Minutes</h3>
        </div>
        <div className="grid lg:grid-cols-2 gap-6 lg:gap-8 mb-8">
          {/* Case Details */}
          <div className="card">
            <h4 className="text-sm font-bold text-msk-400 uppercase tracking-wider mb-4">Case Details</h4>
            <div className="space-y-3">
              {[
                { label: 'Case', value: '#MSK-20260413-HL5J' },
                { label: 'Patient', value: 'Unai Arozena' },
                { label: 'Injury', value: 'Crush trauma -- right index finger' },
                { label: 'Modalities', value: 'X-Ray (AP + Lateral) + CT' }
              ].map((row, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-dark-800/50 border border-dark-700">
                  <span className="text-dark-400 text-sm">{row.label}</span>
                  <span className="text-white text-sm font-medium">{row.value}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 p-4 rounded-lg bg-dark-800/30 border border-dark-700/50">
              <p className="text-dark-400 text-xs uppercase tracking-wider mb-2">Chief Complaint</p>
              <p className="text-dark-300 text-sm italic leading-relaxed">"Was cutting a tree and the tree suddenly fell, crushing the outer side of the index finger on my right hand."</p>
            </div>
          </div>
          {/* AI Findings */}
          <div className="card">
            <h4 className="text-sm font-bold text-msk-400 uppercase tracking-wider mb-4">AI Findings</h4>
            <div className="p-4 rounded-lg bg-dark-800/50 border border-dark-700 mb-4">
              <p className="text-white text-sm leading-relaxed">Complete displaced transverse fracture of the proximal phalanx with significant dorsal angulation and shortening</p>
            </div>
            <div className="space-y-3 mb-4">
              {[
                { label: 'Confidence', value: 'HIGH', valueClass: 'text-green-400' },
                { label: 'AI Analysis Time', value: '11 seconds per image' },
                { label: 'Abnormalities', value: 'Comminuted fracture, dorsal angulation, fragment displacement, soft tissue swelling' }
              ].map((row, i) => (
                <div key={i} className="flex items-start justify-between p-3 rounded-lg bg-dark-800/50 border border-dark-700 gap-4">
                  <span className="text-dark-400 text-sm flex-shrink-0">{row.label}</span>
                  <span className={`text-sm font-medium text-right ${row.valueClass || 'text-white'}`}>{row.value}</span>
                </div>
              ))}
            </div>
            <h4 className="text-sm font-bold text-msk-400 uppercase tracking-wider mb-3">ICD-10 Codes</h4>
            <div className="flex flex-wrap gap-2">
              {[
                'S62.601A -- Fracture of proximal phalanx, right index finger',
                'S62.90XA -- Unspecified fracture of wrist and hand',
                'W20.8XXA -- Struck by other falling object'
              ].map((code, i) => (
                <span key={i} className="badge bg-msk-600/10 text-msk-400 border border-msk-600/20 px-3 py-1.5 text-xs">{code}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* AI Copilot Report */}
      <section className="bg-dark-900/50 border-y border-dark-800">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 py-16 lg:py-24">
          <div className="text-center mb-12">
            <span className="text-msk-400 font-mono text-sm font-bold tracking-wider">AI COPILOT</span>
            <h3 className="text-2xl sm:text-3xl font-bold text-white mt-3">From Analysis to Final Report</h3>
            <p className="text-dark-400 mt-4 max-w-2xl mx-auto">The AI Diagnostic Copilot generates a full structured report draft using all image analyses, patient history, and clinical context. Radiologists review, edit, and finalize.</p>
          </div>
          <div className="max-w-3xl mx-auto">
            <div className="card border-dark-600 bg-dark-900/80">
              <div className="border-b border-dark-700 pb-4 mb-4 flex items-center gap-3">
                <img src={mskLogo} alt="ImagingMind" className="h-8 w-auto object-contain opacity-70" />
                <div>
                  <p className="text-white text-sm font-bold">AI Diagnostic Report -- Draft</p>
                  <p className="text-dark-500 text-xs">Generated by ImagingMind AI Copilot</p>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-dark-400 text-xs uppercase tracking-wider mb-1">Clinical Summary</p>
                  <p className="text-dark-300 text-sm leading-relaxed">Patient Unai Arozena presents with traumatic crush injury... surgical intervention likely required.</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-dark-800/50 border border-dark-700">
                    <p className="text-dark-400 text-xs uppercase tracking-wider mb-1">Severity</p>
                    <p className="text-red-400 text-sm font-bold">Severe</p>
                  </div>
                  <div className="p-3 rounded-lg bg-dark-800/50 border border-dark-700">
                    <p className="text-dark-400 text-xs uppercase tracking-wider mb-1">Recovery Timeline</p>
                    <p className="text-white text-sm font-bold">8-12 weeks</p>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-dark-800/50 border border-dark-700">
                  <p className="text-dark-400 text-xs uppercase tracking-wider mb-1">Recommendation</p>
                  <p className="text-white text-sm leading-relaxed">Urgent orthopedic referral for possible ORIF</p>
                </div>
              </div>
            </div>
            <p className="text-dark-400 text-center text-sm mt-6">One-click PDF export with full letterhead, ICD-10 codes, FHIR R4 compliant, EMR-ready.</p>
          </div>
        </div>
      </section>

      {/* Confidence Scoring */}
      <section className="max-w-7xl mx-auto px-4 lg:px-6 py-16 lg:py-24">
        <div className="text-center mb-12">
          <span className="text-msk-400 font-mono text-sm font-bold tracking-wider">AI CONFIDENCE</span>
          <h3 className="text-2xl sm:text-3xl font-bold text-white mt-3">AI Knows When It's Certain</h3>
        </div>
        <div className="grid sm:grid-cols-3 gap-6 lg:gap-8 mb-8">
          <div className="card border-green-500/30 hover:border-green-500/50 transition-all duration-300">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center mb-4 shadow-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            </div>
            <h4 className="text-lg font-bold text-green-400 mb-2">HIGH</h4>
            <p className="text-dark-300 text-sm mb-2">Clear findings, diagnostic-quality image</p>
            <p className="text-dark-400 text-sm">Proceed with confidence</p>
          </div>
          <div className="card border-amber-500/30 hover:border-amber-500/50 transition-all duration-300">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center mb-4 shadow-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <h4 className="text-lg font-bold text-amber-400 mb-2">MODERATE</h4>
            <p className="text-dark-300 text-sm mb-2">Borderline quality or subtle findings</p>
            <p className="text-dark-400 text-sm">Radiologist review recommended</p>
          </div>
          <div className="card border-red-500/30 hover:border-red-500/50 transition-all duration-300">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center mb-4 shadow-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </div>
            <h4 className="text-lg font-bold text-red-400 mb-2">LOW</h4>
            <p className="text-dark-300 text-sm mb-2">Poor quality or ambiguous anatomy</p>
            <p className="text-dark-400 text-sm">Additional views recommended</p>
          </div>
        </div>
        <p className="text-dark-400 text-center text-sm max-w-2xl mx-auto">Confidence scoring helps prioritize your worklist -- high-confidence cases route directly, freeing you for complex reads.</p>
      </section>

      {/* ROI Calculator */}
      <section className="bg-dark-900/50 border-y border-dark-800">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 py-16 lg:py-24">
          <div className="text-center mb-12">
            <span className="text-msk-400 font-mono text-sm font-bold tracking-wider">ROI</span>
            <h3 className="text-2xl sm:text-3xl font-bold text-white mt-3">What ImagingMind Saves Your Practice</h3>
          </div>
          <div className="max-w-3xl mx-auto">
            {/* Comparison Table */}
            <div className="card mb-8">
              <div className="grid grid-cols-3 gap-0">
                <div className="p-3 border-b border-dark-700" />
                <div className="p-3 border-b border-l border-dark-700 text-center">
                  <span className="text-dark-400 text-sm font-bold">Without</span>
                </div>
                <div className="p-3 border-b border-l border-dark-700 text-center">
                  <span className="text-msk-400 text-sm font-bold">With ImagingMind</span>
                </div>
                {[
                  { metric: 'Studies/day', without: '40', withIM: '80+' },
                  { metric: 'Time per study', without: '45 min', withIM: '8 min' },
                  { metric: 'Report turnaround', without: '36 hours', withIM: '7 minutes' },
                  { metric: 'Missed findings', without: '~12%', withIM: '~1%' }
                ].map((row, i) => (
                  <React.Fragment key={i}>
                    <div className="p-3 border-b border-dark-700/50">
                      <span className="text-dark-300 text-sm">{row.metric}</span>
                    </div>
                    <div className="p-3 border-b border-l border-dark-700/50 text-center">
                      <span className="text-dark-400 text-sm">{row.without}</span>
                    </div>
                    <div className="p-3 border-b border-l border-dark-700/50 text-center">
                      <span className="text-white text-sm font-bold">{row.withIM}</span>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>
            {/* Revenue Recovery */}
            <div className="card border-msk-500/20">
              <h4 className="text-sm font-bold text-msk-400 uppercase tracking-wider mb-4">Revenue Recovery Calculation</h4>
              <div className="space-y-2 font-mono text-sm">
                <div className="flex justify-between p-2 rounded bg-dark-800/50">
                  <span className="text-dark-400">+40 additional studies/day</span>
                  <span className="text-dark-300">40</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-dark-800/50">
                  <span className="text-dark-400">x 250 working days/year</span>
                  <span className="text-dark-300">250</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-dark-800/30 border border-dark-700">
                  <span className="text-dark-300">= Extra studies/year</span>
                  <span className="text-white font-bold">10,000</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-dark-800/50">
                  <span className="text-dark-400">x $30 avg professional fee</span>
                  <span className="text-dark-300">$30</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-dark-800/30 border border-dark-700">
                  <span className="text-dark-300">= Gross revenue</span>
                  <span className="text-white font-bold">$300,000</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-dark-800/50">
                  <span className="text-dark-400">x 75% net billable</span>
                  <span className="text-dark-300">75%</span>
                </div>
                <div className="flex justify-between p-3 rounded-lg bg-msk-600/10 border border-msk-500/30 mt-2">
                  <span className="text-msk-400 font-bold">= Net revenue recovery / radiologist / year</span>
                  <span className="text-msk-400 font-bold text-lg">$225,000+</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing — Single Plan */}
      <section className="bg-dark-900/50 border-y border-dark-800">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 py-16 lg:py-24">
          <h3 className="text-2xl sm:text-3xl font-bold text-white text-center mb-4">Simple, Transparent Pricing</h3>
          <p className="text-dark-400 text-center mb-12 lg:mb-16 max-w-2xl mx-auto">One plan. All features. Pay only for what you analyze.</p>

          <div className="max-w-2xl mx-auto">
            <div className="card border-msk-500 ring-1 ring-msk-500/20">
              <div className="text-center mb-8">
                <div className="inline-block bg-msk-600 text-white text-xs font-bold px-4 py-1 rounded-full mb-6">ALL-INCLUSIVE PLATFORM</div>
                <div className="flex items-baseline justify-center gap-2 mb-2">
                  <span className="text-6xl sm:text-7xl font-bold text-white">$99</span>
                  <span className="text-dark-400 text-xl">/month</span>
                </div>
                <p className="text-dark-400 text-lg">+ pay per image analyzed</p>
              </div>

              <div className="border-t border-dark-700 pt-8 mb-8">
                <h4 className="text-sm font-bold text-msk-400 uppercase tracking-wider mb-4">Cost per study (billed monthly)</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { mod: 'X-Ray', price: '$0.16' },
                    { mod: 'CT (2D slices)', price: '$0.89' },
                    { mod: 'MRI (2D slices)', price: '$0.89' },
                    { mod: 'Mammography', price: '$0.26' },
                    { mod: 'DEXA', price: '$0.16' },
                    { mod: 'Dental X-Ray', price: '$0.16' }
                  ].map((m, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-dark-800/50 border border-dark-700">
                      <span className="text-dark-300 text-sm">{m.mod}</span>
                      <span className="text-msk-400 font-bold text-sm">{m.price}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-dark-700 pt-8 mb-8">
                <h4 className="text-sm font-bold text-msk-400 uppercase tracking-wider mb-4">What typical customers pay per month</h4>
                <div className="space-y-3">
                  {[
                    { type: 'Small clinic', vol: '500 X-rays', total: '$179' },
                    { type: 'Solo radiologist', vol: '1,500 X-rays', total: '$339' },
                    { type: 'Mid-size group', vol: '3,000 X-rays', total: '$579' },
                    { type: 'Hospital dept', vol: '5,000 mixed', total: '$1,799' }
                  ].map((ex, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-dark-800/30 border border-dark-700/50">
                      <div>
                        <span className="text-white text-sm font-medium">{ex.type}</span>
                        <span className="text-dark-500 text-xs ml-2">({ex.vol}/mo)</span>
                      </div>
                      <div className="text-right">
                        <span className="text-white font-bold">{ex.total}</span>
                        <span className="text-dark-500 text-xs ml-1">/mo</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-dark-700 pt-8 mb-8">
                <h4 className="text-sm font-bold text-msk-400 uppercase tracking-wider mb-4">Everything included</h4>
                <div className="grid sm:grid-cols-2 gap-2">
                  {[
                    'All 6 modalities', 'AI Copilot reports', 'ICD-10 auto-coding', 'Patient portal',
                    'Secure messaging', 'Lina voice assistant', 'RPM billing (CPT 99453/99454)', 'FHIR R4 export',
                    'Workers\' comp module', 'Insurance claims engine', 'ROM assessment (camera)', 'HIPAA compliant',
                    'Full audit trail', 'EMR-ready export', 'Multi-provider dashboard', 'Appointment scheduling'
                  ].map((f, j) => (
                    <div key={j} className="flex items-center gap-2 text-sm text-dark-300 py-1">
                      <span className="text-msk-500 flex-shrink-0">&#10003;</span> {f}
                    </div>
                  ))}
                </div>
              </div>

              <Link to="/register" className="btn-primary w-full text-center block text-lg py-4">Start Free Trial</Link>
              <p className="text-dark-500 text-xs text-center mt-4">No credit card required. First 10 studies on us.</p>
            </div>

            <div className="mt-8 p-6 rounded-xl bg-dark-800/30 border border-dark-700 text-center">
              <h4 className="text-white font-bold mb-2">Enterprise & Volume Discounts</h4>
              <p className="text-dark-400 text-sm mb-4">Processing 10,000+ studies per month? We offer volume pricing, white-label branding, SLA guarantees, dedicated account management, and on-premise deployment.</p>
              <a href="mailto:mstagg@digit2ai.com?subject=ImagingMind%20%E2%80%94%20Enterprise%20Inquiry" className="text-msk-400 hover:text-msk-300 font-medium text-sm transition-colors">Contact Sales &rarr;</a>
            </div>
          </div>
        </div>
      </section>

      {/* B2B */}
      <section className="max-w-7xl mx-auto px-6 py-24">
        <div className="card bg-gradient-to-br from-dark-800 to-dark-900 border-dark-600">
          <div className="max-w-2xl mx-auto text-center">
            <h3 className="text-3xl font-bold text-white mb-4">Enterprise Diagnostic Imaging</h3>
            <p className="text-dark-300 mb-8">
              Hospitals, imaging centers, radiology groups, and healthcare networks — deploy AI diagnostic imaging at scale across all modalities with custom integrations, volume pricing, and dedicated support.
            </p>
            <div className="flex flex-wrap justify-center gap-3 mb-8">
              {['Hospitals', 'Imaging Centers', 'Radiology Groups', 'Sports Medicine', 'Urgent Care', 'Dental Clinics'].map(tag => (
                <span key={tag} className="badge bg-msk-600/10 text-msk-400 border border-msk-600/20 px-4 py-2">{tag}</span>
              ))}
            </div>
            <a href="mailto:mstagg@digit2ai.com?subject=ImagingMind%20%E2%80%94%20Enterprise%20Inquiry" className="btn-primary inline-block">Contact Sales</a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-dark-800 py-16">
        <div className="max-w-7xl mx-auto px-6 flex flex-col items-center gap-6">
          <img src={mskLogo} alt="ImagingMind AI Diagnostics" className="h-20 sm:h-24 lg:h-28 w-auto object-contain opacity-80" />
          <p className="text-dark-500 text-sm">HIPAA Compliant | Encrypted | Board-Certified Specialists</p>
        </div>
      </footer>
    </div>
  );
}
