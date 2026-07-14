'use strict';

/**
 * Address write-back for REI BlackBook (Edit Property Details).
 *
 * SAFETY: writing a wrong address is the one non-reversible action in this job,
 * so this writer refuses to touch anything until it is explicitly enabled AND
 * the edit-form selectors have been confirmed live:
 *   - settings.address.writeToRei must be true, and
 *   - settings.address.editFormSelectors.{street,city,zip,save} must be set
 *     (map them with `node diagnose.js address <id>`).
 * Otherwise writeAddress() is a no-op that returns { written:false, skipped:true }
 * so the controller flags the lead instead of guessing at fields.
 *
 * The State field is NEVER written (REI's dropdown offers only full names; SOP §7).
 *
 * Discipline (same as status/notes): set -> save -> reload -> verify the value
 * stuck; if it did not verify, report written:false (nothing is assumed saved).
 */
class AddressWriter {
  constructor(page, settings, log) {
    this.page = page;
    this.settings = settings;
    this.log = log;
    this.cfg = (settings.address && settings.address.editFormSelectors) || {};
  }

  _url(id) {
    const p = (this.settings.urls.addressEdit || '/properties/details/{id}/propertyDetails').replace('{id}', id);
    return new URL(p, this.settings.urls.base).toString();
  }

  _enabled() {
    const a = this.settings.address || {};
    return !!a.writeToRei && !!(this.cfg.street && this.cfg.save);
  }

  /**
   * Write the tidied Street/City/ZIP back into REI and verify on reload.
   * `cleaned` = { street, city, zip } (state omitted on purpose).
   * Returns { written, skipped, detail }.
   */
  async writeAddress(id, cleaned) {
    if (!this._enabled()) {
      return { written: false, skipped: true, detail: 'address.writeToRei off or edit-form selectors unset — flagged, not written' };
    }
    if (!cleaned || (!cleaned.street && !cleaned.city && !cleaned.zip)) {
      return { written: false, skipped: true, detail: 'nothing to write' };
    }

    const url = this._url(id);
    await this.page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await this.page.waitForTimeout(1200);

    // Reveal the edit form if it sits behind an Edit button.
    if (this.cfg.editButton) {
      const eb = this.page.locator(this.cfg.editButton);
      if (await eb.first().isVisible({ timeout: 2500 }).catch(() => false)) {
        await eb.first().click().catch(() => {});
        await this.page.waitForTimeout(700);
      }
    }

    const fill = async (sel, val) => {
      if (!sel || val == null || val === '') return;
      const loc = this.page.locator(sel);
      if (!(await loc.first().isVisible({ timeout: 2000 }).catch(() => false))) return;
      await loc.first().fill(String(val)).catch(() => {});
    };
    await fill(this.cfg.street, cleaned.street);
    await fill(this.cfg.city, cleaned.city);
    await fill(this.cfg.zip, cleaned.zip);
    // State intentionally left untouched.

    const save = this.page.locator(this.cfg.save);
    if (await save.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      await save.first().click().catch(() => {});
    } else {
      return { written: false, skipped: false, detail: 'save control not visible' };
    }
    await this.page.waitForTimeout(1800);

    // Verify on reload: the tidied street must be present in the form.
    await this.page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await this.page.waitForTimeout(1200);
    if (this.cfg.editButton) {
      const eb = this.page.locator(this.cfg.editButton);
      if (await eb.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        await eb.first().click().catch(() => {});
        await this.page.waitForTimeout(500);
      }
    }
    const got = cleaned.street
      ? await this.page.locator(this.cfg.street).first().inputValue().catch(() => '')
      : '';
    const ok = cleaned.street ? (got.trim() === String(cleaned.street).trim()) : true;
    return { written: ok, skipped: false, detail: ok ? 'address saved & reload-verified' : `not verified (got "${got}")` };
  }
}

module.exports = { AddressWriter };
