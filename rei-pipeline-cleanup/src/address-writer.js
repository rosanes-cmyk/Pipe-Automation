'use strict';

const { reviewAddress } = require('./address');

/**
 * Address write-back for REI BlackBook (Edit Property Details).
 *
 * Confirmed live (property 3184299):
 *   - reveal   : an "Edit" button toggles the address section into edit mode
 *   - street   : #address      (e.g. "1217 Newbridge Ave ")
 *   - unit     : #address2
 *   - city     : #city
 *   - state    : #state  (a <select> — NEVER touched; SOP §7)
 *   - zip      : #zip_code
 *   - save     : button "Save Address Details"
 *
 * SAFETY MODEL — this is the one non-reversible action in the job, so:
 *   1. It only runs when settings.address.writeToRei is true AND the field
 *      selectors are set; otherwise it no-ops (the controller flags instead).
 *   2. It reads the form's OWN current values and only NORMALIZES their
 *      formatting (suffix abbreviation, casing, trailing spaces) via the
 *      unit-tested reviewAddress(). It never injects list-view text or moves
 *      data between fields, so it cannot restructure a record — worst case it
 *      leaves a field as-is.
 *   3. The State <select> is never written.
 *   4. set -> Save -> reload -> re-read -> verify each changed field stuck
 *      (same discipline as status/notes). Unverified => written:false.
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

  /** Reveal the address section (click Edit buttons until the street input shows). */
  async _reveal() {
    const streetSel = this.cfg.street;
    const vis = () => this.page.locator(streetSel).first().isVisible({ timeout: 800 }).catch(() => false);
    if (await vis()) return true;
    // Prefer a configured Edit control, then fall back to scanning Edit buttons.
    const candidates = [];
    if (this.cfg.editButton) candidates.push(this.page.locator(this.cfg.editButton));
    candidates.push(this.page.locator("button.button-a.small", { hasText: /^\s*edit\s*$/i }));
    candidates.push(this.page.locator("a, button", { hasText: /edit property details/i }));
    for (const loc of candidates) {
      const n = await loc.count().catch(() => 0);
      for (let i = 0; i < Math.min(n, 8); i++) {
        await loc.nth(i).click().catch(() => {});
        await this.page.waitForTimeout(450);
        if (await vis()) return true;
      }
    }
    return await vis();
  }

  async _readField(sel) {
    if (!sel) return '';
    const loc = this.page.locator(sel).first();
    if (!(await loc.isVisible({ timeout: 800 }).catch(() => false))) return '';
    return (await loc.inputValue().catch(() => '')) || '';
  }

  /**
   * Normalize the record's Street/City formatting in place and verify.
   * Returns { written, skipped, detail, before, after }.
   */
  async tidyAndVerify(id) {
    if (!this._enabled()) {
      return { written: false, skipped: true, detail: 'address.writeToRei off or selectors unset — flagged, not written' };
    }
    const url = this._url(id);
    await this.page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await this.page.waitForTimeout(1200);
    if (!(await this._reveal())) {
      return { written: false, skipped: false, detail: 'could not reveal the address edit form' };
    }

    const curStreet = (await this._readField(this.cfg.street)).trim();
    const curCity = (await this._readField(this.cfg.city)).trim();
    const curZip = (await this._readField(this.cfg.zip)).trim();

    // Normalize formatting ONLY (state passed blank => never considered).
    const r = reviewAddress({ street: curStreet, city: curCity, state: '', zip: curZip }, { tidyStreetText: true });
    const newStreet = r.cleaned.street || curStreet;
    const newCity = r.cleaned.city || curCity;

    const streetChanged = newStreet !== curStreet;
    const cityChanged = newCity !== curCity;
    // Also treat a raw (untrimmed) street with trailing space as a change.
    const rawStreet = await this._readField(this.cfg.street);
    const trailingSpace = rawStreet !== rawStreet.trim();

    if (!streetChanged && !cityChanged && !trailingSpace) {
      return { written: false, skipped: true, detail: 'already clean', before: curStreet, after: curStreet };
    }

    if (streetChanged || trailingSpace) await this.page.locator(this.cfg.street).first().fill(newStreet).catch(() => {});
    if (cityChanged) await this.page.locator(this.cfg.city).first().fill(newCity).catch(() => {});
    // State + ZIP left as-is.

    const save = this.page.locator(this.cfg.save);
    if (!(await save.first().isVisible({ timeout: 2000 }).catch(() => false))) {
      return { written: false, skipped: false, detail: 'Save Address Details button not visible' };
    }
    await save.first().click().catch(() => {});
    await this.page.waitForTimeout(1800);

    // Verify on reload.
    await this.page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await this.page.waitForTimeout(1200);
    await this._reveal();
    const gotStreet = (await this._readField(this.cfg.street)).trim();
    const gotCity = (await this._readField(this.cfg.city)).trim();
    const ok = gotStreet === newStreet && (!cityChanged || gotCity === newCity);
    return {
      written: ok, skipped: false,
      detail: ok ? 'address normalized & reload-verified' : `not verified (street="${gotStreet}", city="${gotCity}")`,
      before: `${curStreet}${curCity ? ', ' + curCity : ''}`,
      after: `${newStreet}${newCity ? ', ' + newCity : ''}`,
    };
  }
}

module.exports = { AddressWriter };
