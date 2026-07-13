'use strict';

/**
 * Address review & cleanup (pure, unit-tested).
 *
 * Rules (SOP v2 §6-§7):
 *   - Target format: "Street Address, City, CA ZIP".
 *   - Keep an existing "CA" unchanged; NEVER replace "CA" with "California".
 *   - Never set the State field (REI's dropdown offers only "California");
 *     flag blank or "California" state values for manual review.
 *   - Tidy safe capitalization / spacing / obvious suffix issues ONLY when
 *     tidyStreetText is enabled; otherwise flag-only.
 *   - Do not guess missing address data.
 */

const SUFFIXES = {
  street: 'St', st: 'St',
  avenue: 'Ave', ave: 'Ave',
  drive: 'Dr', dr: 'Dr',
  road: 'Rd', rd: 'Rd',
  boulevard: 'Blvd', blvd: 'Blvd',
  lane: 'Ln', ln: 'Ln',
  court: 'Ct', ct: 'Ct',
  place: 'Pl', pl: 'Pl',
  circle: 'Cir', cir: 'Cir',
  way: 'Way',
  terrace: 'Ter', ter: 'Ter',
  drives: 'Dr',
};

function titleCaseWord(w) {
  if (!w) return w;
  if (/^\d/.test(w)) return w; // keep 5th, 3rd, numbers
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

function tidyStreet(street) {
  if (!street) return street;
  const words = street.trim().replace(/\s+/g, ' ').split(' ');
  return words
    .map((w, i) => {
      const key = w.toLowerCase().replace(/\./g, '');
      if (i === words.length - 1 && SUFFIXES[key]) return SUFFIXES[key];
      return titleCaseWord(w);
    })
    .join(' ');
}

/**
 * @param {{street, city, state, zip}} addr
 * @param {{tidyStreetText:boolean}} opts
 */
function reviewAddress(addr, opts = {}) {
  const out = {
    cleaned: { ...addr },
    addressCorrected: false,
    stateIssue: null,
    flags: [],
  };

  const rawState = (addr.state || '').trim();

  // State handling — never write it; flag issues.
  if (rawState === '' ) {
    out.stateIssue = 'blank';
    out.flags.push('State is blank — flag for manual review (do not set via UI).');
  } else if (/^california$/i.test(rawState)) {
    out.stateIssue = 'california';
    out.flags.push('State is "California" (not "CA") — flag; leave unchanged (SOP §7A).');
  } else if (/^ca$/i.test(rawState)) {
    out.cleaned.state = 'CA'; // keep existing CA (normalize case only)
  }

  // Street tidy — only when explicitly enabled.
  if (opts.tidyStreetText && addr.street) {
    const tidied = tidyStreet(addr.street);
    if (tidied !== addr.street) {
      out.cleaned.street = tidied;
      out.addressCorrected = true;
    }
  }

  // Malformed detection (e.g. an email/name in the address field).
  if (addr.street && /@|\$|icloud|gmail|\.com/i.test(addr.street)) {
    out.flags.push('Address field looks malformed (contains an email/name fragment) — flag for re-entry.');
  }

  return out;
}

module.exports = { reviewAddress, tidyStreet };
