'use strict';

/**
 * Pipeline Cleanup — control console + dashboard server (dependency-free).
 *   node serve.js [port]        # default 8787
 */
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { buildHtml, readJson } = require('./src/dashboard');

const settings = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'config/settings.json'), 'utf8'));
const port = parseInt(process.argv[2], 10) || 8787;

// This machine's LAN (Wi-Fi/Ethernet) IPv4 so teammates on the same network can
// open the dashboard. Falls back to localhost if no external interface is found.
function lanIp() {
  const ifaces = os.networkInterfaces();
  const prefer = [];
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name] || []) {
      if (ni.family === 'IPv4' && !ni.internal) {
        // Prefer common private ranges (typical office Wi-Fi).
        if (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ni.address)) prefer.unshift(ni.address);
        else prefer.push(ni.address);
      }
    }
  }
  return prefer[0] || 'localhost';
}
const shareUrl = `http://${lanIp()}:${port}`;

const state = { running: false, mode: null, startedAt: null, finishedAt: null, exitCode: null, log: [] };
let child = null;
const pushLog = (l) => { state.log.push(l); if (state.log.length > 400) state.log.shift(); };

function send(res, code, type, body) { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body); }
function query(url) { const q = {}; const i = url.indexOf('?'); if (i >= 0) new URLSearchParams(url.slice(i + 1)).forEach((v, k) => (q[k] = v)); return q; }
function fileOr(p, fallback) { try { return fs.readFileSync(path.resolve(p)); } catch { return fallback; } }

