'use strict';

const { locate } = require('./locators');

/**
 * Latest-activity extraction from a contact record.
 *
 * If config/selectors.json contact.activityItem has a real selector, we read
 * structured items from it. Otherwise we fall back to a heuristic that scans
 * the contact page text for dated activity lines — enough for a read-only audit
 * (flagged lower-confidence) until the contact-record DOM is confirmed.
 */

const TYPE_HINTS = [
  [/text|sms/i, 'text'],
  [/\bcall(ed|ing)?\b|phone|voicemail|vm\b/i, 'call'],
  [/e-?mail/i, 'email'],
  [/\bcomps?\b|comparable/i, 'comps'],
  [/\boffer\b/i, 'offer'],
  [/contract/i, 'contract'],
  [/\bnote\b/i, 'note'],
  [/\btask\b/i, 'task'],
];

// Date patterns like 2026-07-11, 07/11/2026, Jul 11 2026, July 11, 2026.
const DATE_RE = /(\d{4}-\d{2}-\d{2}(?:[t ]\d{2}:\d{2})?)|(\d{1,2}\/\d{1,2}\/\d{2,4})|((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s*\d{4})/i;

function inferType(raw) {
  for (const [re, t] of TYPE_HINTS) if (re.test(raw)) return t;
  return 'note';
}

/**
 * Pure heuristic parser (unit-tested): given contact-page text, return activity
 * items for lines that carry a date AND an activity keyword.
 * @param {string} text
 */
function parseActivityText(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const activities = [];
  const notes = [];
  for (const line of lines) {
    const dm = line.match(DATE_RE);
    const looksActivity = /call|text|sms|e-?mail|offer|contract|comp|note|voicemail|inbound|outbound/i.test(line);
    if (dm && looksActivity) {
      const type = inferType(line);
      activities.push({ type, timestamp: dm[0], summary: line.slice(0, 300), inbound: /inbound|received/i.test(line) });
      if (type === 'note') notes.push(line);
    }
  }
  return { activities, notes };
}

class Activity {
  constructor(page, selectors, log) {
    this.page = page;
    this.selEntry = selectors.contact.activityItem;
    this.log = log;
  }

  _hasStructuredSelector() {
    const e = this.selEntry;
    return e && e.by !== 'code' && typeof e.value === 'string' && e.value.trim() !== '' && e.confidence !== 'fallback';
  }

  async collect() {
    // Structured path (preferred once a real selector is set).
    if (this._hasStructuredSelector()) {
      const items = locate(this.page, this.selEntry, 'contact.activityItem');
      const n = await items.count();
      const activities = [];
      const notes = [];
      for (let i = 0; i < n; i++) {
        const el = items.nth(i);
        const raw = (await el.innerText().catch(() => '')).trim();
        if (!raw) continue;
        const tsAttr =
          (await el.getAttribute('data-timestamp').catch(() => null)) ||
          (await el.locator('time').first().getAttribute('datetime').catch(() => null)) ||
          (raw.match(DATE_RE) ? raw.match(DATE_RE)[0] : '');
        const type = inferType(raw);
        activities.push({ type, timestamp: tsAttr, summary: raw.slice(0, 300), inbound: /inbound|received/i.test(raw) });
        if (type === 'note') notes.push(raw);
      }
      return { activities, notes, tags: [], confidence: 'structured' };
    }

    // Fallback: heuristic scan of the contact page text.
    const text = await this.page.locator('body').innerText().catch(() => '');
    const { activities, notes } = parseActivityText(text);
    if (this.log) this.log(`[activity] fallback text-scan found ${activities.length} dated activity line(s) — audit confidence: low.`);
    return { activities, notes, tags: [], confidence: 'heuristic' };
  }
}

module.exports = { Activity, inferType, parseActivityText };
