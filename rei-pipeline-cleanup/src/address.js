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
 * Split a combined address string into { street, city, state, zip } so the
 * street can be tidied and the ZIP captured while the State is left untouched.
 *
 * Handles the common REI shapes:
 *   "123 Main St, Los Angeles, CA 90001"
 *   "123 Main St, Los Angeles, CA"
 *   "123 Main Street, Oakland, California 94601"
 *   "123 Main St, Los Angeles, CA, USA"   (geocoded — flagged elsewhere)
 *   "123 Main St"                          (street only)
 *
 * Never guesses missing parts; unknown pieces come back blank.
 */
function parseAddress(full) {
  const out = { street: '', city: '', state: '', zip: '' };
  if (!full) return out;

  let s = String(full).trim().replace(/\s+/g, ' ');
  // Drop a trailing country token so it doesn't get mistaken for city/state.
  s = s.replace(/,\s*(USA|United States)\s*$/i, '').trim();

  // Pull the ZIP off the end if present (5 or 5-4).
  const zipM = s.match(/\b(\d{5})(?:-\d{4})?\b\s*$/);
  if (zipM) { out.zip = zipM[1]; s = s.slice(0, zipM.index).trim().replace(/,\s*$/, ''); }

  const parts = s.split(',').map((p) => p.trim()).filter(Boolean);

  // Last token might be a state (2-letter code or full "California").
  const stateTok = parts.length ? parts[parts.length - 1] : '';
  if (/^[A-Za-z]{2}$/.test(stateTok) || /^california$/i.test(stateTok)) {
    out.state = stateTok;
    parts.pop();
  }

  if (parts.length >= 2) {
    out.city = parts[parts.length - 1];
    out.street = parts.slice(0, -1).join(', ');
  } else if (parts.length === 1) {
    out.street = parts[0];
  }
  return out;
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

  // Street + city tidy — only when explicitly enabled.
  if (opts.tidyStreetText && addr.street) {
    const tidied = tidyStreet(addr.street);
    if (tidied !== addr.street) {
      out.cleaned.street = tidied;
      out.addressCorrected = true;
    }
  }
  if (opts.tidyStreetText && addr.city) {
    const tidiedCity = addr.city.trim().replace(/\s+/g, ' ').split(' ').map(titleCaseWord).join(' ');
    if (tidiedCity !== addr.city) {
      out.cleaned.city = tidiedCity;
      out.addressCorrected = true;
    }
  }

  // Malformed detection (e.g. an email/name in the address field).
  if (addr.street && /@|\$|icloud|gmail|\.com/i.test(addr.street)) {
    out.flags.push('Address field looks malformed (contains an email/name fragment) — flag for re-entry.');
  }

  return out;
}

module.exports = { reviewAddress, tidyStreet, parseAddress };
