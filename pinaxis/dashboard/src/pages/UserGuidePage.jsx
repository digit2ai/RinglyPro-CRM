import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ITEM_MASTER_CSV, INVENTORY_CSV, GOODS_IN_CSV, GOODS_OUT_CSV, downloadCSV } from '../lib/sampleData'

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

function DownloadIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
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
  const [activeScenario, setActiveScenario] = useState(0)
  const [activeStep0, setActiveStep0] = useState(1)
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <button
          onClick={() => setActiveScenario(0)}
          className={`p-6 rounded-lg border-2 text-left transition-all ${
            activeScenario === 0
              ? 'border-pinaxis-500 bg-pinaxis-600/10'
              : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
          }`}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              activeScenario === 0 ? 'bg-pinaxis-600 text-white' : 'bg-slate-700 text-slate-400'
            }`}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
              </svg>
            </div>
            <span className={`text-xs font-medium px-2 py-0.5 rounded ${
              activeScenario === 0 ? 'bg-pinaxis-600/30 text-pinaxis-300' : 'bg-slate-700 text-slate-400'
            }`}>Overview</span>
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">How a Warehouse Works</h3>
          <p className="text-sm text-slate-400">Learn the fundamentals of warehouse logistics and how PINAXIS analyzes operations.</p>
        </button>

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
      {/* SCENARIO 0: How a Warehouse / Distribution Center Works */}
      {/* ============================================================ */}
      {activeScenario === 0 && (
        <div className="space-y-6">
          {/* Intro */}
          <div className="card bg-gradient-to-r from-pinaxis-900/30 to-slate-800 border-pinaxis-700/30">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-pinaxis-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
              </svg>
              <div>
                <h3 className="text-white font-semibold mb-1">How a Tier-1 Distribution Center Works</h3>
                <p className="text-sm text-slate-300">
                  A modern distribution center (DC) is the operational heart of any supply chain. It receives goods from suppliers, stores them efficiently, and fulfills customer orders as fast as possible. Understanding these core processes is essential to evaluating where automation delivers the highest ROI.
                </p>
              </div>
            </div>
          </div>

          {/* Visual Flow Diagram */}
          <div className="card">
            <h3 className="text-lg font-semibold text-white mb-4">End-to-End Material Flow</h3>
            <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
              {[
                { label: 'Goods Receiving', color: 'bg-blue-600' },
                { label: 'Quality Check', color: 'bg-blue-500' },
                { label: 'Put-Away', color: 'bg-indigo-600' },
                { label: 'Storage', color: 'bg-violet-600' },
                { label: 'Order Release', color: 'bg-purple-600' },
                { label: 'Picking', color: 'bg-fuchsia-600' },
                { label: 'Packing', color: 'bg-pink-600' },
                { label: 'Labeling', color: 'bg-orange-600' },
                { label: 'Shipping', color: 'bg-rose-600' },
              ].map((step, i) => (
                <div key={step.label} className="flex items-center gap-2">
                  <div className={`px-3 py-2 rounded-lg ${step.color} text-white font-medium text-xs sm:text-sm`}>
                    {step.label}
                  </div>
                  {i < 8 && (
                    <svg className="w-4 h-4 text-slate-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Process Details */}
          <StepCard
            number={1}
            title="Goods Receiving (Inbound)"
            isActive={activeStep0 === 1}
            onClick={() => setActiveStep0(activeStep0 === 1 ? 0 : 1)}
          >
            <div className="ml-14 space-y-3">
              <p className="text-sm text-slate-300">
                Trucks arrive at the receiving dock carrying pallets, cartons, or containers from suppliers. Each delivery is checked against a <strong className="text-white">Purchase Order (PO)</strong> to verify quantities, SKU codes, and condition.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Key Data Captured</p>
                  <ul className="text-sm text-slate-300 space-y-1">
                    <li>- Receipt ID and date</li>
                    <li>- SKU and quantity received</li>
                    <li>- Supplier / vendor name</li>
                    <li>- Lot / batch numbers</li>
                  </ul>
                </div>
                <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">PINAXIS Mapping</p>
                  <p className="text-sm text-slate-300">This data maps to the <strong className="text-pinaxis-300">Goods In</strong> file. PINAXIS uses it to analyze inbound throughput patterns and supplier delivery frequency.</p>
                </div>
              </div>
            </div>
          </StepCard>

          <StepCard
            number={2}
            title="Storage & Inventory Management"
            isActive={activeStep0 === 2}
            onClick={() => setActiveStep0(activeStep0 === 2 ? 0 : 2)}
          >
            <div className="ml-14 space-y-3">
              <p className="text-sm text-slate-300">
                After receiving, items are <strong className="text-white">put away</strong> into designated storage locations. A modern DC uses multiple storage zones optimized for different item types:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                  <p className="text-sm font-medium text-white">Pallet Racking</p>
                  <p className="text-xs text-slate-400 mt-1">Large / heavy items stored on pallets in floor-to-ceiling racks. Accessed by forklifts or automated storage/retrieval systems (AS/RS).</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                  <p className="text-sm font-medium text-white">Bin / Tote Storage</p>
                  <p className="text-xs text-slate-400 mt-1">Small to medium items in standardized bins (600x400mm). Ideal for shuttle systems and goods-to-person automation.</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                  <p className="text-sm font-medium text-white">Flow Racks / Shelving</p>
                  <p className="text-xs text-slate-400 mt-1">Fast-moving items placed at pick-face level for quick manual or automated access. FIFO rotation.</p>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">PINAXIS Mapping</p>
                <p className="text-sm text-slate-300">The <strong className="text-pinaxis-300">Item Master</strong> file provides SKU dimensions and weights to determine bin-capability. The <strong className="text-pinaxis-300">Inventory</strong> snapshot shows current stock levels and storage locations. PINAXIS calculates what percentage of items fit in standard bins — a key metric for automation feasibility.</p>
              </div>
            </div>
          </StepCard>

          <StepCard
            number={3}
            title="Order Fulfillment (Picking & Packing)"
            isActive={activeStep0 === 3}
            onClick={() => setActiveStep0(activeStep0 === 3 ? 0 : 3)}
          >
            <div className="ml-14 space-y-3">
              <p className="text-sm text-slate-300">
                When a customer order arrives, the Warehouse Management System (WMS) releases it for <strong className="text-white">picking</strong> — retrieving the correct items from storage locations. This is typically the most labor-intensive and costly process in a DC. Performance is measured in <strong className="text-white">CPH (Cases Per Hour)</strong> — the number of items a picker or automated system can process per hour.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                  <p className="text-sm font-medium text-white">Single-Line Orders</p>
                  <p className="text-xs text-slate-400 mt-1">Orders with just 1 product. Common in e-commerce. Can be fulfilled with simple pick-and-pack processes or directly from goods-to-person stations.</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                  <p className="text-sm font-medium text-white">Multi-Line Orders</p>
                  <p className="text-xs text-slate-400 mt-1">Orders with 2+ different products that must be consolidated. Requires batch picking, zone picking, or multi-shuttle sequencing to minimize travel time.</p>
                </div>
              </div>

              {/* CPH Benchmark Table */}
              <div className="rounded-lg border border-slate-700 overflow-hidden">
                <div className="px-4 py-3 bg-slate-700/30 border-b border-slate-700">
                  <h4 className="text-sm font-semibold text-white">CPH Benchmarks — Cases Per Hour by Picking Method</h4>
                </div>
                <div className="p-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-400 border-b border-slate-700">
                        <th className="pb-2 font-medium">Picking Method</th>
                        <th className="pb-2 font-medium text-center">CPH Range</th>
                        <th className="pb-2 font-medium">Best For</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-300">
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2.5 font-medium text-white">Manual Pick-to-Cart</td>
                        <td className="py-2.5 text-center"><span className="px-2 py-0.5 rounded bg-red-500/20 text-red-300 text-xs font-mono">60–120</span></td>
                        <td className="py-2.5 text-xs text-slate-400">Low-volume, high-variety warehouses</td>
                      </tr>
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2.5 font-medium text-white">Pick-to-Light</td>
                        <td className="py-2.5 text-center"><span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-xs font-mono">150–300</span></td>
                        <td className="py-2.5 text-xs text-slate-400">Medium-volume with fixed pick faces</td>
                      </tr>
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2.5 font-medium text-white">Goods-to-Person (Shuttle)</td>
                        <td className="py-2.5 text-center"><span className="px-2 py-0.5 rounded bg-green-500/20 text-green-300 text-xs font-mono">300–600</span></td>
                        <td className="py-2.5 text-xs text-slate-400">High-volume e-commerce, small-parts</td>
                      </tr>
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2.5 font-medium text-white">High-Speed Shuttle + Sortation</td>
                        <td className="py-2.5 text-center"><span className="px-2 py-0.5 rounded bg-pinaxis-500/20 text-pinaxis-300 text-xs font-mono">600–1,200</span></td>
                        <td className="py-2.5 text-xs text-slate-400">Tier-1 DCs, peak-driven fulfillment</td>
                      </tr>
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2.5 font-medium text-white">Robotic Piece Picking</td>
                        <td className="py-2.5 text-center"><span className="px-2 py-0.5 rounded bg-violet-500/20 text-violet-300 text-xs font-mono">400–800</span></td>
                        <td className="py-2.5 text-xs text-slate-400">24/7 operations, labor-scarce markets</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-pinaxis-900/20 border border-pinaxis-500/30">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Why CPH Matters</p>
                <p className="text-sm text-slate-300">CPH directly determines how many <strong className="text-white">pick stations and workers</strong> you need. Doubling CPH from 120 (manual) to 600 (goods-to-person) means you need <strong className="text-white">5x fewer pick stations</strong> to handle the same volume — this is the core driver of automation ROI.</p>
              </div>

              <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">PINAXIS Mapping</p>
                <p className="text-sm text-slate-300">The <strong className="text-pinaxis-300">Goods Out</strong> file is the most critical dataset. PINAXIS analyzes order structure (single vs multi-line split), throughput patterns (monthly, weekday, hourly peaks), and <strong className="text-white">ABC classification</strong> to identify which items drive 80% of activity (A-items) vs slow movers (C-items). Peak CPH requirements are derived from the busiest hours in your data.</p>
              </div>
            </div>
          </StepCard>

          <StepCard
            number={4}
            title="Label Management System"
            isActive={activeStep0 === 4}
            onClick={() => setActiveStep0(activeStep0 === 4 ? 0 : 4)}
          >
            <div className="ml-14 space-y-3">
              <p className="text-sm text-slate-300">
                Labels are the <strong className="text-white">backbone of warehouse traceability</strong>. Every item, bin, location, and shipment relies on accurate labeling for identification, tracking, and compliance. A Label Management System (LMS) orchestrates label creation, printing, and application across the entire DC.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                  <p className="text-sm font-medium text-white">Receiving Labels</p>
                  <p className="text-xs text-slate-400 mt-1">Applied at goods-in: pallet ID labels, license plate numbers (LPNs), and put-away location barcodes. Links inbound shipments to WMS inventory records.</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                  <p className="text-sm font-medium text-white">Location / Bin Labels</p>
                  <p className="text-xs text-slate-400 mt-1">Permanent labels on racking, shelving, and bin positions. Include aisle, bay, level, and position codes. Scannable barcodes or RFID tags for pick accuracy.</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                  <p className="text-sm font-medium text-white">Product / SKU Labels</p>
                  <p className="text-xs text-slate-400 mt-1">Item-level barcodes (EAN/UPC, GS1-128) with SKU code, description, lot/batch, and expiry date. Essential for piece-level tracking in automated systems.</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                  <p className="text-sm font-medium text-white">Shipping Labels</p>
                  <p className="text-xs text-slate-400 mt-1">Carrier-compliant labels (UPS, DHL, FedEx) with tracking barcode, destination address, routing code, and service level. Auto-generated from WMS/TMS integration.</p>
                </div>
              </div>

              {/* Label Types Table */}
              <div className="rounded-lg border border-slate-700 overflow-hidden">
                <div className="px-4 py-3 bg-slate-700/30 border-b border-slate-700">
                  <h4 className="text-sm font-semibold text-white">Label Technologies in a Modern DC</h4>
                </div>
                <div className="p-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-400 border-b border-slate-700">
                        <th className="pb-2 font-medium">Technology</th>
                        <th className="pb-2 font-medium">Use Case</th>
                        <th className="pb-2 font-medium">Read Range</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-300">
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2.5 font-medium text-white">1D Barcode</td>
                        <td className="py-2.5 text-xs text-slate-400">Product labels, shipping labels, pick lists</td>
                        <td className="py-2.5"><span className="px-2 py-0.5 rounded bg-slate-700 text-slate-300 text-xs font-mono">0-50 cm</span></td>
                      </tr>
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2.5 font-medium text-white">2D / QR Code</td>
                        <td className="py-2.5 text-xs text-slate-400">High-density data: lot, expiry, serial number, URLs</td>
                        <td className="py-2.5"><span className="px-2 py-0.5 rounded bg-slate-700 text-slate-300 text-xs font-mono">0-100 cm</span></td>
                      </tr>
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2.5 font-medium text-white">RFID (Passive)</td>
                        <td className="py-2.5 text-xs text-slate-400">Pallet tracking, dock door reads, bulk inventory counts</td>
                        <td className="py-2.5"><span className="px-2 py-0.5 rounded bg-green-500/20 text-green-300 text-xs font-mono">1-12 m</span></td>
                      </tr>
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2.5 font-medium text-white">RFID (Active)</td>
                        <td className="py-2.5 text-xs text-slate-400">Real-time asset tracking, forklift/shuttle positioning</td>
                        <td className="py-2.5"><span className="px-2 py-0.5 rounded bg-pinaxis-500/20 text-pinaxis-300 text-xs font-mono">10-100 m</span></td>
                      </tr>
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2.5 font-medium text-white">GS1-128 / SSCC</td>
                        <td className="py-2.5 text-xs text-slate-400">Pallet-level shipping labels, EDI compliance, retail DC receiving</td>
                        <td className="py-2.5"><span className="px-2 py-0.5 rounded bg-slate-700 text-slate-300 text-xs font-mono">0-50 cm</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Print & Apply Systems</p>
                  <p className="text-sm text-slate-300">In automated DCs, <strong className="text-white">print-and-apply (P&A)</strong> machines automatically print and attach shipping labels to cartons on the conveyor line at speeds of 20-40 cartons/minute — eliminating manual labeling bottlenecks.</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Label Compliance</p>
                  <p className="text-sm text-slate-300">Retail customers (Amazon, Walmart, etc.) enforce strict <strong className="text-white">GS1 label standards</strong>. Non-compliant labels result in chargebacks of $5-$25 per violation. An LMS ensures every label meets carrier and retailer specifications.</p>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-pinaxis-900/20 border border-pinaxis-500/30">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Why It Matters for Automation</p>
                <p className="text-sm text-slate-300">Automated storage and retrieval systems rely entirely on <strong className="text-white">machine-readable labels</strong>. Every bin, tote, and item in a shuttle system must be accurately labeled for the system to function. PINAXIS analyzes SKU profiles to determine the right labeling strategy as part of the automation design.</p>
              </div>
            </div>
          </StepCard>

          <StepCard
            number={5}
            title="Shipping (Outbound)"
            isActive={activeStep0 === 5}
            onClick={() => setActiveStep0(activeStep0 === 5 ? 0 : 5)}
          >
            <div className="ml-14 space-y-3">
              <p className="text-sm text-slate-300">
                After picking, packing, and labeling, orders are staged at shipping docks, sorted by carrier and route, and loaded onto trucks for delivery. The outbound process must be synchronized with carrier pickup windows and customer SLAs.
              </p>
              <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Why Throughput Patterns Matter</p>
                <p className="text-sm text-slate-300">Peak shipping days (often Monday-Wednesday) create bottlenecks. PINAXIS identifies weekday and seasonal patterns so automation systems can be sized for actual peak demand, not just averages.</p>
              </div>
            </div>
          </StepCard>

          <StepCard
            number={6}
            title="ABC / Pareto Analysis"
            isActive={activeStep0 === 6}
            onClick={() => setActiveStep0(activeStep0 === 6 ? 0 : 6)}
          >
            <div className="ml-14 space-y-3">
              <p className="text-sm text-slate-300">
                The <strong className="text-white">Pareto Principle</strong> (80/20 rule) applies to almost every warehouse: a small fraction of SKUs drives the majority of order activity.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-green-900/20 border border-green-500/30">
                  <p className="text-sm font-bold text-green-400">A Items</p>
                  <p className="text-xs text-slate-300 mt-1">Top ~20% of SKUs generating ~80% of orders. These are the fast movers — prime candidates for automated goods-to-person systems.</p>
                </div>
                <div className="p-3 rounded-lg bg-amber-900/20 border border-amber-500/30">
                  <p className="text-sm font-bold text-amber-400">B Items</p>
                  <p className="text-xs text-slate-300 mt-1">Middle ~30% of SKUs generating ~15% of orders. Medium movers suited for semi-automated storage with shuttle or mini-load systems.</p>
                </div>
                <div className="p-3 rounded-lg bg-red-900/20 border border-red-500/30">
                  <p className="text-sm font-bold text-red-400">C Items</p>
                  <p className="text-xs text-slate-300 mt-1">Bottom ~50% of SKUs generating ~5% of orders. Slow movers often stored in static racking with manual picking.</p>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">PINAXIS Insight</p>
                <p className="text-sm text-slate-300">PINAXIS computes ABC classification by both <strong className="text-white">order frequency</strong> (how often an item is ordered) and <strong className="text-white">shipping volume</strong> (total units shipped). This dual classification reveals which items benefit most from automation investment.</p>
              </div>
            </div>
          </StepCard>

          <StepCard
            number={7}
            title="Automation & GEBHARDT Solutions"
            isActive={activeStep0 === 7}
            onClick={() => setActiveStep0(activeStep0 === 7 ? 0 : 7)}
          >
            <div className="ml-14 space-y-3">
              <p className="text-sm text-slate-300">
                GEBHARDT manufactures intralogistics automation systems that replace or augment manual warehouse processes. The right solution depends on item profiles, order structure, and throughput requirements.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                  <p className="text-sm font-medium text-white">StoreBiter One-Level Shuttle</p>
                  <p className="text-xs text-slate-400 mt-1">High-speed bin storage and retrieval. Each shuttle operates on a single level for maximum throughput. Ideal for A-items and high-velocity picking.</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                  <p className="text-sm font-medium text-white">StoreBiter Multi-Level Shuttle</p>
                  <p className="text-xs text-slate-400 mt-1">Shuttles travel across multiple levels via lifts. Balances throughput and storage density. Suited for mixed A/B item profiles.</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                  <p className="text-sm font-medium text-white">Mini-Load AS/RS</p>
                  <p className="text-xs text-slate-400 mt-1">Automated crane systems for bin and tray handling. High storage density in narrow aisles. Best for B/C items needing compact storage.</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                  <p className="text-sm font-medium text-white">Conveyor & Sortation</p>
                  <p className="text-xs text-slate-400 mt-1">Connects all systems together. Belt conveyors, roller conveyors, and sorters move bins between storage, picking stations, and packing areas.</p>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">PINAXIS Product Matching</p>
                <p className="text-sm text-slate-300">PINAXIS analyzes your warehouse data and scores each GEBHARDT product with a <strong className="text-white">fit score (0-100)</strong> based on your item dimensions, order structure, throughput requirements, and ABC distribution. This data-driven approach replaces subjective guesswork with quantifiable recommendations.</p>
              </div>
            </div>
          </StepCard>

          <StepCard
            number={8}
            title="ROI & Business Case"
            isActive={activeStep0 === 8}
            onClick={() => setActiveStep0(activeStep0 === 8 ? 0 : 8)}
          >
            <div className="ml-14 space-y-3">
              <p className="text-sm text-slate-300">
                Automation investment decisions require a clear financial justification. PINAXIS projects ROI across multiple benefit categories:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                  <p className="text-sm font-medium text-white">Labor Savings</p>
                  <p className="text-xs text-slate-400 mt-1">Reduced manual picking, packing, and put-away labor through goods-to-person automation.</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                  <p className="text-sm font-medium text-white">Space Optimization</p>
                  <p className="text-xs text-slate-400 mt-1">High-density automated storage uses 40-60% less floor space than conventional racking.</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                  <p className="text-sm font-medium text-white">Error Reduction</p>
                  <p className="text-xs text-slate-400 mt-1">Automated systems achieve 99.9%+ pick accuracy, reducing costly returns and re-shipments.</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                  <p className="text-sm font-medium text-white">Throughput Increase (CPH)</p>
                  <p className="text-xs text-slate-400 mt-1">Manual picking: 60-120 CPH. Goods-to-person shuttle: 300-600 CPH. High-speed shuttle + sortation: 600-1,200 CPH. Up to 10x throughput gain per station.</p>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-pinaxis-900/20 border border-pinaxis-500/30">
                <p className="text-sm text-slate-300">PINAXIS calculates <strong className="text-white">total annual savings</strong>, <strong className="text-white">payback period</strong>, and <strong className="text-white">5-year ROI</strong> based on your actual operational data — giving you the numbers to build a boardroom-ready business case.</p>
              </div>
            </div>
          </StepCard>

          <StepCard
            number={9}
            title="DC Software Stack (WMS / WES / WCS)"
            isActive={activeStep0 === 9}
            onClick={() => setActiveStep0(activeStep0 === 9 ? 0 : 9)}
          >
            <div className="ml-14 space-y-3">
              <p className="text-sm text-slate-300">
                A modern automated distribution center runs on a <strong className="text-white">three-layer software stack</strong> that coordinates everything from business-level order management down to individual motor commands on conveyor belts.
              </p>

              {/* Three-Layer Architecture Diagram */}
              <div className="rounded-lg border border-slate-700 overflow-hidden">
                <div className="px-4 py-3 bg-slate-700/30 border-b border-slate-700">
                  <h4 className="text-sm font-semibold text-white">Three-Layer Control Architecture</h4>
                </div>
                <div className="p-4 space-y-2">
                  {/* WMS Layer */}
                  <div className="p-4 rounded-lg bg-blue-900/20 border border-blue-500/30">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-600 text-white">LAYER 1</span>
                      <h5 className="text-sm font-bold text-blue-300">WMS — Warehouse Management System</h5>
                    </div>
                    <p className="text-xs text-slate-300 mb-2">The <strong className="text-white">business brain</strong> — manages inventory, orders, labor, and warehouse rules. Decides WHAT needs to happen.</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="p-2 rounded bg-slate-900/50 text-slate-400 text-center">Inventory Mgmt</div>
                      <div className="p-2 rounded bg-slate-900/50 text-slate-400 text-center">Order Release</div>
                      <div className="p-2 rounded bg-slate-900/50 text-slate-400 text-center">Wave Planning</div>
                      <div className="p-2 rounded bg-slate-900/50 text-slate-400 text-center">Labor Allocation</div>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">Examples: SAP EWM, Manhattan Active WM, Blue Yonder, Korber WMS</p>
                  </div>

                  {/* Arrow */}
                  <div className="flex justify-center">
                    <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
                    </svg>
                  </div>

                  {/* WES Layer */}
                  <div className="p-4 rounded-lg bg-violet-900/20 border border-violet-500/30">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-violet-600 text-white">LAYER 2</span>
                      <h5 className="text-sm font-bold text-violet-300">WES — Warehouse Execution System</h5>
                    </div>
                    <p className="text-xs text-slate-300 mb-2">The <strong className="text-white">operational brain</strong> — orchestrates real-time workflows between manual and automated zones. Decides HOW and WHEN to execute.</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="p-2 rounded bg-slate-900/50 text-slate-400 text-center">Task Orchestration</div>
                      <div className="p-2 rounded bg-slate-900/50 text-slate-400 text-center">Real-Time Priority</div>
                      <div className="p-2 rounded bg-slate-900/50 text-slate-400 text-center">Zone Balancing</div>
                      <div className="p-2 rounded bg-slate-900/50 text-slate-400 text-center">Pick Sequencing</div>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">Examples: Korber WES, Honeywell Intelligrated Momentum, Dematic iQ, Pyramid Director</p>
                  </div>

                  {/* Arrow */}
                  <div className="flex justify-center">
                    <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
                    </svg>
                  </div>

                  {/* WCS Layer */}
                  <div className="p-4 rounded-lg bg-emerald-900/20 border border-emerald-500/30">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-600 text-white">LAYER 3</span>
                      <h5 className="text-sm font-bold text-emerald-300">WCS — Warehouse Control System</h5>
                    </div>
                    <p className="text-xs text-slate-300 mb-2">The <strong className="text-white">equipment brain</strong> — directly controls PLCs, motors, scanners, and automation hardware. Executes physical movements.</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="p-2 rounded bg-slate-900/50 text-slate-400 text-center">PLC Control</div>
                      <div className="p-2 rounded bg-slate-900/50 text-slate-400 text-center">Conveyor Routing</div>
                      <div className="p-2 rounded bg-slate-900/50 text-slate-400 text-center">Shuttle Commands</div>
                      <div className="p-2 rounded bg-slate-900/50 text-slate-400 text-center">Scanner Integration</div>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">Examples: GEBHARDT Galileo WCS, Siemens WinCC, Beckhoff TwinCAT, Rockwell FactoryTalk</p>
                  </div>
                </div>
              </div>

              {/* Key Platform Examples */}
              <div className="rounded-lg border border-slate-700 overflow-hidden">
                <div className="px-4 py-3 bg-slate-700/30 border-b border-slate-700">
                  <h4 className="text-sm font-semibold text-white">Key WES / WCS Platforms in Intralogistics</h4>
                </div>
                <div className="p-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-400 border-b border-slate-700">
                        <th className="pb-2 font-medium">Platform</th>
                        <th className="pb-2 font-medium">Vendor</th>
                        <th className="pb-2 font-medium">Layer</th>
                        <th className="pb-2 font-medium hidden sm:table-cell">Strength</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-300">
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2.5 font-medium text-white">Pyramid Director</td>
                        <td className="py-2.5 text-xs text-slate-400">Pyramid (Korber)</td>
                        <td className="py-2.5"><span className="px-2 py-0.5 rounded bg-violet-500/20 text-violet-300 text-xs">WES</span></td>
                        <td className="py-2.5 text-xs text-slate-400 hidden sm:table-cell">Multi-vendor orchestration, real-time optimization</td>
                      </tr>
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2.5 font-medium text-white">Korber WES</td>
                        <td className="py-2.5 text-xs text-slate-400">Korber Supply Chain</td>
                        <td className="py-2.5"><span className="px-2 py-0.5 rounded bg-violet-500/20 text-violet-300 text-xs">WES</span></td>
                        <td className="py-2.5 text-xs text-slate-400 hidden sm:table-cell">Unified warehouse execution across manual + automated</td>
                      </tr>
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2.5 font-medium text-white">Momentum</td>
                        <td className="py-2.5 text-xs text-slate-400">Honeywell Intelligrated</td>
                        <td className="py-2.5"><span className="px-2 py-0.5 rounded bg-violet-500/20 text-violet-300 text-xs">WES</span></td>
                        <td className="py-2.5 text-xs text-slate-400 hidden sm:table-cell">Connected distribution, predictive analytics</td>
                      </tr>
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2.5 font-medium text-white">Dematic iQ</td>
                        <td className="py-2.5 text-xs text-slate-400">Dematic (KION)</td>
                        <td className="py-2.5"><span className="px-2 py-0.5 rounded bg-violet-500/20 text-violet-300 text-xs">WES/WCS</span></td>
                        <td className="py-2.5 text-xs text-slate-400 hidden sm:table-cell">Integrated WES+WCS for shuttle and AS/RS systems</td>
                      </tr>
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2.5 font-medium text-white">Galileo WCS</td>
                        <td className="py-2.5 text-xs text-slate-400">GEBHARDT</td>
                        <td className="py-2.5"><span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-xs">WCS</span></td>
                        <td className="py-2.5 text-xs text-slate-400 hidden sm:table-cell">Native control for GEBHARDT shuttle and conveyor systems</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Why Three Layers?</p>
                  <p className="text-sm text-slate-300">Each layer operates at a different <strong className="text-white">time scale</strong>: WMS plans in minutes-to-hours (order waves), WES orchestrates in seconds (task priority), WCS executes in milliseconds (motor commands). Separating these concerns allows best-of-breed integration and independent scaling.</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Integration Challenge</p>
                  <p className="text-sm text-slate-300">The biggest risk in DC automation is poor software integration between layers. <strong className="text-white">PINAXIS analyzes</strong> your operational profile to recommend which combination of WMS/WES/WCS platforms best fits your throughput, complexity, and existing IT landscape.</p>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-pinaxis-900/20 border border-pinaxis-500/30">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">PINAXIS System Architecture Readiness</p>
                <p className="text-sm text-slate-300">PINAXIS evaluates your warehouse data to determine which <strong className="text-white">software stack tier</strong> your operation needs — from standalone WCS for simple automation, to full WMS+WES+WCS integration for complex multi-zone DCs. This assessment is part of the analysis pipeline and feeds into the product recommendation scoring.</p>
              </div>
            </div>
          </StepCard>

          <StepCard
            number={10}
            title="DC Observability & Monitoring"
            isActive={activeStep0 === 10}
            onClick={() => setActiveStep0(activeStep0 === 10 ? 0 : 10)}
          >
            <div className="ml-14 space-y-3">
              <p className="text-sm text-slate-300">
                Operational visibility is critical for automated DCs. <strong className="text-white">DC Observability</strong> bridges the gap between equipment telemetry (WCS), operational KPIs (WES/WMS), and business intelligence — giving stakeholders a unified view of warehouse health.
              </p>

              {/* Observability Layers */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-emerald-900/20 border border-emerald-500/30">
                  <p className="text-sm font-bold text-emerald-400">Equipment Health</p>
                  <p className="text-xs text-slate-300 mt-1">Real-time status of shuttles, conveyors, lifts, and scanners. Motor temperatures, cycle counts, fault codes, and predictive maintenance alerts.</p>
                  <p className="text-xs text-slate-500 mt-2">Source: WCS / PLC telemetry</p>
                </div>
                <div className="p-3 rounded-lg bg-violet-900/20 border border-violet-500/30">
                  <p className="text-sm font-bold text-violet-400">Operational KPIs</p>
                  <p className="text-xs text-slate-300 mt-1">Live CPH per station, order cycle times, zone throughput, pick accuracy rates, and queue depths at workstations.</p>
                  <p className="text-xs text-slate-500 mt-2">Source: WES / WMS events</p>
                </div>
                <div className="p-3 rounded-lg bg-blue-900/20 border border-blue-500/30">
                  <p className="text-sm font-bold text-blue-400">Business Intelligence</p>
                  <p className="text-xs text-slate-300 mt-1">SLA compliance, order-to-ship lead times, labor utilization, cost-per-order trends, and capacity vs. demand forecasting.</p>
                  <p className="text-xs text-slate-500 mt-2">Source: WMS / ERP aggregates</p>
                </div>
              </div>

              {/* Key Metrics Table */}
              <div className="rounded-lg border border-slate-700 overflow-hidden">
                <div className="px-4 py-3 bg-slate-700/30 border-b border-slate-700">
                  <h4 className="text-sm font-semibold text-white">Key Observability Metrics for Automated DCs</h4>
                </div>
                <div className="p-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-400 border-b border-slate-700">
                        <th className="pb-2 font-medium">Metric</th>
                        <th className="pb-2 font-medium">Target</th>
                        <th className="pb-2 font-medium hidden sm:table-cell">Alert Threshold</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-300">
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2.5 font-medium text-white">System Uptime</td>
                        <td className="py-2.5"><span className="px-2 py-0.5 rounded bg-green-500/20 text-green-300 text-xs font-mono">&ge;99.5%</span></td>
                        <td className="py-2.5 text-xs text-slate-400 hidden sm:table-cell">&lt;98% triggers maintenance review</td>
                      </tr>
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2.5 font-medium text-white">Shuttle Availability</td>
                        <td className="py-2.5"><span className="px-2 py-0.5 rounded bg-green-500/20 text-green-300 text-xs font-mono">&ge;95%</span></td>
                        <td className="py-2.5 text-xs text-slate-400 hidden sm:table-cell">&lt;90% impacts throughput capacity</td>
                      </tr>
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2.5 font-medium text-white">CPH (Cases/Hour)</td>
                        <td className="py-2.5"><span className="px-2 py-0.5 rounded bg-pinaxis-500/20 text-pinaxis-300 text-xs font-mono">Per design</span></td>
                        <td className="py-2.5 text-xs text-slate-400 hidden sm:table-cell">&lt;80% of design CPH = bottleneck</td>
                      </tr>
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2.5 font-medium text-white">Pick Accuracy</td>
                        <td className="py-2.5"><span className="px-2 py-0.5 rounded bg-green-500/20 text-green-300 text-xs font-mono">&ge;99.9%</span></td>
                        <td className="py-2.5 text-xs text-slate-400 hidden sm:table-cell">&lt;99.5% requires root cause analysis</td>
                      </tr>
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2.5 font-medium text-white">Order Cycle Time</td>
                        <td className="py-2.5"><span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-xs font-mono">&le;SLA</span></td>
                        <td className="py-2.5 text-xs text-slate-400 hidden sm:table-cell">&gt;120% of SLA = escalation</td>
                      </tr>
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2.5 font-medium text-white">Conveyor Utilization</td>
                        <td className="py-2.5"><span className="px-2 py-0.5 rounded bg-green-500/20 text-green-300 text-xs font-mono">60-85%</span></td>
                        <td className="py-2.5 text-xs text-slate-400 hidden sm:table-cell">&gt;90% = congestion risk</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Predictive Maintenance</p>
                  <p className="text-sm text-slate-300">By analyzing equipment cycle counts, motor temperatures, and fault frequency over time, an observability platform can predict failures <strong className="text-white">before they cause unplanned downtime</strong>. This shifts maintenance from reactive to proactive — reducing costly production stops.</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Anomaly Detection</p>
                  <p className="text-sm text-slate-300">Comparing real-time throughput against historical baselines enables automatic detection of <strong className="text-white">performance anomalies</strong> — a sudden CPH drop, unusual fault patterns, or unexpected queue buildup — triggering alerts before they cascade into SLA breaches.</p>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-pinaxis-900/20 border border-pinaxis-500/30">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">PINAXIS Observability</p>
                <p className="text-sm text-slate-300">In production mode, PINAXIS can ingest live equipment telemetry and operational events via the Production API, providing a <strong className="text-white">real-time observability dashboard</strong> with system health gauges, throughput heatmaps, and anomaly alerts. The voice agent can also speak about current operational status on demand.</p>
              </div>
            </div>
          </StepCard>
        </div>
      )}

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

          {/* Download Test Files */}
          <div className="card border-green-500/30 bg-green-900/10 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-green-600 flex items-center justify-center">
                <DownloadIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Download Test Files</h3>
                <p className="text-sm text-slate-400">Pre-built CSV files ready to upload — 30 SKUs, 3 months of data, realistic patterns.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { name: 'Item Master', file: 'item_master.csv', data: ITEM_MASTER_CSV, rows: 30, required: true, desc: '30 SKUs with dimensions, weights, categories' },
                { name: 'Goods Out', file: 'goods_out.csv', data: GOODS_OUT_CSV, rows: 195, required: true, desc: '195 order lines across 143 orders (Jan-Mar)' },
                { name: 'Inventory', file: 'inventory.csv', data: INVENTORY_CSV, rows: 30, required: false, desc: '30 stock records with bin locations' },
                { name: 'Goods In', file: 'goods_in.csv', data: GOODS_IN_CSV, rows: 40, required: false, desc: '40 receipt lines from 8 suppliers (Jan-Mar)' },
              ].map(item => (
                <button
                  key={item.file}
                  onClick={() => downloadCSV(item.data, item.file)}
                  className="flex items-center gap-3 p-4 rounded-lg border border-slate-700 bg-slate-800/50 hover:bg-slate-700/50 hover:border-slate-600 transition-all text-left group"
                >
                  <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center flex-shrink-0 group-hover:bg-green-600/20">
                    <DownloadIcon className="w-5 h-5 text-slate-400 group-hover:text-green-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white">{item.name}</p>
                      {item.required && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">Required</span>}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{item.desc}</p>
                    <p className="text-xs text-slate-500 mt-1 font-mono">{item.file} ({item.rows} rows)</p>
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={() => {
                downloadCSV(ITEM_MASTER_CSV, 'item_master.csv')
                setTimeout(() => downloadCSV(GOODS_OUT_CSV, 'goods_out.csv'), 200)
                setTimeout(() => downloadCSV(INVENTORY_CSV, 'inventory.csv'), 400)
                setTimeout(() => downloadCSV(GOODS_IN_CSV, 'goods_in.csv'), 600)
              }}
              className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-green-600 hover:bg-green-500 text-white font-medium transition-colors"
            >
              <DownloadIcon className="w-5 h-5" />
              Download All 4 Files
            </button>
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
