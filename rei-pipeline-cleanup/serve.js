'use strict';

/**
 * Dashboard app + control server (dependency-free).
 *   node serve.js [port]        # default 8787
 *
 * Open http://localhost:8787 and click Start — the automation runs from the
 * browser (no command line). Shows live status + log and refreshes results.
 *
 * Routes:
 *   GET  /            app shell (controls + live log + embedded dashboard)
 *   GET  /dashboard   the results dashboard (from the report files)
 *   GET  /api/status  { running, mode, startedAt, exitCode, log[] }
 *   POST /api/run?mode=audit|live&max=N   start a run
 *   POST /api/stop    stop the current run
 *   GET  /api/latest  reports/pipeline-results.json
 *   GET  /api/daily   reports/daily-history.json
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
const pushLog = (line) => { state.log.push(line); if (state.log.length > 300) state.log.shift(); };

function send(res, code, type, body) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}
function query(url) { const q = {}; const i = url.indexOf('?'); if (i >= 0) new URLSearchParams(url.slice(i + 1)).forEach((v, k) => (q[k] = v)); return q; }

function startRun(mode, max) {
  if (state.running) return false;
  const args = ['app.js', mode === 'live' ? '--live' : '--audit'];
  if (max) args.push('--max', String(max));
  state.running = true; state.mode = mode; state.startedAt = new Date().toISOString(); state.exitCode = null; state.log = [];
  pushLog(`$ node ${args.join(' ')}`);
  child = spawn(process.execPath, args, { cwd: __dirname });
  const onData = (buf) => String(buf).split(/\r?\n/).forEach((l) => { if (l.trim()) pushLog(l); });
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.on('close', (code) => { state.running = false; state.exitCode = code; child = null; pushLog(`--- run finished (exit ${code}) ---`); });
  child.on('error', (e) => { state.running = false; child = null; pushLog(`ERROR: ${e.message}`); });
  return true;
}

const APP = `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/><title>Pipeline Cleanup — App</title>
<style>
:root{--bg:#000;--panel:#0c0d10;--panel-2:#141519;--ink:#f2f4f7;--muted:#8b93a1;--border:#212329;--accent:#4d8dff;--ok:#2ee06a;--warn:#ffb020;--dead:#ff5a5a;--mono:ui-monospace,"SF Mono","JetBrains Mono",Menlo,Consolas,monospace;--sans:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--sans)}
.bar{position:sticky;top:0;z-index:5;display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:14px 18px;background:var(--panel);border-bottom:1px solid var(--border)}
.bar h1{font-size:16px;margin:0 12px 0 0}
label{font-size:13px;color:var(--muted)}
select,input{background:var(--panel-2);color:var(--ink);border:1px solid var(--border);border-radius:8px;padding:6px 9px;font-size:13px}
input#max{width:70px;font-family:var(--mono)}
button{border:0;border-radius:8px;padding:8px 15px;font-size:13px;font-weight:600;cursor:pointer}
#start{background:var(--accent);color:#04122e}#stop{background:var(--panel-2);color:var(--ink);border:1px solid var(--border)}
button:disabled{opacity:.45;cursor:not-allowed}
.badge{margin-left:auto;font-family:var(--mono);font-size:12px;padding:4px 11px;border-radius:999px;border:1px solid var(--border)}
.badge.idle{color:var(--muted)}.badge.run{color:#04122e;background:var(--ok)}.badge.err{color:#fff;background:var(--dead)}
.wrap{padding:16px 18px}
.log{background:#05060a;border:1px solid var(--border);border-radius:10px;padding:12px;height:180px;overflow:auto;font-family:var(--mono);font-size:12px;line-height:1.5;white-space:pre-wrap;color:#c9d3df;margin-bottom:16px}
iframe{width:100%;height:1100px;border:1px solid var(--border);border-radius:12px;background:var(--bg)}
.hint{color:var(--muted);font-size:12px;margin:2px 0 12px}
</style></head><body>
<div class="bar">
  <h1>Pipeline Cleanup</h1>
  <label>Mode <select id="mode"><option value="audit">Audit (read-only)</option><option value="live">Live (writes)</option></select></label>
  <label>Max <input id="max" type="number" value="60" min="1"/></label>
  <button id="start" onclick="startRun()">▶ Start</button>
  <button id="stop" onclick="stopRun()" disabled>■ Stop</button>
  <span class="badge idle" id="badge">idle</span>
</div>
<div class="wrap">
  <div class="hint">Audit changes nothing. Live writes "Follow up"/"Dead" for leads the rep already staged, and holds/flags the rest. A run opens a Chrome window; log in there if asked.</div>
  <div class="log" id="log">Ready. Choose a mode and click Start.</div>
  <iframe id="dash" src="/dashboard"></iframe>
</div>
<script>
let wasRunning=false;
async function startRun(){
  const mode=document.getElementById('mode').value;
  const max=document.getElementById('max').value||60;
  if(mode==='live' && !confirm('LIVE mode will WRITE statuses in REI (Follow up / Dead). Continue?'))return;
  await fetch('/api/run?mode='+mode+'&max='+max,{method:'POST'});
  poll();
}
async function stopRun(){ await fetch('/api/stop',{method:'POST'}); }
async function poll(){
  try{
    const s=await fetch('/api/status').then(r=>r.json());
    const b=document.getElementById('badge');
    document.getElementById('start').disabled=s.running;
    document.getElementById('stop').disabled=!s.running;
    if(s.running){b.className='badge run';b.textContent=(s.mode||'')+' running…';}
    else if(s.exitCode&&s.exitCode!==0){b.className='badge err';b.textContent='error (exit '+s.exitCode+')';}
    else{b.className='badge idle';b.textContent='idle';}
    const log=document.getElementById('log');
    if(s.log&&s.log.length){log.textContent=s.log.join('\\n');log.scrollTop=log.scrollHeight;}
    if(wasRunning&&!s.running){document.getElementById('dash').src='/dashboard?t='+Date.now();}
    wasRunning=s.running;
  }catch(e){}
  setTimeout(poll, 2000);
}
poll();
</script></body></html>`;

const server = http.createServer((req, res) => {
  try {
    const url = req.url;
    if (url === '/' || url.startsWith('/?')) return send(res, 200, 'text/html', APP);
    if (url.startsWith('/dashboard')) {
      const rows = readJson(settings.paths.reportsJson, []);
      const hist = readJson(settings.paths.dailyHistory, []);
      return send(res, 200, 'text/html', buildHtml(rows, hist, { mode: 'live view', generatedAt: new Date().toISOString().replace('T', ' ').slice(0, 16) }));
    }
    if (url === '/api/status') return send(res, 200, 'application/json', JSON.stringify(state));
    if (url.startsWith('/api/run') && req.method === 'POST') {
      const q = query(url);
      const ok = startRun(q.mode === 'live' ? 'live' : 'audit', parseInt(q.max, 10) || null);
      return send(res, ok ? 200 : 409, 'application/json', JSON.stringify({ ok, running: state.running }));
    }
    if (url === '/api/stop' && req.method === 'POST') {
      if (child) child.kill('SIGINT');
      return send(res, 200, 'application/json', JSON.stringify({ ok: true }));
    }
    if (url === '/api/latest') return send(res, 200, 'application/json', JSON.stringify(readJson(settings.paths.reportsJson, [])));
    if (url === '/api/daily') return send(res, 200, 'application/json', JSON.stringify(readJson(settings.paths.dailyHistory, [])));
    send(res, 404, 'text/plain', 'Not found');
  } catch (e) { send(res, 500, 'text/plain', String(e.message)); }
});

server.listen(port, () => {
  console.log(`Pipeline Cleanup app running:  http://localhost:${port}`);
  console.log('Open it in your browser and click Start. Ctrl+C to stop the server.');
});
