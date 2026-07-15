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

    // Fill + save + reload-verify, retrying once IF the save didn't take.
    // Some records (properties with an attached contact/owner) have their
    // address re-derived server-side, so our edit applies in the form but
    // REVERTS on reload — retrying can't help those; detect and flag them.
    let gotStreet = curStreet, gotCity = curCity, ok = false, reverted = false;
    for (let attempt = 1; attempt <= 2 && !ok && !reverted; attempt++) {
      if (attempt > 1 && !(await this._openEdit(url))) break; // re-open on retry

      if (streetChanged) await this._fill(this.sel.street, newStreet);
      if (cityChanged) await this._fill(this.sel.city, newCity);
      // State + ZIP intentionally untouched.

      // Save via the button, and also call the exact global handler as backup.
      const save = this.page.locator(this.sel.save).first();
      if (await save.isVisible({ timeout: 2000 }).catch(() => false)) await save.click().catch(() => {});
      await this.page.evaluate(() => { if (typeof window.savePropInfo === 'function') window.savePropInfo('address_form'); }).catch(() => {});
      // Wait for the save POST to settle before reloading.
      await this.page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      await this.page.waitForTimeout(1500);

      // Read the value in the form BEFORE reload — did our edit apply at all?
      const preReload = ((await this._val(this.sel.street)) || '').trim();

      // Verify on reload — read the saved value straight from the DOM.
      await this.page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await this.page.waitForSelector(this.sel.street, { state: 'attached', timeout: 20000 }).catch(() => {});
      await this.page.waitForTimeout(700);
      gotStreet = ((await this._val(this.sel.street)) || '').trim();
      gotCity = ((await this._val(this.sel.city)) || '').trim();
      ok = gotStreet === newStreet && (!cityChanged || gotCity === newCity);

      // Edit applied in the form but reverted after reload => server-side revert
      // (contact/owner-linked). Retrying won't help — stop and flag.
      if (!ok && preReload === newStreet) reverted = true;
    }

    if (reverted) {
      return {
        written: false, skipped: false, reverted: true,
        detail: 'REI reverts this address on reload (record is contact/owner-linked) — cannot change via the UI; needs a CSV/API pass',
        before: `${curStreet}${curCity ? ', ' + curCity : ''}`, after: `${newStreet}${newCity ? ', ' + newCity : ''}`,
      };
    }
    return {
      written: ok, skipped: false,
      detail: ok ? 'address normalized & reload-verified' : `not verified (street="${gotStreet}", city="${gotCity}")`,
      before: `${curStreet}${curCity ? ', ' + curCity : ''}`,
      after: `${newStreet}${newCity ? ', ' + newCity : ''}`,
    };
  }

  /** Fill a visible field and fire input/change so REI's handler sees it. */
  async _fill(sel, value) {
    const loc = this.page.locator(sel).first();
    await loc.fill(value).catch(() => {});
    await this.page.evaluate((s) => {
      const el = document.querySelector(s);
      if (el) { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.blur && el.blur(); }
    }, sel).catch(() => {});
  }
}

module.exports = { AddressWriter };
