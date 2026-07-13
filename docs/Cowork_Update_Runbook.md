# Cowork Batch Runbook — Updating REI BlackBook

**Equity Track / Twin Home Buyer · REI BlackBook**

- **Owner:** Jonathan
- **Executor:** Claude in Cowork (browser / computer use) — no API required
- **What this is:** the exact procedure Cowork follows to work the ~2,442-lead
  "New" backlog in the REI BlackBook web UI, with the reliability the July 11
  manual test lacked (checkpoint/resume, auto-verify, reconnect-and-continue).
- **Companions:** [`Pipeline_Status_Cleanup_SOP_v2.md`](../Pipeline_Status_Cleanup_SOP_v2.md)
  (rules) · [`SOP_Automation_Operations.md`](./SOP_Automation_Operations.md) (the API tool).

> This runbook is written to be **executed by the Cowork agent**, not just read.
> Follow it top to bottom. The golden rule: **only ever change one status field
> or add a note — never merge, delete, or move data. Everything is reversible.**

---

## 0. Before starting each session

1. Confirm you are logged into REI BlackBook and can open the **Property
   Pipeline**, the **"Add New Properties" / New** bucket.
2. Open the **checkpoint log** (see §4). If it already has rows, this is a
   **resume** — read the last `property_id` recorded and continue from the next
   unprocessed New lead. Never re-process a lead already in the log.
3. Announce the plan: "Processing New bucket in batches of 25; checkpointing
   after each; verifying every save."

---

## 1. Decision cheat-sheet (apply per lead)

Read the activity on the **attached CONTACT**, not the property Notes tab (the
Notes tab is almost always empty — the real activity lives on the contact).
**Decide on notes/activity, never on tags.**

| What the attached contact shows | Decision | What to do |
| :-- | :-- | :-- |
| No attached contact **and** no activity | **New** | Leave. Log `left_new`. |
| Contact attached, no activity, no dead tag | **New** | Leave. Log `left_new`. |
| Any call / text / email / comps / offer activity | **Evaluating** | Set **Market Status = "Follow up"**. Verify. Log `verified`. |
| Stale "Dead Lead / Lost Deal / Unresponsive" tag **+** current outreach, and no note confirms it's dead | **Evaluating** (treat as active) | Set "Follow up". Verify. Log `verified`. |
| Note says signed contract / accepted offer | **Under Contract** | **HOLD** — do not set (value unconfirmed, §3). Add a note. Log `held`. |
| Note says deal closed / funded | **Closed-won** | **HOLD**. Add a note. Log `held`. |
| Note says deal dead / no further action | **Closed-dead** | **HOLD**. Add a note. Log `held`. |
| A dead/closed note **and** a later re-inquiry / re-engagement | **Manual review** (conflict) | Leave status. Add a note. Log `flagged`. |
| Dead tag but no activity to corroborate it | **Manual review** | Leave status. Add a note. Log `flagged`. |
| Activity unclear / signals genuinely mixed | **Manual review** | Leave status. Add a note. Log `flagged`. |

---

## 2. Per-lead procedure

For each New lead, in order:

1. **Open** the property record.
2. **Open the attached contact.** Confirm it's the right one.
   - If clearly wrong/missing and the correct match is obvious → attach/fix it.
   - If ownership can't be confirmed → leave it, add a note, log `flagged`.
3. **Read the contact's activity and notes** (calls, texts, emails, comps,
   offers, dated notes).
4. **Decide** using the cheat-sheet in §1.
5. **If the decision is Evaluating** (set "Follow up"):
   a. Open the Market Status dropdown, select **"Follow up"**.
   b. **Fire the save** — click out of the field / the record's Save so the save
      handler runs. *Setting the dropdown value alone silently reverts.*
   c. **Verify:** reload the record and confirm Market Status still reads
      "Follow up". If it reverted, repeat (a)–(c) up to **3 times**.
   d. If it still won't stick after 3 tries → log `error` with a short note; move on.
6. **If the decision is HOLD or Manual review:** add a Note on the property
   stating the reason (see §3/§1). Do **not** change the status.
7. **Address:** you may tidy street/suffix/city/ZIP if obviously wrong. **Do
   NOT touch the State field** — leave it exactly as-is (policy; "CA"
   normalization is a separate pass).
8. **Duplicates:** if you spot a duplicate (e.g. "St" vs "Street", same
   address), add a Note on **both** records naming the twin. Never merge/delete.
9. **Log the outcome** to the checkpoint (§4) and move to the next lead.

---

## 3. The HOLD rule (do not guess)

Under Contract and Closed each need a specific REI **Market Status** value, and
those values are **not yet confirmed** (SOP v2 §8). Until Jonathan confirms the
mapping:

- Do **not** set a status for these leads.
- Instead add a Note, e.g.:
  > "Determined stage: Under Contract (signed contract per note dated ___).
  > Holding — Market Status value for this stage not yet confirmed."
- Log the lead as `held`.

When the mapping is confirmed, a later pass revisits only the `held` leads.

---

## 4. Checkpoint & resume (this is what makes it survivable)

Maintain a **checkpoint log** — a Google Sheet or a CSV the agent appends to as
it goes. One row per processed lead:

```
property_id, address, outcome, target_stage, reason, timestamp
```

`outcome` is one of: `verified | held | flagged | left_new | error`.

Rules:
- **Append a row the moment a lead is finished** — before moving on. The log is
  the source of truth for "what's done".
- **After every 25 leads**, post a one-line batch summary (counts by outcome)
  and note the last `property_id`.
- **On resume** (new session, or after a drop): open the log, find the last
  `property_id`, and continue from the next New lead not already in the log.
  A lead already in the log is **never** re-processed.

This guarantees a dropped connection loses at most the single in-flight lead,
which the next session re-checks.

---

## 5. If the connection drops mid-run

1. Reconnect / reload the REI extension and re-open the Pipeline.
2. Open the checkpoint log and read the last recorded `property_id`.
3. **Re-verify the in-flight lead** (the one after the last logged row): open it
   fresh and check whether the last intended change actually saved.
   - If it saved → log it and continue.
   - If not → redo it per §2, then continue.
4. Resume the batch. Do not start over.

---

## 6. Per-batch summary (report every 25)

After each batch of 25, post:

```
Batch N (leads X–Y):
  verified   __   (→ Evaluating, reload-confirmed)
  held       __   (Under Contract / Closed — awaiting mapping)
  flagged    __   (manual review)
  left_new   __
  error      __
  last_id: ________   remaining New (approx): ________
```

Attach the flagged and held property IDs so a human can follow up.

---

## 7. End-of-run report (for Jonathan / the Cherry report)

- Totals by outcome across the whole run.
- **Remaining New** count.
- **Flagged** list (manual review) with reasons.
- **Held** list (awaiting the Market Status mapping).
- **Duplicate pairs** found.
- Any `error` leads and whether a re-check cleared them.
- A note confirming: no records merged, deleted, or had data moved; State fields
  untouched; all changes reversible.

---

## 8. Guardrails (never do these)

- ❌ Never set the **State** field to "California" (or anything) — leave it.
- ❌ Never **merge or delete** a duplicate — flag both with a note.
- ❌ Never **guess** an Under Contract / Closed Market Status value — HOLD.
- ❌ Never decide status from a **tag** — decide from notes/activity.
- ❌ Never trust a dropdown selection without a **reload-verify**.
- ❌ Never re-process a lead already in the checkpoint log.

---

**RUNBOOK READY — for the Cowork batch run. Same decision rules as the API tool;
only the hands are different.**
