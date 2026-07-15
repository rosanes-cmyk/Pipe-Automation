'use strict';

const { reviewAddress } = require('./address');

/**
 * Address write-back for REI BlackBook (Edit Property Details).
 *
 * Confirmed live (property 3184299). The page has several independently-editable
 * sections, each with its own "Edit" toggle and Save button, and REI renders a
 * hidden duplicate of the address inputs — so a bare #address can resolve to the
 * wrong copy. To stay exact we anchor on the one unique element, the
 * "Save Address Details" button, tag the container that holds BOTH that button
 * and the address input, and operate strictly inside that scope:
 *   - street : [name="address"]   (e.g. "1217 Newbridge Ave ")
 *   - city   : [name="city"]
 *   - state  : [name="state"]  (a <select> — NEVER touched; SOP §7)
 *   - zip    : [name="zip_code"]
 *   - save   : button "Save Address Details"
 *
 * SAFETY MODEL — this is the one non-reversible action in the job, so:
 *   1. Runs only when settings.address.writeToRei is true; else no-ops (flag).
 *   2. Reads the record's OWN field values and only NORMALIZES their formatting
 *      (suffix abbreviation, casing, trailing space) via unit-tested
 *      reviewAddress(); never injects list text, never moves data between fields.
 *   3. The State <select> and ZIP are never written.
 *   4. set -> Save -> reload -> re-read -> verify; unverified => written:false.
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

  _enabled() { return !!(this.settings.address && this.settings.address.writeToRei); }

  /**
   * Tag the container that holds the "Save Address Details" button AND an
   * address input, so every later query is scoped to the real address form
   * (defeats the hidden duplicate). Returns true if the scope was found.
   */
  async _tagScope() {
    return await this.page.evaluate(() => {
      document.querySelectorAll('[data-addr-scope]').forEach((e) => e.removeAttribute('data-addr-scope'));
      const controls = [...document.querySelectorAll('button, a, input[type=button], input[type=submit]')];
      const save = controls.find((b) => /save address details/i.test((b.innerText || b.value || '').trim()));
      if (!save) return false;
      let el = save;
      for (let i = 0; i < 10 && el; i++) {
        if (el.querySelector && el.querySelector('[name="address"]')) { el.setAttribute('data-addr-scope', '1'); return true; }
        el = el.parentElement;
      }
      return false;
    }).catch(() => false);
  }

  _scope() { return this.page.locator('[data-addr-scope="1"]'); }
  _street() { return this._scope().locator('[name="address"]').first(); }
  _city() { return this._scope().locator('[name="city"]').first(); }
  _save() { return this._scope().getByRole('button', { name: /save address details/i }).first(); }
  _editBtn() { return this._scope().getByRole('button', { name: /^\s*edit\s*$/i }); }

  async _ready() {
    return (await this._street().isVisible({ timeout: 400 }).catch(() => false))
        && (await this._save().isVisible({ timeout: 400 }).catch(() => false));
  }

  /** Put the address section into edit mode (street input + Save both visible). */
  async _reveal() {
    if (!(await this._tagScope())) return false;
    if (await this._ready()) return true;
    // Click the Edit control(s) inside the address scope first, then any Edit.
    const groups = [this._editBtn(), this.page.getByRole('button', { name: /^\s*edit\s*$/i })];
    for (const loc of groups) {
      const n = await loc.count().catch(() => 0);
      for (let i = 0; i < Math.min(n, 12); i++) {
        await loc.nth(i).click().catch(() => {});
        await this.page.waitForTimeout(450);
        await this._tagScope(); // re-tag: DOM may have re-rendered on toggle
        if (await this._ready()) return true;
      }
    }
    return await this._ready();
  }

  async _readVal(loc) {
    if (!(await loc.isVisible({ timeout: 600 }).catch(() => false))) return '';
    return (await loc.inputValue().catch(() => '')) || '';
  }

  /**
   * Normalize the record's Street/City formatting in place and verify.
   * Returns { written, skipped, detail, before, after }.
   */
  async tidyAndVerify(id) {
    if (!this._enabled()) {
      return { written: false, skipped: true, detail: 'address.writeToRei off — flagged, not written' };
    }
    const url = this._url(id);
    await this.page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await this.page.waitForTimeout(1200);
    if (!(await this._reveal())) {
      return { written: false, skipped: false, detail: 'could not reveal the address edit form' };
    }

    const rawStreet = await this._readVal(this._street());
    const curStreet = rawStreet.trim();
    const curCity = (await this._readVal(this._city())).trim();

    const r = reviewAddress({ street: curStreet, city: curCity, state: '', zip: '' }, { tidyStreetText: true });
    const newStreet = r.cleaned.street || curStreet;
    const newCity = r.cleaned.city || curCity;

    const streetChanged = newStreet !== curStreet || rawStreet !== rawStreet.trim();
    const cityChanged = newCity !== curCity;
    if (!streetChanged && !cityChanged) {
      return { written: false, skipped: true, detail: 'already clean', before: curStreet, after: curStreet };
    }

    if (streetChanged) await this._street().fill(newStreet).catch(() => {});
    if (cityChanged) await this._city().fill(newCity).catch(() => {});
    // State + ZIP intentionally untouched.

    const save = this._save();
    if (!(await save.isVisible({ timeout: 2000 }).catch(() => false))) {
      return { written: false, skipped: false, detail: 'Save Address Details button not visible' };
    }
    await save.click().catch(() => {});
    await this.page.waitForTimeout(1800);

    // Verify on reload.
    await this.page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await this.page.waitForTimeout(1200);
    await this._reveal();
    const gotStreet = (await this._readVal(this._street())).trim();
    const gotCity = (await this._readVal(this._city())).trim();
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
