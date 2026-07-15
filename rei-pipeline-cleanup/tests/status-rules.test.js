'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { classify } = require('../src/status-rules');

// Production 4-stage mapping (fully automated): New (leave), Evaluating='Follow up',
// Under Contract='Under Contract', Closed='Closed' for BOTH dead and sold (+ note why).
const MS = { Evaluating: 'Follow up', UnderContract: 'Under Contract', ClosedWon: 'Closed', ClosedDead: 'Closed' };

const P = (over) => ({ hasContact: true, tags: [], notes: [], activities: [], leadStage: '', disposition: '', hasOutreach: false, ...over });

test('no contact, no activity, no stage -> leave New', () => {
  const d = classify({ hasContact: false, tags: [], notes: [], activities: [], leadStage: '' }, MS);
  assert.equal(d.action, 'leave_new');
});

test('lead stage Follow Up -> Evaluating / Follow up (auto-write)', () => {
  const d = classify(P({ leadStage: '2 Follow Up', disposition: 'Unresponsive' }), MS);
  assert.equal(d.action, 'set_status');
  assert.equal(d.recommendedStatus, 'Evaluating');
  assert.equal(d.marketStatusValue, 'Follow up');
});

test('lead stage Interested -> Evaluating', () => {
  assert.equal(classify(P({ leadStage: 'Interested' }), MS).recommendedStatus, 'Evaluating');
});

test('lead stage Lost/Dead -> Closed (auto-write) with a "why" note', () => {
  const d = classify(P({ leadStage: '9 Lost / Dead Lead', disposition: 'Unresponsive' }), MS);
  assert.equal(d.action, 'set_status');
  assert.equal(d.recommendedStatus, 'Closed');
  assert.equal(d.marketStatusValue, 'Closed');
  assert.match(d.note, /dead|lost/i);
});

test('lead stage Invalid -> Closed', () => {
  const d = classify(P({ leadStage: '0 Invalid Leads' }), MS);
  assert.equal(d.recommendedStatus, 'Closed');
  assert.equal(d.marketStatusValue, 'Closed');
});

test('disposition Wrong Number -> Closed', () => {
  assert.equal(classify(P({ disposition: 'Wrong Number' }), MS).marketStatusValue, 'Closed');
});

test('Closed-won (Sold) -> Closed (auto-write) with a "sold" note', () => {
  const d = classify(P({ leadStage: 'Sold' }), MS);
  assert.equal(d.recommendedStatus, 'Closed');
  assert.equal(d.action, 'set_status');
  assert.equal(d.marketStatusValue, 'Closed');
  assert.match(d.note, /sold|completed/i);
});

test('lead stage Under Contract -> auto-set "Under Contract" + note', () => {
  const d = classify(P({ leadStage: 'Under Contract' }), MS);
  assert.equal(d.recommendedStatus, 'Under Contract');
  assert.equal(d.action, 'set_status');
  assert.equal(d.marketStatusValue, 'Under Contract');
  assert.match(d.note, /under contract/i);
});

test('lead stage New Lead -> leave New', () => {
  assert.equal(classify(P({ leadStage: '1 New Lead' }), MS).action, 'leave_new');
});

test('dead lead stage + re-inquiry note -> Closed (SOP: trust the Dead stage)', () => {
  const d = classify(P({ leadStage: 'Dead', notes: ['May 2026 re-inquiry received'] }), MS);
  assert.equal(d.action, 'set_status');
  assert.equal(d.recommendedStatus, 'Closed');
});

test('literal Review stage -> flagged for a human', () => {
  assert.equal(classify(P({ leadStage: 'For Review' }), MS).action, 'manual_review');
  assert.equal(classify(P({ leadStage: '', disposition: 'Needs Review' }), MS).action, 'manual_review');
});

test('outreach logged but blank Lead Stage -> Evaluating (SOP: any contact made)', () => {
  const d = classify(P({ leadStage: '', hasOutreach: true }), MS);
  assert.equal(d.action, 'set_status');
  assert.equal(d.recommendedStatus, 'Evaluating');
  assert.equal(d.marketStatusValue, 'Follow up');
});

test('activity logged but blank stage -> Evaluating', () => {
  const d = classify(P({ activities: [{ type: 'call', timestamp: '2026-07-11' }] }), MS);
  assert.equal(d.recommendedStatus, 'Evaluating');
});

test('notes present but blank stage -> Evaluating', () => {
  const d = classify(P({ leadStage: '', notes: ['left a voicemail'] }), MS);
  assert.equal(d.recommendedStatus, 'Evaluating');
});

test('contact attached but zero activity -> leave New', () => {
  assert.equal(classify(P({ leadStage: '', hasOutreach: false }), MS).action, 'leave_new');
});

test('latest activity is surfaced', () => {
  const d = classify(P({ leadStage: '2 Follow Up', activities: [
    { type: 'call', timestamp: '2026-07-01T10:00:00', summary: 'old' },
    { type: 'text', timestamp: '2026-07-11T10:00:00', summary: 'new' },
  ] }), MS);
  assert.equal(d.latestActivity.summary, 'new');
});
