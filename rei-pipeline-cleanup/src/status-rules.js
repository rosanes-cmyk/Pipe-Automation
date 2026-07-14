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
// This is the primary signal (it IS how the rep categorized the lead).
function stageFromSignals(leadStage, disposition) {
  const s = `${leadStage || ''} ${disposition || ''}`.toLowerCase();
  if (!s.trim()) return null;
  if (/under\s*contract|accepted\s*offer|contract\s*(sent|signed|pending)|in\s*escrow|closing/.test(s)) return 'UnderContract';
  if (/\bclosed\s*won\b|\bsold\b|\bfunded\b|deal\s*closed/.test(s)) return 'ClosedWon';
  if (/\bdead\b|\blost\b|not\s*interested|wrong\s*number|do\s*not\s*(mail|call|contact)|\bdnc\b|unqualified|invalid|declined|remove\s*from\s*list|trash|bad\s*(number|lead)/.test(s)) return 'ClosedDead';
  if (/follow\s*up|interested|nurtur|made?\s*an?\s*offer|\boffer\b|appointment|property\s*visit|\bwarm\b|\bhot\b|contacted|negotiat|callback|call\s*back|left\s*(a\s*)?(voicemail|message|vm)|answered|spoke|attempt|working|in\s*progress/.test(s)) return 'Evaluating';
  return null;
}

function classify(input, marketStatus) {
  const ms = marketStatus || {};
  const tags = input.tags || [];
  const notes = (input.notes || []).join(' \n ');
  const activities = input.activities || [];
  const latest = latestActivity(activities);
  const base = { latestActivity: latest };

  // 1. Untouched -> stays New.
  if (!input.hasContact && activities.length === 0 && (input.notes || []).length === 0 && !input.leadStage) {
    return { ...base, recommendedStatus: 'New', action: 'leave_new', marketStatusValue: null,
      reason: 'No attached contact and no activity — correct as New.', note: null, manualReviewReason: null };
  }

  // 1b. Lead Stage / Call Disposition is the primary signal (how the rep
  //     categorized the lead). Use it before falling back to notes/activity.
  const signalStage = stageFromSignals(input.leadStage, input.disposition);
  const stageLabel = input.leadStage ? `Lead Stage "${input.leadStage}"` : `disposition "${input.disposition}"`;
  if (signalStage === 'Evaluating') {
    return { ...base, recommendedStatus: 'Evaluating', action: 'set_status', marketStatusValue: ms.Evaluating || null,
      reason: `${stageLabel} indicates an active/worked lead.`, note: null, manualReviewReason: null };
  }
  if (signalStage === 'UnderContract') {
    return { ...base, ...holdOrSet('Under Contract', ms.UnderContract, `${stageLabel} indicates under contract.`) };
  }
  if (signalStage === 'ClosedWon') {
    return { ...base, ...holdOrSet('Closed', ms.ClosedWon, `${stageLabel} indicates closed (won).`) };
  }
  if (signalStage === 'ClosedDead') {
    // A dead stage that conflicts with a re-engagement note -> manual review.
    if (matchesAny(notes, REENGAGE)) {
      return { ...base, recommendedStatus: 'New', action: 'manual_review', marketStatusValue: null,
        reason: `${stageLabel} indicates dead, but a re-engagement note conflicts.`,
        note: 'Dead lead stage vs. a later re-inquiry — left as-is for manual review.', manualReviewReason: 'Dead vs. re-inquiry conflict.' };
    }
    return { ...base, ...holdOrSet('Closed', ms.ClosedDead, `${stageLabel} indicates dead.`) };
  }

  // 2. Conflict: a dead/closed note co-occurs with a re-engagement signal -> manual review.
  if (matchesAny(notes, REENGAGE) && matchesAny(notes, [...CLOSED_DEAD, ...CLOSED_WON, ...UNDER_CONTRACT])) {
    return { ...base, recommendedStatus: 'New', action: 'manual_review', marketStatusValue: null,
      reason: 'Conflict: a dead/closed note co-occurs with a re-engagement signal.', note: 'Conflicting notes — a dead/closed signal and a later re-inquiry both present. Left as-is for manual review.',
      manualReviewReason: 'Dead/closed note vs. later re-inquiry.' };
  }

  // 3. Under Contract (note confirms signed contract / accepted offer).
  if (matchesAny(notes, UNDER_CONTRACT)) {
    return { ...base, ...holdOrSet('Under Contract', ms.UnderContract, 'Note indicates a signed contract / accepted offer.') };
  }

  // 4. Closed (won or dead per note).
  if (matchesAny(notes, CLOSED_WON)) {
    return { ...base, ...holdOrSet('Closed', ms.ClosedWon, 'Note indicates the deal closed (won).') };
  }
  if (matchesAny(notes, CLOSED_DEAD)) {
    return { ...base, ...holdOrSet('Closed', ms.ClosedDead, 'Note confirms the deal is dead.') };
  }

  // 5. Activity present -> Evaluating (decide on activity, not tags).
  if (activities.length > 0) {
    const hasOutreach = activities.some((a) => OUTREACH.has(a.type));
    const dead = hasDeadTag(tags);
    if (hasOutreach && !dead) {
      return { ...base, recommendedStatus: 'Evaluating', action: 'set_status', marketStatusValue: ms.Evaluating || null,
        reason: 'Outreach/analysis activity on the attached contact.', note: null, manualReviewReason: null };
    }
    if (hasOutreach && dead) {
      return { ...base, recommendedStatus: 'Evaluating', action: 'set_status', marketStatusValue: ms.Evaluating || null,
        reason: `Stale 'dead' tag conflicts with current outreach and no note confirms the deal is dead (latest outreach ${latestOutreachTs(activities)}); treating as active per SOP v2 §4.`,
        note: null, manualReviewReason: null };
    }
    // Activity present but not clear outreach -> manual review.
    return { ...base, recommendedStatus: 'New', action: 'manual_review', marketStatusValue: null,
      reason: 'Activity present but not clear outreach; signals mixed.', note: 'Activity on the contact is ambiguous (no clear outreach and no confirming note). Left as-is for manual review.',
      manualReviewReason: 'Ambiguous activity.' };
  }

  // 6. Contact attached, no activity, but a stale dead tag -> manual review.
  if (hasDeadTag(tags)) {
    return { ...base, recommendedStatus: 'New', action: 'manual_review', marketStatusValue: null,
      reason: "Contact carries a 'dead' tag but shows no activity to corroborate it.", note: 'Contact tagged dead but no activity/notes to confirm. Left as-is for manual review.',
      manualReviewReason: 'Dead tag, no corroborating activity.' };
  }

  // 7. Contact attached, no activity, no tags -> New.
  return { ...base, recommendedStatus: 'New', action: 'leave_new', marketStatusValue: null,
    reason: 'Contact attached but no activity yet — correct as New.', note: null, manualReviewReason: null };
}

module.exports = { classify, latestActivity, OUTREACH };
