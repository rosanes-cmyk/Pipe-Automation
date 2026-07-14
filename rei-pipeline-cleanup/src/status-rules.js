'use strict';

/**
 * SOP status decision engine (pure, no I/O — unit-tested).
 *
 * Decides the correct pipeline stage for a property from the LATEST relevant
 * activity on its attached contact. Mirrors SOP v2 and the July-11 handoff:
 *   - Decide on notes/activity, never on tags.
 *   - Read the attached CONTACT, not the property Notes tab.
 *   - Under Contract / Closed Market Status values are unconfirmed (SOP v2 §8):
 *     when we determine one of those stages but the mapping is not configured,
 *     HOLD + flag for manual review rather than guess.
 *
 * Input shape:
 *   {
 *     hasContact: boolean,
 *     tags: string[],
 *     notes: string[],                                  // free text
 *     activities: [{ type, timestamp, summary, inbound }] // type: call|text|email|comps|offer|contract|note|task
 *   }
 * marketStatus config: { Evaluating, UnderContract, ClosedWon, ClosedDead }
 *
 * Returns:
 *   {
 *     recommendedStatus: 'New'|'Evaluating'|'Under Contract'|'Closed',
 *     action: 'leave_new'|'set_status'|'hold'|'manual_review',
 *     marketStatusValue: string|null,   // value to write, or null
 *     reason: string,
 *     note: string|null,                 // written to REI for hold/manual_review
 *     latestActivity: object|null,
 *     manualReviewReason: string|null
 *   }
 */

const OUTREACH = new Set(['call', 'text', 'email', 'comps', 'offer']);

const DEAD_TAG = [/dead\s*lead/i, /lost\s*deal/i, /not\s*interested/i, /remove\s*from\s*list/i, /unresponsive/i, /invalid\s*contact/i];
const CLOSED_DEAD = [/\bdead\b/i, /deal\s*(is\s*)?dead/i, /closed\s*lost/i, /no\s*further\s*action/i];
const CLOSED_WON = [/closed\s*won/i, /deal\s*closed/i, /\bsold\b/i, /\bfunded\b/i];
const UNDER_CONTRACT = [/under\s*contract/i, /signed\s*contract/i, /accepted\s*offer/i, /contract\s*signed/i];
const REENGAGE = [/re-?inquiry/i, /re-?engag/i, /still\s*interested/i, /reached\s*back\s*out/i, /new\s*inquiry/i, /circled\s*back/i, /following\s*up\s*again/i];

const matchesAny = (text, patterns) => patterns.some((p) => p.test(text || ''));
const hasDeadTag = (tags) => matchesAny((tags || []).join(' | '), DEAD_TAG);

function latestActivity(activities) {
  if (!activities || activities.length === 0) return null;
  return activities
    .slice()
    .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')))[0];
}

function latestOutreachTs(activities) {
  const ts = (activities || [])
    .filter((a) => OUTREACH.has(a.type) && a.timestamp)
    .map((a) => a.timestamp)
    .sort();
  return ts.length ? ts[ts.length - 1] : 'unknown';
}

function holdOrSet(stage, value, reason) {
  if (value) {
    return { recommendedStatus: stage, action: 'set_status', marketStatusValue: value, reason, note: null, manualReviewReason: null };
  }
  return {
    recommendedStatus: stage,
    action: 'hold',
    marketStatusValue: null,
    reason: `${reason} — Market Status value for '${stage}' is unconfirmed (SOP v2 §8); holding.`,
    note: `Determined stage '${stage}' but its Market Status value is not yet confirmed. Holding write pending confirmation.`,
    manualReviewReason: `Awaiting Market Status mapping for '${stage}'.`,
  };
}

// Map the contact's Lead Stage / Call Disposition text to a pipeline stage.
// This is the PRIMARY signal — it is how the rep categorized the lead.
function stageFromSignals(leadStage, disposition) {
  const s = `${leadStage || ''} ${disposition || ''}`.toLowerCase();
  if (!s.trim() || s.trim() === '-') return null;
  if (/under\s*contract|accepted\s*offer|contract\s*(sent|signed|pending)|in\s*escrow|closing/.test(s)) return 'UnderContract';
  if (/\bclosed\s*won\b|\bsold\b|\bfunded\b|deal\s*closed|completed\s*sale/.test(s)) return 'ClosedWon';
  if (/\bdead\b|\blost\b|not\s*interested|wrong\s*number|do\s*not\s*(mail|call|contact)|\bdnc\b|unqualified|invalid|declined|remove\s*from\s*list|trash|bad\s*(number|lead)|we\s*passed/.test(s)) return 'ClosedDead';
  if (/\breview\b|for\s*review|needs?\s*review|to\s*review|manual\s*review/.test(s)) return 'Review';
  if (/follow\s*up|interested|nurtur|made?\s*an?\s*offer|\boffer\b|appointment|property\s*visit|\bwarm\b|\bhot\b|contacted|negotiat|callback|call\s*back|left\s*(a\s*)?(voicemail|message|vm)|answered|spoke|attempt|working|in\s*progress/.test(s)) return 'Evaluating';
  if (/new\s*lead|^\s*\d*\s*new\b|^\s*new\s*$/.test(s)) return 'New';
  return null;
}

