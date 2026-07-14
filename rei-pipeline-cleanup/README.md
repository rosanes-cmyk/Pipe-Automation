# rei-pipeline-cleanup

Node.js + Playwright automation for the **REI BlackBook Property Pipeline status
cleanup** (Equity Track / Twin Home Buyer). It opens each New property, reads the
latest activity on the **attached contact**, and sets the pipeline status to
match — with audit-first safety, save verification, and checkpoint/resume.

Same decision rules as the SOP (`../Pipeline_Status_Cleanup_SOP_v2.md`); this is
the coded, browser-driven implementation.

## Safety model

- **Defaults are audit-only:** `AUDIT_MODE=true`, `LIVE_MODE=false`,
  `MAX_LEADS_PER_RUN=1`. `--live` must be passed explicitly to write anything.
- **Save verification:** after a status change it reloads the record and confirms
  the value stuck (the dropdown silently reverts otherwise); at most one retry,
  then it logs the failure and stops changing that lead.
- **Hold, don't guess:** Under Contract / Closed have no confirmed Market Status
  value yet (SOP §8) — those leads are held and queued for manual review.
- **Reversible only:** it sets one status field; it never merges, deletes, moves
  data, or touches the State field. Duplicates are flagged, not merged.

## Setup

```bash
cd rei-pipeline-cleanup
npm install                       # installs Playwright
# Chromium is already present in this environment; for local use you may need:
# npx playwright install chromium
```

## Phase 1 — map selectors (required before any run)

The automation reads element selectors from `config/selectors.json`. Entries
marked `"confidence": "TODO"` (or a `TODO_...` value) **throw on use** — no
silent guessing. Before running:

1. Set `urls.pipeline` in `config/settings.json` to the real Property Pipeline URL.
2. Open REI in the launched browser, inspect the elements listed in
   `selectors.json`, and replace each `TODO` with a stable selector
   (prefer `data-testid` → role+name → href/css).

## Phase 2 — audit one lead (no changes)

```bash
node app.js --audit --max 1
```

Processes one New lead read-only and writes the full result to
`reports/pipeline-results.{csv,json}`. Review it.

## Phase 3 — one live lead (writes, then stops)

```bash
node app.js --live --max 1
```

Updates exactly one lead, verifies the save by reload, captures before/after
screenshots, records the result, and stops. **Review before increasing `--max`.**

## Dashboard & daily report

Every run writes reports and **auto-generates a dashboard**:
- `reports/pipeline-results.csv` / `.json` — the latest run's per-lead results.
- `reports/daily-history.json` — one summary record appended per run (the daily report).
- `reports/dashboard.html` — a self-contained black-UI dashboard (latest run + daily trend + notable leads). Double-click to open.

Regenerate the dashboard anytime:
```bash
node dashboard.js
```

Live dashboard server (the "API daily report dashboard") — reflects the newest
run on each refresh:
```bash
node serve.js            # http://localhost:8787
# endpoints: /  (dashboard)   /api/latest   /api/daily
```

## Test the pure logic (no browser)

```bash
npm test        # status-rules, address, duplicates — runs offline
```

## Layout

```
src/
  status-rules.js  # SOP decision engine (pure, tested)
  address.js       # address review / CA rules (pure, tested)
  duplicates.js    # duplicate detection (pure, tested)
  browser.js       # persistent Chrome profile launch
  login.js         # session restore (manual login once; no stored password)
  pipeline.js      # Property Pipeline navigation (top-first)
  property.js      # property extraction + status read/write
  contact.js       # attached-contact navigation + verification
  activity.js      # latest-activity extraction
  updater.js       # set status + reload-verify (1 retry)
  reporter.js      # CSV + JSON reports, run summary
  controller.js    # orchestration, phases, MAX_LEADS, progress recovery
  locators.js      # selector resolver (throws on TODO placeholders)
config/  settings.json, selectors.json
data/    progress.json, manual-review.json, duplicates.json   (generated)
reports/ screenshots/ logs/                                    (generated)
tests/   *.test.js
app.js
```

## Controls

- `AUDIT_MODE` / `LIVE_MODE` / `MAX_LEADS_PER_RUN` in `config/settings.json`
  (or `--audit` / `--live` / `--max N`).
- Progress is saved after every property to `data/progress.json`; re-running
  skips completed leads (resume). A fresh run starts from the top of the list.
- `Ctrl-C` requests a graceful stop after the current property.
