'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { classify } = require('../src/status-rules');

// Confirmed mapping: Evaluating + Closed-dead auto-write; UC + Closed-won hold.
const MS = { Evaluating: 'Follow up', UnderContract: null, ClosedWon: null, ClosedDead: 'Dead' };

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

test('lead stage Lost/Dead -> Closed set "Dead" (auto-write)', () => {
  const d = classify(P({ leadStage: '9 Lost / Dead Lead', disposition: 'Unresponsive' }), MS);
  assert.equal(d.action, 'set_status');
  assert.equal(d.recommendedStatus, 'Closed');
  assert.equal(d.marketStatusValue, 'Dead');
});

test('lead stage Invalid -> Closed / Dead', () => {
  const d = classify(P({ leadStage: '0 Invalid Leads' }), MS);
  assert.equal(d.recommendedStatus, 'Closed');
  assert.equal(d.marketStatusValue, 'Dead');
});

test('disposition Wrong Number -> Closed / Dead', () => {
  assert.equal(classify(P({ disposition: 'Wrong Number' }), MS).marketStatusValue, 'Dead');
});

test('Closed-won stays HELD (reserve Closed/Sold for real sales)', () => {
  const d = classify(P({ leadStage: 'Sold' }), MS);
  assert.equal(d.recommendedStatus, 'Closed');
  assert.equal(d.action, 'hold');
  assert.equal(d.marketStatusValue, null);
});

test('lead stage Under Contract -> HELD for a human', () => {
  const d = classify(P({ leadStage: 'Under Contract' }), MS);
  assert.equal(d.recommendedStatus, 'Under Contract');
  assert.equal(d.action, 'hold');
});

test('lead stage New Lead -> leave New', () => {
  assert.equal(classify(P({ leadStage: '1 New Lead' }), MS).action, 'leave_new');
});

test('dead lead stage + re-inquiry note -> manual review', () => {
  const d = classify(P({ leadStage: 'Dead', notes: ['May 2026 re-inquiry received'] }), MS);
  assert.equal(d.action, 'manual_review');
});

test('outreach logged but blank Lead Stage -> manual review (borderline)', () => {
  const d = classify(P({ leadStage: '', hasOutreach: true }), MS);
  assert.equal(d.action, 'manual_review');
  assert.match(d.reason, /blank/i);
});

test('outreach via dated activity but blank stage -> manual review', () => {
  const d = classify(P({ activities: [{ type: 'call', timestamp: '2026-07-11' }] }), MS);
  assert.equal(d.action, 'manual_review');
});

test('contact, no stage, no outreach -> leave New', () => {
  assert.equal(classify(P({ leadStage: '', hasOutreach: false }), MS).action, 'leave_new');
});

test('latest activity is surfaced', () => {
  const d = classify(P({ leadStage: '2 Follow Up', activities: [
    { type: 'call', timestamp: '2026-07-01T10:00:00', summary: 'old' },
    { type: 'text', timestamp: '2026-07-11T10:00:00', summary: 'new' },
  ] }), MS);
  assert.equal(d.latestActivity.summary, 'new');
});
