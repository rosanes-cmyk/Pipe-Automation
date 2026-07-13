'use strict';

const fs = require('fs');
const path = require('path');

const COLUMNS = [
  'property_address', 'property_url', 'previous_status', 'recommended_status', 'updated_status',
  'latest_activity_date', 'latest_activity_type', 'latest_activity_summary',
  'contact_name', 'contact_verified', 'contact_corrected', 'address_corrected', 'state_issue',
  'possible_duplicate', 'manual_review_required', 'manual_review_reason',
  'update_attempted', 'update_saved', 'before_screenshot', 'after_screenshot', 'processed_at',
];

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

class Reporter {
  constructor(settings) {
    this.settings = settings;
    this.rows = [];
    this._ensureDir(settings.paths.reportsCsv);
    this._ensureDir(settings.paths.reportsJson);
  }

  _ensureDir(p) {
    fs.mkdirSync(path.dirname(path.resolve(p)), { recursive: true });
  }

  add(row) {
    const complete = {};
    for (const c of COLUMNS) complete[c] = row[c] ?? '';
    this.rows.push(complete);
  }

  flush() {
    const csv = [COLUMNS.join(',')]
      .concat(this.rows.map((r) => COLUMNS.map((c) => csvCell(r[c])).join(',')))
      .join('\n');
    fs.writeFileSync(path.resolve(this.settings.paths.reportsCsv), csv + '\n');
    fs.writeFileSync(path.resolve(this.settings.paths.reportsJson), JSON.stringify(this.rows, null, 2));
  }

  summary() {
    const s = {
      total: this.rows.length,
      leftNew: 0, evaluating: 0, underContract: 0, closed: 0,
      contactsVerified: 0, contactsCorrected: 0, addressesCleaned: 0,
      duplicatesFlagged: 0, manualReview: 0, failedUpdates: 0,
    };
    for (const r of this.rows) {
      if (r.recommended_status === 'New') s.leftNew++;
      if (r.recommended_status === 'Evaluating') s.evaluating++;
      if (r.recommended_status === 'Under Contract') s.underContract++;
      if (r.recommended_status === 'Closed') s.closed++;
      if (r.contact_verified) s.contactsVerified++;
      if (r.contact_corrected) s.contactsCorrected++;
      if (r.address_corrected) s.addressesCleaned++;
      if (r.possible_duplicate) s.duplicatesFlagged++;
      if (r.manual_review_required) s.manualReview++;
      if (r.update_attempted && !r.update_saved) s.failedUpdates++;
    }
    return s;
  }
}

module.exports = { Reporter, COLUMNS };
