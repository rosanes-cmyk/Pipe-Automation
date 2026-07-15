'use strict';

/**
 * Session restoration. With a persistent Chrome profile we do NOT automate
 * credentials — you log into REI by hand once in the launched browser, and the
 * profile keeps you signed in. This checks whether we're logged in and, if not,
 * waits (up to LOGIN_WAIT_MS) for a manual login, so we never store a password.
 */

const LOGIN_WAIT_MS = 10 * 60 * 1000; // 10 minutes to log in by hand
const POLL_MS = 3000;

async function isLoginScreen(page) {
  const pw = page.locator('input[type="password"]');
  return pw.first().isVisible().catch(() => false);
}

async function ensureLoggedIn(page, settings, log) {
  await page.goto(settings.urls.login, { waitUntil: 'domcontentloaded' });

  if (!(await isLoginScreen(page))) {
    log('Existing session restored (already logged in).');
    return;
  }

  log('Not logged in. A Chrome window is open — please log into REI BlackBook there.');
  log(`Waiting up to ${Math.round(LOGIN_WAIT_MS / 60000)} minutes for you to finish logging in...`);

  const deadline = Date.now() + LOGIN_WAIT_MS;
  while (Date.now() < deadline) {
    await page.waitForTimeout(POLL_MS);
    // Logged in when the password field is gone (navigated past the login screen).
    if (!(await isLoginScreen(page))) {
      await page.waitForTimeout(1500); // let the app settle
      log('Login detected — continuing.');
      return;
    }
  }
  throw new Error('Login not completed within the allowed time. Re-run the command and log in when the window opens.');
}

module.exports = { ensureLoggedIn };
