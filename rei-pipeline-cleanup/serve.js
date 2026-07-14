'use strict';

/**
 * Tiny dependency-free dashboard server (the "API daily report dashboard").
 *   node serve.js [port]        # default 8787
 *
 * Serves a live dashboard at /  (rebuilt from the report files on each request,
 * so it always reflects the latest run) plus JSON endpoints:
 *   GET /api/latest  -> reports/pipeline-results.json
 *   GET /api/daily   -> reports/daily-history.json
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { buildHtml, readJson } = require('./src/dashboard');

const settings = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'config/settings.json'), 'utf8'));
const port = parseInt(process.argv[2], 10) || 8787;

function send(res, code, type, body) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  try {
    if (req.url === '/api/latest') return send(res, 200, 'application/json', JSON.stringify(readJson(settings.paths.reportsJson, [])));
    if (req.url === '/api/daily') return send(res, 200, 'application/json', JSON.stringify(readJson(settings.paths.dailyHistory, [])));
    if (req.url === '/' || req.url.startsWith('/?')) {
      const rows = readJson(settings.paths.reportsJson, []);
      const hist = readJson(settings.paths.dailyHistory, []);
      const html = buildHtml(rows, hist, { mode: 'live view', generatedAt: new Date().toISOString().replace('T', ' ').slice(0, 16) });
      // auto-refresh every 15s
      return send(res, 200, 'text/html', html.replace('</head>', '<meta http-equiv="refresh" content="15"></head>'));
    }
    send(res, 404, 'text/plain', 'Not found');
  } catch (e) {
    send(res, 500, 'text/plain', String(e.message));
  }
});

server.listen(port, () => {
  console.log(`Dashboard server running:  http://localhost:${port}`);
  console.log('Endpoints:  /  (dashboard)   /api/latest   /api/daily');
  console.log('Leave this running; it reflects the newest report each refresh. Ctrl+C to stop.');
});
