'use strict';

const fs = require('fs');
const path = require('path');

const { launch, close } = require('./browser');
const { ensureLoggedIn } = require('./login');
const { Pipeline } = require('./pipeline');
const { Property } = require('./property');
const { Contact } = require('./contact');
const { Activity } = require('./activity');
const { Updater } = require('./updater');
const { Reporter } = require('./reporter');
const { classify } = require('./status-rules');
const { reviewAddress } = require('./address');
const { findDuplicates, normalizeAddress } = require('./duplicates');

function nowIso() { return new Date().toISOString(); }

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(path.resolve(p), 'utf8')); } catch { return fallback; }
}
function writeJson(p, data) {
  fs.mkdirSync(path.dirname(path.resolve(p)), { recursive: true });
  fs.writeFileSync(path.resolve(p), JSON.stringify(data, null, 2));
}

class Controller {
  constructor(settings, selectors, log) {
    this.settings = settings;
    this.selectors = selectors;
    this.log = log;
    this.stopRequested = false;
    for (const d of ['screenshotsBefore', 'screenshotsAfter', 'screenshotsErrors']) {
      fs.mkdirSync(path.resolve(settings.paths[d]), { recursive: true });
    }
  }

  stop() { this.stopRequested = true; }

  async run() {
    const { AUDIT_MODE, LIVE_MODE, MAX_LEADS_PER_RUN } = this.settings.mode;
    if (AUDIT_MODE && LIVE_MODE) throw new Error('AUDIT_MODE and LIVE_MODE cannot both be true.');
    const mode = LIVE_MODE ? 'LIVE' : 'AUDIT';
    this.log(`Mode=${mode}  MAX_LEADS_PER_RUN=${MAX_LEADS_PER_RUN}`);

    const progress = readJson(this.settings.paths.progress, { completed: [] });
    const completed = new Set(progress.completed || []);
    const manualReview = readJson(this.settings.paths.manualReview, []);
    const duplicateQueue = readJson(this.settings.paths.duplicates, []);
    const reporter = new Reporter(this.settings);

    const { context, page } = await launch(this.settings);
    try {
      await ensureLoggedIn(page, this.settings, this.log);

      const pipeline = new Pipeline(page, this.selectors, this.settings, this.log);
      await pipeline.open();

      // Fresh run: start from the top of the New list.
      const leads = await pipeline.listNewLeads();
      this.log(`Found ${leads.length} New leads (processing from the top).`);

      // Duplicate detection across the visible New set (flag-only).
      const dupeGroups = findDuplicates(leads.map((l, i) => ({ propertyId: String(i), address: l.address })));
      const dupeKeys = new Set(dupeGroups.map((g) => g.key));

      const property = new Property(page, this.selectors, this.log);
      const contact = new Contact(page, this.selectors, this.log);
      const activity = new Activity(page, this.selectors, this.log);
      const updater = new Updater(page, property, this.settings, this.log);

      let processed = 0;
      for (const lead of leads) {
        if (this.stopRequested) { this.log('Stop requested — halting.'); break; }
        if (processed >= MAX_LEADS_PER_RUN) { this.log(`Reached MAX_LEADS_PER_RUN (${MAX_LEADS_PER_RUN}).`); break; }

        const { url } = await pipeline.openLead(lead.index);
        if (completed.has(url)) { this.log(`Skip (already done): ${lead.address}`); await pipeline.returnToPipeline(); continue; }

        const previousStatus = await property.currentStatus().catch(() => lead.statusText);

        // Contact + activity.
        let attached = false, contactName = '', collected = { activities: [], notes: [], tags: [] };
        try {
          await property.openContactsTab();
          attached = await contact.hasAttachedContact();
          if (attached) {
            const c = await contact.openAttachedContact();
            contactName = c.name;
            collected = await activity.collect();
            await page.goto(url, { waitUntil: 'domcontentloaded' }); // back to property
          }
        } catch (e) {
          this.log(`[warn] contact/activity read failed for ${lead.address}: ${e.message}`);
        }

        // Address review (flag-only unless configured).
        const addr = reviewAddress(
          { street: lead.address, city: lead.city, state: lead.state, zip: '' },
          { tidyStreetText: this.settings.address.tidyStreetText }
        );

        // Decision.
        const decision = classify(
          { hasContact: attached, tags: collected.tags, notes: collected.notes, activities: collected.activities },
          this.settings.marketStatus
        );

        const before = path.join(this.settings.paths.screenshotsBefore, `${processed}-${normalizeAddress(lead.address).replace(/\s+/g, '_') || 'lead'}.png`);
        if (LIVE_MODE && this.settings.run.screenshotsBefore) await property.screenshot(before);

        const isDupe = dupeKeys.has(normalizeAddress(lead.address));

        // Safety: never write a status off a low-confidence (heuristic) activity read.
        const heuristicBlock =
          LIVE_MODE &&
          decision.action === 'set_status' &&
          collected.confidence === 'heuristic' &&
          this.settings.run.requireStructuredActivityForLive;

        const needsManual =
          decision.action === 'manual_review' || decision.action === 'hold' ||
          !!addr.stateIssue || isDupe || heuristicBlock;

        let updatedStatus = '', attempted = false, saved = false, after = '';

        if (heuristicBlock) {
          this.log(`[hold] ${lead.address}: activity read was heuristic — not writing in LIVE. Confirm contact.activityItem selector first.`);
        } else if (LIVE_MODE && decision.action === 'set_status' && decision.marketStatusValue) {
          const res = await updater.applyAndVerify(url, decision.marketStatusValue);
          attempted = res.attempted; saved = res.saved;
          updatedStatus = saved ? decision.recommendedStatus : previousStatus;
          after = path.join(this.settings.paths.screenshotsAfter, `${processed}-${normalizeAddress(lead.address).replace(/\s+/g, '_') || 'lead'}.png`);
          if (this.settings.run.screenshotsAfter) await property.screenshot(after);
          if (!saved) this.log(`[FAILED SAVE] ${lead.address}: ${res.detail}`);
        } else if (AUDIT_MODE) {
          updatedStatus = ''; // audit makes no changes
        }

        // Queues.
        const manualReason = heuristicBlock
          ? 'Heuristic activity read — confirm contact.activityItem selector before writing.'
          : (decision.manualReviewReason || (addr.stateIssue ? `state:${addr.stateIssue}` : (isDupe ? 'possible duplicate' : 'hold')));
        if (needsManual) {
          manualReview.push({ address: lead.address, url, reason: manualReason, at: nowIso() });
        }
        if (isDupe) {
          duplicateQueue.push({ key: normalizeAddress(lead.address), address: lead.address, url, at: nowIso() });
        }

        reporter.add({
          property_address: lead.address,
          property_url: url,
          previous_status: previousStatus,
          recommended_status: decision.recommendedStatus,
          updated_status: updatedStatus,
          latest_activity_date: decision.latestActivity ? decision.latestActivity.timestamp : '',
          latest_activity_type: decision.latestActivity ? decision.latestActivity.type : '',
          latest_activity_summary: decision.latestActivity ? decision.latestActivity.summary : '',
          contact_name: contactName,
          contact_verified: attached,
          contact_corrected: false,
          address_corrected: addr.addressCorrected,
          state_issue: addr.stateIssue || '',
          possible_duplicate: isDupe,
          manual_review_required: !!needsManual,
          manual_review_reason: needsManual ? manualReason : '',
          update_attempted: attempted,
          update_saved: saved,
          before_screenshot: LIVE_MODE ? before : '',
          after_screenshot: after,
          processed_at: nowIso(),
        });

        completed.add(url);
        writeJson(this.settings.paths.progress, { completed: [...completed], updatedAt: nowIso() });
        writeJson(this.settings.paths.manualReview, manualReview);
        writeJson(this.settings.paths.duplicates, duplicateQueue);

        processed++;
        this.log(`[${processed}] ${lead.address} → ${decision.recommendedStatus} (${decision.action})${LIVE_MODE ? ` saved=${saved}` : ' [audit]'}`);

        await pipeline.returnToPipeline();
      }

      reporter.flush();
      const s = reporter.summary();
      this.log('\n===== RUN SUMMARY =====');
      this.log(`Total reviewed:     ${s.total}`);
      this.log(`Left as New:        ${s.leftNew}`);
      this.log(`Evaluating:         ${s.evaluating}`);
      this.log(`Under Contract:     ${s.underContract}`);
      this.log(`Closed:             ${s.closed}`);
      this.log(`Contacts verified:  ${s.contactsVerified}`);
      this.log(`Addresses cleaned:  ${s.addressesCleaned}`);
      this.log(`Duplicates flagged: ${s.duplicatesFlagged}`);
      this.log(`Manual review:      ${s.manualReview}`);
      this.log(`Failed updates:     ${s.failedUpdates}`);
      return s;
    } finally {
      await close(context);
    }
  }
}

module.exports = { Controller };
