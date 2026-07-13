'use strict';

const path = require('path');
const { chromium } = require('playwright');

/**
 * Launches a persistent Chrome context so the REI login/session is reused
 * across runs (log in once by hand; the profile keeps you signed in).
 */
async function launch(settings) {
  const b = settings.browser;
  const userDataDir = path.resolve(b.userDataDir);
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: b.headless,
    channel: b.channel || undefined,
    slowMo: b.slowMoMs || 0,
    viewport: b.viewport || { width: 1440, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });
  context.setDefaultNavigationTimeout(b.navigationTimeoutMs || 45000);
  context.setDefaultTimeout(b.actionTimeoutMs || 15000);
  const page = context.pages()[0] || (await context.newPage());
  return { context, page };
}

async function close(context) {
  try { await context.close(); } catch { /* ignore */ }
}

module.exports = { launch, close };
