# SOP — Running the Pipeline Status Cleanup Automation

**Equity Track / Twin Home Buyer · REI BlackBook**

- **Owner:** Jonathan
- **For:** the operator running the cleanup (Cherry)
- **What this covers:** how to set up, run, monitor, and report on the automated
  Pipeline Status Cleanup — the tool that clears the ~2,442-lead "New" backlog.
- **Related docs:** [`Pipeline_Status_Cleanup_SOP_v2.md`](../Pipeline_Status_Cleanup_SOP_v2.md)
  (the decision rules) · [`automation_flow.md`](./automation_flow.md) (how it works internally).

> **The one rule to remember:** the tool only ever **edits a single status field** or
> **adds a note**. It never merges, deletes, or moves data. Everything it does is
> reversible. When in doubt, run in **dry-run** first and read the dashboard.

---

## 1. What the tool does (plain English)

It opens each "New" lead, reads the activity on the **attached contact**, and:

- Moves it to **Evaluating** (Market Status "Follow up") if anyone called, texted,
  emailed, ran comps, or worked an offer.
- **Leaves it New** if nobody has touched it.
- **Flags for manual review** (writes a note, leaves the status) if the signals
  are unclear or conflicting.
- **Holds** any lead that looks Under Contract or Closed — because we haven't yet
  confirmed which Market Status value to use for those (see §7). It writes a note
  and moves on, so nothing is guessed.

After every change it **reloads the record to confirm the change stuck**, and it
**saves its place** so a dropped connection never loses progress.

---

## 2. One-time setup

Do this once on the machine that will run the job.

1. Install Python 3.11+ if it isn't already.
2. Get the project folder (`Pipe-Automation`) and open a terminal in it.
3. Install the tool:
   ```bash
   pip install -r requirements.txt
   ```
4. Create your settings file:
   ```bash
   cp .env.example .env
   ```
5. Open `.env` and fill in (ask Jonathan for the values):
   - `DATA_SOURCE=rei`  ← use the live REI data (leave as `fixture` for a safe practice run)
   - `REI_API_BASE_URL`, `REI_API_KEY`, `REI_AUTH_STYLE`  ← REI API credentials
   - Leave `DRY_RUN=true` for now.

> **Practice mode:** if you set `DATA_SOURCE=fixture`, the tool runs against built-in
> sample leads and touches nothing real. Use it to learn the steps safely.

---

## 3. Daily run — step by step

### Step 1 — Do a dry run first (no changes written)

With `DRY_RUN=true` in `.env`:

```bash
python -m pipeline_automation.cli run --limit 25
```

This processes 25 leads and shows what it *would* do — without changing anything
in REI. Read the output.

### Step 2 — Check the dashboard

In a second terminal:

```bash
uvicorn pipeline_automation.dashboard.app:app
```

Open **http://127.0.0.1:8000** in your browser. You'll see:

- **Tiles:** how many were processed, verified, held, flagged, and how many New leads remain.
- **Cleanup progress** bar.
- **Pipeline by stage** — live counts from REI.
- **Recent decisions** — every lead and why it was decided that way.

Spot-check a few rows against REI. If they look right, continue.

### Step 3 — Go live

Set `DRY_RUN=false` in `.env`, then run for real:

```bash
python -m pipeline_automation.cli run
```

It processes the whole New bucket, verifying each save. Leave it running — the
dashboard updates as it goes.

### Step 4 — If it stops or the connection drops

Just run the same command again:

```bash
python -m pipeline_automation.cli run
```

It automatically **skips everything it already finished** and picks up where it
left off. You can't double-process a lead.

### Step 5 — Get the summary for the report

```bash
python -m pipeline_automation.cli status
```

This prints the counts and the most recent decisions — the numbers you put in
the Cherry report (see §6).

---

## 4. Reading the outcomes

| Outcome on the dashboard | What it means | Action needed |
| :-- | :-- | :-- |
| **Verified → Evaluating** | Moved to Evaluating and confirmed saved | None — done correctly |
| **Left New** | No contact / no activity — correctly untouched | None |
| **Manual-review flags** | Signals unclear or conflicting; a note was written, status unchanged | A human reviews these leads |
| **Held (unconfirmed)** | Looks Under Contract / Closed, but the status value isn't confirmed yet | Needs Jonathan's mapping (§7), then re-run |
| **Errors** | A save couldn't be verified after retries | Re-run; if it persists, tell Jonathan |

---

## 5. Do / Don't

**Do**
- Always dry-run + check the dashboard before going live.
- Re-run freely — resume is automatic and safe.
- Report the counts from `cli status` at the end of each run.

**Don't**
- Don't merge or delete duplicates — the tool only flags them; a human decides.
- Don't set the **State** field to "California." Per policy it's left alone (a
  separate cleanup handles "CA").
- Don't guess a status for Held leads — wait for the confirmed mapping.

---

## 6. What to put in the Cherry report

After a run, report:

1. **Counts** from `cli status`: processed, verified, held, flagged, left New, errors.
2. **Remaining New** (from the dashboard tile) — how much backlog is left.
3. **Flagged leads** — the manual-review list for a human to look at.
4. **Held leads** — anything waiting on the Market Status mapping.
5. **Any errors** and whether a re-run cleared them.

A screenshot of the dashboard is a good one-glance summary to attach.

---

## 7. Known open items (blockers to a 100% clean run)

These are Jonathan's to confirm; until then the tool safely holds/flags instead
of guessing:

1. **REI API details** — the exact endpoints/auth must be confirmed against the
   REI developer portal (developer.blackbookcloud.com). Marked `CONFIRM:` in the code.
2. **Market Status mapping** — which value = Under Contract, Closed-won, and
   Closed-dead (and where the granular values like Nurture / Made an Offer /
   Contract sent belong). Once set in `.env`, re-run and the Held leads get processed.
3. **State field / "CA"** — left alone by decision; a separate CSV/API pass if desired.

---

**SOP READY — for handoff to Cherry.**
