'use strict';

/**
 * Property Pipeline "New" bucket navigation.
 * URL: /properties/inbox?status_filter=New  (groups New + sub-statuses).
 * Each row has an address link href="/properties/details/{id}".
 * The inbox sometimes hangs "loading" — we reload once if rows don't appear.
 */
class Pipeline {
  constructor(page, selectors, settings, log) {
    this.page = page;
    this.settings = settings;
    this.log = log;
  }

  async open() {
    const url = this.settings.urls.pipeline;
    for (let attempt = 1; attempt <= 6; attempt++) {
      await this.page.goto(url, { waitUntil: 'domcontentloaded' });
      // Poll for rows to attach (not necessarily "visible") — the list renders
      // lazily and a loading overlay can keep links technically hidden.
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        const c = await this._addressLinks().count().catch(() => 0);
        if (c > 0) return;
        await this.page.waitForTimeout(1500);
      }
      this.log(`Pipeline list didn't render (attempt ${attempt}/6) — reloading...`);
      await this.page.waitForTimeout(1500);
    }
    throw new Error('Pipeline "New" list did not load after 6 attempts (known intermittent hang). Run the command again — a fresh load usually works.');
  }

  _addressLinks() {
    return this.page.locator('a[href*="/properties/details/"]');
  }

  /**
   * Return New-bucket leads in list order (top first), de-duplicated by id.
   * Each: { id, address, url }
   */
  async listNewLeads() {
    const links = this._addressLinks();
    const n = await links.count().catch(() => 0);
    const seen = new Set();
    const leads = [];
    for (let i = 0; i < n; i++) {
      const href = await links.nth(i).getAttribute('href').catch(() => '');
      const m = href && href.match(/\/properties\/details\/(\d+)/);
      if (!m) continue;
      const id = m[1];
      if (seen.has(id)) continue;
      seen.add(id);
      const address = ((await links.nth(i).innerText().catch(() => '')) || '').trim().replace(/\s+/g, ' ');
      leads.push({ id, address, url: this._abs(`/properties/details/${id}`) });
    }
    return leads;
  }

  _abs(pathname) {
    return new URL(pathname, this.settings.urls.base).toString();
  }
}

module.exports = { Pipeline };
