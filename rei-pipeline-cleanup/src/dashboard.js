'use strict';

const fs = require('fs');
const path = require('path');

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(path.resolve(p), 'utf8')); } catch { return fallback; }
}

function computeSummary(rows) {
  const s = { total: rows.length, leftNew: 0, evaluating: 0, underContract: 0, closed: 0,
    contacts: 0, duplicates: 0, manualReview: 0, failed: 0 };
  for (const r of rows) {
    if (r.recommended_status === 'New') s.leftNew++;
    else if (r.recommended_status === 'Evaluating') s.evaluating++;
    else if (r.recommended_status === 'Under Contract') s.underContract++;
    else if (r.recommended_status === 'Closed') s.closed++;
    if (r.contact_verified) s.contacts++;
    if (r.possible_duplicate) s.duplicates++;
    if (r.manual_review_required) s.manualReview++;
    if (r.update_attempted && !r.update_saved) s.failed++;
  }
  return s;
}

function esc(v) { return String(v == null ? '' : v).replace(/[<&>"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])); }

function byDay(history) {
  const days = new Map();
  for (const h of history) {
    const d = h.date || (h.ts || '').slice(0, 10);
    if (!d) continue;
    if (!days.has(d)) days.set(d, { date: d, runs: 0, total: 0, evaluating: 0, closed: 0, manualReview: 0, failed: 0 });
    const x = days.get(d);
    x.runs++; x.total += h.total || 0; x.evaluating += h.evaluating || 0;
    x.closed += h.closed || 0; x.manualReview += h.manualReview || 0; x.failed += h.failed || 0;
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const STYLE = `
:root{--bg:#f4f7fc;--bg-2:#eaf0f9;--panel:#ffffff;--panel-2:#f2f6fc;--line:#e4eaf3;--line-2:#d3dcea;
--ink:#141c2e;--ink-2:#42506a;--muted:#6d7a92;--accent:#2f6bff;
--new:#8aa0bd;--eval:#2f6bff;--uc:#8b5cf6;--dead:#ef4655;--review:#f59e0b;--ok:#12b76a;
--shadow:0 1px 2px rgba(16,24,40,.05),0 4px 16px rgba(16,24,40,.06);
--mono:ui-monospace,"SF Mono","JetBrains Mono",Menlo,Consolas,monospace;--sans:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
*{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,var(--bg-2),var(--bg) 240px);color:var(--ink);font-family:var(--sans);line-height:1.55;-webkit-font-smoothing:antialiased}
.wrap{max-width:1080px;margin:0 auto;padding:28px 22px 64px}
.head{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:8px}
.head h1{font-size:22px;font-weight:700;margin:0;letter-spacing:-.02em}
.head .tag{font-family:var(--mono);font-size:11.5px;color:var(--muted);background:var(--panel);border:1px solid var(--line-2);border-radius:999px;padding:4px 11px;box-shadow:var(--shadow)}
.head .tag.live{color:#fff;background:var(--ok);border-color:transparent;font-weight:700}
.lede{color:var(--ink-2);font-size:15px;margin:0 0 24px;max-width:82ch}
.lede b{color:var(--ink)}
h2{font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin:28px 0 13px;font-weight:700}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(168px,1fr));gap:14px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:16px 17px 15px;box-shadow:var(--shadow);border-top:3px solid var(--c,var(--accent));transition:transform .12s ease,box-shadow .12s ease}
.card:hover{transform:translateY(-2px);box-shadow:0 6px 22px rgba(16,24,40,.1)}
.card .k{display:flex;align-items:center;gap:8px;color:var(--ink-2);font-size:12.5px;font-weight:600}
.card .k .d{width:9px;height:9px;border-radius:3px;background:var(--c,var(--accent))}
.card .v{font-family:var(--mono);font-size:34px;font-weight:700;margin:8px 0 3px;font-variant-numeric:tabular-nums;letter-spacing:-.02em;color:var(--ink)}
.card .sub{color:var(--muted);font-size:12.5px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:20px 22px;margin-top:14px;box-shadow:var(--shadow)}
.stack{display:flex;height:28px;border-radius:9px;overflow:hidden;background:var(--panel-2)}
.stack > span{display:block;height:100%}
.legend{display:flex;flex-wrap:wrap;gap:18px;margin-top:15px;font-size:13px;color:var(--ink-2)}
.legend .i{display:flex;align-items:center;gap:8px}
.legend .d{width:11px;height:11px;border-radius:3px}
.legend .n{font-family:var(--mono);color:var(--muted);margin-left:3px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}
@media(max-width:760px){.cols{grid-template-columns:1fr}}
.day{display:grid;grid-template-columns:92px 1fr 120px;align-items:center;gap:12px;margin-bottom:11px;font-size:13px}
.day .dt{font-family:var(--mono);color:var(--ink-2)}
.dwrap{background:var(--panel-2);border-radius:7px;height:20px;overflow:hidden}
.dbar{height:100%;background:linear-gradient(90deg,#2f6bff,#5aa0ff);border-radius:7px}
.day .met{font-family:var(--mono);font-size:12px;color:var(--muted);text-align:right}
.scroll{overflow-x:auto;margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:13px;min-width:640px}
th,td{text-align:left;padding:11px 12px;border-bottom:1px solid var(--line);vertical-align:top}
thead th{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.04em;font-weight:700;background:var(--panel-2)}
tbody tr:hover{background:var(--panel-2)}
td.addr{font-weight:600}td.mono{font-family:var(--mono);color:var(--ink-2);white-space:nowrap}
.chip{font-size:11px;padding:3px 10px;border-radius:999px;font-weight:700;white-space:nowrap;display:inline-block}
.chip.eval{background:#e4edff;color:#1d4ed8}.chip.dead{background:#fde5e7;color:#c81e2b}
.chip.uc{background:#f0e9ff;color:#6d28d9}.chip.review{background:#fef2d9;color:#b45309}.chip.new{background:#eef1f6;color:#5b6577}
.act{font-family:var(--mono);font-size:12px;font-weight:600}.act.ok{color:var(--ok)}.act.hold{color:#b45309}.act.fail{color:var(--dead)}
.help{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px 24px;font-size:13px;color:var(--ink-2)}
.help b{color:var(--ink)}
.foot{color:var(--muted);font-size:12px;text-align:center;margin-top:32px}
.empty{text-align:center;padding:48px 20px;color:var(--muted)}
.empty .big{font-size:18px;color:var(--ink);margin-bottom:8px;font-weight:650}
`;

function emptyState(meta) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Pipeline Cleanup Dashboard</title><style>${STYLE}</style></head><body><div class="wrap">
  <div class="head"><h1>Pipeline Cleanup</h1><span class="tag">${esc(meta.mode || 'no data')}</span></div>
  <div class="panel"><div class="empty">
    <div class="big">No run yet</div>
    Click <b>Start</b> above (or run <span style="font-family:var(--mono)">node app.js --audit</span>) to review the pipeline.<br/>
    Results, charts, and the daily report will appear here automatically once a run finishes.
  </div></div>
</div></body></html>`;
}

function buildHtml(rows, history, meta = {}) {
  if (!rows || rows.length === 0) return emptyState(meta);

  const s = computeSummary(rows);
  const days = byDay(history);
  const pct = (n) => (s.total ? Math.round((n / s.total) * 1000) / 10 : 0);

  const SEG = [
    { label: 'Left New', key: 'leftNew', color: 'var(--new)', desc: 'un-worked / no contact' },
    { label: 'Evaluating', key: 'evaluating', color: 'var(--eval)', desc: 'any activity → Evaluating' },
    { label: 'Under Contract', key: 'underContract', color: 'var(--uc)', desc: 'signed/accepted → set' },
    { label: 'Closed', key: 'closed', color: 'var(--dead)', desc: 'dead or sold → Closed + note' },
  ];

  const lede = `<b>${meta.mode === 'LIVE' || meta.mode === 'live view' ? 'Latest run' : 'Latest audit'}</b> — reviewed <b>${s.total}</b> leads: ` +
    `<b>${s.evaluating}</b> set to Evaluating, <b>${s.underContract}</b> to Under&nbsp;Contract, <b>${s.closed}</b> to Closed, ` +
    `<b>${s.manualReview}</b> flagged (auto-noted), <b>${s.leftNew}</b> left New` +
    `${s.failed ? ` · <span style="color:var(--dead)">${s.failed} failed writes</span>` : ' · 0 errors'}.`;

  const card = (dot, k, v, sub) => `<div class="card" style="--c:${dot}"><div class="k"><span class="d"></span>${k}</div><div class="v">${v}</div><div class="sub">${sub}</div></div>`;

  const stack = SEG.filter((x) => s[x.key] > 0)
    .map((x) => `<span style="width:${pct(s[x.key])}%;background:${x.color}" title="${x.label}: ${s[x.key]}"></span>`).join('');
  const legend = SEG.map((x) => `<span class="i"><span class="d" style="background:${x.color}"></span>${x.label} <span class="n">${s[x.key]}</span></span>`).join('');

  const maxDay = Math.max(1, ...days.map((d) => d.total));
  const dailyRows = days.length
    ? days.slice(-14).map((d) => `<div class="day"><span class="dt">${d.date}</span><div class="dwrap"><div class="dbar" style="width:${Math.max(3, 100 * d.total / maxDay)}%"></div></div><span class="met">${d.total} leads · ${d.evaluating}▲ ${d.closed}✕</span></div>`).join('')
    : '<div class="empty" style="padding:24px">No history yet — one row is added here each run.</div>';

  const chip = (st) => (st === 'Evaluating' ? 'eval' : st === 'Closed' ? 'dead' : st === 'Under Contract' ? 'uc' : st === 'New' ? 'review' : 'new');
  const attention = rows.filter((r) => r.recommended_status !== 'New' || r.manual_review_required).slice(0, 80);
  const tableBody = attention.length
    ? attention.map((r) => {
        const st = r.recommended_status;
        let act = 'act hold', txt = 'held / flagged';
        if (st === 'Evaluating') { act = r.update_attempted ? (r.update_saved ? 'act ok' : 'act fail') : 'act ok'; txt = r.update_attempted ? (r.update_saved ? '✓ set “Follow up”' : '✗ save failed') : '→ Follow up'; }
        else if (st === 'Closed') { act = r.update_attempted ? (r.update_saved ? 'act ok' : 'act fail') : 'act ok'; txt = r.update_attempted ? (r.update_saved ? '✓ set “Closed”' : '✗ save failed') : '→ Closed'; }
        else if (st === 'Under Contract') { act = r.update_attempted ? (r.update_saved ? 'act ok' : 'act fail') : 'act ok'; txt = r.update_attempted ? (r.update_saved ? '✓ set “Under Contract”' : '✗ save failed') : '→ Under Contract'; }
        else { act = 'act hold'; txt = 'review'; }
        const disp = st === 'New' ? 'Flagged' : st;
        const url = r.property_url || '';
        const addrCell = url ? `<a href="${esc(url)}" target="_blank" style="color:var(--accent);text-decoration:none">${esc(r.property_address)} ↗</a>` : esc(r.property_address);
        return `<tr><td class="addr">${addrCell}</td><td class="mono">${esc(r.contact_name || '—')}</td>
          <td><span class="chip ${chip(st)}">${esc(disp)}</span></td>
          <td class="${act}">${txt}</td>
          <td class="mono">${esc(r.manual_review_reason || r.latest_activity_summary || r.latest_activity_type || '')}</td></tr>`;
      }).join('')
    : '<tr><td colspan="5" class="empty" style="padding:24px">Nothing needed changing or review in this run — all leads correctly left as New.</td></tr>';

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/><title>Pipeline Cleanup Dashboard</title>
<style>${STYLE}</style></head><body><div class="wrap">
  <div class="head"><h1>Pipeline Cleanup</h1>
    <span class="tag${meta.mode === 'LIVE' ? ' live' : ''}">${esc(meta.mode || 'report')}</span>
    <span class="tag" style="margin-left:auto">updated ${esc(meta.generatedAt || '')}</span></div>
  <p class="lede">${lede}</p>

  <h2>This run at a glance</h2>
  <div class="cards">
    ${card('var(--accent)', 'Reviewed', s.total, 'leads checked')}
    ${card('var(--eval)', 'Evaluating', s.evaluating, 'any activity → Follow up')}
    ${card('var(--uc)', 'Under Contract', s.underContract, 'signed/accepted → set')}
    ${card('var(--dead)', 'Closed', s.closed, 'dead or sold → + note')}
    ${card('var(--review)', 'Flagged', s.manualReview, 'auto-noted, no action needed')}
    ${card('var(--ok)', 'Duplicates', s.duplicates, 'flagged, not merged')}
  </div>

  <div class="panel">
    <h2 style="margin-top:0">How the ${s.total} leads broke down</h2>
    <div class="stack">${stack}</div>
    <div class="legend">${legend}</div>
  </div>

  <div class="cols">
    <div class="panel"><h2 style="margin-top:0">Daily report — backlog worked over time</h2>${dailyRows}
      <div class="legend"><span class="i">▲ Evaluating</span><span class="i">✕ Closed</span></div></div>
    <div class="panel"><h2 style="margin-top:0">What the terms mean</h2>
      <div class="help">
        <div><b>Evaluating</b> — the rep worked this lead (call/text/offer). Sets Market Status "Follow up".</div>
        <div><b>Under Contract</b> — signed contract / accepted offer noted. Auto-set to "Under Contract".</div>
        <div><b>Closed</b> — dead/lost OR sold, per the note. Auto-set to "Closed" with a note saying which.</div>
        <div><b>Review</b> — signals conflict or a contact was worked but has no Lead Stage.</div>
        <div><b>Left New</b> — no contact or not worked yet; correctly untouched.</div>
        <div><b>Everything is reversible</b> — one status field per lead; the State field is never touched.</div>
      </div>
    </div>
  </div>

  <div class="panel"><h2 style="margin-top:0">Leads that changed or need attention (${attention.length})</h2>
    <div class="scroll"><table>
      <thead><tr><th>Property</th><th>Contact</th><th>Decision</th><th>Action</th><th>Why</th></tr></thead>
      <tbody>${tableBody}</tbody>
    </table></div>
  </div>

  <div class="foot">Twin Home Buyer · REI BlackBook · generated from the latest run report · auto-writes transcribe the rep's Lead Stage and are reversible</div>
</div></body></html>`;
}

function writeDashboard(settings) {
  const rows = readJson(settings.paths.reportsJson, []);
  const history = readJson(settings.paths.dailyHistory, []);
  const html = buildHtml(rows, history, {
    mode: settings.mode && settings.mode.LIVE_MODE ? 'LIVE' : 'AUDIT',
    generatedAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
  });
  const out = path.resolve(settings.paths.dashboardHtml || './reports/dashboard.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  return out;
}

module.exports = { buildHtml, writeDashboard, computeSummary, byDay, readJson };
