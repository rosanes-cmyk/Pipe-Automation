'use strict';

/**
 * Applies a Market Status change on the lead sheet and verifies it persisted
 * (set -> reload -> read). Retries once (per operator notes, a second attempt
 * is often needed). Then stops changing that lead.
 */
class Updater {
  constructor(page, property, settings, log) {
    this.page = page;
    this.property = property;
    this.settings = settings;
    this.log = log;
  }

  /**
   * @param {string} id property id
   * @param {string} value Market Status value to set (e.g. "Follow up")
   * @returns {Promise<{attempted:boolean, saved:boolean, detail:string}>}
   */
  async applyAndVerify(id, value) {
    const maxTries = 1 + (this.settings.run.maxVerifyRetries || 1);
    let detail = '';
    for (let attempt = 1; attempt <= maxTries; attempt++) {
      await this.property.openLeadSheet(id);
      let toastSeen = false;
      try {
        ({ toastSeen } = await this.property.setMarketStatus(value));
      } catch (e) {
        detail = e.message;
        this.log(`[set ${attempt}] ${id}: ${detail}`);
        continue;
      }
      // Reload and read back.
      await this.property.openLeadSheet(id);
      const after = await this.property.readMarketStatus();
      if (String(after).trim().toLowerCase() === String(value).trim().toLowerCase()) {
        return { attempted: true, saved: true, detail: `verified "${value}" after reload (attempt ${attempt}, toast=${toastSeen})` };
      }
      detail = `did not persist (saw "${after}", toast=${toastSeen}) on attempt ${attempt}`;
      this.log(`[verify ${attempt}] ${id}: ${detail}`);
    }
    return { attempted: true, saved: false, detail };
  }
}

module.exports = { Updater };
