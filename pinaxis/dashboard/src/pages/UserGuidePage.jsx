import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'

function ChevronDownIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  )
}

function CheckCircleIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={copy} className="text-xs text-slate-400 hover:text-white transition-colors">
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

function CodeBlock({ children, label }) {
  return (
    <div className="mt-3 rounded-lg overflow-hidden border border-slate-700">
      {label && (
        <div className="flex items-center justify-between px-4 py-2 bg-slate-700/50 border-b border-slate-700">
          <span className="text-xs font-medium text-slate-300">{label}</span>
          <CopyButton text={children} />
        </div>
      )}
      <pre className="p-4 bg-slate-900/50 text-sm text-slate-300 overflow-x-auto whitespace-pre">{children}</pre>
    </div>
  )
}

function StepCard({ number, title, children, isActive, onClick }) {
  return (
    <div className={`rounded-lg border transition-all ${isActive ? 'border-pinaxis-500/50 bg-slate-800/80' : 'border-slate-700 bg-slate-800/40'}`}>
      <button onClick={onClick} className="w-full flex items-center gap-4 p-5 text-left">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 ${
          isActive ? 'bg-pinaxis-600 text-white' : 'bg-slate-700 text-slate-400'
        }`}>
          {number}
        </div>
        <h3 className="text-lg font-semibold text-white flex-1">{title}</h3>
        <ChevronDownIcon className={`w-5 h-5 text-slate-400 transition-transform ${isActive ? 'rotate-180' : ''}`} />
      </button>
      {isActive && (
        <div className="px-5 pb-5 space-y-4 animate-fade-in">
          {children}
        </div>
      )}
    </div>
  )
}

export default function UserGuidePage() {
  const navigate = useNavigate()
  const [activeScenario, setActiveScenario] = useState(1)
  const [activeStep1, setActiveStep1] = useState(1)
  const [activeStep2, setActiveStep2] = useState(1)

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">User Guide</h1>
        <p className="text-slate-400">
          Learn how to run test demos with PINAXIS. Choose a scenario below to get started.
        </p>
      </div>

      {/* Scenario Selector */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <button
          onClick={() => setActiveScenario(1)}
          className={`p-6 rounded-lg border-2 text-left transition-all ${
            activeScenario === 1
              ? 'border-pinaxis-500 bg-pinaxis-600/10'
              : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
          }`}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              activeScenario === 1 ? 'bg-pinaxis-600 text-white' : 'bg-slate-700 text-slate-400'
            }`}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
            </div>
            <span className={`text-xs font-medium px-2 py-0.5 rounded ${
              activeScenario === 1 ? 'bg-pinaxis-600/30 text-pinaxis-300' : 'bg-slate-700 text-slate-400'
            }`}>Scenario 1</span>
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">Synthetic Data Demo</h3>
          <p className="text-sm text-slate-400">One-click demo with auto-generated warehouse data. No files needed.</p>
        </button>

        <button
          onClick={() => setActiveScenario(2)}
          className={`p-6 rounded-lg border-2 text-left transition-all ${
            activeScenario === 2
              ? 'border-pinaxis-500 bg-pinaxis-600/10'
              : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
          }`}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              activeScenario === 2 ? 'bg-pinaxis-600 text-white' : 'bg-slate-700 text-slate-400'
            }`}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <span className={`text-xs font-medium px-2 py-0.5 rounded ${
              activeScenario === 2 ? 'bg-pinaxis-600/30 text-pinaxis-300' : 'bg-slate-700 text-slate-400'
            }`}>Scenario 2</span>
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">CSV / JSON File Upload</h3>
          <p className="text-sm text-slate-400">Upload your own data files (CSV or XLSX) through the dashboard upload flow.</p>
        </button>
      </div>

      {/* ============================================================ */}
      {/* SCENARIO 1: Synthetic Demo */}
      {/* ============================================================ */}
      {activeScenario === 1 && (
        <div className="space-y-4">
          <div className="card bg-gradient-to-r from-pinaxis-900/30 to-slate-800 border-pinaxis-700/30 mb-6">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-pinaxis-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
              <div>
                <h3 className="text-white font-semibold mb-1">What is the Synthetic Demo?</h3>
                <p className="text-sm text-slate-300">
                  PINAXIS generates a complete demo project with realistic warehouse data for a fictional company
                  ("Demo Warehouse GmbH"). It creates ~500 SKUs with item dimensions, inventory snapshots,
                  goods-in receipts, and goods-out shipments spanning 12 months. The analysis runs automatically,
                  so you can explore every page of the platform instantly.
                </p>
              </div>
            </div>
          </div>

          <StepCard
            number={1}
            title="Navigate to the Upload Page"
            isActive={activeStep1 === 1}
            onClick={() => setActiveStep1(activeStep1 === 1 ? 0 : 1)}
          >
            <p className="text-sm text-slate-300 ml-14">
              Go to the <strong className="text-white">Upload</strong> page from the sidebar (first step).
              This is the landing page when you log in.
            </p>
            <div className="ml-14">
              <button onClick={() => navigate('/')} className="btn-ghost text-sm">
                Go to Upload Page &rarr;
              </button>
            </div>
          </StepCard>

          <StepCard
            number={2}
            title='Click "Generate Demo"'
            isActive={activeStep1 === 2}
            onClick={() => setActiveStep1(activeStep1 === 2 ? 0 : 2)}
          >
            <p className="text-sm text-slate-300 ml-14">
              At the top of the Upload page, you'll see a <strong className="text-white">Quick Demo</strong> card
              with a blue <strong className="text-pinaxis-400">"Generate Demo"</strong> button. Click it.
            </p>
            <div className="ml-14 p-4 rounded-lg bg-slate-900/50 border border-slate-700">
              <p className="text-xs text-slate-500 mb-2">What happens behind the scenes:</p>
              <ul className="text-sm text-slate-400 space-y-1">
                <li className="flex items-start gap-2">
                  <CheckCircleIcon className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                  Creates a new project: "Demo Warehouse GmbH"
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircleIcon className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                  Generates ~500 SKUs with realistic dimensions and weights
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircleIcon className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                  Creates inventory snapshots with bin locations
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircleIcon className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                  Generates 12 months of goods-in and goods-out transactions
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircleIcon className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                  Runs the full analysis engine automatically
                </li>
              </ul>
            </div>
          </StepCard>

          <StepCard
            number={3}
            title="Explore the Analysis Dashboard"
            isActive={activeStep1 === 3}
            onClick={() => setActiveStep1(activeStep1 === 3 ? 0 : 3)}
          >
            <p className="text-sm text-slate-300 ml-14">
              After generation completes (~5-10 seconds), you'll be automatically redirected to the
              <strong className="text-white"> Analysis</strong> page. From there, navigate through each step:
            </p>
            <div className="ml-14 grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              {[
                { step: 'Analysis', desc: 'Order structure, throughput, ABC classification, seasonal patterns' },
                { step: 'Products', desc: 'GEBHARDT product recommendations with fit scores' },
                { step: 'ROI Projection', desc: 'Cost-benefit analysis and payback period' },
                { step: 'Report', desc: 'Generate and download a full PDF report with charts' },
                { step: 'API Integration', desc: 'Generate API keys for production data feeds' },
              ].map(item => (
                <div key={item.step} className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                  <p className="text-sm font-medium text-white">{item.step}</p>
                  <p className="text-xs text-slate-400 mt-1">{item.desc}</p>
                </div>
              ))}
            </div>
          </StepCard>

          <StepCard
            number={4}
            title="Download the PDF Report"
            isActive={activeStep1 === 4}
            onClick={() => setActiveStep1(activeStep1 === 4 ? 0 : 4)}
          >
            <p className="text-sm text-slate-300 ml-14">
              Navigate to the <strong className="text-white">Report</strong> page and click
              <strong className="text-pinaxis-400"> "Generate Report"</strong>. Once generated, click
              <strong className="text-pinaxis-400"> "Download PDF"</strong> to get a comprehensive report
              with charts, tables, and product recommendations.
            </p>
          </StepCard>
        </div>
      )}

      {/* ============================================================ */}
      {/* SCENARIO 2: CSV / JSON File Upload */}
      {/* ============================================================ */}
      {activeScenario === 2 && (
        <div className="space-y-4">
          <div className="card bg-gradient-to-r from-pinaxis-900/30 to-slate-800 border-pinaxis-700/30 mb-6">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-pinaxis-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
              <div>
                <h3 className="text-white font-semibold mb-1">Upload Your Own Data</h3>
                <p className="text-sm text-slate-300">
                  Upload real or test warehouse data files through the dashboard.
                  Supported formats: <strong className="text-white">CSV</strong> (semicolon or comma delimited) and
                  <strong className="text-white"> XLSX</strong> (Excel). Max file size: 50 MB.
                  You need at minimum <strong className="text-white">Item Master</strong> and
                  <strong className="text-white"> Goods Out</strong> files to run the analysis.
                </p>
              </div>
            </div>
          </div>

          <StepCard
            number={1}
            title="Prepare Your Data Files"
            isActive={activeStep2 === 1}
            onClick={() => setActiveStep2(activeStep2 === 1 ? 0 : 1)}
          >
            <p className="text-sm text-slate-300 ml-14 mb-3">
              You need up to 4 data files. Column names are flexible — PINAXIS auto-maps common aliases
              (e.g., "article" → "sku", "qty" → "quantity", "Artikelnummer" → "sku").
            </p>

            {/* Item Master */}
            <div className="ml-14 space-y-4">
              <div className="rounded-lg border border-slate-700 overflow-hidden">
                <div className="px-4 py-3 bg-slate-700/30 border-b border-slate-700 flex items-center gap-2">
                  <span className="text-xs font-medium px-2 py-0.5 rounded bg-red-500/20 text-red-300">Required</span>
                  <h4 className="text-sm font-semibold text-white">Item Master</h4>
                </div>
                <div className="p-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-400">
                        <th className="pb-2 font-medium">Column</th>
                        <th className="pb-2 font-medium">Required</th>
                        <th className="pb-2 font-medium">Description</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-300">
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2 font-mono text-xs text-pinaxis-300">sku</td>
                        <td className="py-2 text-red-300">Yes</td>
                        <td className="py-2">Unique product identifier</td>
                      </tr>
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2 font-mono text-xs text-slate-400">description</td>
                        <td className="py-2 text-slate-500">No</td>
                        <td className="py-2">Product name / description</td>
                      </tr>
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2 font-mono text-xs text-slate-400">length_mm, width_mm, height_mm</td>
                        <td className="py-2 text-slate-500">No</td>
                        <td className="py-2">Dimensions in millimeters</td>
                      </tr>
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2 font-mono text-xs text-slate-400">weight_kg</td>
                        <td className="py-2 text-slate-500">No</td>
                        <td className="py-2">Weight in kilograms</td>
                      </tr>
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2 font-mono text-xs text-slate-400">pieces_per_picking_unit</td>
                        <td className="py-2 text-slate-500">No</td>
                        <td className="py-2">Units per pick container</td>
                      </tr>
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2 font-mono text-xs text-slate-400">category</td>
                        <td className="py-2 text-slate-500">No</td>
                        <td className="py-2">Product category</td>
                      </tr>
                    </tbody>
                  </table>
                  <CodeBlock label="item_master.csv (example)">{`sku;description;length_mm;width_mm;height_mm;weight_kg;category
