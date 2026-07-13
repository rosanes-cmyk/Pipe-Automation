'use strict';

/**
 * Session restoration. With a persistent Chrome profile we do NOT automate
 * credentials — you log into REI by hand once in the launched browser, and the
 * profile keeps you signed in. This checks whether we're logged in and, if not,
 * waits for a manual login (so we never store or type a password).
 */

async function ensureLoggedIn(page, settings, log) {
  await page.goto(settings.urls.login, { waitUntil: 'domcontentloaded' });

  // Heuristic: a visible password field means we're on a login screen.
  const passwordField = page.locator('input[type="password"]');
  const needsLogin = await passwordField.first().isVisible().catch(() => false);

  if (needsLogin) {
    log('Not logged in. Please log into REI BlackBook in the opened browser window.');
    log('Waiting for login to complete (up to 5 minutes)...');
    await passwordField
      .first()
      .waitFor({ state: 'detached', timeout: 5 * 60 * 1000 })
      .catch(() => { throw new Error('Login not completed in time.'); });
    log('Login detected.');
  } else {
    log('Existing session restored (already logged in).');
  }
}

module.exports = { ensureLoggedIn };
