'use strict';

/**
 * THE ROADMAP DIAGRAM.
 *
 * Generated FROM the phases the engines produced, never authored beside them —
 * so the picture and the document under it cannot drift. Every box, every gate
 * condition and every figure here is read out of the same JSON the text
 * renders from.
 *
 * Inline SVG, no library. Scrolls horizontally inside its own container so the
 * page body never does.
 */

(function (global) {

  const W = 250, H = 186, GAP = 74, PAD = 16, TOP = 54;
  const C = {
    green: '#3ad07f', yellow: '#e6b45a', red: '#f0645a',
    blue: '#4263eb', violet: '#8b5cf6', ink: '#f5f5f7',
    mut: '#a6a9b4', faint: '#7f838f', line: 'rgba(255,255,255,.14)',
    card: '#16161d', card2: '#1c1c24', bg: '#0a0a0e'
  };

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  /** Wrap by character budget — SVG has no text flow. */
  function wrap(text, perLine, maxLines) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = []; let cur = '';
    for (const w of words) {
      if ((cur + ' ' + w).trim().length > perLine) { lines.push(cur.trim()); cur = w; }
      else cur = (cur + ' ' + w).trim();
      if (lines.length >= maxLines) break;
    }
    if (cur && lines.length < maxLines) lines.push(cur.trim());
    if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length + 1) {
      lines[maxLines - 1] = lines[maxLines - 1].replace(/[.,;:]?$/, '') + '…';
    }
    return lines;
  }

  function ratingColor(r) { return C[r] || C.faint; }

  function render(diagram, opts) {
    if (!diagram || !Array.isArray(diagram.nodes) || !diagram.nodes.length) return '';
    const nodes = diagram.nodes.filter(n => n.kind !== 'gate');
    const gates = diagram.nodes.filter(n => n.kind === 'gate');
    const cols = nodes.length;
    const width = PAD * 2 + cols * W + (cols - 1) * GAP;
    const height = TOP + H + 76;

    let svg = `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="AI roadmap: phases and gates">`;
    svg += `<defs>
      <marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
        <path d="M0,0 L10,5 L0,10 z" fill="${C.line}"/></marker></defs>`;
    // An explicit ground. Without it the SVG is transparent, and a browser
    // export or a paste into a light document renders pale text on white —
    // the diagram would be unreadable in exactly the places it travels to.
    svg += `<rect width="${width}" height="${height}" fill="${C.bg}"/>`;

    nodes.forEach((n, i) => {
      const x = PAD + i * (W + GAP);
      const y = TOP;

      /* connector into this node */
      if (i > 0) {
        const px = x - GAP, mid = y + H / 2;
        svg += `<line x1="${px + 6}" y1="${mid}" x2="${x - 8}" y2="${mid}" stroke="${C.line}" stroke-width="2.2" marker-end="url(#ar)"/>`;
        const gate = gates.find(g => g.after === nodes[i - 1].id);
        if (gate) {
          const gx = px + GAP / 2;
          svg += `<g><path d="M${gx - 13} ${mid - 15} L${gx + 4} ${mid} L${gx - 13} ${mid + 15} Z" fill="${C.violet}" opacity=".9"/>`;
          svg += `<text x="${gx - 4}" y="${mid + 34}" text-anchor="middle" font-size="10.5" font-weight="600" fill="${C.violet}" font-family="system-ui,sans-serif">GATE</text></g>`;
        }
      }

      const isPhase = n.kind === 'phase';
      const isBlocker = n.kind === 'blocker';
      const isFirst = n.number === 1;
      const stroke = isBlocker ? C.red : (isFirst ? C.blue : C.line);
      const fill = isBlocker ? '#1d1214' : (isFirst ? C.card2 : C.card);

      svg += `<rect x="${x}" y="${y}" width="${W}" height="${H}" rx="14" fill="${fill}" stroke="${stroke}" stroke-width="${isFirst || isBlocker ? 1.8 : 1}"/>`;
      // The accent bar carries "this is the one that happens" without tinting
      // the ground the text sits on.
      if (isFirst || isBlocker) {
        svg += `<rect x="${x + 1}" y="${y + 14}" width="3.5" height="${H - 28}" rx="2" fill="${isBlocker ? C.red : C.blue}"/>`;
      }

      let ty = y + 26;
      if (isPhase) {
        svg += `<text x="${x + 18}" y="${ty}" font-size="10.5" font-weight="700" fill="${C.faint}" letter-spacing="1.4" font-family="system-ui,sans-serif">PHASE ${n.number}</text>`;
        if (n.risk_level) {
          const rc = n.risk_level === 'low' ? C.green : n.risk_level === 'medium' ? C.yellow : C.red;
          const label = `${n.risk_level} risk`;
          const rw = label.length * 5.9 + 20;
          svg += `<rect x="${x + W - 18 - rw}" y="${ty - 12}" width="${rw}" height="17" rx="8.5" fill="${rc}" opacity=".16"/>`;
          svg += `<circle cx="${x + W - 18 - rw + 9}" cy="${ty - 3.5}" r="3" fill="${rc}"/>`;
          svg += `<text x="${x + W - 18 - rw + 16}" y="${ty}" font-size="10" font-weight="600" fill="${rc}" font-family="system-ui,sans-serif">${esc(label)}</text>`;
        }
      } else if (isBlocker) {
        svg += `<text x="${x + 18}" y="${ty}" font-size="10.5" font-weight="700" fill="${C.red}" letter-spacing="1.4" font-family="system-ui,sans-serif">BEFORE YOU START</text>`;
      } else {
        svg += `<text x="${x + 18}" y="${ty}" font-size="10.5" font-weight="700" fill="${C.faint}" letter-spacing="1.4" font-family="system-ui,sans-serif">INPUT</text>`;
      }
      ty += 22;

      const title = (n.label || '').replace(/^Phase \d+\s*[—-]\s*/i, '');
      wrap(title, 26, 2).forEach(l => {
        svg += `<text x="${x + 18}" y="${ty}" font-size="15" font-weight="650" fill="${C.ink}" font-family="system-ui,sans-serif">${esc(l)}</text>`;
        ty += 19;
      });
      ty += 6;

      const body = isPhase
        ? (n.scope && n.scope.length ? n.scope.join(' · ') : (n.objective || ''))
        : (isBlocker ? (Array.isArray(n.detail) ? n.detail.join(' ') : n.detail) : (n.detail || ''));
      wrap(body, 34, 3).forEach(l => {
        svg += `<text x="${x + 18}" y="${ty}" font-size="11.5" fill="${isFirst ? '#c9cfdb' : C.mut}" font-family="system-ui,sans-serif">${esc(l)}</text>`;
        ty += 15;
      });

      /* footer strip: weeks · cost · risk */
      const fy = y + H - 20;
      svg += `<line x1="${x + 14}" y1="${fy - 22}" x2="${x + W - 14}" y2="${fy - 22}" stroke="${C.line}"/>`;
      let bits = [];
      if (isPhase) {
        if (n.weeks) bits.push(`${n.weeks} weeks`);
        if (n.cost && n.cost.build_usd_range) bits.push(n.cost.build_usd_range);
        else if (n.number === 3) bits.push('not priced');
        // Risk is NOT appended here. "8 weeks · $21,000 – $39,000 · medium
        // risk" overruns the card at any readable size and clips to
        // "medium risl" — a truncated risk level is worse than none. It is
        // drawn as a labelled dot in the header instead, where it has room.
      } else if (isBlocker) {
        bits.push(n.days ? `${n.days} day${n.days === 1 ? '' : 's'} of work` : 'measured in days');
      }
      // Phase 1's footer is the line a reader looks for — weeks, band, risk.
      // It gets full ink; an unpriced Phase 3 stays deliberately quiet.
      const col = (isPhase && n.number === 3) ? C.faint : (isBlocker ? '#ff8a80' : (isFirst ? C.ink : C.mut));
      svg += `<text x="${x + 18}" y="${fy}" font-size="11.5" font-weight="600" fill="${col}" font-family="ui-monospace,Menlo,monospace">${esc(bits.join('  ·  '))}</text>`;
    });

    /* lane chips across the top */
    (diagram.lanes || []).forEach((l, i) => {
      const cx = PAD + i * 200;
      svg += `<circle cx="${cx + 6}" cy="26" r="5" fill="${ratingColor(l.rating)}"/>`;
      svg += `<text x="${cx + 18}" y="30" font-size="12" font-weight="600" fill="${C.mut}" font-family="system-ui,sans-serif">${esc(l.title)} — ${esc(l.rating)}</text>`;
    });

    /* the unpriced note, in the diagram rather than only in the prose */
    svg += `<text x="${PAD}" y="${height - 14}" font-size="11" fill="${C.faint}" font-family="system-ui,sans-serif">${esc(diagram.unpriced_note || '')}</text>`;

    svg += '</svg>';
    return svg;
  }


  /**
   * VERTICAL LAYOUT — for paper.
   *
   * The horizontal roadmap is right on a screen, where it scrolls. On a
   * portrait page it has to shrink to about 44% to fit, and at that size the
   * scope lines and the cost band are unreadable — which makes the single most
   * important element of the report the weakest thing on the page. Stacked, each
   * phase gets the full column width and prints at its natural size.
   *
   * Same nodes, same JSON, same numbers. Only the arrangement differs, so the
   * printed diagram still cannot disagree with the on-screen one.
   */
  function renderVertical(diagram) {
    if (!diagram || !Array.isArray(diagram.nodes) || !diagram.nodes.length) return '';
    const nodes = diagram.nodes.filter(n => n.kind !== 'gate');
    const gates = diagram.nodes.filter(n => n.kind === 'gate');

    const VW = 660, VH = 132, VGAP = 62, VPAD = 18, VTOP = 46;
    const width = VW + VPAD * 2;
    const height = VTOP + nodes.length * VH + (nodes.length - 1) * VGAP + 40;

    let svg = `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="AI roadmap: phases and gates">`;
    svg += `<defs><marker id="arv" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
      <path d="M0,0 L10,5 L0,10 z" fill="${C.line}"/></marker></defs>`;
    svg += `<rect width="${width}" height="${height}" fill="${C.bg}"/>`;

    (diagram.lanes || []).forEach((l, i) => {
      const cx = VPAD + i * 220;
      svg += `<circle cx="${cx + 6}" cy="24" r="5" fill="${ratingColor(l.rating)}"/>`;
      svg += `<text x="${cx + 18}" y="28" font-size="12" font-weight="600" fill="${C.mut}" font-family="system-ui,sans-serif">${esc(l.title)} — ${esc(l.rating)}</text>`;
    });

    nodes.forEach((n, i) => {
      const x = VPAD, y = VTOP + i * (VH + VGAP);
      const isPhase = n.kind === 'phase';
      const isBlocker = n.kind === 'blocker';
      const isFirst = n.number === 1;

      if (i > 0) {
        const py = y - VGAP, cxm = x + VW / 2;
        svg += `<line x1="${cxm}" y1="${py + 4}" x2="${cxm}" y2="${y - 8}" stroke="${C.line}" stroke-width="2.2" marker-end="url(#arv)"/>`;
        const gate = gates.find(g => g.after === nodes[i - 1].id);
        if (gate) {
          const gy = py + VGAP / 2;
          svg += `<path d="M${cxm - 15} ${gy - 12} L${cxm} ${gy + 5} L${cxm + 15} ${gy - 12} Z" fill="${C.violet}" opacity=".9"/>`;
          svg += `<text x="${cxm + 24}" y="${gy + 2}" font-size="10.5" font-weight="700" fill="${C.violet}" font-family="system-ui,sans-serif">GATE</text>`;
        }
      }

      svg += `<rect x="${x}" y="${y}" width="${VW}" height="${VH}" rx="14" fill="${isBlocker ? '#1d1214' : (isFirst ? C.card2 : C.card)}" stroke="${isBlocker ? C.red : (isFirst ? C.blue : C.line)}" stroke-width="${isFirst || isBlocker ? 1.8 : 1}"/>`;
      if (isFirst || isBlocker) svg += `<rect x="${x + 1}" y="${y + 14}" width="3.5" height="${VH - 28}" rx="2" fill="${isBlocker ? C.red : C.blue}"/>`;

      let ty = y + 25;
      const kicker = isPhase ? `PHASE ${n.number}` : (isBlocker ? 'BEFORE YOU START' : 'INPUT');
      svg += `<text x="${x + 20}" y="${ty}" font-size="10.5" font-weight="700" fill="${isBlocker ? C.red : C.faint}" letter-spacing="1.4" font-family="system-ui,sans-serif">${kicker}</text>`;
      if (isPhase && n.risk_level) {
        const rc = n.risk_level === 'low' ? C.green : n.risk_level === 'medium' ? C.yellow : C.red;
        const label = `${n.risk_level} risk`, rw = label.length * 5.9 + 20;
        svg += `<rect x="${x + VW - 20 - rw}" y="${ty - 12}" width="${rw}" height="17" rx="8.5" fill="${rc}" opacity=".16"/>`;
        svg += `<circle cx="${x + VW - 20 - rw + 9}" cy="${ty - 3.5}" r="3" fill="${rc}"/>`;
        svg += `<text x="${x + VW - 20 - rw + 16}" y="${ty}" font-size="10" font-weight="600" fill="${rc}" font-family="system-ui,sans-serif">${esc(label)}</text>`;
      }
      ty += 23;

      const title = (n.label || '').replace(/^Phase \d+\s*[—-]\s*/i, '');
      svg += `<text x="${x + 20}" y="${ty}" font-size="16" font-weight="650" fill="${C.ink}" font-family="system-ui,sans-serif">${esc(wrap(title, 68, 1)[0] || '')}</text>`;
      ty += 21;

      const body = isPhase
        ? (n.scope && n.scope.length ? 'Scope: ' + n.scope.join(' · ') : (n.objective || ''))
        : (isBlocker ? (Array.isArray(n.detail) ? n.detail.join(' ') : n.detail) : (n.detail || ''));
      wrap(body, 92, 2).forEach(l => {
        svg += `<text x="${x + 20}" y="${ty}" font-size="11.5" fill="${isFirst ? '#c9cfdb' : C.mut}" font-family="system-ui,sans-serif">${esc(l)}</text>`;
        ty += 15;
      });

      const fy = y + VH - 18;
      svg += `<line x1="${x + 16}" y1="${fy - 20}" x2="${x + VW - 16}" y2="${fy - 20}" stroke="${C.line}"/>`;
      let bits = [];
      if (isPhase) {
        if (n.weeks) bits.push(`${n.weeks} weeks`);
        if (n.cost && n.cost.build_usd_range) bits.push(n.cost.build_usd_range);
        else if (n.number === 3) bits.push('not priced');
        if (n.cost && n.cost.run_monthly_usd) bits.push(`$${n.cost.run_monthly_usd}/mo`);
        if (n.cost && n.cost.max_exposure_usd) bits.push(`max exposure $${n.cost.max_exposure_usd}`);
      } else if (isBlocker) {
        bits.push(n.days ? `${n.days} day${n.days === 1 ? '' : 's'} of work` : 'measured in days');
      }
      const col = (isPhase && n.number === 3) ? C.faint : (isBlocker ? '#ff8a80' : (isFirst ? C.ink : C.mut));
      svg += `<text x="${x + 20}" y="${fy}" font-size="11.5" font-weight="600" fill="${col}" font-family="ui-monospace,Menlo,monospace">${esc(bits.join('  ·  '))}</text>`;
    });

    svg += `<text x="${VPAD}" y="${height - 12}" font-size="11" fill="${C.faint}" font-family="system-ui,sans-serif">${esc(diagram.unpriced_note || '')}</text>`;
    return svg + '</svg>';
  }

  global.DiscoveryDiagram = { render, renderVertical, wrap };
})(window);
