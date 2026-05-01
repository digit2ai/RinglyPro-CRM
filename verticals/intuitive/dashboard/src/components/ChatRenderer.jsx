import React from 'react'
import { useNavigate } from 'react-router-dom'

// Lightweight markdown renderer for chatbot responses.
// Supports: headings, bullets, numbered lists, GitHub-style tables, bold/italic, inline code,
// fenced code (including ```action JSON blocks for confirm UI), and clickable links to /intuitive/...

function renderInline(text) {
  if (!text) return null
  // Replace **bold**, *italic*, `code`, [text](url) with React elements
  const out = []
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g
  let last = 0
  let m
  let key = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(<span key={key++}>{text.slice(last, m.index)}</span>)
    const tok = m[0]
    if (tok.startsWith('**')) out.push(<strong key={key++}>{tok.slice(2, -2)}</strong>)
    else if (tok.startsWith('*')) out.push(<em key={key++}>{tok.slice(1, -1)}</em>)
    else if (tok.startsWith('`')) out.push(<code key={key++} className="px-1 py-0.5 rounded bg-slate-800 text-emerald-300 text-xs">{tok.slice(1, -1)}</code>)
    else if (tok.startsWith('[')) {
      const label = tok.match(/\[([^\]]+)\]/)[1]
      const url = tok.match(/\(([^)]+)\)/)[1]
      const internal = url.startsWith('/intuitive/') || url.startsWith('/')
      out.push(internal
        ? <InternalLink key={key++} url={url}>{label}</InternalLink>
        : <a key={key++} href={url} target="_blank" rel="noreferrer" className="text-violet-400 hover:text-violet-200 underline">{label}</a>
      )
    }
    last = m.index + tok.length
  }
  if (last < text.length) out.push(<span key={key++}>{text.slice(last)}</span>)
  return out
}

function InternalLink({ url, children }) {
  const navigate = useNavigate()
  // Strip /intuitive prefix for react-router (mounted at /intuitive)
  const path = url.replace(/^\/intuitive/, '') || '/'
  return (
    <button onClick={() => navigate(path)} className="text-violet-400 hover:text-violet-200 underline">{children}</button>
  )
}

function renderTable(rows) {
  if (!rows || rows.length === 0) return null
  // First row is header, second row is separator (---), rest are data
  const headerCells = rows[0].slice(1, -1).split('|').map(c => c.trim())
  const dataRows = rows.slice(2).map(r => r.slice(1, -1).split('|').map(c => c.trim()))
  return (
    <div className="overflow-x-auto my-2">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-slate-800">
            {headerCells.map((h, i) => <th key={i} className="px-2 py-1.5 text-left font-semibold text-slate-200 border-b border-slate-700">{renderInline(h)}</th>)}
          </tr>
        </thead>
        <tbody>
          {dataRows.map((r, i) => (
            <tr key={i} className="hover:bg-slate-800/40">
              {r.map((c, j) => <td key={j} className="px-2 py-1.5 text-slate-300 border-b border-slate-800/60">{renderInline(c)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ChatRenderer({ text, onConfirmAction }) {
  if (!text) return null
  const lines = text.split('\n')
  const blocks = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // Fenced code block ```action ... ```  → confirm action button
    if (/^```action/i.test(line)) {
      let j = i + 1
      const buf = []
      while (j < lines.length && !/^```/.test(lines[j])) { buf.push(lines[j]); j++ }
      try {
        const payload = JSON.parse(buf.join('\n'))
        blocks.push(
          <div key={blocks.length} className="my-2 bg-amber-950/40 border border-amber-700/40 rounded-lg p-3 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase font-bold text-amber-300">Confirm action</div>
              <div className="text-xs text-amber-100 mt-0.5">{payload.label || payload.tool}</div>
            </div>
            <button onClick={() => onConfirmAction && onConfirmAction(payload)} className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold py-1.5 px-3 rounded">Confirm</button>
          </div>
        )
      } catch (e) {
        blocks.push(<pre key={blocks.length} className="bg-slate-900 text-slate-300 text-xs p-2 rounded overflow-x-auto my-2">{buf.join('\n')}</pre>)
      }
      i = j + 1
      continue
    }

    // Generic fenced code block
    if (/^```/.test(line)) {
      let j = i + 1
      const buf = []
      while (j < lines.length && !/^```/.test(lines[j])) { buf.push(lines[j]); j++ }
      blocks.push(<pre key={blocks.length} className="bg-slate-900 text-slate-300 text-xs p-2 rounded overflow-x-auto my-2">{buf.join('\n')}</pre>)
      i = j + 1
      continue
    }

    // Markdown table (line starts and ends with |, next line is ---)
    if (/^\|.*\|$/.test(line) && i + 1 < lines.length && /^\|[\s|:-]+\|$/.test(lines[i + 1])) {
      const rows = [line]
      let j = i + 1
      while (j < lines.length && /^\|.*\|$/.test(lines[j])) { rows.push(lines[j]); j++ }
      blocks.push(<React.Fragment key={blocks.length}>{renderTable(rows)}</React.Fragment>)
      i = j
      continue
    }

    // Heading
    const h = line.match(/^(#+)\s+(.+)$/)
    if (h) {
      const level = h[1].length
      const Tag = `h${Math.min(level + 2, 6)}`
      blocks.push(React.createElement(Tag, { key: blocks.length, className: 'text-sm font-bold text-slate-100 mt-2 mb-1' }, renderInline(h[2])))
      i++
      continue
    }

    // Bulleted list
    if (/^[-*]\s+/.test(line)) {
      const items = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ''))
        i++
      }
      blocks.push(
        <ul key={blocks.length} className="list-disc list-inside text-sm text-slate-300 space-y-0.5 my-1">
          {items.map((it, k) => <li key={k}>{renderInline(it)}</li>)}
        </ul>
      )
      continue
    }

    // Numbered list
    if (/^\d+\.\s+/.test(line)) {
      const items = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''))
        i++
      }
      blocks.push(
        <ol key={blocks.length} className="list-decimal list-inside text-sm text-slate-300 space-y-0.5 my-1">
          {items.map((it, k) => <li key={k}>{renderInline(it)}</li>)}
        </ol>
      )
      continue
    }

    // Empty line: skip
    if (/^\s*$/.test(line)) { i++; continue }

    // Paragraph
    blocks.push(<p key={blocks.length} className="text-sm text-slate-300 leading-relaxed my-1">{renderInline(line)}</p>)
    i++
  }
  return <>{blocks}</>
}
