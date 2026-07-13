# Cowork Kickoff Prompt

Paste the block below into a **Cowork** session that already has **REI BlackBook
open and logged in**. Attach `Cowork_Update_Runbook.md` to the session (or paste
its contents) so the agent can follow it in full — the prompt inlines the
essential rules so it works either way.

This prompt is the **fully automated / unattended** version: once pasted, the
agent works the entire New bucket on its own with no approval pauses. It stops
only if it can't save at all, loses the REI login, or finishes the bucket.

A checkpoint-sheet template is in §2 below; create it (Google Sheet or CSV)
before you start.

---

## 1. The kickoff prompt — FULLY AUTOMATED / UNATTENDED (copy everything in this box)

This version runs the entire New bucket end to end **without pausing for
approval**. The only checks that remain are automated ones (they need no human):
a one-lead self-test, reload-verify on every save, checkpoint/resume, and
holding the leads that can't be decided safely.

> **Role.** You are running the Pipeline Status Cleanup for Twin Home Buyer in
> REI BlackBook, following the attached `Cowork_Update_Runbook.md` and SOP v2.
> Run **unattended, end to end** — do NOT stop to ask for approval between
> batches. Work reversibly and log everything.
>
> **Golden rule.** Only ever change one status field or add a note. Never merge,
> delete, or move data between records. Everything you do must be reversible.
>
> **Automated self-test (no human needed — do this once at the start):**
> 1. Open the Property Pipeline → the "New" / "Add New Properties" bucket.
> 2. On the **first lead you would set to "Follow up"**, set it, save, reload,
>    and confirm it persisted. If it sticks, continue automatically. **If it
>    does NOT persist after 3 tries, STOP the whole run and report** — the save
>    mechanism is broken and running on would waste the batch.
>
> **ALWAYS START FROM THE TOP.** Every time you start OR resume, go to the very
> TOP of the New list (as REI displays it) and work straight downward. Newly
> added leads appear at the top, so starting from the top guarantees none are
> ever missed. As you scan down, **skip any lead already recorded in the
> checkpoint sheet** (it's already handled) and process every lead that isn't.
> Never re-process a logged lead.
>
> **Process EVERY unlogged New lead, continuously, until you reach the bottom of
> the list.** For each lead:
> 1. Open the record; open the **attached CONTACT** (not the property Notes tab
>    — real activity lives on the contact).
> 2. Read the contact's calls/texts/emails/comps/offers and dated notes.
> 3. **Decide on activity, never on tags:**
>    - Any call/text/email/comps/offer activity → **Evaluating**: set Market
>      Status = **"Follow up"**.
>    - A stale "Dead Lead / Lost Deal / Unresponsive" tag that conflicts with
>      current outreach, with no note confirming it's dead → treat as active →
>      **Evaluating** ("Follow up").
>    - No attached contact and no activity → **leave New**.
>    - Contact attached but no activity → **leave New**.
>    - Note says signed contract / accepted offer → **HOLD** (Under Contract):
>      do NOT set a status; add a note; record as `held`.
>    - Note says deal closed/funded, or dead/no-further-action → **HOLD**
>      (Closed): do NOT set a status; add a note; record as `held`.
>    - A dead/closed note AND a later re-inquiry/re-engagement → **conflict** →
>      leave status, add a note, record as `flagged`.
>    - Dead tag but no activity to corroborate, or signals genuinely mixed →
>      leave status, add a note, record as `flagged`.
> 4. **If you set "Follow up":** after selecting it, click out / Save so the save
>    handler fires (selecting the dropdown alone silently reverts). Then
>    **reload the record and confirm** Market Status still reads "Follow up".
>    Retry up to 3 times. If it still won't stick, record `error` and move on.
> 5. **Do NOT touch the State field.** If you spot a duplicate, add a note on
>    BOTH records naming the twin — never merge/delete.
> 6. **Log every finished lead** to the checkpoint sheet immediately:
>    `property_id, address, outcome, target_stage, reason, timestamp`
>    (outcome = verified | held | flagged | left_new | error).
>
> **Run continuously.** Every 25 leads, append a one-line progress note to the
> checkpoint sheet (counts + last property_id) but **keep going without waiting**.
> If the connection drops, reconnect and **go back to the TOP of the New list**,
> then scan downward skipping every lead already in the checkpoint sheet until
> you reach the first unlogged lead, and continue. Never re-process a logged lead.
>
> **Guardrails — never:** set the State field; merge/delete a duplicate; guess an
> Under Contract/Closed status value; decide from a tag; trust a save without a
> reload-verify; re-process a logged lead.
>
> **Only stop for these (otherwise never pause):** (a) the first-lead self-test
> fails; (b) you lose the REI session and cannot log back in; (c) you hit the end
> of the New bucket. On (c), post the full end-of-run report (§7 of the runbook).

---

## 2. Checkpoint sheet template

Create a Google Sheet (or CSV) named `pipeline_cleanup_checkpoint` with these
columns, header row first:

| property_id | address | outcome | target_stage | reason | timestamp |
| :-- | :-- | :-- | :-- | :-- | :-- |

- `outcome`: `verified` · `held` · `flagged` · `left_new` · `error`
- One row per finished lead, appended immediately.
- This sheet is the source of truth for resume — the agent reads the last
  `property_id` to know where to continue.

---

## 3. What "fully automated" means here (and what it doesn't)

Once you paste the prompt, the run is **unattended** — the agent processes the
whole New bucket on its own, no approvals, and resumes itself after a drop. Two
things still require a human, and can't be removed:

1. **You launch it.** It can't start itself — you open the Cowork session, log
   into REI, create the checkpoint sheet, and paste the prompt. After that it's
   hands-off.
2. **The REI login must stay alive.** If REI logs the session out and can't get
   back in, the agent stops and reports (it won't silently fail).

Everything else is automatic: decisions, "Follow up" saves, reload-verify,
retries, checkpointing, resume-after-drop, and the hold/flag rules.

**Still safe even unattended:** the agent only sets one value ("Follow up") or
adds notes; it holds (never guesses) Under Contract/Closed; it never touches the
State field or merges/deletes. So an unattended run can't do anything
irreversible — worst case is an extra note or a status you can flip back.

At the end (bucket empty) it posts the end-of-run report (§7 of the runbook) for
the Cherry report.
