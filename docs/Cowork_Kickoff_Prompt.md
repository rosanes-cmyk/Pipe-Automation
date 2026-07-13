# Cowork Kickoff Prompt

Paste the block below into a **Cowork** session that already has **REI BlackBook
open and logged in**. Attach `Cowork_Update_Runbook.md` to the session (or paste
its contents) so the agent can follow it in full — the prompt inlines the
essential rules so it works either way.

A checkpoint-sheet template is in §2 below; create it (Google Sheet or CSV)
before you start.

---

## 1. The kickoff prompt (copy everything in this box)

> **Role.** You are running the Pipeline Status Cleanup for Twin Home Buyer in
> REI BlackBook, following the attached `Cowork_Update_Runbook.md` and SOP v2.
> Work carefully and reversibly. You are driving the REI web UI directly.
>
> **Golden rule.** Only ever change one status field or add a note. Never merge,
> delete, or move data between records. Everything you do must be reversible.
>
> **Preflight (do this first, then pause and tell me what you see):**
> 1. Confirm you can open the Property Pipeline and the "New" / "Add New
>    Properties" bucket, and tell me roughly how many leads are in it.
> 2. Confirm you can open a property, open its **attached contact**, read the
>    contact's activity/notes, change **Market Status**, save, and reload.
> 3. Open the checkpoint sheet I gave you. If it has rows, we are RESUMING —
>    read the last `property_id` and continue from the next unprocessed New lead.
>
> **Then process the New bucket in batches of 25.** For each lead:
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
>      do NOT set a status; add a note (the exact status value isn't confirmed
>      yet); record as `held`.
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
> 5. **Do NOT touch the State field** (leave it exactly as-is). If you spot a
>    duplicate, add a note on BOTH records naming the twin — never merge/delete.
> 6. **Log every finished lead** to the checkpoint sheet immediately:
>    `property_id, address, outcome, target_stage, reason, timestamp`
>    (outcome = verified | held | flagged | left_new | error).
>
> **Checkpointing & drops:** append a row the moment each lead is done. After
> every 25 leads, post a summary (counts by outcome + last property_id) and
> PAUSE for my go-ahead. If the connection drops, reconnect, re-open the
> checkpoint sheet, re-verify only the single in-flight lead, then continue —
> never restart and never re-process a logged lead.
>
> **Guardrails — never:** set the State field; merge/delete a duplicate; guess an
> Under Contract/Closed status value; decide from a tag; trust a save without a
> reload-verify; re-process a logged lead.
>
> **Start now with just the FIRST 10 leads**, then stop and show me the 10 rows
> so I can spot-check before you continue with full batches of 25.

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

## 3. How you (the human) drive it

1. Do the preflight — confirm the agent can see/click REI, then let it run the
   first 10.
2. **Spot-check those 10** against REI (did the "Follow up" ones actually stick?
   are the holds/flags sensible?).
3. If good, tell it to continue in batches of 25, approving each batch.
4. Keep the checkpoint sheet open; if anything drops, just tell the agent to
   resume from the sheet.
5. At the end, ask for the end-of-run report (§7 of the runbook) for the Cherry
   report.

**When to stop and ask Jonathan:** anything that would require merging records,
a status value that isn't "Follow up", or a lead you can't confidently classify.
Hold/flag it and keep going — don't guess.
