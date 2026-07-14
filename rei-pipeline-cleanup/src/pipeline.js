'use strict';

const { locate } = require('./locators');

/**
 * Property Pipeline navigation. Always starts from the TOP of the New list
 * (fresh runs); the controller handles skip/resume.
 */
class Pipeline {
  constructor(page, selectors, settings, log) {
    this.page = page;
    this.sel = selectors.pipeline;
    this.settings = settings;
    this.log = log;
  }

  async open() {
    const url = this.settings.urls.pipeline;
    if (!url || url.startsWith('TODO')) {
      throw new Error('settings.urls.pipeline is not set. Copy the real Property Pipeline URL from the address bar (Phase 1).');
    }
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    await locate(this.page, this.sel.table, 'pipeline.table').first().waitFor();
  }

  /**
   * Return lightweight descriptors for New leads, in list order (top first).
   * Each: { index, address, city, state, statusText, rowHandle }
   */
  async listNewLeads() {
    const rows = locate(this.page, this.sel.row, 'pipeline.row');
    const count = await rows.count();
    const leads = [];
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      // Read the selected option text of the row's Status <select> (robust to
      // option value vs. label differences).
      const statusText = (
        (await row.locator('select option:checked').first().innerText().catch(() => '')) ||
        (await row.locator('select').first().inputValue().catch(() => ''))
      ).trim();
      const address = (await row.locator('td').nth(0).innerText().catch(() => '')).trim();
      const city = (await row.locator('td').nth(1).innerText().catch(() => '')).trim();
      const state = (await row.locator('td').nth(2).innerText().catch(() => '')).trim();
      if (/^new$/i.test(statusText)) {
        leads.push({ index: i, address, city, state, statusText });
      }
    }
    return leads;
  }

  /** Open a lead's property page by clicking its address link. */
  async openLead(index) {
    const row = locate(this.page, this.sel.row, 'pipeline.row').nth(index);
    const link = row.locator('td').nth(0).locator('a').first();
    const href = await link.getAttribute('href').catch(() => null);
    await link.click();
    await this.page.waitForLoadState('domcontentloaded');
    return { url: href ? new URL(href, this.page.url()).toString() : this.page.url() };
  }

  async returnToPipeline() {
    await this.open();
  }
}

module.exports = { Pipeline };
