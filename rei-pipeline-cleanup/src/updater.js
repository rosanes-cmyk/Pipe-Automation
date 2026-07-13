'use strict';

/**
 * Applies a status change and verifies it persisted (SOP: the dropdown silently
 * reverts unless the save handler fires, so we reload and confirm). Retries at
 * most one additional time, then reports failure and stops changing that lead.
 */
class Updater {
  constructor(page, property, settings, log) {
    this.page = page;
    this.property = property;
    this.settings = settings;
    this.log = log;
  }

  /**
   * @param {string} propertyUrl fresh URL to reopen for verification
   * @param {string} value Market Status value to set (e.g. "Follow up")
   * @returns {Promise<{attempted:boolean, saved:boolean, detail:string}>}
   */
  async applyAndVerify(propertyUrl, value) {
    const maxTries = 1 + (this.settings.run.maxVerifyRetries || 1);
    let detail = '';
    for (let attempt = 1; attempt <= maxTries; attempt++) {
      await this.property.setStatus(value);

      // Reload / reopen to verify.
      await this.page.goto(propertyUrl, { waitUntil: 'domcontentloaded' });
      const after = await this.property.currentStatus();
      if (String(after).trim().toLowerCase() === String(value).trim().toLowerCase()) {
        return { attempted: true, saved: true, detail: `verified "${value}" after reload (attempt ${attempt})` };
      }
      detail = `value did not persist (saw "${after}") on attempt ${attempt}`;
      this.log(`[verify] ${detail}`);
    }
    return { attempted: true, saved: false, detail };
  }
}

module.exports = { Updater };
