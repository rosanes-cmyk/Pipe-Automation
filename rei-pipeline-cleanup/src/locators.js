'use strict';

/**
 * Resolves a selector entry from selectors.json into a Playwright Locator.
 * Supported `by`: testid | role | text | label | placeholder | css.
 *
 * A selector whose confidence is "TODO" (or whose value starts with "TODO_")
 * throws — this enforces the Phase-1 rule: no silent guessing. Fill it in
 * against the live DOM before the automation will use it.
 */

function assertMapped(entry, key) {
  if (!entry) throw new Error(`Selector "${key}" is not defined in selectors.json`);
  const todo = entry.confidence === 'TODO' || (typeof entry.value === 'string' && entry.value.startsWith('TODO_'));
  if (todo) {
    throw new Error(
      `Selector "${key}" is a Phase-1 placeholder (confidence: TODO). ` +
      `Map it against the live REI DOM in config/selectors.json before running. Note: ${entry.note || '—'}`
    );
  }
}

/**
 * @param {import('playwright').Page|import('playwright').Locator} scope
 * @param {object} entry selectors.json entry
 * @param {string} key dotted key for error messages
 */
function locate(scope, entry, key) {
  assertMapped(entry, key);
  const exact = entry.exact !== false;
  switch (entry.by) {
    case 'testid': return scope.getByTestId(entry.value);
    case 'role': return scope.getByRole(entry.role, { name: entry.value, exact });
    case 'text': return scope.getByText(entry.value, { exact: entry.exact === true });
    case 'label': return scope.getByLabel(entry.value, { exact: entry.exact === true });
    case 'placeholder': return scope.getByPlaceholder(entry.value);
    case 'css': return scope.locator(entry.value);
    default: throw new Error(`Unknown selector strategy "${entry.by}" for "${key}"`);
  }
}

module.exports = { locate, assertMapped };
