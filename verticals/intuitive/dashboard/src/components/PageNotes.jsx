import React from 'react'

/**
 * PageNotes — reusable "How to Read This Page" explanatory note.
 *
 * Renders a consistent, demo-friendly box at the bottom of every dashboard page
 * so any audience member (CFO, executive, surgeon, administrator) understands
 * what the page answers, where each number comes from, the formula behind it,
 * and the assumptions used — with zero prior context.
 *
 * Usage:
 *   <PageNotes title="Clinical Benefit Overlay">
 *     <p className="mb-2">...</p>
 *   </PageNotes>
 *
 * Style conventions used inside notes (keep consistent across all pages):
 *   - cost-avoidance / positive  -> text-emerald-300
 *   - revenue / financial return -> text-amber-300
 *   - key term being defined     -> text-cyan-300
 *   - "does not count" / warning -> text-red-300
 *   - emphasis                   -> text-white font-semibold
 *
 * See prompts/intuitive-page-notes-builder.md for the full spec + glossary.
 */
export default function PageNotes({ title, children }) {
  return (
    <div className="mt-8 bg-slate-800/40 border border-slate-700 rounded-lg p-5 text-sm text-slate-300 leading-relaxed">
      <div className="text-[10px] uppercase tracking-widest text-cyan-300 font-bold mb-2">
        How to Read This Page{title ? ` · ${title}` : ''}
      </div>
      {children}
    </div>
  )
}
