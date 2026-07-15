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
   * The inbox lazy-loads rows as you scroll. Scroll to the bottom repeatedly
   * until the row count stops growing (or a cap), so we enumerate the full
   * bucket instead of just the first screen.
   */
  async loadAllRows(target = Infinity, maxScrolls = 80) {
    let prev = -1, stable = 0;
    for (let i = 0; i < maxScrolls && stable < 3; i++) {
      const c = await this._addressLinks().count().catch(() => 0);
      if (c >= target) { prev = c; break; }           // enough for this run
      if (c === prev) stable++; else { stable = 0; prev = c; }
      await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
      await this.page.mouse.wheel(0, 30000).catch(() => {});
      await this.page.waitForTimeout(900);
    }
    this.log(`Loaded ${prev} rows after scrolling${target !== Infinity ? ` (needed ~${target})` : ''}.`);
    return prev;
  }

  /**
   * Read the leads currently rendered in the list (top first), de-duplicated by
   * id — WITHOUT scrolling. Used for incremental top-first processing so the
   * bot starts on lead #1 right away instead of scrolling the whole bucket.
   * Each: { id, address, url }
   */
  async currentLeads() {
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

  /**
   * Read leads from the given link index onward (only the newly-loaded rows),
   * so incremental processing never re-scans the whole list. Returns
   * { leads, nextIndex }. Caller de-dupes by id via its own "completed" set.
   */
  async leadsFrom(startIndex = 0) {
    const links = this._addressLinks();
    const n = await links.count().catch(() => 0);
    const leads = [];
    for (let i = startIndex; i < n; i++) {
      const href = await links.nth(i).getAttribute('href').catch(() => '');
      const m = href && href.match(/\/properties\/details\/(\d+)/);
      if (!m) continue;
      const id = m[1];
      const address = ((await links.nth(i).innerText().catch(() => '')) || '').trim().replace(/\s+/g, ' ');
      leads.push({ id, address, url: this._abs(`/properties/details/${id}`) });
    }
    return { leads, nextIndex: n };
  }

  /** One lazy-load scroll step. Returns the rendered row count afterwards. */
  async scrollOnce() {
    await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
    await this.page.mouse.wheel(0, 30000).catch(() => {});
    await this.page.waitForTimeout(900);
    return this._addressLinks().count().catch(() => 0);
  }

  /**
   * Full-list load (top first), de-duplicated. Kept for callers that need the
   * whole set up front; the controller now prefers incremental processing.
   */
  async listNewLeads() {
    const max = this.settings.mode.MAX_LEADS_PER_RUN;
    const target = max && max > 0 ? max + 10 : Infinity;
    await this.loadAllRows(target);
    return this.currentLeads();
  }

  _abs(pathname) {
    return new URL(pathname, this.settings.urls.base).toString();
  }
}

module.exports = { Pipeline };
