'use strict';

/**
 * Property Pipeline navigation. Always starts from the TOP of the New list.
 *
 * Robust locators (content-based) so we target the real properties table and
 * not the hidden per-row <table class="indicators-table"> marketing widgets:
 *   - property rows are <tr>s that contain a status <select>;
 *   - preferred scope is the table whose header contains "Address".
 */
class Pipeline {
  constructor(page, selectors, settings, log) {
    this.page = page;
    this.settings = settings;
    this.log = log;
  }

  async open() {
    const url = this.settings.urls.pipeline;
    if (!url || url.startsWith('TODO')) {
      throw new Error('settings.urls.pipeline is not set. Copy the real Property Pipeline URL (Phase 1).');
    }
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    // Wait for a real property row (one that carries a status <select>) to render.
    await this.rows().first().waitFor({ state: 'visible', timeout: 30000 });
  }

  /** Locator for property rows (rows that contain a status <select>). */
  rows() {
    const scoped = this.page.locator('table:has(th:has-text("Address")) tbody tr:has(select)');
    // Fall back to any row with a <select> if the header scope doesn't match.
    return scoped;
  }

  _rowsFallback() {
    return this.page.locator('tr:has(td select)');
  }

  async _bestRows() {
    let rows = this.rows();
    if ((await rows.count().catch(() => 0)) > 0) return rows;
    rows = this._rowsFallback();
    return rows;
  }

  /**
   * Return descriptors for New leads, in list order (top first).
   * Each: { index, address, city, state, statusText }
   */
  async listNewLeads() {
    const rows = await this._bestRows();
    const count = await rows.count();
    const leads = [];
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const statusText = (
        (await row.locator('select option:checked').first().innerText().catch(() => '')) ||
        (await row.locator('select').first().inputValue().catch(() => ''))
      ).trim();
      const link = row.locator('a').first();
      const address = (await link.innerText().catch(() => '')).trim() ||
        (await row.locator('td').nth(0).innerText().catch(() => '')).trim();
      const city = (await row.locator('td').nth(1).innerText().catch(() => '')).trim();
      const state = (await row.locator('td').nth(2).innerText().catch(() => '')).trim();
      if (/^new$/i.test(statusText)) leads.push({ index: i, address, city, state, statusText });
    }
    return leads;
  }

  /** Open a lead's property page by clicking its address link. */
  async openLead(index) {
    const rows = await this._bestRows();
    const row = rows.nth(index);
    const link = row.locator('a').first();
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
