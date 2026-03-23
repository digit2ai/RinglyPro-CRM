export default function PlaceholderPage({ title }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center bg-slate-800/60 border border-slate-700 rounded-xl p-12 max-w-md">
        <h2 className="text-xl font-bold text-white mb-3">{title}</h2>
        <p className="text-slate-400 text-sm">This module is part of the FreightMind AI agent mesh. Currently managed via MCP tools.</p>
        <div className="mt-4 text-xs text-slate-500 font-mono">Access via /freight_broker/mcp/tools/call</div>
        <a
          href="https://ringlypro.com/demo"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-6 px-6 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition-colors"
        >
          Request Access
        </a>
      </div>
    </div>
  )
}
