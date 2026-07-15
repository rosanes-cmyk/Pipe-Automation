'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { parseActivityText, inferType } = require('../src/activity');

test('inferType classifies common activity kinds', () => {
  assert.equal(inferType('Outbound call - left voicemail'), 'call');
  assert.equal(inferType('Sent text message'), 'text');
  assert.equal(inferType('Emailed the seller'), 'email');
  assert.equal(inferType('Ran comps'), 'comps');
  assert.equal(inferType('Made an offer'), 'offer');
  assert.equal(inferType('General note'), 'note');
});

test('parseActivityText picks dated activity lines only', () => {
  const text = [
    'Contact: Arleen Scoggins',
    'Phone: (510) 961-6877',
    '2026-07-11 Call - answered, discussed price',
    '2026-07-11 Text - follow up sent',
    'Some heading with no date',
    'Jul 10, 2026 Ran comps and prepared offer',
  ].join('\n');
  const { activities } = parseActivityText(text);
  assert.equal(activities.length, 3);
  assert.equal(activities[0].type, 'call');
  assert.ok(activities.every((a) => a.timestamp));
});

test('parseActivityText ignores non-activity dated lines', () => {
  const { activities } = parseActivityText('2026-01-01 Property created in system');
  assert.equal(activities.length, 0);
});

test('empty text yields no activities', () => {
  const { activities, notes } = parseActivityText('');
  assert.equal(activities.length, 0);
  assert.equal(notes.length, 0);
});
