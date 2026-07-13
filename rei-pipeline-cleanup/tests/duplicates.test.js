'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { normalizeAddress, findDuplicates, isPossibleDuplicate } = require('../src/duplicates');

test('normalizes suffix, case, punctuation', () => {
  assert.equal(normalizeAddress('522 Seacliff Place'), normalizeAddress('522 Seacliff Pl'));
  assert.equal(normalizeAddress('123 Main Street'), normalizeAddress('123 Main St'));
});

test('isPossibleDuplicate matches twins', () => {
  assert.ok(isPossibleDuplicate('522 Seacliff Place', '522 Seacliff Pl'));
  assert.ok(!isPossibleDuplicate('522 Seacliff Pl', '523 Seacliff Pl'));
});

test('findDuplicates groups members', () => {
  const recs = [
    { propertyId: '1', address: '1746 Mirabella Ct' },
    { propertyId: '2', address: '1746 Mirabella Court' },
    { propertyId: '3', address: '9 Unrelated Rd' },
  ];
  const dupes = findDuplicates(recs);
  assert.equal(dupes.length, 1);
  assert.equal(dupes[0].members.length, 2);
});

test('empty address is ignored', () => {
  assert.equal(normalizeAddress(''), '');
  assert.ok(!isPossibleDuplicate('', ''));
});
