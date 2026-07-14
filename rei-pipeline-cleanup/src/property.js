'use strict';

const { locate } = require('./locators');

const STATUS_OPTIONS = /new|follow\s*up|evaluating|under\s*contract|closed/i;

/** Single-property extraction + status read/write on the property page. */
class Property {
  constructor(page, selectors, log) {
    this.page = page;
    this.sel = selectors.property;
    this.selEdit = selectors.editDetails;
    this.log = log;
  }

  /**
   * Resolve the Market Status <select> by scanning for the one whose options
   * include the known pipeline statuses. This is content-based (robust) and
   * distinguishes it from the "Deal Type" select next to it.
   */
  async _statusSelect() {
    const selects = this.page.locator('select');
    const n = await selects.count();
    for (let i = 0; i < n; i++) {
      const opts = (await selects.nth(i).locator('option').allInnerTexts().catch(() => [])).join('|');
      const hasNew = /(^|\|)\s*new\s*(\||$)/i.test(opts);
      if (hasNew && STATUS_OPTIONS.test(opts) && /(follow\s*up|under\s*contract|closed|evaluating)/i.test(opts)) {
        return selects.nth(i);
      }
    }
    throw new Error('Could not find the property Status <select> (no <select> exposing New/Follow up/Under Contract/Closed options).');
  }

  async currentStatus() {
    const sel = await this._statusSelect();
    const checked = await sel.locator('option:checked').first().innerText().catch(() => '');
    return (checked || '').trim();
  }

  async openContactsTab() {
    await locate(this.page, this.sel.tabContacts, 'property.tabContacts').first().click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Set the Market Status value and fire the save handler.
   * Verification (reload) is done by the Updater.
   */
  async setStatus(value) {
    const select = await this._statusSelect();
    await select.selectOption({ label: value }).catch(async () => { await select.selectOption(value); });
    await select.evaluate((el) => el.dispatchEvent(new Event('change', { bubbles: true }))).catch(() => {});
    // Best-effort explicit Save (many REI selects auto-save on change; if a Save
    // control exists, click it — but never fail if there isn't one).
    try {
      const save = this.page.getByRole('button', { name: /save/i });
      if (await save.first().isVisible({ timeout: 1500 }).catch(() => false)) {
        await save.first().click();
      }
    } catch { /* no explicit save button — rely on change handler */ }
    await this.page.waitForTimeout(800);
  }

  async screenshot(filePath) {
    await this.page.screenshot({ path: filePath, fullPage: false }).catch(() => {});
  }
}

module.exports = { Property };
