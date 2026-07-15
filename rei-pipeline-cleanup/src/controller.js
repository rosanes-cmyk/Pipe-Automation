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
const { reviewAddress, parseAddress } = require('./address');
const { AddressWriter } = require('./address-writer');
const { findDuplicates, normalizeAddress } = require('./duplicates');

function nowIso() { return new Date().toISOString(); }
function readJson(p, fallback) { try { return JSON.parse(fs.readFileSync(path.resolve(p), 'utf8')); } catch { return fallback; } }
function writeJson(p, data) { fs.mkdirSync(path.dirname(path.resolve(p)), { recursive: true }); fs.writeFileSync(path.resolve(p), JSON.stringify(data, null, 2)); }

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
    this.log(`Mode=${LIVE_MODE ? 'LIVE' : 'AUDIT'}  MAX_LEADS_PER_RUN=${MAX_LEADS_PER_RUN}`);

    // Fresh run (default): re-check the whole New bucket from the top, no skip.
    // Resume (--resume): continue an interrupted run, skipping leads already done.
    const resume = !!this.settings.mode.RESUME;
    let completed, manualReview, duplicateQueue;
    if (resume) {
      const progress = readJson(this.settings.paths.progress, { completed: [] });
      completed = new Set(progress.completed || []);
      manualReview = readJson(this.settings.paths.manualReview, []);
      duplicateQueue = readJson(this.settings.paths.duplicates, []);
      this.log(`RESUME: continuing; skipping ${completed.size} lead(s) already done this run.`);
    } else {
      completed = new Set();
      manualReview = [];
      duplicateQueue = [];
      writeJson(this.settings.paths.progress, { completed: [], startedAt: nowIso() });
      this.log('Fresh run: re-checking the whole New bucket from the top (no skip).');
    }
    const reporter = new Reporter(this.settings);

    const { context, page } = await launch(this.settings);
    try {
      await ensureLoggedIn(page, this.settings, this.log);

      let leads;
      if (this.settings.mode.TARGET_ID) {
        const id = String(this.settings.mode.TARGET_ID);
        leads = [{ id, address: `(id ${id})`, url: new URL(`/properties/details/${id}`, this.settings.urls.base).toString() }];
        this.log(`Targeted run: single lead id=${id}`);
      } else {
        const pipeline = new Pipeline(page, this.selectors, this.settings, this.log);
        await pipeline.open();
        leads = await pipeline.listNewLeads();
        this.log(`Found ${leads.length} New-bucket leads (processing from the top).`);
      }

      // Duplicate detection across the visible New set (flag-only).
      const dupeGroups = findDuplicates(leads.map((l) => ({ propertyId: l.id, address: l.address })));
      const dupeKeys = new Set(dupeGroups.map((g) => g.key));

      const property = new Property(page, this.settings, this.log);
      const contact = new Contact(page, this.settings, this.log);
      const activity = new Activity(page, this.settings, this.log);
      const updater = new Updater(page, property, this.settings, this.log);
      const { Notes } = require('./notes');
      const notes = new Notes(page, this.settings, this.log);
      const addressWriter = new AddressWriter(page, this.settings, this.log);

      let processed = 0;
      for (const lead of leads) {
        if (this.stopRequested) { this.log('Stop requested — halting.'); break; }
        if (processed >= MAX_LEADS_PER_RUN) { this.log(`Reached MAX_LEADS_PER_RUN (${MAX_LEADS_PER_RUN}).`); break; }
        if (completed.has(lead.id)) continue;

        try {
          await this._processLead({ lead, property, contact, activity, updater, notes, addressWriter, reporter,
            dupeKeys, manualReview, duplicateQueue, LIVE_MODE, AUDIT_MODE, processed });
        } catch (e) {
          this.log(`[error] ${lead.address} (${lead.id}): ${e.message}`);
          reporter.add({ property_address: lead.address, property_url: lead.url, manual_review_required: true,
            manual_review_reason: `error: ${e.message}`, processed_at: nowIso() });
        }

        completed.add(lead.id);
        writeJson(this.settings.paths.progress, { completed: [...completed], updatedAt: nowIso() });
        writeJson(this.settings.paths.manualReview, manualReview);
        writeJson(this.settings.paths.duplicates, duplicateQueue);
        processed++;
      }

      reporter.flush();
      reporter.appendDaily(LIVE_MODE ? 'LIVE' : 'AUDIT');
      try {
        const { writeDashboard } = require('./dashboard');
        const out = writeDashboard(this.settings);
        this.log(`Dashboard updated -> ${out}`);
      } catch (e) { this.log(`[dashboard] ${e.message}`); }
      this._printSummary(reporter, LIVE_MODE);
      return reporter.summary();
    } finally {
      await close(context);
    }
  }

  async _processLead(ctx) {
    const { lead, property, contact, activity, updater, notes, addressWriter, reporter, dupeKeys, manualReview, duplicateQueue, LIVE_MODE, AUDIT_MODE, processed } = ctx;

    // 1. Skip the lead-sheet pre-read for speed — the decision doesn't need the
    //    current status, and the LIVE writer opens the lead sheet itself.
    const previousStatus = '';

    // 2. Attached contact -> contactId.
    const att = await contact.attachedContact(lead.id).catch(() => null);
    const hasContact = !!(att && att.contactId);
    const contactName = att ? att.name : '';

    // 3. Activity from the contact record.
    let collected = { activities: [], notes: [], tags: [], confidence: 'empty' };
    if (hasContact) collected = await activity.collect(att.contactId).catch(() => collected);

    // 4. Address review — parse the combined address into parts so the Street/
    //    City/ZIP can be tidied while the State field is left untouched (SOP §6-7).
    const parsed = parseAddress(lead.address);
    const addr = reviewAddress(parsed, { tidyStreetText: this.settings.address.tidyStreetText });
    // Geocoded one-field address ("..., CA, USA") — flag, cannot fix in UI.
    const geocoded = /,\s*[A-Z]{2},\s*USA$/i.test(lead.address);

    // 5. Decision.
    const decision = classify(
      {
        hasContact, tags: collected.tags, notes: collected.notes, activities: collected.activities,
        leadStage: collected.leadStage, disposition: collected.disposition, hasOutreach: collected.hasOutreach,
      },
      this.settings.marketStatus
    );

    const isDupe = dupeKeys.has(normalizeAddress(lead.address));
    const needsManual = decision.action === 'manual_review' || decision.action === 'hold' || isDupe || geocoded;

    // 6. Screenshots + write (LIVE only).
    const slug = (normalizeAddress(lead.address).replace(/\s+/g, '_') || lead.id);
    let updatedStatus = '', attempted = false, saved = false, after = '';
    const before = path.join(this.settings.paths.screenshotsBefore, `${processed}-${slug}.png`);

    if (LIVE_MODE && decision.action === 'set_status' && decision.marketStatusValue) {
      if (this.settings.run.screenshotsBefore) await property.screenshot(before);
      const res = await updater.applyAndVerify(lead.id, decision.marketStatusValue);
      attempted = res.attempted; saved = res.saved;
      updatedStatus = saved ? decision.recommendedStatus : previousStatus;
      after = path.join(this.settings.paths.screenshotsAfter, `${processed}-${slug}.png`);
      if (this.settings.run.screenshotsAfter) await property.screenshot(after);
      if (!saved) this.log(`[FAILED SAVE] ${lead.address}: ${res.detail}`);
    }

    // Address write-back (LIVE, gated). The writer reads the record's own
    // Street/City fields and normalizes only their formatting (suffix/casing/
    // trailing space), reload-verified. State + ZIP are left untouched. Skipped
    // for geocoded one-field blobs (can't be fixed in the UI) and no-ops safely
    // when writeToRei is off. Runs per-lead because a form's trailing space /
    // casing isn't visible from the list view.
    let addressWritten = false, addressWriteDetail = '', cleanedAddress = '';
    if (LIVE_MODE && !geocoded) {
      const res = await addressWriter
        .tidyAndVerify(lead.id)
        .catch((e) => ({ written: false, skipped: false, detail: e.message }));
      addressWritten = res.written;
      addressWriteDetail = res.detail;
      if (res.written) cleanedAddress = res.after || '';
      if (res.reverted) addr.flags.push('Address not changeable in the UI — REI reverts it (contact/owner-linked). Needs a CSV/API pass.');
      else if (!res.written && !res.skipped) addr.flags.push(`Address tidy not written: ${res.detail}`);
      const word = res.written ? `normalized -> ${res.after}`
        : res.reverted ? 'not changeable in UI (REI reverts it — contact-linked)'
        : res.skipped ? `skipped (${res.detail})` : 'NOT written';
      this.log(`[address] ${lead.address}: ${word} — ${res.detail}`);
    }

    const manualReason = geocoded ? 'Geocoded one-field address (,CA,USA) — cannot fix in UI; flag.'
      : (decision.manualReviewReason || (isDupe ? 'possible duplicate' : ''));

    // Auto-write the note into REI for review/held/duplicate leads (no person needed).
    let noteWritten = false;
    if (LIVE_MODE && needsManual && this.settings.run.autoWriteNotes) {
      const noteText = isDupe
        ? `Possible duplicate of another pipeline record (same address). ${decision.note || ''}`.trim()
        : (decision.note || manualReason || 'Flagged by pipeline cleanup — needs review.');
      const res = await notes.writeNote(lead.id, noteText).catch((e) => ({ written: false, detail: e.message }));
      noteWritten = res.written;
      const word = res.skipped ? 'already noted (skipped)' : (res.written ? 'written' : 'NOT written');
      this.log(`[note] ${lead.address}: ${word} — ${res.detail}`);
    }

    if (needsManual) manualReview.push({ id: lead.id, address: lead.address, url: lead.url, reason: manualReason, noteWritten, at: nowIso() });
    if (isDupe) duplicateQueue.push({ key: normalizeAddress(lead.address), id: lead.id, address: lead.address, url: lead.url, at: nowIso() });

    reporter.add({
      property_address: lead.address,
      property_url: lead.url,
      previous_status: previousStatus,
      recommended_status: decision.recommendedStatus,
      updated_status: updatedStatus,
      latest_activity_date: decision.latestActivity ? decision.latestActivity.timestamp : '',
      latest_activity_type: decision.latestActivity ? decision.latestActivity.type : '',
      latest_activity_summary: decision.latestActivity ? decision.latestActivity.summary : '',
      contact_name: contactName,
      contact_verified: hasContact,
      contact_corrected: false,
      address_corrected: LIVE_MODE ? addressWritten : addr.addressCorrected,
      address_written: addressWritten,
      cleaned_address: cleanedAddress || (addr.addressCorrected
        ? [addr.cleaned.street, addr.cleaned.city, addr.cleaned.zip].filter(Boolean).join(', ')
        : ''),
      address_write_detail: addressWriteDetail,
      state_issue: addr.stateIssue || (geocoded ? 'geocoded' : ''),
      possible_duplicate: isDupe,
      manual_review_required: !!needsManual,
      manual_review_reason: needsManual ? manualReason : '',
      update_attempted: attempted,
      update_saved: saved,
      before_screenshot: LIVE_MODE ? before : '',
      after_screenshot: after,
      processed_at: nowIso(),
    });

    // Show the actual Market Status value that will be written (e.g. "Dead",
    // "Follow up") rather than the internal pipeline-category name ("Closed").
    const shown = (decision.action === 'set_status' && decision.marketStatusValue)
      ? decision.marketStatusValue : decision.recommendedStatus;
    this.log(`[${processed + 1}] ${lead.address} (${lead.id}) → ${shown} (${decision.action})` +
      `${hasContact ? ` contact=${contactName || att.contactId}` : ' no-contact'}${LIVE_MODE ? ` saved=${saved}` : ' [audit]'}`);
  }

  _printSummary(reporter, LIVE_MODE) {
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
  }
}

module.exports = { Controller };