function classify(input, marketStatus) {
  const ms = marketStatus || {};
  const notes = (input.notes || []).join(' \n ');
  const activities = input.activities || [];
  const latest = latestActivity(activities);
  const base = { latestActivity: latest };
  const hasOutreach = !!input.hasOutreach || activities.some((a) => OUTREACH.has(a.type));

  // 1. Nothing at all -> New.
  if (!input.hasContact && activities.length === 0 && (input.notes || []).length === 0 && !input.leadStage) {
    return { ...base, recommendedStatus: 'New', action: 'leave_new', marketStatusValue: null,
      reason: 'No attached contact and no activity — correct as New.', note: null, manualReviewReason: null };
  }

  // 2. Lead Stage / Call Disposition — the primary signal.
  const signalStage = stageFromSignals(input.leadStage, input.disposition);
  const label = input.leadStage ? `Lead Stage "${input.leadStage}"` : (input.disposition ? `disposition "${input.disposition}"` : 'signals');
  if (signalStage === 'Evaluating') {
    return { ...base, recommendedStatus: 'Evaluating', action: 'set_status', marketStatusValue: ms.Evaluating || null,
      reason: `${label} indicates an active/worked lead.`, note: null, manualReviewReason: null };
  }
  if (signalStage === 'UnderContract') {
    return { ...base, ...holdOrSet('Under Contract', ms.UnderContract, `${label} indicates under contract.`) };
  }
  if (signalStage === 'ClosedWon') {
    return { ...base, ...holdOrSet('Closed', ms.ClosedWon, `${label} indicates a completed sale.`) };
  }
  if (signalStage === 'ClosedDead') {
    // Dead stage that conflicts with a re-engagement note -> manual review.
    if (matchesAny(notes, REENGAGE)) {
      return { ...base, recommendedStatus: 'New', action: 'manual_review', marketStatusValue: null,
        reason: `${label} indicates dead, but a re-engagement note conflicts.`,
        note: 'Dead lead stage vs. a later re-inquiry — left as-is for manual review.', manualReviewReason: 'Dead vs. re-inquiry conflict.' };
    }
    return { ...base, ...holdOrSet('Closed', ms.ClosedDead, `${label} indicates a dead/lost lead.`) };
  }
  if (signalStage === 'New') {
    return { ...base, recommendedStatus: 'New', action: 'leave_new', marketStatusValue: null,
      reason: `${label} is a New/unworked stage.`, note: null, manualReviewReason: null };
  }
  if (signalStage === 'Review') {
    return { ...base, recommendedStatus: 'New', action: 'manual_review', marketStatusValue: null,
      reason: `${label} indicates the lead is flagged for review.`,
      note: 'Lead Stage / disposition is a review status — left as-is for a human to decide.',
      manualReviewReason: 'Marked for review in REI.' };
  }

  // 3. Lead Stage blank/unrecognized, but outreach was logged -> borderline,
  //    send to manual review (not New).
  if (hasOutreach) {
    return { ...base, recommendedStatus: 'New', action: 'manual_review', marketStatusValue: null,
      reason: 'Outreach (call/text) logged but Lead Stage is blank — borderline, needs review.',
      note: 'Outbound/inbound contact logged but no Lead Stage set. Left as-is for manual review.',
      manualReviewReason: 'Outreach but blank Lead Stage.' };
  }

  // 4. Contact/notes present but no stage and no outreach -> New (imported, not worked).
  return { ...base, recommendedStatus: 'New', action: 'leave_new', marketStatusValue: null,
    reason: input.hasContact ? 'Contact attached but no Lead Stage or outreach — correct as New.' : 'No activity — correct as New.',
    note: null, manualReviewReason: null };
}

module.exports = { classify, latestActivity, stageFromSignals, OUTREACH };