SKU-001;Widget A;300;200;150;2.5;Electronics
SKU-002;Gadget B;450;300;200;4.1;Hardware
SKU-003;Part C;120;80;60;0.3;Small Parts`}</CodeBlock>
                </div>
              </div>

              {/* Goods Out */}
              <div className="rounded-lg border border-slate-700 overflow-hidden">
                <div className="px-4 py-3 bg-slate-700/30 border-b border-slate-700 flex items-center gap-2">
                  <span className="text-xs font-medium px-2 py-0.5 rounded bg-red-500/20 text-red-300">Required</span>
                  <h4 className="text-sm font-semibold text-white">Goods Out (Shipments)</h4>
                </div>
                <div className="p-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-400">
                        <th className="pb-2 font-medium">Column</th>
                        <th className="pb-2 font-medium">Required</th>
                        <th className="pb-2 font-medium">Description</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-300">
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2 font-mono text-xs text-pinaxis-300">sku</td>
                        <td className="py-2 text-red-300">Yes</td>
                        <td className="py-2">Product SKU (must match Item Master)</td>
                      </tr>
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2 font-mono text-xs text-pinaxis-300">order_id</td>
                        <td className="py-2 text-red-300">Yes</td>
                        <td className="py-2">Order number</td>
                      </tr>
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2 font-mono text-xs text-pinaxis-300">ship_date</td>
                        <td className="py-2 text-red-300">Yes</td>
                        <td className="py-2">Shipping date (YYYY-MM-DD)</td>
                      </tr>
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2 font-mono text-xs text-slate-400">quantity</td>
                        <td className="py-2 text-slate-500">No</td>
                        <td className="py-2">Quantity shipped (defaults to 1)</td>
                      </tr>
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2 font-mono text-xs text-slate-400">customer_id</td>
                        <td className="py-2 text-slate-500">No</td>
                        <td className="py-2">Customer identifier</td>
                      </tr>
                    </tbody>
                  </table>
                  <CodeBlock label="goods_out.csv (example)">{`sku;order_id;ship_date;quantity;customer_id
