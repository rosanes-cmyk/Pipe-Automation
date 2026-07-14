'use strict';

/**
 * READ-ONLY diagnostic for the contact/activity path.
 *
 *   node diagnose.js            -> uses the top New lead
 *   node diagnose.js 3184299    -> uses the property with that id
 *
 * Prints how the contacts tab links the attached contact and what the contact
 * record page contains. Changes nothing.
 */

const fs = require('fs');
const path = require('path');
const { launch, close } = require('./src/browser');
const { ensureLoggedIn } = require('./src/login');
const { Pipeline } = require('./src/pipeline');

function load(p) { return JSON.parse(fs.readFileSync(path.resolve(__dirname, p), 'utf8')); }
const log = (m) => console.log(m);

(async () => {
  const settings = load('config/settings.json');
  const selectors = load('config/selectors.json');
  const argId = process.argv[2];
  const base = settings.urls.base;
  const abs = (p) => new URL(p, base).toString();
  const { context, page } = await launch(settings);
  try {
    await ensureLoggedIn(page, settings, log);

    // SCAN mode: node diagnose.js scan  -> find New leads that HAVE a contact.
    if (argId === 'scan') {
      const pipeline = new Pipeline(page, selectors, settings, log);
      await pipeline.open();
      const leads = await pipeline.listNewLeads();
      log(`\n== SCAN: checking up to 30 of ${leads.length} New leads for attached contacts ==`);
      let firstHit = null;
      for (let i = 0; i < Math.min(leads.length, 30); i++) {
        const l = leads[i];
        const cUrl = abs(settings.urls.contactsTab.replace('{id}', l.id));
        await page.goto(cUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
        await page.waitForTimeout(700);
        const cnt = await page.locator('a[href*="_panel_content"]').count().catch(() => 0);
        log(`  ${cnt > 0 ? '● ' + cnt : '·  '}  ${l.id}  ${l.address}`);
        if (cnt > 0 && !firstHit) firstHit = l;
      }
      if (firstHit) {
        log(`\nFirst New lead WITH a contact: ${firstHit.id} (${firstHit.address}). Dumping its contact record...`);
        process.argv[2] = firstHit.id; // fall through to detailed dump below
      } else {
        log('\nNo New lead in the sample has an attached contact (contacts tab shows the empty state).');
        log('That means most/all New-bucket leads here are un-worked → correctly left as New.');
        log('To confirm detection works, run: node diagnose.js <id-of-a-Follow-up-lead>');
        return;
      }
    }

    let propId = (process.argv[2] === 'scan') ? null : process.argv[2];
    if (!propId) {
      const pipeline = new Pipeline(page, selectors, settings, log);
      await pipeline.open();
      const leads = await pipeline.listNewLeads();
      if (!leads.length) { log('No New leads.'); return; }
      propId = leads[0].id;
    }
    log(`\n== TARGET PROPERTY ID: ${propId} ==`);

    // Lead sheet
    const leadSheet = abs(settings.urls.leadSheet.replace('{id}', propId));
    await page.goto(leadSheet, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(1200);
    log(`\n== LEAD SHEET: ${leadSheet} ==`);
    log((await page.locator('body').innerText().catch(() => '')).split('\n').map(s => s.trim()).filter(Boolean).slice(0, 25).join('\n'));

    // Contacts tab
    const contactsUrl = abs(settings.urls.contactsTab.replace('{id}', propId));
    await page.goto(contactsUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(1500);
    log(`\n== CONTACTS TAB: ${contactsUrl} ==`);

    const panels = page.locator('a[href*="_panel_content"]');
    const pn = await panels.count().catch(() => 0);
    log(`\n_panel_content anchors: ${pn}`);
    for (let i = 0; i < Math.min(pn, 10); i++) {
      const href = await panels.nth(i).getAttribute('href').catch(() => '');
      const txt = ((await panels.nth(i).innerText().catch(() => '')) || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      log(`  ${href}   "${txt}"`);
    }

    log('\n== CONTACTS TAB — all links (first 30) ==');
    const all = page.locator('a');
    const an = await all.count().catch(() => 0);
    for (let i = 0; i < Math.min(an, 30); i++) {
      const href = await all.nth(i).getAttribute('href').catch(() => '');
      const txt = ((await all.nth(i).innerText().catch(() => '')) || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      if (txt || (href && href !== '#')) log(`  ${href}   "${txt}"`);
    }

    log('\n== CONTACTS TAB — visible text (first 40 lines) ==');
    log((await page.locator('body').innerText().catch(() => '')).split('\n').map(s => s.trim()).filter(Boolean).slice(0, 40).join('\n'));

    // Contact record
    let contactId = null;
    for (let i = 0; i < pn; i++) {
      const href = await panels.nth(i).getAttribute('href').catch(() => '');
      const m = href && href.match(/#?(\d+)_panel_content/);
      if (m) { contactId = m[1]; break; }
    }
    if (contactId) {
      const recUrl = abs(settings.urls.contactRecord.replace('{contactId}', contactId));
      await page.goto(recUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(1500);
      log(`\n== CONTACT RECORD: ${recUrl} ==`);
      log((await page.locator('body').innerText().catch(() => '')).split('\n').map(s => s.trim()).filter(Boolean).slice(0, 80).join('\n'));
    } else {
      log('\nNo _panel_content contactId found on the contacts tab (no attached contact, or it renders differently).');
    }
    log('\n(Diagnostic complete.)');
  } catch (e) {
    log('DIAG ERROR: ' + e.message);
  } finally {
    await close(context);
  }
})();
