'use strict';

const { locate } = require('./locators');

/** Attached-contact navigation + verification. */
class Contact {
  constructor(page, selectors, log) {
    this.page = page;
    this.sel = selectors.contact;
    this.log = log;
  }

  /** Whether a contact is attached (called after openContactsTab on Property). */
  async hasAttachedContact() {
    const link = locate(this.page, this.sel.attachedContactLink, 'contact.attachedContactLink');
    return (await link.count()) > 0;
  }

  /** Open the attached contact record. Returns { name, url }. */
  async openAttachedContact() {
    const link = locate(this.page, this.sel.attachedContactLink, 'contact.attachedContactLink').first();
    const name = (await link.innerText().catch(() => '')).trim();
    const href = await link.getAttribute('href').catch(() => null);
    await link.click();
    await this.page.waitForLoadState('domcontentloaded');
    return { name, url: href ? new URL(href, this.page.url()).toString() : this.page.url() };
  }
}

module.exports = { Contact };
