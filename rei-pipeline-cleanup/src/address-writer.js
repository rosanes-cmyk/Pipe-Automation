'use strict';

const { reviewAddress } = require('./address');

/**
 * Address write-back for REI BlackBook (Edit Property Details).
 *
 * Confirmed live (property 3184299). The property-details sections load via
 * AJAX and each has its own Edit toggle + Save button. The address section:
 *   - Edit toggle : <button ... onclick="$('#editable_address').hide();$('#saveaddress').show()">Edit</button>
 *   - street      : #address     (unique id; e.g. "1217 Newbridge Ave ")
 *   - unit        : #address2
 *   - city        : #city
 *   - state       : #state  (a <select> — NEVER touched; SOP §7)
 *   - zip         : #zip_code
 *   - save        : <button onclick="savePropInfo('address_form')">Save Address Details</button>
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
    const c = (settings.address && settings.address.editFormSelectors) || {};
    this.sel = {
      edit: c.editButton || 'button[onclick*="editable_address"]',
      street: c.street || '#address',
      city: c.city || '#city',
      save: c.save || 'button[onclick*="address_form"]',
    };
  }

  _url(id) {
    const p = (this.settings.urls.addressEdit || '/properties/details/{id}/propertyDetails').replace('{id}', id);
    return new URL(p, this.settings.urls.base).toString();
  }

  _enabled() { return !!(this.settings.address && this.settings.address.writeToRei); }

  /** Read an input's value directly from the DOM (works even while hidden). */
  async _val(sel) {
    return await this.page.evaluate((s) => {
      const el = document.querySelector(s);
      return el ? (el.value || '') : null;
    }, sel).catch(() => null);
  }

  /** Load the page, wait for the AJAX address form, and open its edit view. */
  async _openEdit(url) {
    await this.page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    // The property-details sections load via AJAX — wait for the address input.
    const attached = await this.page.waitForSelector(this.sel.street, { state: 'attached', timeout: 20000 })
      .then(() => true).catch(() => false);
    if (!attached) return false;
    // Reveal the address edit view (intended UI path), with a jQuery fallback.
    const edit = this.page.locator(this.sel.edit).first();
    if (await edit.count().catch(() => 0)) {
      await edit.click().catch(() => {});
    } else {
      await this.page.evaluate(() => { if (window.jQuery) { window.jQuery('#editable_address').hide(); window.jQuery('#saveaddress').show(); } }).catch(() => {});
    }
    // Wait for the street input to become editable.
    await this.page.locator(this.sel.street).first().waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
    return await this.page.locator(this.sel.street).first().isVisible().catch(() => false);
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
    if (!(await this._openEdit(url))) {
      return { written: false, skipped: false, detail: 'address edit form did not load / reveal' };
    }

    const rawStreet = (await this._val(this.sel.street)) || '';
    const curStreet = rawStreet.trim();
    const curCity = ((await this._val(this.sel.city)) || '').trim();

    const r = reviewAddress({ street: curStreet, city: curCity, state: '', zip: '' }, { tidyStreetText: true });
    const newStreet = r.cleaned.street || curStreet;
    const newCity = r.cleaned.city || curCity;

    const streetChanged = newStreet !== curStreet || rawStreet !== rawStreet.trim();
    const cityChanged = newCity !== curCity;
    if (!streetChanged && !cityChanged) {
      return { written: false, skipped: true, detail: 'already clean', before: curStreet, after: curStreet };
    }

    if (streetChanged) await this.page.locator(this.sel.street).first().fill(newStreet).catch(() => {});
    if (cityChanged) await this.page.locator(this.sel.city).first().fill(newCity).catch(() => {});
    // State + ZIP intentionally untouched.

    // Save via the button, else call the exact global handler.
    const save = this.page.locator(this.sel.save).first();
    if (await save.isVisible({ timeout: 2000 }).catch(() => false)) {
      await save.click().catch(() => {});
    } else {
      await this.page.evaluate(() => { if (typeof window.savePropInfo === 'function') window.savePropInfo('address_form'); }).catch(() => {});
    }
    await this.page.waitForTimeout(2000);

    // Verify on reload — read the saved value straight from the DOM.
    await this.page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await this.page.waitForSelector(this.sel.street, { state: 'attached', timeout: 20000 }).catch(() => {});
    await this.page.waitForTimeout(600);
    const gotStreet = ((await this._val(this.sel.street)) || '').trim();
    const gotCity = ((await this._val(this.sel.city)) || '').trim();
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
