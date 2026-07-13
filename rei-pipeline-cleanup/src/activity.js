'use strict';

const { locate } = require('./locators');

/**
 * Latest-activity extraction from a contact record. Collects all activity
 * items (notes, calls, texts, emails, comps, offer/contract) with timestamps
 * so status-rules can pick the newest relevant one.
 */

const TYPE_HINTS = [
  [/text|sms/i, 'text'],
  [/call/i, 'call'],
  [/email|mail/i, 'email'],
  [/comp/i, 'comps'],
  [/offer/i, 'offer'],
  [/contract/i, 'contract'],
  [/note/i, 'note'],
  [/task/i, 'task'],
];

function inferType(raw) {
  for (const [re, t] of TYPE_HINTS) if (re.test(raw)) return t;
  return 'note';
}

class Activity {
  constructor(page, selectors, log) {
    this.page = page;
    this.sel = selectors.contact;
    this.log = log;
  }

  /**
   * @returns {Promise<{activities:Array, notes:string[], tags:string[]}>}
   */
  async collect() {
    const items = locate(this.page, this.sel.activityItem, 'contact.activityItem');
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
        '';
      const type = inferType(raw);
      activities.push({ type, timestamp: tsAttr, summary: raw.slice(0, 300), inbound: /inbound|received/i.test(raw) });
      if (type === 'note') notes.push(raw);
    }
    return { activities, notes, tags: [] };
  }
}

module.exports = { Activity, inferType };