SKU-001;ORD-1001;2024-01-15;5;CUST-A
SKU-002;ORD-1001;2024-01-15;2;CUST-A
SKU-003;ORD-1002;2024-01-16;12;CUST-B
SKU-001;ORD-1003;2024-01-17;3;CUST-C`}</CodeBlock>
                </div>
              </div>

              {/* Inventory */}
              <div className="rounded-lg border border-slate-700 overflow-hidden">
                <div className="px-4 py-3 bg-slate-700/30 border-b border-slate-700 flex items-center gap-2">
                  <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-600/50 text-slate-300">Optional</span>
                  <h4 className="text-sm font-semibold text-white">Inventory Snapshot</h4>
                </div>
                <div className="p-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-400">
                        <th className="pb-2 font-medium">Column</th>
                        <th className="pb-2 font-medium">Required</th>
                        <th className="pb-2 font-medium">Description</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-300">
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2 font-mono text-xs text-pinaxis-300">sku</td>
                        <td className="py-2 text-red-300">Yes</td>
                        <td className="py-2">Product SKU</td>
                      </tr>
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2 font-mono text-xs text-slate-400">stock</td>
                        <td className="py-2 text-slate-500">No</td>
                        <td className="py-2">Current stock quantity</td>
                      </tr>
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2 font-mono text-xs text-slate-400">location</td>
                        <td className="py-2 text-slate-500">No</td>
                        <td className="py-2">Storage location code</td>
                      </tr>
                    </tbody>
                  </table>
                  <CodeBlock label="inventory.csv (example)">{`sku;stock;location;snapshot_date
