'use strict';

/**
 * Auto note-writer. For review / held / duplicate leads the bot writes the
 * explanatory note into REI itself (property Notes / communication tab) so no
 * person has to. Property notes: /properties/details/{id}/communication
 *
 * Best-effort selectors — confirm with:  node diagnose.js notes <id>
 * then adjust here if needed.
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

  /**
   * Write a note on the property. Returns { written: boolean, detail }.
   */
  async writeNote(id, text) {
    if (!text) return { written: false, detail: 'no text' };
    await this.page.goto(this._url(id), { waitUntil: 'domcontentloaded' }).catch(() => {});
    await this.page.waitForTimeout(1000);

    // Open the composer if there's an "Add Note" trigger.
    const addBtn = this.page.getByRole('button', { name: /add note|new note|\+ note/i });
    if (await addBtn.first().isVisible({ timeout: 1500 }).catch(() => false)) {
      await addBtn.first().click().catch(() => {});
      await this.page.waitForTimeout(600);
    }

    // Find the note input (textarea, contenteditable, or a note-ish field).
    let field = this.page.getByPlaceholder(/note/i);
    if (!(await field.first().isVisible().catch(() => false))) field = this.page.locator('textarea');
    if (!(await field.first().isVisible().catch(() => false))) field = this.page.locator('[contenteditable="true"]');
    if (!(await field.first().isVisible().catch(() => false))) {
      return { written: false, detail: 'note field not found (map with: node diagnose.js notes <id>)' };
    }

    const tagged = `[Auto-cleanup] ${text}`;
    await field.first().click().catch(() => {});
    await field.first().fill(tagged).catch(async () => { await this.page.keyboard.type(tagged, { delay: 20 }); });

    // Save / Add / Post.
    const save = this.page.getByRole('button', { name: /save|add note|post|submit/i });
    if (await save.first().isVisible({ timeout: 1500 }).catch(() => false)) {
      await save.first().click().catch(() => {});
    } else {
      await this.page.keyboard.press('Enter').catch(() => {});
    }
    const ok = await this.page.getByText(/successfully|note added|saved/i).first()
      .waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
    return { written: true, detail: ok ? 'note saved (confirmation seen)' : 'note submitted (no confirmation text)' };
  }
}

module.exports = { Notes };
