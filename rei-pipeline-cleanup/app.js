'use strict';

/**
 * Entry point.
 *   node app.js            # uses settings.json defaults (audit, 1 lead)
 *   node app.js --audit    # force AUDIT_MODE
 *   node app.js --live     # force LIVE_MODE (writes to REI)
 *   node app.js --max N     # override MAX_LEADS_PER_RUN
 *
 * Safety: defaults are audit-only, no writes, one lead. --live must be explicit.
 */

const fs = require('fs');
const path = require('path');
const { Controller } = require('./src/controller');

function loadJson(p) {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, p), 'utf8'));
}

function makeLogger(logPath) {
  fs.mkdirSync(path.dirname(path.resolve(__dirname, logPath)), { recursive: true });
  const stream = fs.createWriteStream(path.resolve(__dirname, logPath), { flags: 'a' });
  return (msg) => {
    const line = `${new Date().toISOString()} ${msg}`;
    console.log(msg);
    stream.write(line + '\n');
  };
}

function parseArgs(argv) {
  const a = { audit: false, live: false, max: null, resume: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--audit') a.audit = true;
    else if (argv[i] === '--live') a.live = true;
    else if (argv[i] === '--resume') a.resume = true;
    else if (argv[i] === '--max') a.max = parseInt(argv[++i], 10);
  }
  return a;
}

async function main() {
  const settings = loadJson('config/settings.json');
  const selectors = loadJson('config/selectors.json');
  const args = parseArgs(process.argv);

  if (args.live) { settings.mode.LIVE_MODE = true; settings.mode.AUDIT_MODE = false; }
  if (args.audit) { settings.mode.AUDIT_MODE = true; settings.mode.LIVE_MODE = false; }
  if (Number.isInteger(args.max)) settings.mode.MAX_LEADS_PER_RUN = args.max;
  settings.mode.RESUME = args.resume;

  const log = makeLogger(settings.paths.log);
  const controller = new Controller(settings, selectors, log);

  // Graceful stop on Ctrl-C (finishes the in-flight save, then exits).
  process.on('SIGINT', () => { log('SIGINT — stop requested after current property.'); controller.stop(); });

  try {
    await controller.run();
  } catch (e) {
    log(`FATAL: ${e.message}`);
    process.exitCode = 1;
  }
}

main();
