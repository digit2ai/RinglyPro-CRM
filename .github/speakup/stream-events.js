'use strict';

/**
 * Turn Claude Code's stream-json output into short activity lines for SpeakUp.
 *
 * WHAT LEAVES THIS VM: only these summaries, posted to SpeakUp over the narrow
 * progress token. Nothing is printed to the (public) Actions log, and the raw
 * stream stays in $WORK.
 *
 * Kinds must match the server's EVENT_KINDS list.
 */

const path = require('path');

const CUT = { say: 900, text: 400, code: 1400 };
const clip = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) + '…' : s; };

function rel(p) {
  const root = process.env.GITHUB_WORKSPACE || process.cwd();
  const s = String(p || '');
  if (!s) return '';
  return s.startsWith(root) ? path.relative(root, s) || s : s;
}

// One Claude stream event -> zero or more activity lines.
function summarize(ev) {
  if (!ev || typeof ev !== 'object') return [];
  if (ev.type === 'system' && ev.subtype === 'init') return [{ kind: 'info', text: 'Claude Code started' + (ev.model ? ' (' + ev.model + ')' : ''),
    detail: { i18n: 'claude_started', model: ev.model ? ' (' + ev.model + ')' : '' } }];
  if (ev.type === 'result') {
    const cost = ev.total_cost_usd != null ? ' (cost $' + Number(ev.total_cost_usd).toFixed(2) + ')' : '';
    return [{ kind: ev.is_error ? 'error' : 'done',
      text: (ev.is_error ? 'Claude stopped: ' + clip(ev.subtype || 'error', 120) : 'Claude finished') +
        (ev.num_turns != null ? ' after ' + ev.num_turns + ' turns' : '') + cost,
      // The pieces travel separately so the console can join them in either language.
      detail: { i18n: ev.is_error ? 'claude_stopped' : 'claude_done', why: clip(ev.subtype || 'error', 120), turns: ev.num_turns, cost } }];
  }
  const out = [];
  const content = ev.message && Array.isArray(ev.message.content) ? ev.message.content : [];
  for (const b of content) {
    if (!b || typeof b !== 'object') continue;
    if (b.type === 'text' && String(b.text || '').trim()) out.push({ kind: 'say', text: clip(b.text.trim(), CUT.say) });
    if (b.type === 'tool_use') {
      const i = b.input || {};
      switch (b.name) {
        case 'Read': out.push({ kind: 'read', text: rel(i.file_path) }); break;
        case 'Edit': out.push({ kind: 'edit', text: rel(i.file_path), detail: { old: clip(i.old_string, CUT.code), new: clip(i.new_string, CUT.code) } }); break;
        case 'MultiEdit': out.push({ kind: 'edit', text: rel(i.file_path), detail: { edits: (i.edits || []).length,
          old: clip((i.edits || []).map(e => e.old_string).join('\n---\n'), CUT.code), new: clip((i.edits || []).map(e => e.new_string).join('\n---\n'), CUT.code) } }); break;
        case 'Write': out.push({ kind: 'write', text: rel(i.file_path), detail: { new: clip(i.content, CUT.code) } }); break;
        case 'Bash': out.push({ kind: 'run', text: clip(i.command, CUT.text) }); break;
        case 'Grep': case 'Glob': out.push({ kind: 'search', text: clip((i.pattern || '') + (i.path ? ' in ' + rel(i.path) : ''), CUT.text) }); break;
        case 'TodoWrite': out.push({ kind: 'todo', text: clip((i.todos || []).map(t => (t.status === 'completed' ? '[x] ' : '[ ] ') + (t.content || '')).join(' · '), CUT.text) }); break;
        default: out.push({ kind: 'tool', text: clip(b.name, 60) });
      }
    }
    if (b.type === 'tool_result' && b.is_error) {
      const c = Array.isArray(b.content) ? b.content.map(x => x && x.text).filter(Boolean).join(' ') : b.content;
      out.push({ kind: 'error', text: clip(c, CUT.text) });
    }
  }
  return out;
}

// Batches lines and posts them; never throws into the build.
function Poster(base, jobId, planHash, token) {
  let queue = [], sending = false, dropped = 0;
  async function flush() {
    if (sending || !queue.length || !token) return;
    sending = true;
    const batch = queue.splice(0, 60);
    try {
      const res = await fetch(base + '/api/v1/factory/progress-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-speakup-progress': token, 'User-Agent': 'SpeakUp-Factory-Action' },
        body: JSON.stringify({ job_id: String(jobId), plan_hash: planHash, events: batch })
      });
      if (!res.ok) dropped += batch.length;
    } catch (e) { dropped += batch.length; }
    sending = false;
  }
  const timer = setInterval(flush, 2500);
  if (timer.unref) timer.unref();
  return {
    push(lines) { for (const l of lines) if (queue.length < 600) queue.push(l); },
    async done() { clearInterval(timer); for (let i = 0; i < 12 && queue.length; i++) await flush(); return dropped; }
  };
}

module.exports = { summarize, Poster, rel, clip };
