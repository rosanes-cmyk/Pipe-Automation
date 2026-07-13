'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { reviewAddress, tidyStreet } = require('../src/address');

test('keeps existing CA, never expands to California', () => {
  const r = reviewAddress({ street: '123 Main St', city: 'Oakland', state: 'ca', zip: '94601' }, { tidyStreetText: true });
  assert.equal(r.cleaned.state, 'CA');
  assert.equal(r.stateIssue, null);
});

test('flags California value, leaves it unchanged', () => {
  const r = reviewAddress({ street: '123 Main St', city: 'Oakland', state: 'California', zip: '94601' });
  assert.equal(r.stateIssue, 'california');
  assert.equal(r.cleaned.state, 'California');
});

test('flags blank state', () => {
  const r = reviewAddress({ street: '123 Main St', city: 'Oakland', state: '', zip: '94601' });
  assert.equal(r.stateIssue, 'blank');
});

test('tidy suffix only when enabled', () => {
  const on = reviewAddress({ street: '2328 Lafayette Drive', state: 'CA' }, { tidyStreetText: true });
  assert.equal(on.cleaned.street, '2328 Lafayette Dr');
  assert.equal(on.addressCorrected, true);

  const off = reviewAddress({ street: '2328 Lafayette Drive', state: 'CA' }, { tidyStreetText: false });
  assert.equal(off.cleaned.street, '2328 Lafayette Drive');
  assert.equal(off.addressCorrected, false);
});

test('flags malformed address', () => {
  const r = reviewAddress({ street: 'Mariarivera @$icloud', state: '' });
  assert.ok(r.flags.some((f) => /malformed/i.test(f)));
});

test('tidyStreet abbreviates common suffixes', () => {
  assert.equal(tidyStreet('522 Seacliff Place'), '522 Seacliff Pl');
  assert.equal(tidyStreet('16125 bittner road'), '16125 Bittner Rd');
});
