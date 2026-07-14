'use strict';

/**
 * Contact record reader: /contacts/{contactId}
 * The real activity lives here — Category, Lead Stage, Call Disposition, Tags,
 * Associated Deals, and Notes / CALL SUMMARY entries (latest first).
 *
 * parseActivityText/inferType are pure and unit-tested; collectFromText turns a
 * contact page's text into the shape the decision engine expects.
 */

const TYPE_HINTS = [
  [/text|sms/i, 'text'],
  [/\bcall(ed|ing)?\b|phone|voicemail|\bvm\b|dial/i, 'call'],
  [/e-?mail/i, 'email'],
  [/\bcomps?\b|comparable|analysis|analyz/i, 'comps'],
  [/\boffer\b/i, 'offer'],
  [/contract/i, 'contract'],
  [/\bnote\b|summary/i, 'note'],
  [/\btask\b/i, 'task'],
];

const DATE_RE = /(\d{4}-\d{2}-\d{2}(?:[t ]\d{2}:\d{2})?)|(\d{1,2}\/\d{1,2}\/\d{2,4})|((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s*\d{2,4})/i;

// Signal lines we always keep as "notes" for the decision engine, even without
// a date — dispositions/stages that imply dead/closed/under-contract.
const SIGNAL_RE = /lead stage|call disposition|category|associated deal|not interested|wrong number|invalid|dead|lost|we passed|under contract|accepted offer|signed contract|closed|sold|funded|follow up|interested|made an offer|nurtur|appointment|for property visit/i;

function inferType(raw) {
  for (const [re, t] of TYPE_HINTS) if (re.test(raw)) return t;
  return 'note';
}

function parseActivityText(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const activities = [];
  const notes = [];
  for (const line of lines) {
    const dm = line.match(DATE_RE);
    const looksActivity = /call|text|sms|e-?mail|offer|contract|comp|note|voicemail|inbound|outbound|summary|disposition/i.test(line);
    if (dm && looksActivity) {
      const type = inferType(line);
      activities.push({ type, timestamp: dm[0], summary: line.slice(0, 300), inbound: /inbound|received/i.test(line) });
      if (type === 'note') notes.push(line);
    } else if (SIGNAL_RE.test(line)) {
      notes.push(line.slice(0, 300));
    }
  }
  return { activities, notes };
}

/** Extract Tags from a contact page's text (best-effort). */
function parseTags(text) {
  const m = String(text || '').match(/tags?\s*[:\n]([^\n]+)/i);
  if (!m) return [];
  return m[1].split(/[,|]/).map((t) => t.trim()).filter(Boolean).slice(0, 20);
}

class Activity {
  constructor(page, settings, log) {
    this.page = page;
    this.settings = settings;
    this.log = log;
  }

  _abs(pathname) { return new URL(pathname, this.settings.urls.base).toString(); }

  /**
   * Navigate to the contact record and collect activity/notes/tags.
   * @returns {{activities, notes, tags, confidence}}
   */
  async collect(contactId) {
    const url = this._abs(this.settings.urls.contactRecord.replace('{contactId}', contactId));
    await this.page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await this.page.waitForLoadState('networkidle').catch(() => {});
    // The contact record loads its detail/activity panels via JS after the
    // shell renders — poll until real content (beyond the nav chrome) appears.
    const deadline = Date.now() + 12000;
    let text = '';
    while (Date.now() < deadline) {
      await this.page.waitForTimeout(1200);
      text = await this.page.locator('body').innerText().catch(() => '');
      if (/lead stage|call disposition|category|tags|call summary|notes|disposition|deal/i.test(text)) break;
    }
    const { activities, notes } = parseActivityText(text);
    const tags = parseTags(text);
    if (this.log) this.log(`[contact ${contactId}] ${activities.length} dated activity line(s), ${notes.length} signal note(s), ${tags.length} tag(s).`);
    return { activities, notes, tags, confidence: activities.length || notes.length ? 'contact-record' : 'empty' };
  }
}

module.exports = { Activity, inferType, parseActivityText, parseTags };
