'use strict';

/**
 * Duplicate detection by address normalization (pure, unit-tested).
 * Flag only — never merge, delete, or move data (SOP v2 §6).
 */

const SUFFIX_CANON = {
  street: 'st', st: 'st',
  avenue: 'ave', ave: 'ave',
  drive: 'dr', dr: 'dr',
  road: 'rd', rd: 'rd',
  boulevard: 'blvd', blvd: 'blvd',
  lane: 'ln', ln: 'ln',
  court: 'ct', ct: 'ct',
  place: 'pl', pl: 'pl',
  circle: 'cir', cir: 'cir',
  terrace: 'ter', ter: 'ter',
  way: 'way',
};

/** Normalize an address string to a comparison key. */
function normalizeAddress(str) {
  if (!str) return '';
  let s = String(str).toLowerCase();
  s = s.replace(/[.,#]/g, ' ');          // punctuation
  s = s.replace(/\bunit\b|\bapt\b|\bste\b|\bsuite\b/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  const words = s.split(' ').map((w) => SUFFIX_CANON[w] || w);
  return words.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * @param {Array<{propertyId, address, url, contact}>} records
 * @returns {Array<{key, members:Array}>} groups with >1 member
 */
function findDuplicates(records) {
  const groups = new Map();
  for (const r of records) {
    const key = normalizeAddress(r.address);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const dupes = [];
  for (const [key, members] of groups) {
    if (members.length > 1) dupes.push({ key, members });
  }
  return dupes;
}

/** True if two address strings are a possible duplicate. */
function isPossibleDuplicate(a, b) {
  return normalizeAddress(a) === normalizeAddress(b) && normalizeAddress(a) !== '';
}

module.exports = { normalizeAddress, findDuplicates, isPossibleDuplicate };
