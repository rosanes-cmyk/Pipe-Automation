'use strict';

/**
 * Regenerate reports/dashboard.html from the current report files.
 *   node dashboard.js
 * (This also runs automatically after every audit/live run.)
 */
const fs = require('fs');
const path = require('path');
const { writeDashboard } = require('./src/dashboard');

const settings = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'config/settings.json'), 'utf8'));
const out = writeDashboard(settings);
console.log(`Dashboard written to ${out}`);
console.log('Open it in your browser (double-click the file), or run:  node serve.js');
