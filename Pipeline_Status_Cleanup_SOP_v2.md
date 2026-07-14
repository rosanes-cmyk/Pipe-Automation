# SOP — Pipeline Status Cleanup (v2)

**Equity Track / Twin Home Buyer**

- **Owner:** Jonathan
- **Platform:** Claude Cowork (batch) + REI BlackBook
- **Version:** v2 — revised after the July 11, 2026 manual test run. All fixes from the [Test Run Handoff Report](./Pipeline_Status_Cleanup_Test_Run_Handoff.md) are baked in.

> **What changed from v1 (summary)**
> - Read the attached **contact**, not the property Notes tab (Notes is almost always empty).
> - Status is set through **Market Status = "Follow up"** for Evaluating (dropdown value alone silently reverts; the save handler must fire and be reload-verified).
> - Decide on **notes/activity, not tags** — stale "Dead Lead" tags are common on active contacts.
> - **State field:** leave as-is; do **not** force "California". CA normalization is a separate CSV/API pass.
> - Run in **Cowork batch mode** with checkpoint/resume and auto-verify — not interactive browser-driving.

---

## 1. Purpose

Go through the Property Pipeline and set each lead's correct status. Read the last activity **on the attached contact**, change the status from "New" to the correct stage, confirm the right contact is attached, and flag (never merge/delete) duplicates and unclear records.

---

## 2. Current Pipeline Snapshot

| Add New Properties | Evaluating | Under Contract | Closed |
| :-: | :-: | :-: | :-: |
| 2,442 | 42 | 3 | 144 |

_Most of the work is in the 2,442 "Add New Properties" bucket, where everything is defaulting to "New."_

---

## 3. Core Rule

**"New" only applies if no one has touched or connected to the lead** — i.e. no attached contact **and** no notes/activity.

If there is any activity on the attached contact, change the status to match. If there is no contact and no activity, leave it "New."

---

## 4. Where the activity actually lives

- **Read the attached CONTACT record**, not the property's Notes tab. The property Notes tab is almost always empty; the real call/text/email/comps/offer activity is on the attached contact.
- **Decide on notes/activity, not tags.** Contacts frequently carry stale "Dead Lead / Lost Deal / Unresponsive / Invalid Contact Info" tags while the notes show active, recent outreach.
  - "Dead" tag **+** recent call/text **+** no note confirming the deal is dead → treat as **active (Evaluating)** if outreach is clearly current.
  - Signals genuinely mixed / conflicting → **manual review** (leave status unchanged, write a note).

---

## 5. How to set the status

Set status from the latest activity on the attached contact:

| Set status to… | When the attached contact shows… | How to set it in REI |
| :-- | :-- | :-- |
| **New** (leave as-is) | No notes and no contact — nobody has touched the lead | No change |
| **Evaluating** | Any contact made / analysis started — called, texted, emailed, comps run, offer being worked | Set **Market Status = "Follow up"** (confirmed to surface in the Evaluating rollup) |
| **Under Contract** | A signed contract / accepted offer is noted | Set the Under-Contract Market Status value _(confirm exact value — see §8)_ |
| **Closed** | Deal closed or dead per the most recent note | Set the Closed Market Status value _(confirm Closed-won vs Closed-dead — see §8)_ |
| **Manual review** | Activity unclear or conflicting, OR the contact's Lead Stage / Call Disposition is a **review** status (e.g. "For Review", "Needs Review") | Leave status unchanged; write a note explaining why |

### Save mechanism (critical)

Setting the dropdown value alone **silently reverts**. A status change only persists when the field's save handler fires. **Every status change must be reload-verified**: set → reload the record → confirm the value stuck. If it did not stick, retry.

---

## 6. Workflow steps (per lead)

1. Open the property record.
2. Open the **attached contact**; confirm it's the right one (attach/fix if clearly wrong, flag if ownership can't be confirmed).
3. Read the most recent activity on the contact.
4. Set the status per §5 — then **reload and verify** it persisted.
5. Address: tidy street/suffix/city/ZIP where obvious. **Leave the State field unchanged** (see §7). Capture ZIPs documented in the record's own notes.
6. Flag duplicates (note on **both** records; do not merge or delete).
7. Move to the next lead. Checkpoint per §9.

---

## 7. System limits & standing decisions

- **State as "CA" — leave alone.** The Edit Property Details → State/Province dropdown offers only full names ("California"), no "CA" and no autocomplete. **Do not set "California."** Leave the state field as-is (blank or whatever it holds). True "CA" normalization requires a CSV export/re-import or the REI BlackBook API — a separate pass, out of scope for the interactive/Cowork run.
- **Bulk CSV import cannot update in place.** The import screen has no property-ID field and no "update existing" option, so importing creates duplicates rather than updating. State fixes need REI BlackBook support or their API.
- **Duplicates are flagged only** — never merged, deleted, or cross-populated. In every observed pair one twin holds the contact/activity and the other holds the cleaner address/ZIP; the human merge decision keeps the contact from one and the address from the other.
- **Uncertain contacts are flagged, not changed.**
- Everything written is reversible: flags are Notes (editable/deletable); status changes are single-field edits.

---

## 8. Open items to confirm before the full run

1. **Market Status mapping for the two closed stages:** which value = Closed-won, which = Closed-dead.
2. **Assign the remaining granular Market Status values** (Interested, Nurture, Made an Offer, Contract sent, Unresponsive, etc.) to a pipeline stage.
3. **Confirm the Under Contract value** (none seen in the test sample).

Until confirmed, treat any lead that would be Under Contract or Closed as **manual review** and note it, rather than guessing the value.

---

## 9. Running the full backlog (~2,442 records) — Cowork batch mode

The July 11 test showed the logic is sound but interactive browser-driving is not reliable at scale (8+ disconnects across ~45 leads, several mid-save). Run the full job as an **agentic Cowork batch**, not by hand:

- **Batch execution**, not interactive browser-driving.
- **Checkpoint & resume every N records** (e.g. 25) so a dropped connection never loses place.
- **Auto-verify every save** (set → reload → confirm); retry on failure.
- **Retry-on-drop:** reconnect and re-verify the in-flight record before continuing.
- **Per-page batches (100)** with a summary for spot-checking.
- A **stable, authenticated session** for the run's duration.
- Optional first pass: a **duplicate + address sweep** from the list view to catch dupes/formatting fast, opening records only when a write is needed.

---

## 10. Notes

- No sign-off needed — update statuses directly based on activity.
- Leads with no activity and no contact stay "New."
- If activity is unclear, leave the lead unchanged and write a note so it can be reviewed.

**SOP v2 READY — for the Cowork batch run.**
