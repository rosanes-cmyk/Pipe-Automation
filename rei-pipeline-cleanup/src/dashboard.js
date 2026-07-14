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

function esc(v) { return String(v == null ? '' : v).replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;')); }

// Aggregate daily-history run records by date.
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

function buildHtml(rows, history, meta = {}) {
  const s = computeSummary(rows);
  const days = byDay(history);
  const notable = rows
    .filter((r) => r.recommended_status !== 'New' || r.manual_review_required)
    .slice(0, 60)
    .map((r) => ({
      addr: r.property_address, contact: r.contact_name || '',
      status: r.recommended_status, saved: r.update_saved, attempted: r.update_attempted,
      reason: r.manual_review_reason || r.latest_activity_type || '',
    }));

  const STATUS = [
    { label: 'Left New', n: s.leftNew, color: 'var(--new)' },
    { label: 'Evaluating', n: s.evaluating, color: 'var(--eval)' },
    { label: 'Closed', n: s.closed, color: 'var(--dead)' },
    { label: 'Under Contract', n: s.underContract, color: 'var(--uc)' },
  ];
  const maxStatus = Math.max(1, ...STATUS.map((x) => x.n));
  const maxDay = Math.max(1, ...days.map((d) => d.total));
  const chip = (st) => (st === 'Evaluating' ? 'eval' : st === 'Closed' ? 'dead' : st === 'Under Contract' ? 'uc' : 'review');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Pipeline Cleanup Dashboard</title>
<style>
:root{--bg:#000;--panel:#0c0d10;--panel-2:#141519;--ink:#f2f4f7;--muted:#8b93a1;--border:#212329;--border-strong:#30333b;--accent:#4d8dff;--new:#7b8698;--eval:#4d8dff;--uc:#b57bff;--dead:#ff5a5a;--review:#ffb020;--ok:#2ee06a;--mono:ui-monospace,"SF Mono","JetBrains Mono",Menlo,Consolas,monospace;--sans:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--sans);line-height:1.5}
.wrap{max-width:1060px;margin:0 auto;padding:26px 20px 60px}
.top{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;padding-bottom:16px;border-bottom:1px solid var(--border);margin-bottom:24px}
.top h1{font-size:19px;margin:0}.top .sub{color:var(--muted);font-size:13px}
.pill{margin-left:auto;font-family:var(--mono);font-size:12px;color:var(--muted);border:1px solid var(--border-strong);border-radius:999px;padding:3px 11px}
h2{font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0 0 13px;font-weight:600}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:24px}
.tile{background:var(--panel);border:1px solid var(--border);border-radius:13px;padding:15px;position:relative;overflow:hidden}
.tile::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--c,var(--new))}
.tile .l{color:var(--muted);font-size:11.5px;text-transform:uppercase;letter-spacing:.04em}
.tile .v{font-family:var(--mono);font-size:30px;font-weight:600;margin-top:5px;font-variant-numeric:tabular-nums}
.tile .s{color:var(--muted);font-size:12px;margin-top:2px}
.panel{background:var(--panel);border:1px solid var(--border);border-radius:13px;padding:19px;margin-bottom:22px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:20px}@media(max-width:700px){.cols{grid-template-columns:1fr}}
.bar-row{display:grid;grid-template-columns:140px 1fr 42px;align-items:center;gap:11px;margin-bottom:10px}
.bar-row .n{font-size:13px}.bwrap{background:var(--panel-2);border-radius:6px;height:20px;overflow:hidden}
.bar{height:100%;border-radius:6px;min-width:3px}.bar-row .c{text-align:right;font-family:var(--mono);font-weight:600}
table{width:100%;border-collapse:collapse;font-size:13px;min-width:560px}.scroll{overflow-x:auto}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--border);vertical-align:top}
thead th{color:var(--muted);font-size:11px;text-transform:uppercase;font-weight:600}
tbody tr:hover{background:var(--panel-2)}td.mono{font-family:var(--mono);color:var(--muted)}
.chip{font-size:11px;padding:2px 9px;border-radius:6px;font-weight:600;white-space:nowrap}
.chip.eval{background:rgba(77,141,255,.16);color:var(--eval)}.chip.dead{background:rgba(255,90,90,.16);color:var(--dead)}
.chip.uc{background:rgba(181,123,255,.16);color:var(--uc)}.chip.review{background:rgba(255,176,32,.16);color:var(--review)}
.w{font-family:var(--mono);font-size:12px}.w.ok{color:var(--ok)}.w.hold{color:var(--review)}.w.fail{color:var(--dead)}
.day{display:grid;grid-template-columns:96px 1fr 120px;align-items:center;gap:11px;margin-bottom:9px;font-size:13px}
.day .mono{font-family:var(--mono);color:var(--muted)}.daybar{background:var(--panel-2);border-radius:5px;height:16px;overflow:hidden}
.day .met{font-family:var(--mono);font-size:12px;color:var(--muted);text-align:right}
.foot{color:var(--muted);font-size:12px;text-align:center;margin-top:26px}
.empty{color:var(--muted);font-size:13px}
</style></head><body><div class="wrap">
<div class="top"><h1>Pipeline Cleanup Dashboard</h1><span class="sub">Twin Home Buyer · REI BlackBook</span>
<span class="pill">${esc(meta.mode || 'report')} · ${esc(meta.generatedAt || '')}</span></div>

