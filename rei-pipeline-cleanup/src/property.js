'use strict';

/**
 * Lead Sheet (per-property status): /properties/leadsheet/form/{id}
 * This is where Market Status is read and changed.
 *
 * Setting technique (per operator notes): the control is a typeahead — a
 * programmatic set silently reverts. We must click it, TYPE the value, press
 * Enter, and wait for the "Successfully saved/updated" toast. Often needs a
 * second attempt; always reload to verify.
 */

const STATUS_OPTIONS = /new|follow\s*up|evaluating|under\s*contract|closed|interested|made an offer|dead|sold|unresponsive|nurtur/i;

class Property {
  constructor(page, settings, log) {
    this.page = page;
    this.settings = settings;
    this.log = log;
  }

  _leadSheetUrl(id) {
    return new URL(this.settings.urls.leadSheet.replace('{id}', id), this.settings.urls.base).toString();
  }

  async openLeadSheet(id) {
    await this.page.goto(this._leadSheetUrl(id), { waitUntil: 'domcontentloaded' });
    await this.page.waitForTimeout(1000);
  }

  /** Best-effort read of the current Market Status value. */
  async readMarketStatus() {
    const sel = await this._statusSelect().catch(() => null);
    if (sel) {
      const t = await sel.locator('option:checked').first().innerText().catch(() => '');
      if (t) return t.trim();
      const v = await sel.inputValue().catch(() => '');
      if (v) return v.trim();
    }
    return '';
  }

  async _statusSelect() {
    const selects = this.page.locator('select');
    const n = await selects.count().catch(() => 0);
    for (let i = 0; i < n; i++) {
      const opts = (await selects.nth(i).locator('option').allInnerTexts().catch(() => [])).join('|');
      if (/(^|\|)\s*new\s*(\||$)/i.test(opts) && STATUS_OPTIONS.test(opts)) return selects.nth(i);
    }
    return null;
  }

  /**
   * Set Market Status via the typeahead technique. Returns { toastSeen }.
   * Verification is done by the Updater (reload + readMarketStatus).
   */
  async setMarketStatus(value) {
    // Path 1: a native <select> that includes the value as an option.
    const sel = await this._statusSelect().catch(() => null);
    if (sel) {
      const ok = await sel.selectOption({ label: value }).then(() => true).catch(() => false);
      if (ok) {
        await sel.evaluate((el) => el.dispatchEvent(new Event('change', { bubbles: true }))).catch(() => {});
        const toast = await this._waitToast();
        return { toastSeen: toast };
      }
    }

    // Path 2: typeahead/combobox near a "Market Status" label.
    const combo = await this._marketStatusCombo();
    if (combo) {
      await combo.click().catch(() => {});
      await combo.fill('').catch(() => {});
      await combo.type(value, { delay: 40 }).catch(async () => {
        await this.page.keyboard.type(value, { delay: 40 });
      });
      await this.page.keyboard.press('Enter').catch(() => {});
      const toast = await this._waitToast();
      return { toastSeen: toast };
    }

    throw new Error('Could not locate the Market Status control on the lead sheet.');
  }

  async _marketStatusCombo() {
    // Look for an input/combobox associated with a "Market Status" label.
    const byLabel = this.page.getByLabel(/market status/i);
    if (await byLabel.count().catch(() => 0)) return byLabel.first();
    // Select2-style: a container following the label text.
    const near = this.page.locator('xpath=//*[contains(translate(.,"MARKET STATUS","market status"),"market status")]/following::input[1]');
    if (await near.count().catch(() => 0)) return near.first();
    return null;
  }

  async _waitToast() {
    const toast = this.page.getByText(/successfully (saved|updated)/i);
    return toast.first().waitFor({ state: 'visible', timeout: 6000 }).then(() => true).catch(() => false);
  }

  async screenshot(filePath) {
    await this.page.screenshot({ path: filePath, fullPage: false }).catch(() => {});
  }
}

module.exports = { Property };
