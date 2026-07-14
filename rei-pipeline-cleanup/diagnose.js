'use strict';

/**
 * READ-ONLY diagnostic. Opens the top New lead and prints how REI structures
 * the attached contact + activity, so selectors can be mapped precisely.
 * Changes nothing. Run: node diagnose.js
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
  const { context, page } = await launch(settings);
  try {
    await ensureLoggedIn(page, settings, log);
    const pipeline = new Pipeline(page, selectors, settings, log);
    await pipeline.open();
    const leads = await pipeline.listNewLeads();
    log(`\nNew leads found: ${leads.length}`);
    if (!leads.length) return;

    const { url } = await pipeline.openLead(leads[0].index);
    log(`\n== PROPERTY URL ==\n${url}`);

    async function dumpContactLinks(tag) {
      const links = page.locator('a[href*="/contact"]');
      const n = await links.count().catch(() => 0);
      log(`\n== ${tag}: ${n} link(s) containing /contact ==`);
      for (let i = 0; i < Math.min(n, 25); i++) {
        const href = await links.nth(i).getAttribute('href').catch(() => '');
        const vis = await links.nth(i).isVisible().catch(() => false);
        const txt = ((await links.nth(i).innerText().catch(() => '')) || '').trim().replace(/\s+/g, ' ').slice(0, 40);
        log(`  [${vis ? 'V' : '-'}] ${href}   "${txt}"`);
      }
    }

    await dumpContactLinks('BEFORE clicking CONTACTS tab');

    log('\n== Tab labels present on the property page ==');
    for (const w of ['LEAD SHEET', 'CONTACTS', 'REPAIR LIST', 'COMPS', 'ANALYZER', 'TASKS', 'UPLOADS', 'NOTES', 'MARKETING']) {
      const c = await page.getByText(new RegExp('^' + w + '$', 'i')).count().catch(() => 0);
      log(`  ${w}: ${c} match(es)`);
    }

    // Click the lowest "Contacts" text (the property tab, not the top nav).
    const cands = page.getByText(/^contacts$/i);
    const cn = await cands.count().catch(() => 0);
    let best = null, by = -1;
    for (let i = 0; i < cn; i++) {
      const b = await cands.nth(i).boundingBox().catch(() => null);
      if (b && b.y > by) { by = b.y; best = cands.nth(i); }
    }
    if (best) { await best.click().catch(() => {}); await page.waitForTimeout(1500); log('\n(clicked lowest CONTACTS text at y=' + Math.round(by) + ')'); }

    await dumpContactLinks('AFTER clicking CONTACTS tab');

    fs.mkdirSync(path.resolve(__dirname, 'dump'), { recursive: true });
    fs.writeFileSync(path.resolve(__dirname, 'dump/property.html'), await page.content());
    log('\nSaved full property HTML -> dump/property.html');

    // Open the first real contact record (/contacts/{number}) if present.
    const recs = page.locator('a[href*="/contacts/"]');
    const rn = await recs.count().catch(() => 0);
    let opened = false;
    for (let i = 0; i < rn; i++) {
      const href = await recs.nth(i).getAttribute('href').catch(() => '');
      if (href && /\/contacts\/\d+/.test(href)) {
        await page.goto(new URL(href, page.url()).toString(), { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1500);
        log(`\n== OPENED CONTACT RECORD: ${href} ==`);
        fs.writeFileSync(path.resolve(__dirname, 'dump/contact.html'), await page.content());
        const text = (await page.locator('body').innerText().catch(() => ''))
          .split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 80).join('\n');
        log('\n== CONTACT PAGE TEXT (first 80 lines) ==\n' + text);
        opened = true;
        break;
      }
    }
    if (!opened) log('\nNo /contacts/{number} record link found — the contact may be shown inline or under a different control.');
    log('\n(Diagnostic complete. dump/property.html and dump/contact.html saved for detailed selector mapping.)');
  } catch (e) {
    log('DIAG ERROR: ' + e.message);
  } finally {
    await close(context);
  }
})();
