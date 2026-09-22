'use strict';

/** Minimal, dependency-free Markdown -> HTML for the requirements page. Escapes first. */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
}
function renderMarkdown(md) {
  const lines = String(md).replace(/\r/g, '').split('\n');
  const out = []; let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = l.match(/^(#{1,4})\s+(.*)$/))) {
      const n = m[1].length; const id = m[2].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      out.push(`<h${n} id="${id}">${inline(m[2])}</h${n}>`); i++; continue;
    }
    if (/^---+$/.test(l.trim())) { out.push('<hr>'); i++; continue; }
    if (l.trim().startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(lines[i].trim()); i++; }
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const body = rows.filter((r, k) => !(k === 1 && /^\|[\s:|-]+\|$/.test(r)));
      out.push('<div class="tw"><table><thead><tr>' + cells(body[0]).map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
        body.slice(1).map((r) => '<tr>' + cells(r).map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>');
      continue;
    }
    if (/^\s*(-|\d+\.)\s+/.test(l)) {
      const ordered = /^\s*\d+\./.test(l); const items = [];
      while (i < lines.length && /^\s*(-|\d+\.)\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*(-|\d+\.)\s+/, '')); i++; }
      out.push(`<${ordered ? 'ol' : 'ul'}>` + items.map((t) => `<li>${inline(t)}</li>`).join('') + `</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\||\s*(-|\d+\.)\s|---)/.test(lines[i])) { para.push(lines[i]); i++; }
    out.push('<p>' + inline(para.join(' ')) + '</p>');
  }
  return out.join('\n');
}
module.exports = { renderMarkdown };