function startRun(mode, resume) {
  if (state.running) return false;
  const args = ['app.js', mode === 'live' ? '--live' : '--audit'];
  if (resume) args.push('--resume');
  state.running = true; state.mode = mode; state.startedAt = new Date().toISOString(); state.finishedAt = null; state.exitCode = null; state.log = [];
  pushLog('$ node ' + args.join(' '));
  // ELECTRON_RUN_AS_NODE makes the Electron binary behave as plain Node when we
  // spawn the worker, so `node app.js ...` runs correctly inside the packaged app.
  child = spawn(process.execPath, args, { cwd: __dirname, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
  const on = (b) => String(b).split(/\r?\n/).forEach((l) => l.trim() && pushLog(l));
  child.stdout.on('data', on); child.stderr.on('data', on);
  child.on('close', (c) => { state.running = false; state.finishedAt = new Date().toISOString(); state.exitCode = c; child = null; pushLog('--- run finished (exit ' + c + ') ---'); });
  child.on('error', (e) => { state.running = false; state.finishedAt = new Date().toISOString(); child = null; pushLog('ERROR: ' + e.message); });
  return true;
}

const APP = `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/><title>Pipeline Cleanup — Console</title>
<style>
:root{--bg:#0b111b;--panel:#131c2b;--panel-2:#182234;--line:#243247;--line-2:#2d3d55;
--ink:#eaf0f8;--ink-2:#aeb9cc;--muted:#7e8ca3;--accent:#3b82f6;--green:#22c55e;--green-2:#16a34a;--red:#ef4444;--amber:#f59e0b;--purple:#a855f7;--cyan:#38bdf8;
--sans:-apple-system,"Segoe UI",Roboto,Inter,system-ui,Helvetica,Arial,sans-serif;--mono:ui-monospace,"Cascadia Code","SF Mono",Menlo,Consolas,monospace}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:14px;line-height:1.5}
.app{max-width:1240px;margin:0 auto;padding:16px 26px 60px}
.apphead{display:flex;align-items:center;gap:14px;padding:6px 2px 14px}
.apphead .dot{width:11px;height:11px;border-radius:50%;background:var(--muted);flex:none}
.apphead .dot.on{background:var(--green);box-shadow:0 0 0 4px rgba(34,197,94,.16)}
.apphead h1{font-size:20px;font-weight:750;margin:0;letter-spacing:-.01em}
.apphead .sub{color:var(--muted);font-size:12.5px;margin-top:1px}
.apphead .right{margin-left:auto;display:flex;align-items:center;gap:12px}
.prog{font-family:var(--mono);font-size:12px;color:var(--muted)}
.status{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:var(--ink-2);background:var(--panel);border:1px solid var(--line-2);border-radius:999px;padding:6px 14px}
.status .s{width:9px;height:9px;border-radius:50%;background:var(--muted)}
.status.run .s{background:var(--green);box-shadow:0 0 0 3px rgba(34,197,94,.2)}.status.run{color:var(--ink)}
.status.err .s{background:var(--red)}.status.err{color:#fff}
.sharebar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12.5px;color:var(--ink-2);background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.28);border-radius:10px;padding:8px 12px;margin-bottom:12px}
.sharebar .si{opacity:.9}
.sharebar b{color:var(--ink);font-weight:700;letter-spacing:.01em}
.sharebar .btn{padding:4px 12px;font-size:12px}
.sharebar .copied{color:var(--green);font-weight:700}
.tbar{position:sticky;top:0;z-index:30;display:flex;align-items:center;gap:14px;flex-wrap:wrap;background:var(--panel);border:1px solid var(--line-2);border-radius:12px;padding:12px 14px;margin-bottom:12px;box-shadow:0 6px 20px rgba(0,0,0,.35)}
.grp{display:flex;align-items:center;gap:8px}
.grp+.grp{padding-left:14px;border-left:1px solid var(--line)}
.grp .gl{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:700;margin-right:2px}
.util{margin-left:auto}
.btn{border:1px solid var(--line-2);background:var(--panel-2);color:var(--ink);border-radius:9px;padding:9px 14px;font-size:13px;font-weight:600;cursor:pointer;transition:.12s}
.btn:hover{border-color:var(--accent)}.btn:disabled{opacity:.4;cursor:not-allowed}
.btn.green{background:var(--green-2);border-color:transparent;color:#fff}.btn.green:hover{background:var(--green)}
.btn.red{background:var(--red);border-color:transparent;color:#fff}.btn.ghost{background:transparent}
.seg{display:inline-flex;border:1px solid var(--line-2);border-radius:9px;overflow:hidden}
.seg button{background:var(--panel-2);color:var(--ink-2);border:0;padding:8px 16px;font-weight:700;font-size:13px;cursor:pointer}
.seg button.on{background:var(--accent);color:#fff}.seg button.on.liveon{background:var(--green-2)}
.srcbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;color:var(--ink-2);font-size:13px;margin:4px 0 12px}
.srcbar b{color:var(--ink)}.srcbar a{color:var(--accent);text-decoration:none}.srcbar a:hover{text-decoration:underline}
details.info{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:12px;padding:0 16px;margin-bottom:16px}
details.info>summary{cursor:pointer;padding:12px 0;font-weight:650;font-size:13.5px;list-style:none;color:var(--ink)}
details.info>summary::-webkit-details-marker{display:none}
details.info>summary::before{content:"▸ ";color:var(--muted)}details.info[open]>summary::before{content:"▾ "}
details.info .body{padding:2px 0 14px;color:var(--ink-2);font-size:13.5px}details.info .body b{color:#fff}
.hinttxt{color:var(--muted);font-size:12px;margin:0 0 10px}
.stats{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:14px}
@media(max-width:900px){.stats{grid-template-columns:repeat(3,1fr)}}@media(max-width:560px){.stats{grid-template-columns:repeat(2,1fr)}}
.stat{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:15px 16px;cursor:pointer;transition:.12s;position:relative}
.stat:hover{border-color:var(--accent);transform:translateY(-2px)}
.stat:hover::after{content:"view ↗";position:absolute;top:12px;right:14px;font-size:10px;color:var(--accent);font-weight:700}
.stat.hl{border-color:var(--accent);box-shadow:0 0 0 1px rgba(59,130,246,.3)}
.stat .num{font-size:30px;font-weight:750;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.stat .lab{font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);margin-top:3px;font-weight:700}
.n-white{color:#fff}.n-green{color:var(--green)}.n-red{color:var(--red)}.n-amber{color:var(--amber)}.n-cyan{color:var(--cyan)}.n-purple{color:var(--purple)}
.firstrun{background:var(--panel);border:1px dashed var(--line-2);border-radius:12px;padding:26px;text-align:center;color:var(--muted);margin-bottom:14px}.firstrun b{color:var(--ink)}
.detail{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin-bottom:16px}
.detail .close{float:right;cursor:pointer;color:var(--muted);font-size:13px}
.detail h3{margin:0 0 4px;font-size:16px}.detail .hint{color:var(--muted);font-size:12.5px;margin-bottom:10px}
.lead{padding:11px 0;border-bottom:1px solid var(--line)}.lead:last-child{border-bottom:0}
.lead .top{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.lead a.addr{color:var(--ink);font-weight:700;text-decoration:none;font-size:14px}.lead a.addr:hover{color:var(--accent);text-decoration:underline}
.lead .open{color:var(--accent);font-size:12px;text-decoration:none;font-weight:600}
.lead .cont{color:var(--ink-2);font-family:var(--mono);font-size:12px}
.lead .st{font-size:11px;font-weight:700;padding:2px 9px;border-radius:999px}
.st.ev{background:#12331f;color:#4ade80}.st.cl{background:#3a1518;color:#f87171}.st.uc{background:#2a1840;color:#c084fc}.st.mr{background:#3a2c0c;color:#fbbf24}.st.nw{background:#1a2436;color:#93a4bd}
.lead .why{color:var(--muted);font-size:12px;margin-top:4px}
.sched{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:12.5px;margin-bottom:16px}
.sched input[type=time]{background:var(--panel-2);color:var(--ink);border:1px solid var(--line-2);border-radius:8px;padding:6px 9px}
label.chk{display:flex;align-items:center;gap:7px;color:var(--ink-2);font-size:13px;cursor:pointer}
.log{background:#070c14;border:1px solid var(--line);border-radius:12px;padding:14px;height:210px;overflow:auto;font-family:var(--mono);font-size:12px;line-height:1.55;white-space:pre-wrap;color:#c3d0e4}
.modal-bg{position:fixed;inset:0;background:rgba(4,8,14,.7);backdrop-filter:blur(3px);z-index:60;display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow:auto}
.modal{background:#fff;color:#1f2733;width:100%;max-width:800px;border-radius:14px;padding:34px 40px;box-shadow:0 20px 60px rgba(0,0,0,.5);font-family:"Segoe UI",system-ui,-apple-system,Roboto,Helvetica,Arial,sans-serif;font-size:14.5px;line-height:1.65}
.modaltop{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;border-bottom:2px solid #eef1f6;padding-bottom:16px;margin-bottom:20px}
.modal h2{margin:0;font-size:23px;font-weight:750;letter-spacing:-.01em;color:#141c2e}
.modal .muted{color:#6b7688;font-size:13px;margin-top:3px}
.modal .explain{background:#f6f8fc;border:1px solid #e9eef6;border-radius:10px;padding:16px 18px;font-size:14.5px;margin-bottom:22px;line-height:1.7;color:#37414f}
.modal .explain b{color:#141c2e}
.modal .krow{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:24px}
.modal .kcell{border:1px solid #eef1f6;border-radius:10px;padding:12px 14px}
.modal .kcell .k{font-size:11px;color:#6b7688;text-transform:uppercase;letter-spacing:.05em;font-weight:700}
.modal .kcell .kv{font-size:26px;font-weight:750;margin-top:2px;line-height:1.1}
.modal h4{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#6b7688;margin:22px 0 10px;font-weight:750}
.modal table{width:100%;border-collapse:collapse;font-size:13.5px}
.modal th{text-align:left;padding:9px 10px;border-bottom:2px solid #eef1f6;color:#6b7688;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
.modal td{text-align:left;padding:9px 10px;border-bottom:1px solid #f1f4f9;vertical-align:top}
.modal tbody tr:nth-child(even){background:#fafbfe}
.modal .btn{background:#2f6bff;color:#fff;border:0;border-radius:8px;padding:9px 15px;font-weight:700;cursor:pointer;margin-left:8px;font-size:13px}
.modal .btn.ghost{background:#eef2f8;color:#141c2e}
@media print{@page{margin:16mm}body *{visibility:hidden!important}.modal-bg,.modal-bg *{visibility:visible!important}.modal-bg{position:absolute;inset:0;background:#fff;padding:0;display:block}.modal{box-shadow:none;max-width:100%;padding:0}.noprint{display:none!important}.modal tbody tr:nth-child(even){background:#fff}}
.hide{display:none}
.clock{display:flex;align-items:center;gap:7px;font-size:14px;font-weight:750;color:var(--ink);background:var(--panel);border:1px solid var(--line-2);border-radius:999px;padding:6px 14px;font-variant-numeric:tabular-nums;letter-spacing:.02em}
.clock.run{border-color:rgba(34,197,94,.4);color:#e8fff1}
.clock .cl{font-size:12px;color:var(--muted);font-weight:700}
</style></head><body><div class="app">

  <div class="apphead">
    <div class="dot" id="dot"></div>
    <div><h1>Pipeline Status Cleanup</h1><div class="sub">Lead Stage Automation · Twin Home Buyer / Equity Track</div></div>
    <div class="right"><span class="prog hide" id="prog"></span>
      <div class="clock" id="clock" title="How long the automation has been running"><span>⏱</span><span id="clocktime">00:00:00</span><span class="cl" id="clocklab"></span></div>
      <div class="status" id="status"><span class="s"></span><span id="statustext">Idle</span></div></div>
  </div>

  <div class="sharebar">
    <span class="si">🔗</span>
    <span>Share with teammates on this Wi‑Fi — have them open <b id="shareurl">{{SHARE_URL}}</b></span>
    <button class="btn" onclick="copyShare()">Copy</button>
    <span class="copied hide" id="copied">Copied ✓</span>
  </div>

  <div class="tbar">
    <div class="grp"><span class="gl">Run</span>
      <button class="btn green" id="start" onclick="startRun(false)">▶ Start</button>
      <button class="btn red" id="stop" onclick="stopRun()" disabled>■ Stop</button>
      <button class="btn" id="resume" onclick="startRun(true)">↻ Resume</button>
    </div>
    <div class="grp"><span class="gl">Mode</span>
      <div class="seg"><button id="mAudit" class="on" onclick="setMode(false)">Audit</button><button id="mLive" onclick="setMode(true)">Live</button></div>
    </div>
    <div class="grp util"><span class="gl">View</span>
      <button class="btn" onclick="openReport()">📊 Report</button>
      <button class="btn ghost" onclick="menuExport()">↓ Export</button>
      <button class="btn ghost" onclick="toggleLog()">▤ Logs</button>
    </div>
  </div>

  <div class="srcbar"><b>Source:</b> New bucket in REI BlackBook
    · <a href="https://my.reiblackbook.com/properties/inbox?status_filter=New" target="_blank">open in REI ↗</a>
    · runs the whole bucket top-to-bottom; a Chrome window opens on Start — log into REI there once.</div>

  <details class="info"><summary>How it decides — from the rep's Lead Stage (no guessing)</summary>
    <div class="body"><b>Follow up</b> — worked lead → sets Evaluating. &nbsp;<b>Dead</b> — Lost / Invalid / Wrong number → sets Dead.<br/>
    <b>Under Contract</b>, conflicts &amp; flagged → held + an explanatory note is written automatically. &nbsp;<b>New</b> — not worked → left as-is. Address is tidied (street/city/ZIP); the State field is never touched; everything is reversible.</div>
  </details>

  <p class="hinttxt">▸ Click any card to see those leads with links into REI.</p>
  <div class="stats" id="stats"></div>
  <div class="firstrun hide" id="firstrun"><b>No run yet.</b> Choose Audit or Live above and click Start — results appear here.</div>
  <div id="detail" class="detail hide"></div>

  <div class="sched">
    <label class="chk"><input type="checkbox" id="schedchk" onchange="schedNote()"/> Run automatically every day at</label>
    <input type="time" id="schedtime" value="09:00"/>
    <span id="schednote">Manual for now — ask to enable the daily Windows task.</span>
  </div>

  <div class="log hide" id="log">Ready. Choose a mode and click Start.</div>
</div>

<div class="modal-bg hide" id="modalbg" onclick="if(event.target===this)closeReport()">
  <div class="modal" id="report">
    <div class="modaltop"><div><h2 id="rtitle">Pipeline Status Cleanup — Daily Report</h2><div class="muted" id="rdate"></div></div>
      <div class="noprint"><button class="btn" onclick="savePDF()">🖨 Save as PDF</button><button class="btn ghost" onclick="closeReport()">✕ Close</button></div></div>
    <div id="rbody"></div>
  </div>
</div>
<script>
let live=false, wasRunning=false, ROWS=[];
// Elapsed-time clock: track the current/last run's start & finish.
var clk={start:null, finish:null, running:false};
function fmtDur(ms){if(ms<0)ms=0;var s=Math.floor(ms/1000);var h=Math.floor(s/3600);var m=Math.floor((s%3600)/60);var ss=s%60;var p=function(n){return(n<10?'0':'')+n;};return p(h)+':'+p(m)+':'+p(ss);}
function tickClock(){var el=document.getElementById('clock'),tt=document.getElementById('clocktime'),lab=document.getElementById('clocklab');if(!el)return;
  if(!clk.start){tt.textContent='00:00:00';lab.textContent='not started';el.classList.remove('run');return;}
  var end=clk.running?Date.now():(clk.finish||Date.now());var ms=end-clk.start;tt.textContent=fmtDur(ms);
  var hrs=ms/3600000;var hlabel=hrs>=1?(hrs.toFixed(1)+' hrs'):(Math.round(ms/60000)+' min');
  lab.textContent=clk.running?('running · '+hlabel):('last run · '+hlabel);el.classList.toggle('run',clk.running);}
setInterval(tickClock,1000);
function esc(v){return String(v==null?'':v).replace(/[<&>"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));}
function stClass(st){return st==='Evaluating'?'ev':st==='Closed'?'cl':st==='Under Contract'?'uc':'nw';}
function setMode(l){ live=l; document.getElementById('mAudit').className=live?'':'on'; document.getElementById('mLive').className=live?'on liveon':''; }
function toggleLog(){ document.getElementById('log').classList.toggle('hide'); }
function menuExport(){ const c=confirm('OK = download CSV, Cancel = download JSON'); location.href = c ? '/download/csv' : '/download/json'; }
function schedNote(){ const on=document.getElementById('schedchk').checked; document.getElementById('schednote').textContent = on ? 'Needs a Windows Task Scheduler task — ask me to add the ready-made .bat + task.' : 'Manual for now — ask to enable the daily Windows task.'; if(on) document.getElementById('schedchk').checked=false; }
async function startRun(resume){
  if(live && !resume && !confirm('LIVE mode will WRITE statuses + notes in REI. Continue?'))return;
  document.getElementById('log').classList.remove('hide');
  await fetch('/api/run?mode='+(live?'live':'audit')+(resume?'&resume=1':''),{method:'POST'});
  poll();
}
async function stopRun(){ await fetch('/api/stop',{method:'POST'}); }
const CATS={all:'All reviewed',ev:'Follow up',cl:'Dead',uc:'Under Contract',mr:'Flagged',dup:'Duplicates'};
function catMatch(cat,r){return cat==='all'?true:cat==='ev'?r.recommended_status==='Evaluating':cat==='cl'?r.recommended_status==='Closed':cat==='uc'?r.recommended_status==='Under Contract':cat==='mr'?!!r.manual_review_required:cat==='dup'?!!r.possible_duplicate:false;}
function showCat(cat){
  const list=ROWS.filter(r=>catMatch(cat,r));
  const d=document.getElementById('detail'); d.classList.remove('hide');
  d.innerHTML='<span class="close" onclick="document.getElementById(\\'detail\\').classList.add(\\'hide\\')">✕ close</span>'+
    '<h3>'+CATS[cat]+' ('+list.length+')</h3><div class="hint">Click an address to open the lead in REI BlackBook.</div>'+
    (list.length?list.map(r=>{const url=r.property_url||'https://my.reiblackbook.com/properties/inbox';const st=r.recommended_status||'New';
      return '<div class="lead"><div class="top"><a class="addr" href="'+esc(url)+'" target="_blank">'+esc(r.property_address||'(no address)')+'</a>'+
        '<span class="st '+stClass(st)+'">'+esc(st)+'</span>'+(r.contact_name?'<span class="cont">'+esc(r.contact_name)+'</span>':'')+
        '<a class="open" href="'+esc(url)+'" target="_blank">↗ Open in REI</a></div><div class="why">'+esc(r.manual_review_reason||r.latest_activity_summary||r.latest_activity_type||'')+'</div></div>';
    }).join(''):'<div class="why" style="padding:8px 0">No leads in this category.</div>');
  d.scrollIntoView({behavior:'smooth',block:'nearest'});
}
async function loadStats(){
  try{
    ROWS=await fetch('/api/latest').then(r=>r.json());
    const c={total:ROWS.length,ev:0,cl:0,uc:0,mr:0,dup:0};
    ROWS.forEach(r=>{ if(r.recommended_status==='Evaluating')c.ev++; else if(r.recommended_status==='Closed')c.cl++; else if(r.recommended_status==='Under Contract')c.uc++; if(r.manual_review_required)c.mr++; if(r.possible_duplicate)c.dup++; });
    document.getElementById('firstrun').classList.toggle('hide', ROWS.length>0);
    const cards=[['TOTAL REVIEWED',c.total,'n-white','','all'],['FOLLOW UP',c.ev,'n-green','','ev'],['DEAD',c.cl,'n-red','','cl'],['UNDER CONTRACT',c.uc,'n-purple','','uc'],['FLAGGED',c.mr,'n-amber','','mr'],['DUPLICATES',c.dup,'n-cyan','hl','dup']];
    document.getElementById('stats').innerHTML=cards.map(x=>'<div class="stat '+x[3]+'" onclick="showCat(\\''+x[4]+'\\')"><div class="num '+x[2]+'">'+x[1]+'</div><div class="lab">'+x[0]+'</div></div>').join('');
  }catch(e){}
}
async function openReport(){
  const rows=await fetch('/api/latest').then(r=>r.json());
  const c={total:rows.length,ev:0,cl:0,uc:0,mr:0,dup:0,new:0};
  rows.forEach(r=>{const s=r.recommended_status; if(s==='Evaluating')c.ev++; else if(s==='Closed')c.cl++; else if(s==='Under Contract')c.uc++; else c.new++; if(r.manual_review_required)c.mr++; if(r.possible_duplicate)c.dup++;});
  const today=new Date().toISOString().slice(0,10);
  document.getElementById('rdate').textContent='Twin Home Buyer · REI BlackBook · '+today;
  const explain='Today the automation reviewed <b>'+c.total+'</b> leads from the New pipeline. It set <b>'+c.ev+'</b> to <b>Follow up</b> and <b>'+c.cl+'</b> to <b>Dead</b> (both from the rep\\'s own Lead Stage), held <b>'+c.uc+'</b> Under-Contract lead(s) for a person, and flagged <b>'+c.mr+'</b>'+(c.dup?(' plus <b>'+c.dup+'</b> duplicate(s)'):'')+'. The remaining <b>'+c.new+'</b> had no contact/activity and were left as New. Every change is reversible; the State field was never touched.';
  const kc=(k,v,col)=>'<div class="kcell"><div class="k">'+k+'</div><div class="kv"'+(col?' style="color:'+col+'"':'')+'>'+v+'</div></div>';
  document.getElementById('rbody').innerHTML='<div class="explain">'+explain+'</div><div class="krow">'+
    kc('Reviewed',c.total)+kc('Follow up',c.ev,'#16a34a')+kc('Dead',c.cl,'#dc2626')+kc('Under Contract',c.uc,'#7c3aed')+kc('Flagged',c.mr,'#b45309')+kc('Duplicates',c.dup,'#0891b2')+
    '</div>';
  document.getElementById('modalbg').classList.remove('hide');
}
function closeReport(){ document.getElementById('modalbg').classList.add('hide'); }
function savePDF(){ window.print(); }
async function poll(){
  try{
    const s=await fetch('/api/status').then(r=>r.json());
    const st=document.getElementById('status'),t=document.getElementById('statustext'),dot=document.getElementById('dot'),prog=document.getElementById('prog');
    document.getElementById('start').disabled=s.running; document.getElementById('resume').disabled=s.running; document.getElementById('stop').disabled=!s.running;
    if(s.running){st.className='status run';t.textContent='Running';dot.className='dot on';}
    else if(s.exitCode&&s.exitCode!==0){st.className='status err';t.textContent='Error';dot.className='dot';}
    else{st.className='status';t.textContent='Idle';dot.className='dot';}
    let n=0; (s.log||[]).forEach(l=>{const m=l.match(/^\\[(\\d+)\\]/); if(m)n=Math.max(n,+m[1]);});
    if(s.running){prog.classList.remove('hide');prog.textContent='processed '+n+' · '+(s.mode||'').toUpperCase();}else prog.classList.add('hide');
    const log=document.getElementById('log'); if(s.log&&s.log.length){log.textContent=s.log.join('\\n');log.scrollTop=log.scrollHeight;}
    if(wasRunning&&!s.running){ loadStats(); }
    wasRunning=s.running;
    // Feed the elapsed-time clock.
    clk.start=s.startedAt?Date.parse(s.startedAt):null;
    clk.finish=s.finishedAt?Date.parse(s.finishedAt):null;
    clk.running=!!s.running;
    tickClock();
  }catch(e){}
  setTimeout(poll,2000);
}
function copyShare(){var u=document.getElementById('shareurl').textContent.trim();var done=function(){var c=document.getElementById('copied');c.classList.remove('hide');setTimeout(function(){c.classList.add('hide');},1600);};
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(u).then(done).catch(done);}else{var t=document.createElement('textarea');t.value=u;document.body.appendChild(t);t.select();try{document.execCommand('copy');}catch(e){}document.body.removeChild(t);done();}}
loadStats(); poll();
</script></body></html>`;

const server = http.createServer((req, res) => {
  try {
    const url = req.url;
    if (url === '/' || url.startsWith('/?')) return send(res, 200, 'text/html', APP.replace(/\{\{SHARE_URL\}\}/g, shareUrl));
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
      const ok = startRun(q.mode === 'live' ? 'live' : 'audit', q.resume === '1');
      return send(res, ok ? 200 : 409, 'application/json', JSON.stringify({ ok, running: state.running }));
    }
    if (url === '/api/stop' && req.method === 'POST') { if (child) child.kill('SIGINT'); return send(res, 200, 'application/json', JSON.stringify({ ok: true })); }
    send(res, 404, 'text/plain', 'Not found');
  } catch (e) { send(res, 500, 'text/plain', String(e.message)); }
});

// Bind to 0.0.0.0 so teammates on the same Wi-Fi/LAN can open the dashboard.
function startServer(cb) {
  server.listen(port, '0.0.0.0', () => {
    console.log('Pipeline Cleanup console running:');
    console.log('  This computer:      http://localhost:' + port);
    console.log('  Share on this WiFi: ' + shareUrl + '   (open on a teammate\'s browser)');
    console.log('Set options and click Start. Ctrl+C to stop.');
    if (typeof cb === 'function') cb(port);
  });
  return server;
}

// Run standalone (node serve.js) => start listening. When required by the
// Electron app, it calls startServer() itself after the window is ready.
if (require.main === module) startServer();

module.exports = { startServer, server, port, shareUrl };
