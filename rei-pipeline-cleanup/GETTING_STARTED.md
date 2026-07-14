# Getting Started — Step by Step

How to run the pipeline-cleanup automation on your own computer, from nothing to
a read-only audit of one lead. No prior coding needed — just follow each step.

---

## What you need first (one-time)

1. **Google Chrome** — installed (you almost certainly have it).
2. **Node.js (version 18 or newer)** — the thing that runs the automation.
   - Download the "LTS" installer from <https://nodejs.org> and install it.
   - To check it worked, open a terminal and run: `node --version`
     (should print something like `v20.x` or `v22.x`).
3. **The project code** — the `rei-pipeline-cleanup` folder from this repo.
   - Easiest: on the GitHub page for the repo, branch
     `claude/pipeline-status-cleanup-test-61hwcr`, click **Code → Download ZIP**,
     unzip it, and find the `rei-pipeline-cleanup` folder inside.

> **Terminal:** on Mac, open **Terminal**; on Windows, open **PowerShell**.

---

## Step 1 — Open a terminal in the project folder

Navigate into the `rei-pipeline-cleanup` folder. For example:

```bash
cd path/to/rei-pipeline-cleanup
```

(On Windows you can also right-click the folder → "Open in Terminal".)

You should be able to run `ls` (Mac) or `dir` (Windows) and see `app.js`,
`package.json`, and the `src` folder.

## Step 2 — Install the automation's dependencies (one-time)

```bash
npm install
```

This downloads Playwright (the browser controller). Wait for it to finish.

## Step 3 — Install the Chrome driver (one-time)

```bash
npx playwright install chrome
```

This lets the automation drive your Chrome. (If it says already installed, good.)

## Step 4 — Run the read-only audit of ONE lead

```bash
node app.js --audit --max 1
```

What happens:

1. A Chrome window opens to REI BlackBook.
2. **If it asks you to log in, log into REI in that window.** The automation
   waits for you (up to 5 minutes) and remembers the login for next time.
3. It opens the top **New** lead, opens the attached contact, reads the latest
   activity, and decides the correct status.
4. It **changes nothing** (audit mode). It writes a report and prints a summary.

## Step 5 — Read the result

- In the terminal you'll see a **RUN SUMMARY** (totals).
- Open the detailed report:
  - `reports/pipeline-results.csv` (open in Excel/Google Sheets), or
  - `reports/pipeline-results.json`
- Key columns: `property_address`, `recommended_status`, `latest_activity_type`,
  `latest_activity_summary`, `manual_review_required`.

## Step 6 — Send it back

Copy the terminal summary (or the CSV row) and paste it to me. I'll confirm the
recommendation looks right and whether we can proceed to the one-lead **live**
test.

---

## Step 7 — (Only after you approve the audit) one live lead

This one actually changes a status in REI, then stops:

```bash
node app.js --live --max 1
```

It sets the status, **reloads to confirm it saved**, screenshots before/after,
records the result, and stops. Review before running more.

> Note: if the audit's activity read was "heuristic" (low-confidence), a live run
> will **hold and flag** that lead instead of writing — on purpose. We raise it to
> full confidence once the audit confirms the reads look correct.

---

## If something goes wrong

- **An error mentioning a selector** (e.g. "Could not find the Status select"):
  copy the whole error and send it to me — it means one element on the page is
  named differently than expected, and I'll fix that one line.
- **"node: command not found"**: Node isn't installed or the terminal needs to be
  reopened after installing it (Step in "What you need first").
- **It didn't log in / timed out**: just run the audit command again; the login
  window will reopen.
- **Nothing changed in REI after a live run**: that's the save-revert issue from
  the SOP — the report's `update_saved` will be `false`. Send it to me.

Nothing here is destructive: audit changes nothing, and a live run only ever sets
one status field (reversible) — it never merges, deletes, or edits addresses/state.