SKU-001;150;A-01-03;2024-06-01
SKU-002;42;B-02-01;2024-06-01
SKU-003;800;C-05-12;2024-06-01`}</CodeBlock>
                </div>
              </div>

              {/* Goods In */}
              <div className="rounded-lg border border-slate-700 overflow-hidden">
                <div className="px-4 py-3 bg-slate-700/30 border-b border-slate-700 flex items-center gap-2">
                  <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-600/50 text-slate-300">Optional</span>
                  <h4 className="text-sm font-semibold text-white">Goods In (Receipts)</h4>
                </div>
                <div className="p-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-400">
                        <th className="pb-2 font-medium">Column</th>
                        <th className="pb-2 font-medium">Required</th>
                        <th className="pb-2 font-medium">Description</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-300">
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2 font-mono text-xs text-pinaxis-300">sku</td>
                        <td className="py-2 text-red-300">Yes</td>
                        <td className="py-2">Product SKU</td>
                      </tr>
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2 font-mono text-xs text-pinaxis-300">receipt_date</td>
                        <td className="py-2 text-red-300">Yes</td>
                        <td className="py-2">Receipt date (YYYY-MM-DD)</td>
                      </tr>
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2 font-mono text-xs text-slate-400">quantity</td>
                        <td className="py-2 text-slate-500">No</td>
                        <td className="py-2">Quantity received</td>
                      </tr>
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2 font-mono text-xs text-slate-400">supplier</td>
                        <td className="py-2 text-slate-500">No</td>
                        <td className="py-2">Supplier name</td>
                      </tr>
                    </tbody>
                  </table>
                  <CodeBlock label="goods_in.csv (example)">{`sku;receipt_date;quantity;receipt_id;supplier