<h2>Latest run</h2>
<div class="tiles">
${[['Reviewed', s.total, 'this run', 'var(--accent)'],
   ['→ Follow up', s.evaluating, 'Evaluating', 'var(--eval)'],
   ['→ Dead', s.closed, 'Closed-dead', 'var(--dead)'],
   ['Under Contract', s.underContract, 'held', 'var(--uc)'],
   ['Manual review', s.manualReview, 'flagged', 'var(--review)'],
   ['Duplicates', s.duplicates, 'flagged', 'var(--ok)'],
   ['Contacts', s.contacts, 'found', 'var(--new)'],
   ['Failed writes', s.failed, s.failed ? 'check log' : '0 errors', s.failed ? 'var(--dead)' : 'var(--ok)']]
  .map((t) => `<div class="tile" style="--c:${t[3]}"><div class="l">${t[0]}</div><div class="v">${t[1]}</div><div class="s">${t[2]}</div></div>`).join('')}
</div>

<div class="cols">
<div class="panel"><h2>Status decisions (of ${s.total})</h2>
${STATUS.map((x) => `<div class="bar-row"><span class="n">${x.label}</span><div class="bwrap"><div class="bar" style="width:${Math.max(3, 100 * x.n / maxStatus)}%;background:${x.color}"></div></div><span class="c">${x.n}</span></div>`).join('')}
</div>
<div class="panel"><h2>Daily report (runs over time)</h2>
${days.length ? days.slice(-14).map((d) => `<div class="day"><span class="mono">${d.date}</span><div class="daybar"><div class="bar" style="width:${Math.max(3, 100 * d.total / maxDay)}%;background:var(--accent)"></div></div><span class="met">${d.total} · ${d.evaluating}E ${d.closed}C</span></div>`).join('') : '<div class="empty">No runs logged yet. Each run appends a day record here.</div>'}
</div>
</div>

<div class="panel"><h2>Notable leads (${notable.length})</h2><div class="scroll">
<table><thead><tr><th>Property</th><th>Contact</th><th>Decision</th><th>Write</th><th>Why</th></tr></thead><tbody>
${notable.length ? notable.map((r) => {
  const w = r.status === 'Evaluating' || (r.status === 'Closed') ? (r.attempted ? (r.saved ? 'ok' : 'fail') : 'ok') : 'hold';
  const wtxt = r.attempted ? (r.saved ? 'saved' : 'FAILED') : (r.status === 'Evaluating' ? '→ Follow up' : r.status === 'Closed' ? '→ Dead' : 'hold');
  return `<tr><td>${esc(r.addr)}</td><td class="mono">${esc(r.contact)}</td><td><span class="chip ${chip(r.status)}">${esc(r.status)}</span></td><td class="w ${w}">${wtxt}</td><td class="mono">${esc(r.reason).slice(0, 80)}</td></tr>`;
}).join('') : '<tr><td colspan="5" class="empty">No non-New / flagged leads in the latest report.</td></tr>'}
</tbody></table></div></div>

<div class="foot">Generated from reports/pipeline-results.json + reports/daily-history.json · auto-writes are reversible · state field never touched</div>
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
