'use strict';

/**
 * Auto note-writer for REI BlackBook property Notes (/properties/details/{id}/communication).
 * Selectors confirmed live:
 *   - reveal link : a.btn.btn-link2.btn-lg  (text "Add Note") — textarea is hidden until clicked
 *   - textarea    : #new_note_content (class form-control)
 *   - save        : button.button-a.small (text "Submit", onclick newOrEditNote()); window.newOrEditNote() is global
 *   - saved notes : #note_display_table  (used to verify on reload — same silent-revert caveat as status)
 * jQuery is loaded on the page, so we set the value via jQuery + trigger change.
 */
class Notes {
  constructor(page, settings, log) {
    this.page = page;
    this.settings = settings;
    this.log = log;
  }

  _url(id) {
    const p = (this.settings.urls.propertyNotes || '/properties/details/{id}/communication').replace('{id}', id);
    return new URL(p, this.settings.urls.base).toString();
  }

  /** Write a note on the property and verify it persisted. Returns { written, detail }. */
  async writeNote(id, text) {
    if (!text) return { written: false, detail: 'no text' };
    const tagged = `[Auto-cleanup] ${text}`.replace(/\s+/g, ' ').trim().slice(0, 900);
    const url = this._url(id);
    await this.page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await this.page.waitForTimeout(1000);

    // 1. Reveal the composer.
    const addLink = this.page.locator('a.btn.btn-link2.btn-lg', { hasText: /add note/i });
    if (await addLink.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await addLink.first().click().catch(() => {});
      await this.page.waitForTimeout(500);
    }

    // 2. Set the textarea value (jQuery is present; also set the DOM value directly).
    const set = await this.page.evaluate((t) => {
      const el = document.querySelector('#new_note_content');
      if (!el) return false;
      el.value = t;
      if (window.jQuery) window.jQuery('#new_note_content').val(t).trigger('input').trigger('change');
      else { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
      return true;
    }, tagged).catch(() => false);
    if (!set) return { written: false, detail: 'textarea #new_note_content not found' };

    // 3. Save — click the Submit button, else call the global handler.
    const submit = this.page.locator('button.button-a.small', { hasText: /submit/i });
    if (await submit.first().isVisible({ timeout: 1500 }).catch(() => false)) {
      await submit.first().click().catch(() => {});
    } else {
      await this.page.evaluate(() => { if (typeof window.newOrEditNote === 'function') window.newOrEditNote(); }).catch(() => {});
    }
    await this.page.waitForTimeout(1500);

    // 4. Verify on reload: the note must appear in #note_display_table.
    await this.page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await this.page.waitForTimeout(1200);
    const present = await this.page.evaluate(() => {
      const tbl = document.querySelector('#note_display_table');
      return tbl ? tbl.innerText.includes('[Auto-cleanup]') : false;
    }).catch(() => false);
    return { written: present, detail: present ? 'note saved & verified in note_display_table' : 'submitted but not found on reload' };
  }
}

module.exports = { Notes };