SKU-001;2024-01-10;100;REC-501;Supplier Alpha
SKU-002;2024-01-12;50;REC-502;Supplier Beta
SKU-003;2024-01-14;500;REC-503;Supplier Alpha`}</CodeBlock>
                </div>
              </div>
            </div>
          </StepCard>

          <StepCard
            number={2}
            title="Create Project & Enter Company Info"
            isActive={activeStep2 === 2}
            onClick={() => setActiveStep2(activeStep2 === 2 ? 0 : 2)}
          >
            <p className="text-sm text-slate-300 ml-14">
              On the <strong className="text-white">Upload</strong> page, fill in the company information form:
            </p>
            <ul className="ml-14 text-sm text-slate-300 space-y-2 mt-2">
              <li className="flex items-start gap-2">
                <CheckCircleIcon className="w-4 h-4 text-pinaxis-400 mt-0.5 flex-shrink-0" />
                <span><strong className="text-white">Company Name</strong> (required) — e.g., "Test Corp GmbH"</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircleIcon className="w-4 h-4 text-pinaxis-400 mt-0.5 flex-shrink-0" />
                <span><strong className="text-white">Contact Name</strong> (optional) — e.g., "Max Mustermann"</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircleIcon className="w-4 h-4 text-pinaxis-400 mt-0.5 flex-shrink-0" />
                <span><strong className="text-white">Industry</strong> (optional) — select from dropdown</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircleIcon className="w-4 h-4 text-pinaxis-400 mt-0.5 flex-shrink-0" />
                <span><strong className="text-white">Country</strong> (optional) — select from dropdown</span>
              </li>
            </ul>
            <p className="ml-14 text-sm text-slate-400 mt-3">
              Click <strong className="text-pinaxis-400">"Continue to Upload"</strong> to proceed.
            </p>
            <div className="ml-14">
              <button onClick={() => navigate('/')} className="btn-ghost text-sm">
                Go to Upload Page &rarr;
              </button>
            </div>
          </StepCard>

          <StepCard
            number={3}
            title="Upload Your CSV / XLSX Files"
            isActive={activeStep2 === 3}
            onClick={() => setActiveStep2(activeStep2 === 3 ? 0 : 3)}
          >
            <p className="text-sm text-slate-300 ml-14">
              Drag and drop (or click to browse) your files into each upload zone.
              You'll see upload status, row count, and any warnings for each file.
            </p>
            <div className="ml-14 p-4 rounded-lg bg-slate-900/50 border border-slate-700 mt-2">
              <p className="text-xs text-slate-500 mb-2">Tips:</p>
              <ul className="text-sm text-slate-400 space-y-1">
                <li>- CSV files can use <code className="text-pinaxis-300">;</code> or <code className="text-pinaxis-300">,</code> as delimiter (auto-detected)</li>
                <li>- XLSX files: only the first sheet is read</li>
                <li>- Column names are case-insensitive and auto-mapped</li>
                <li>- German column names (Artikelnummer, Menge, etc.) are supported</li>
                <li>- Minimum required: <strong className="text-white">Item Master</strong> + <strong className="text-white">Goods Out</strong></li>
              </ul>
            </div>
          </StepCard>

          <StepCard
            number={4}
            title='Click "Run Full Analysis"'
            isActive={activeStep2 === 4}
            onClick={() => setActiveStep2(activeStep2 === 4 ? 0 : 4)}
          >
            <p className="text-sm text-slate-300 ml-14">
              Once you've uploaded at least the Item Master and Goods Out files, the
              <strong className="text-pinaxis-400"> "Run Full Analysis"</strong> button becomes active.
              Click it to start the analysis engine.
            </p>
            <div className="ml-14 p-4 rounded-lg bg-slate-900/50 border border-slate-700 mt-2">
              <p className="text-xs text-slate-500 mb-2">The analysis engine computes:</p>
              <ul className="text-sm text-slate-400 space-y-1">
                <li className="flex items-start gap-2">
                  <CheckCircleIcon className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                  Order structure analysis (single-line vs multi-line, lines per order)
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircleIcon className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                  Monthly and weekday throughput patterns
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircleIcon className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                  ABC classification (by order frequency and volume)
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircleIcon className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                  Seasonality index and peak detection
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircleIcon className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                  GEBHARDT product fit scoring and recommendations
                </li>
              </ul>
            </div>
          </StepCard>

          <StepCard
            number={5}
            title="Walk Through the Results"
            isActive={activeStep2 === 5}
            onClick={() => setActiveStep2(activeStep2 === 5 ? 0 : 5)}
          >
            <p className="text-sm text-slate-300 ml-14">
              After analysis completes, navigate through the sidebar steps to explore your results.
              Each page builds on the analysis to provide deeper insights.
            </p>
            <div className="ml-14 mt-3 space-y-2">
              {[
                { num: '2', name: 'Analysis', desc: 'View order structure charts, throughput heatmaps, ABC curves, and seasonal trends from your data.' },
                { num: '3', name: 'Products', desc: 'See recommended GEBHARDT automation products with fit scores based on your warehouse profile.' },
                { num: '4', name: 'ROI Projection', desc: 'Review cost-benefit analysis, projected savings, and payback period estimates.' },
                { num: '5', name: 'Report', desc: 'Generate and download a comprehensive PDF report with all analysis, charts, and recommendations.' },
                { num: '6', name: 'API Integration', desc: 'Set up production API keys for live WMS/ERP data feeds.' },
              ].map(item => (
                <div key={item.num} className="flex items-start gap-3 p-3 rounded-lg bg-slate-900/30">
                  <div className="w-7 h-7 rounded flex items-center justify-center bg-slate-700 text-slate-300 text-xs font-bold flex-shrink-0">
                    {item.num}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{item.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </StepCard>
        </div>
      )}

      {/* JSON via API section (bonus tip) */}
      {activeScenario === 2 && (
        <div className="mt-8 card border-slate-700">
          <h3 className="text-lg font-semibold text-white mb-2">Bonus: Ingest Data via JSON API</h3>
          <p className="text-sm text-slate-300 mb-4">
            Instead of uploading CSV files through the dashboard, you can also push JSON records
            directly via the Production API. First generate an API key from the
            <strong className="text-white"> API Integration</strong> page, then use curl or any HTTP client.
          </p>
          <CodeBlock label="Example: Ingest item master via JSON API">{`curl -X POST https://aiagent.ringlypro.com/pinaxis/api/v1/ingest/{projectId}/item-master \\
  -H "X-API-Key: pnx_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "records": [
      {"sku": "SKU-001", "description": "Widget A", "length_mm": 300, "width_mm": 200, "height_mm": 150, "weight_kg": 2.5},
      {"sku": "SKU-002", "description": "Gadget B", "length_mm": 450, "width_mm": 300, "height_mm": 200, "weight_kg": 4.1}
    ],
    "mode": "upsert"
  }'`}</CodeBlock>
          <p className="text-xs text-slate-500 mt-3">
            See the <strong className="text-slate-300">API Integration</strong> page for full endpoint documentation and more examples.
          </p>
        </div>
      )}
    </div>
  )
}
