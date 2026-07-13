'use strict';

const { locate } = require('./locators');

/** Single-property extraction + status read/write on the property page. */
class Property {
  constructor(page, selectors, log) {
    this.page = page;
    this.sel = selectors.property;
    this.selEdit = selectors.editDetails;
    this.log = log;
  }

  async currentStatus() {
    return (await locate(this.page, this.sel.statusSelect, 'property.statusSelect').inputValue().catch(() => '')) || '';
  }

  async addressText() {
    // The property header shows "Street\nCity, State ZIP"; best-effort parse.
    const header = await this.page.locator('body').innerText().catch(() => '');
    return header;
  }

  async openContactsTab() {
    await locate(this.page, this.sel.tabContacts, 'property.tabContacts').click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Set the Market Status value and fire the save handler.
   * Returns after the save action; verification is done separately (reload).
   */
  async setStatus(value) {
    const select = locate(this.page, this.sel.statusSelect, 'property.statusSelect');
    await select.selectOption({ label: value }).catch(async () => {
      // some selects want value, not label
      await select.selectOption(value);
    });
    // Fire the save handler: blur + explicit Save if present.
    await select.evaluate((el) => el.dispatchEvent(new Event('change', { bubbles: true }))).catch(() => {});
    const save = locate(this.page, this.sel.saveButton, 'property.saveButton');
    if (await save.first().isVisible().catch(() => false)) {
      await save.first().click();
    }
    await this.page.waitForTimeout(800);
  }

  async screenshot(filePath) {
    await this.page.screenshot({ path: filePath, fullPage: false }).catch(() => {});
  }
}

module.exports = { Property };
