'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { classify } = require('../src/status-rules');

const MS = { Evaluating: 'Follow up', UnderContract: null, ClosedWon: null, ClosedDead: null };

test('no contact, no activity -> leave New', () => {
  const d = classify({ hasContact: false, activities: [], notes: [], tags: [] }, MS);
  assert.equal(d.action, 'leave_new');
  assert.equal(d.recommendedStatus, 'New');
});

test('contact, no activity -> leave New', () => {
  const d = classify({ hasContact: true, activities: [], notes: [], tags: ['Seller'] }, MS);
  assert.equal(d.action, 'leave_new');
});

test('outreach -> Evaluating / Follow up', () => {
  const d = classify({ hasContact: true, tags: [], notes: [], activities: [{ type: 'call', timestamp: '2026-07-11T09:00:00' }] }, MS);
  assert.equal(d.action, 'set_status');
  assert.equal(d.recommendedStatus, 'Evaluating');
  assert.equal(d.marketStatusValue, 'Follow up');
});

test('stale dead tag + outreach -> Evaluating', () => {
  const d = classify({ hasContact: true, tags: ['Dead Lead'], notes: [], activities: [{ type: 'text', timestamp: '2026-07-11T09:00:00' }] }, MS);
  assert.equal(d.recommendedStatus, 'Evaluating');
  assert.match(d.reason, /stale/i);
});

test('dead tag, no activity -> manual review', () => {
  const d = classify({ hasContact: true, tags: ['Dead Lead'], notes: [], activities: [] }, MS);
  assert.equal(d.action, 'manual_review');
});

test('under contract note holds when unconfirmed', () => {
  const d = classify({ hasContact: true, tags: [], notes: ['Signed contract, accepted offer'], activities: [{ type: 'offer', timestamp: '2026-07-01' }] }, MS);
  assert.equal(d.action, 'hold');
  assert.equal(d.recommendedStatus, 'Under Contract');
  assert.equal(d.marketStatusValue, null);
});

test('under contract sets when mapping configured', () => {
  const d = classify({ hasContact: true, tags: [], notes: ['contract signed'], activities: [{ type: 'offer', timestamp: '2026-07-01' }] },
    { ...MS, UnderContract: 'Contract sent' });
  assert.equal(d.action, 'set_status');
  assert.equal(d.marketStatusValue, 'Contract sent');
});

test('closed dead note holds', () => {
  const d = classify({ hasContact: true, tags: [], notes: ['Seller confirmed deal is dead, no further action'], activities: [{ type: 'call', timestamp: '2026-06-01' }] }, MS);
  assert.equal(d.recommendedStatus, 'Closed');
  assert.equal(d.action, 'hold');
});

test('dead note + re-inquiry -> conflict manual review', () => {
  const d = classify({ hasContact: true, tags: [], notes: ['Oct 2025 no further actions', 'May 2026 re-inquiry received'], activities: [{ type: 'note', timestamp: '2026-05-02' }] }, MS);
  assert.equal(d.action, 'manual_review');
  assert.match(d.reason, /conflict/i);
});

test('latest activity is surfaced', () => {
  const d = classify({ hasContact: true, tags: [], notes: [], activities: [
    { type: 'call', timestamp: '2026-07-01T10:00:00', summary: 'old' },
    { type: 'text', timestamp: '2026-07-11T10:00:00', summary: 'new' },
  ] }, MS);
  assert.equal(d.latestActivity.summary, 'new');
});
