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

    // NOTES mode: node diagnose.js notes <id>  -> reveal the property Notes UI.
    if (argId === 'notes') {
      const id = process.argv[3];
      if (!id) { log('Usage: node diagnose.js notes <propertyId>'); return; }
      const u = abs((settings.urls.propertyNotes || '/properties/details/{id}/communication').replace('{id}', id));
      await page.goto(u, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(2000);
      log(`\n== NOTES PAGE: ${u} ==`);
      for (const [name, sel] of [['textarea', 'textarea'], ['contenteditable', '[contenteditable="true"]'], ['inputs', 'input']]) {
        const loc = page.locator(sel); const n = await loc.count().catch(() => 0);
        log(`\n${name}: ${n}`);
        for (let i = 0; i < Math.min(n, 6); i++) {
          const ph = await loc.nth(i).getAttribute('placeholder').catch(() => '');
          const vis = await loc.nth(i).isVisible().catch(() => false);
          log(`  [${vis ? 'V' : '-'}] ${sel}  placeholder="${ph || ''}"`);
        }
      }
      const btns = page.getByRole('button'); const bn = await btns.count().catch(() => 0);
      log(`\nbuttons: ${bn}`);
      for (let i = 0; i < Math.min(bn, 25); i++) {
        const t = ((await btns.nth(i).innerText().catch(() => '')) || '').trim().replace(/\s+/g, ' ').slice(0, 30);
        if (t) log(`  "${t}"`);
      }
      log('\n== NOTES PAGE TEXT (first 25 lines) ==');
      log((await page.locator('body').innerText().catch(() => '')).split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 25).join('\n'));

      // Deep dump: the textarea's container + every clickable candidate (REI uses
      // non-<button> controls) so the composer + save control can be mapped.
      const info = await page.evaluate(() => {
        const out = { ta: null, clickables: [], noteEls: [] };
        const ta = document.querySelector('textarea');
        if (ta) { let p = ta; for (let i = 0; i < 3 && p.parentElement; i++) p = p.parentElement; out.ta = p.outerHTML.slice(0, 2000); }
        document.querySelectorAll('a,input[type=submit],input[type=button],[role=button],.btn,button,[onclick]').forEach((e) => {
          const t = (e.innerText || e.value || '').trim().slice(0, 30);
          const cls = (e.className || '').toString().slice(0, 45);
          if (t || /save|add|note|post|submit/i.test(cls)) out.clickables.push(e.tagName + ' [' + cls + '] "' + t + '"');
        });
        document.querySelectorAll('[class*=note i],[id*=note i]').forEach((e) => out.noteEls.push(e.tagName + '  ' + ((e.className || e.id) + '').slice(0, 55)));
        return out;
      }).catch(() => null);
      if (info) {
        log('\n== TEXTAREA CONTAINER HTML ==\n' + (info.ta || '(no textarea found)'));
        log('\n== CLICKABLE CANDIDATES (a / input / onclick / .btn) ==\n' + info.clickables.slice(0, 45).join('\n'));
        log('\n== NOTE-CLASSED ELEMENTS ==\n' + info.noteEls.slice(0, 30).join('\n'));
      }
      fs.mkdirSync(path.resolve(__dirname, 'dump'), { recursive: true });
      fs.writeFileSync(path.resolve(__dirname, 'dump/notes.html'), await page.content());
      log('\nSaved full notes-page HTML -> dump/notes.html');
      return;
    }

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
      await page.waitForLoadState('networkidle').catch(() => {});
      // Poll for the record content to render (loads via JS after the shell).
      let ctext = '';
      const dl = Date.now() + 12000;
      while (Date.now() < dl) {
        await page.waitForTimeout(1200);
        ctext = await page.locator('body').innerText().catch(() => '');
        if (/lead stage|call disposition|category|tags|call summary|notes|disposition|deal/i.test(ctext)) break;
      }
      log(`\n== CONTACT RECORD: ${recUrl} ==`);
      log(ctext.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 120).join('\n'));
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
