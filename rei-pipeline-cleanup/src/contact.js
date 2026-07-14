'use strict';

/**
 * Attached-contact navigation + verification.
 *
 * A real contact record lives at /contacts/{numericId}. We must NOT match menu
 * links like /contacts/deal-settings, so we filter to hrefs whose id is numeric
 * and prefer a visible link.
 */
class Contact {
  constructor(page, selectors, log) {
    this.page = page;
    this.log = log;
  }

  async _recordLinks() {
    const links = this.page.locator('a[href*="/contacts/"]');
    const n = await links.count().catch(() => 0);
    const out = [];
    for (let i = 0; i < n; i++) {
      const loc = links.nth(i);
      const href = await loc.getAttribute('href').catch(() => null);
      if (href && /\/contacts\/\d+/.test(href)) {
        const visible = await loc.isVisible().catch(() => false);
        const text = (await loc.innerText().catch(() => '')).trim();
        out.push({ loc, href, visible, text });
      }
    }
    // Prefer visible links.
    out.sort((a, b) => Number(b.visible) - Number(a.visible));
    return out;
  }

  async hasAttachedContact() {
    const links = await this._recordLinks();
    return links.length > 0;
  }

  async openAttachedContact() {
    const links = await this._recordLinks();
    if (links.length === 0) throw new Error('No attached contact record link (/contacts/{id}) found on the CONTACTS tab.');
    const target = links[0];
    const name = target.text;
    const href = target.href;
    if (target.visible) {
      await target.loc.click({ timeout: 8000 }).catch(async () => {
        await this.page.goto(new URL(href, this.page.url()).toString(), { waitUntil: 'domcontentloaded' });
      });
    } else {
      // Not clickable — navigate directly to the record.
      await this.page.goto(new URL(href, this.page.url()).toString(), { waitUntil: 'domcontentloaded' });
    }
    await this.page.waitForTimeout(1200);
    return { name, url: new URL(href, this.page.url()).toString() };
  }
}

module.exports = { Contact };
