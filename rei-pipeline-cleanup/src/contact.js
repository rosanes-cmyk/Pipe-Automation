'use strict';

/**
 * Contacts tab: /properties/details/{id}/contacts
 * The attached contact's name link is href="#{contactId}_panel_content".
 * We navigate by URL and extract the contactId.
 */
class Contact {
  constructor(page, settings, log) {
    this.page = page;
    this.settings = settings;
    this.log = log;
  }

  _abs(pathname) {
    return new URL(pathname, this.settings.urls.base).toString();
  }

  /**
   * Open the contacts tab for a property and return { contactId, name } or null.
   */
  async attachedContact(propertyId) {
    const url = this._abs(this.settings.urls.contactsTab.replace('{id}', propertyId));
    await this.page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await this.page.waitForTimeout(1000);

    // Contact name link -> href="#12345_panel_content"
    const panels = this.page.locator('a[href*="_panel_content"]');
    const n = await panels.count().catch(() => 0);
    for (let i = 0; i < n; i++) {
      const href = await panels.nth(i).getAttribute('href').catch(() => '');
      const m = href && href.match(/#?(\d+)_panel_content/);
      if (m) {
        const name = ((await panels.nth(i).innerText().catch(() => '')) || '').trim().replace(/\s+/g, ' ');
        return { contactId: m[1], name };
      }
    }
    // Fallback: a direct /contacts/{id} link if present.
    const rec = this.page.locator('a[href*="/contacts/"]');
    const rn = await rec.count().catch(() => 0);
    for (let i = 0; i < rn; i++) {
      const href = await rec.nth(i).getAttribute('href').catch(() => '');
      const m = href && href.match(/\/contacts\/(\d+)/);
      if (m) {
        const name = ((await rec.nth(i).innerText().catch(() => '')) || '').trim().replace(/\s+/g, ' ');
        return { contactId: m[1], name };
      }
    }
    return null;
  }
}

module.exports = { Contact };
