'use strict';

/**
 * Pipeline Cleanup — control console + dashboard server (dependency-free).
 *   node serve.js [port]        # default 8787
 *
 * Open http://localhost:8787, set the options, and click Start — the automation
 * runs from the browser. UI styled after the campaign-console reference.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { buildHtml, readJson } = require('./src/dashboard');

const settings = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'config/settings.json'), 'utf8'));
const port = parseInt(process.argv[2], 10) || 8787;

const state = { running: false, mode: null, startedAt: null, exitCode: null, log: [] };
let child = null;
const pushLog = (l) => { state.log.push(l); if (state.log.length > 400) state.log.shift(); };

function send(res, code, type, body) { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body); }
function query(url) { const q = {}; const i = url.indexOf('?'); if (i >= 0) new URLSearchParams(url.slice(i + 1)).forEach((v, k) => (q[k] = v)); return q; }
function fileOr(p, fallback) { try { return fs.readFileSync(path.resolve(p)); } catch { return fallback; } }

function startRun(mode, max, resume) {
  if (state.running) return false;
  const args = ['app.js', mode === 'live' ? '--live' : '--audit'];
  if (max) args.push('--max', String(max));
  if (resume) args.push('--resume');
  state.running = true; state.mode = mode; state.startedAt = new Date().toISOString(); state.exitCode = null; state.log = [];
  pushLog(`$ node ${args.join(' ')}`);
  child = spawn(process.execPath, args, { cwd: __dirname });
  const on = (b) => String(b).split(/\r?\n/).forEach((l) => l.trim() && pushLog(l));
  child.stdout.on('data', on); child.stderr.on('data', on);
  child.on('close', (c) => { state.running = false; state.exitCode = c; child = null; pushLog(`--- run finished (exit ${c}) ---`); });
  child.on('error', (e) => { state.running = false; child = null; pushLog(`ERROR: ${e.message}`); });
  return true;
}

const APP = `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/><title>Pipeline Cleanup — Console</title>
<style>
:root{--bg:#0b111b;--bg2:#0e1622;--panel:#131c2b;--panel-2:#182234;--line:#243247;--line-2:#2d3d55;
--ink:#eaf0f8;--ink-2:#aeb9cc;--muted:#7e8ca3;--accent:#3b82f6;--green:#22c55e;--green-2:#16a34a;--red:#ef4444;--amber:#f59e0b;--purple:#a855f7;--cyan:#38bdf8;
--sans:-apple-system,"Segoe UI",Roboto,Inter,system-ui,Helvetica,Arial,sans-serif;--mono:ui-monospace,"Cascadia Code","SF Mono",Menlo,Consolas,monospace}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:14px;line-height:1.5}
.app{max-width:1240px;margin:0 auto;padding:20px 26px 60px}
.apphead{display:flex;align-items:flex-start;gap:16px;padding:14px 4px 18px}
.apphead .dot{width:11px;height:11px;border-radius:50%;background:var(--green);margin-top:6px;box-shadow:0 0 0 4px rgba(34,197,94,.15)}
.apphead h1{font-size:22px;font-weight:700;margin:0;letter-spacing:-.01em}
.apphead .sub{color:var(--accent);font-size:13px;margin-top:2px}
.status{margin-left:auto;display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--ink-2);background:var(--panel);border:1px solid var(--line-2);border-radius:999px;padding:7px 15px}
.status .s{width:9px;height:9px;border-radius:50%;background:var(--muted)}
.status.run .s{background:var(--green);box-shadow:0 0 0 3px rgba(34,197,94,.2)}.status.run{color:var(--ink)}
.status.err .s{background:var(--red)}
.info{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:12px;padding:16px 18px;margin-bottom:16px}
.info .lbl{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700;margin-bottom:8px}
.info p{margin:6px 0;color:var(--ink);font-size:14.5px}
.info b{color:#fff}
.step{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin-bottom:18px}
.step h3{margin:0 0 6px;font-size:16px}
.step .desc{color:var(--ink-2);font-size:13.5px;margin-bottom:14px;max-width:95ch}
.btn{border:1px solid var(--line-2);background:var(--panel-2);color:var(--ink);border-radius:9px;padding:9px 15px;font-size:13px;font-weight:600;cursor:pointer;transition:.12s}
.btn:hover{border-color:var(--accent)}
.btn:disabled{opacity:.4;cursor:not-allowed}
.btn.green{background:var(--green-2);border-color:transparent;color:#fff}.btn.green:hover{background:var(--green)}
.btn.red{background:var(--red);border-color:transparent;color:#fff}
.btn.ghost{background:transparent}
.stats{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:18px}
@media(max-width:900px){.stats{grid-template-columns:repeat(3,1fr)}}
@media(max-width:560px){.stats{grid-template-columns:repeat(2,1fr)}}
.stat{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:15px 16px}
.stat.hl{border-color:var(--accent);box-shadow:0 0 0 1px rgba(59,130,246,.3)}
.stat .num{font-size:30px;font-weight:750;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.stat .lab{font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);margin-top:3px;font-weight:600}
.n-white{color:#fff}.n-green{color:var(--green)}.n-red{color:var(--red)}.n-amber{color:var(--amber)}.n-cyan{color:var(--cyan)}.n-purple{color:var(--purple)}
.controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}
.controls .sp{margin-left:auto}
select,input[type=number],input[type=time]{background:var(--panel-2);color:var(--ink);border:1px solid var(--line-2);border-radius:9px;padding:8px 10px;font-size:13px}
label.chk{display:flex;align-items:center;gap:7px;color:var(--ink-2);font-size:13px}
.toggle{display:inline-flex;align-items:center;gap:8px;background:var(--green-2);color:#fff;border:0;border-radius:9px;padding:9px 14px;font-size:13px;font-weight:700;cursor:pointer}
.toggle.off{background:var(--panel-2);color:var(--ink-2);border:1px solid var(--line-2)}
.muted{color:var(--muted);font-size:13px}
.row2{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px}
.sched{display:flex;align-items:center;gap:10px;color:var(--ink-2);font-size:13px;margin-bottom:16px}
.log{background:#070c14;border:1px solid var(--line);border-radius:12px;padding:14px;height:210px;overflow:auto;font-family:var(--mono);font-size:12px;line-height:1.55;white-space:pre-wrap;color:#c3d0e4}
.hide{display:none}
</style></head><body><div class="app">

  <div class="apphead">
    <div class="dot"></div>
    <div><h1>Pipeline Status Cleanup</h1><div class="sub">Lead Stage Automation · Twin Home Buyer / Equity Track</div></div>
    <div class="status" id="status"><span class="s"></span><span id="statustext">Idle</span></div>
  </div>

  <div class="info">
    <div class="lbl">How it decides (from the rep's Lead Stage — no guessing)</div>
    <p><b>Follow up</b> — worked lead (call/text/offer) → set Evaluating. &nbsp; <b>Dead</b> — Lost / Invalid / Wrong number → set Dead.</p>
    <p><b>Under Contract</b> &amp; conflicts → held for a human. &nbsp; <b>New</b> — no contact / not worked → left as-is. Every change is reversible; the State field is never touched.</p>
  </div>

  <div class="step">
    <h3>1 · Source</h3>
    <div class="desc">Pulls the <b>New</b> bucket from REI BlackBook (<span class="muted">my.reiblackbook.com/properties/inbox</span>) top-first, opens each attached contact, reads the latest activity, and sets the correct status. A Chrome window opens on Start — log into REI there once.</div>
    <button class="btn" onclick="window.open('https://my.reiblackbook.com/properties/inbox?status_filter=New','_blank')">↗ Open pipeline in REI</button>
    <button class="btn" onclick="openReport()">📊 Daily Report</button>
  </div>

  <div class="stats" id="stats"></div>

  <div class="controls">
    <button class="btn green" id="start" onclick="startRun(false)">▶ Start</button>
    <button class="btn" id="resume" onclick="startRun(true)">↻ Resume</button>
    <button class="btn red" id="stop" onclick="stopRun()" disabled>■ Stop</button>
    <span class="muted">Leads per run</span>
    <select id="max"><option>25</option><option selected>100</option><option>300</option><option>1000</option></select>
    <label class="chk"><input type="checkbox" id="auto"/> Auto-continue</label>
    <button class="toggle" id="live" onclick="toggleLive()">● Live writing: OFF</button>
    <span class="sp"></span>
    <button class="btn ghost" onclick="toggleLog()">▤ View Logs</button>
  </div>
  <div class="row2">
    <button class="btn" onclick="location.href='/download/csv'">↓ Export CSV</button>
    <button class="btn" onclick="location.href='/download/json'">↓ Export JSON</button>
    <button class="btn" onclick="openReport()">📊 Open full report</button>
  </div>
  <div class="sched">
    <label class="chk"><input type="checkbox" id="schedchk" onchange="schedNote()"/> Run automatically every day at</label>
    <input type="time" id="schedtime" value="09:00"/>
    <span id="schednote" class="muted">Off — you start each run manually</span>
  </div>

  <div class="log hide" id="log">Ready. Set your options and click Start.</div>
</div>
<script>
let live=false, wasRunning=false;
function toggleLive(){ live=!live; const b=document.getElementById('live'); b.textContent=(live?'● Live writing: ON':'● Live writing: OFF'); b.className='toggle'+(live?'':' off'); }
function toggleLog(){ document.getElementById('log').classList.toggle('hide'); }
function openReport(){ window.open('/dashboard','_blank'); }
function schedNote(){ const on=document.getElementById('schedchk').checked; document.getElementById('schednote').textContent = on ? 'Scheduled — see setup note below (uses Windows Task Scheduler)' : 'Off — you start each run manually'; if(on) alert('To run daily automatically, add a Windows Task Scheduler task that runs:  node app.js --live --max 300  in this folder at your chosen time. Ask for the ready-made .bat + task and I will add it.'); }
async function startRun(resume){
  if(live && !resume && !confirm('LIVE writing is ON. This will WRITE statuses in REI (Follow up / Dead). Continue?'))return;
  document.getElementById('log').classList.remove('hide');
  const max=document.getElementById('max').value||100;
  await fetch('/api/run?mode='+(live?'live':'audit')+'&max='+max+(resume?'&resume=1':''),{method:'POST'});
  poll();
}
async function stopRun(){ document.getElementById('auto').checked=false; await fetch('/api/stop',{method:'POST'}); }
function setNum(id,val,cls){ document.getElementById(id).innerHTML='<div class="num '+cls+'">'+val+'</div>'; }
async function loadStats(){
  try{
    const rows=await fetch('/api/latest').then(r=>r.json());
    const c={total:rows.length,ev:0,cl:0,uc:0,mr:0,dup:0};
    rows.forEach(r=>{ if(r.recommended_status==='Evaluating')c.ev++; else if(r.recommended_status==='Closed')c.cl++; else if(r.recommended_status==='Under Contract')c.uc++; if(r.manual_review_required)c.mr++; if(r.possible_duplicate)c.dup++; });
    const cards=[['TOTAL REVIEWED',c.total,'n-white',''],['FOLLOW UP',c.ev,'n-green',''],['DEAD',c.cl,'n-red',''],['UNDER CONTRACT',c.uc,'n-purple',''],['MANUAL REVIEW',c.mr,'n-amber',''],['DUPLICATES',c.dup,'n-cyan','hl']];
    document.getElementById('stats').innerHTML=cards.map(x=>'<div class="stat '+x[3]+'"><div class="num '+x[2]+'">'+x[1]+'</div><div class="lab">'+x[0]+'</div></div>').join('');
  }catch(e){}
}
async function poll(){
  try{
    const s=await fetch('/api/status').then(r=>r.json());
    const st=document.getElementById('status'), t=document.getElementById('statustext');
    document.getElementById('start').disabled=s.running; document.getElementById('resume').disabled=s.running; document.getElementById('stop').disabled=!s.running;
    if(s.running){st.className='status run';t.textContent='Running';}
    else if(s.exitCode&&s.exitCode!==0){st.className='status err';t.textContent='Error';}
    else{st.className='status';t.textContent='Idle';}
    const log=document.getElementById('log'); if(s.log&&s.log.length){log.textContent=s.log.join('\\n');log.scrollTop=log.scrollHeight;}
    if(wasRunning&&!s.running){ loadStats(); if(document.getElementById('auto').checked&&(!s.exitCode||s.exitCode===0)){ startRun(true); } }
    wasRunning=s.running;
  }catch(e){}
  setTimeout(poll,2000);
}
loadStats(); poll();
</script></body></html>`;

const server = http.createServer((req, res) => {
  try {
    const url = req.url;
    if (url === '/' || url.startsWith('/?')) return send(res, 200, 'text/html', APP);
    if (url.startsWith('/dashboard')) {
      const rows = readJson(settings.paths.reportsJson, []);
      const hist = readJson(settings.paths.dailyHistory, []);
      return send(res, 200, 'text/html', buildHtml(rows, hist, { mode: 'report', generatedAt: new Date().toISOString().replace('T', ' ').slice(0, 16) }));
    }
    if (url === '/api/status') return send(res, 200, 'application/json', JSON.stringify(state));
    if (url === '/api/latest') return send(res, 200, 'application/json', JSON.stringify(readJson(settings.paths.reportsJson, [])));
    if (url === '/api/daily') return send(res, 200, 'application/json', JSON.stringify(readJson(settings.paths.dailyHistory, [])));
    if (url === '/download/csv') { res.writeHead(200, { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="pipeline-results.csv"' }); return res.end(fileOr(settings.paths.reportsCsv, 'no data')); }
    if (url === '/download/json') { res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="pipeline-results.json"' }); return res.end(fileOr(settings.paths.reportsJson, '[]')); }
    if (url.startsWith('/api/run') && req.method === 'POST') {
      const q = query(url);
      const ok = startRun(q.mode === 'live' ? 'live' : 'audit', parseInt(q.max, 10) || null, q.resume === '1');
      return send(res, ok ? 200 : 409, 'application/json', JSON.stringify({ ok, running: state.running }));
    }
    if (url === '/api/stop' && req.method === 'POST') { if (child) child.kill('SIGINT'); return send(res, 200, 'application/json', JSON.stringify({ ok: true })); }
    send(res, 404, 'text/plain', 'Not found');
  } catch (e) { send(res, 500, 'text/plain', String(e.message)); }
});

server.listen(port, () => {
  console.log(`Pipeline Cleanup console running:  http://localhost:${port}`);
  console.log('Open it in your browser, set options, and click Start. Ctrl+C to stop the server.');
});
