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
:root{--bg:#0a0b0e;--panel:#111318;--panel-2:#171a21;--line:#232733;--line-2:#2e3341;
--ink:#eef1f6;--ink-2:#c3cad6;--muted:#8b93a3;--accent:#4d8dff;
--new:#7c8698;--eval:#4d8dff;--uc:#b489ff;--dead:#ff6b6b;--review:#ffb62e;--ok:#31d977;
--mono:ui-monospace,"SF Mono","JetBrains Mono",Menlo,Consolas,monospace;--sans:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--sans);line-height:1.55;-webkit-font-smoothing:antialiased}
.wrap{max-width:1080px;margin:0 auto;padding:26px 22px 64px}
.head{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:6px}
.head h1{font-size:20px;font-weight:650;margin:0;letter-spacing:-.01em}
.head .tag{font-family:var(--mono);font-size:11.5px;color:var(--muted);border:1px solid var(--line-2);border-radius:999px;padding:3px 10px}
.head .tag.live{color:#03120a;background:var(--ok);border-color:transparent;font-weight:700}
.lede{color:var(--ink-2);font-size:14.5px;margin:0 0 22px;max-width:80ch}
.lede b{color:var(--ink)}
h2{font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin:26px 0 13px;font-weight:650}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(168px,1fr));gap:13px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px 17px}
.card .k{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:12px;font-weight:600}
.card .k .d{width:9px;height:9px;border-radius:3px;background:var(--c,var(--new))}
.card .v{font-family:var(--mono);font-size:33px;font-weight:650;margin:7px 0 3px;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.card .sub{color:var(--muted);font-size:12.5px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:20px 21px;margin-top:13px}
.stack{display:flex;height:26px;border-radius:8px;overflow:hidden;border:1px solid var(--line);background:var(--panel-2)}
.stack > span{display:block;height:100%}
.legend{display:flex;flex-wrap:wrap;gap:16px;margin-top:14px;font-size:13px;color:var(--ink-2)}
.legend .i{display:flex;align-items:center;gap:8px}
.legend .d{width:10px;height:10px;border-radius:3px}
.legend .n{font-family:var(--mono);color:var(--muted);margin-left:3px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:13px;margin-top:13px}
@media(max-width:760px){.cols{grid-template-columns:1fr}}
.day{display:grid;grid-template-columns:92px 1fr 118px;align-items:center;gap:12px;margin-bottom:10px;font-size:13px}
.day .dt{font-family:var(--mono);color:var(--ink-2)}
.dwrap{background:var(--panel-2);border-radius:6px;height:18px;overflow:hidden;border:1px solid var(--line)}
.dbar{height:100%;background:linear-gradient(90deg,var(--accent),#7db0ff)}
.day .met{font-family:var(--mono);font-size:12px;color:var(--muted);text-align:right}
.scroll{overflow-x:auto;margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:13px;min-width:640px}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top}
thead th{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.04em;font-weight:650;background:var(--panel-2)}
tbody tr:hover{background:var(--panel-2)}
td.addr{font-weight:550}td.mono{font-family:var(--mono);color:var(--ink-2);white-space:nowrap}
.chip{font-size:11px;padding:3px 10px;border-radius:7px;font-weight:650;white-space:nowrap;display:inline-block}
.chip.eval{background:rgba(77,141,255,.15);color:var(--eval)}.chip.dead{background:rgba(255,107,107,.15);color:var(--dead)}
.chip.uc{background:rgba(180,137,255,.15);color:var(--uc)}.chip.review{background:rgba(255,182,46,.15);color:var(--review)}.chip.new{background:rgba(124,134,152,.18);color:var(--new)}
.act{font-family:var(--mono);font-size:12px}.act.ok{color:var(--ok)}.act.hold{color:var(--review)}.act.fail{color:var(--dead)}
.help{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px 22px;font-size:13px;color:var(--ink-2)}
.help b{color:var(--ink)}
.foot{color:var(--muted);font-size:12px;text-align:center;margin-top:30px}
.empty{text-align:center;padding:48px 20px;color:var(--muted)}
.empty .big{font-size:17px;color:var(--ink);margin-bottom:8px;font-weight:600}
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
    { label: 'Follow up', key: 'evaluating', color: 'var(--eval)', desc: 'active lead → Evaluating' },
    { label: 'Dead', key: 'closed', color: 'var(--dead)', desc: 'lost / dead → Closed' },
    { label: 'Under Contract', key: 'underContract', color: 'var(--uc)', desc: 'held for a human' },
  ];

  const lede = `<b>${meta.mode === 'LIVE' || meta.mode === 'live view' ? 'Latest run' : 'Latest audit'}</b> — reviewed <b>${s.total}</b> leads: ` +
    `<b>${s.evaluating}</b> set to Follow&nbsp;up, <b>${s.closed}</b> marked Dead, ` +
    `<b>${s.manualReview}</b> flagged for review, <b>${s.leftNew}</b> left New` +
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
        else if (st === 'Closed') { act = r.update_attempted ? (r.update_saved ? 'act ok' : 'act fail') : 'act ok'; txt = r.update_attempted ? (r.update_saved ? '✓ set “Dead”' : '✗ save failed') : '→ Dead'; }
        else if (st === 'Under Contract') { act = 'act hold'; txt = 'hold (human)'; }
        else { act = 'act hold'; txt = 'review'; }
        const disp = st === 'New' ? 'Needs review' : st;
        return `<tr><td class="addr">${esc(r.property_address)}</td><td class="mono">${esc(r.contact_name || '—')}</td>
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
    ${card('var(--eval)', 'Follow up', s.evaluating, 'active → Evaluating')}
    ${card('var(--dead)', 'Dead', s.closed, 'lost/dead → Closed')}
    ${card('var(--uc)', 'Under Contract', s.underContract, 'held for a human')}
    ${card('var(--review)', 'Review', s.manualReview, 'flagged, unchanged')}
    ${card('var(--ok)', 'Duplicates', s.duplicates, 'flagged, not merged')}
  </div>

  <div class="panel">
    <h2 style="margin-top:0">How the ${s.total} leads broke down</h2>
    <div class="stack">${stack}</div>
    <div class="legend">${legend}</div>
  </div>

  <div class="cols">
    <div class="panel"><h2 style="margin-top:0">Daily report — backlog worked over time</h2>${dailyRows}
      <div class="legend"><span class="i">▲ Follow up</span><span class="i">✕ Dead</span></div></div>
    <div class="panel"><h2 style="margin-top:0">What the terms mean</h2>
      <div class="help">
        <div><b>Follow up</b> — the rep already worked this lead (call/text/offer). Set to Evaluating.</div>
        <div><b>Dead</b> — Lost / Invalid / Wrong number per the rep's Lead Stage. Set to Dead.</div>
        <div><b>Under Contract</b> — high-stakes; held for a person to confirm, never auto-written.</div>
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
