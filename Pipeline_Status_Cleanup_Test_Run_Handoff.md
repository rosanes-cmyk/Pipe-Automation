# Pipeline Status Cleanup — Test Run Handoff Report

**Equity Track / Twin Home Buyer · REI BlackBook · prepared for Jonathan**

- **Date:** July 11, 2026
- **Scope of this run:** manual test of the Pipeline Status Cleanup SOP via the Claude-in-Chrome browser extension, driving REI BlackBook by hand as a proof-of-concept before a full automated run.
- **Companion file:** [`Pipeline_Status_Cleanup_SOP_v2.md`](./Pipeline_Status_Cleanup_SOP_v2.md) (the revised SOP with all fixes below baked in).

---

## 1. Headline

The SOP's decision logic is sound — it produced a correct, defensible status call on every lead reached, including the messy ones. The blocker is **not** the logic; it is **execution reliability**: the browser connection dropped 8+ times (several mid-save), so a lead-by-lead browser run cannot complete the ~2,442-record backlog unattended.

**Recommendation:** run the full job in Claude Cowork batch mode with checkpoint/resume and auto-verify (details in §7).

---

## 2. What was processed

Roughly **45 leads** were reviewed across the session.

| Outcome | Count |
| :-- | :-- |
| → Evaluating (Market Status "Follow up"), saved & verified | 11 |
| → Evaluating — determined but NOT yet saved (connection dropped) | 1 |
| Left New (no attached contact + no notes) | ~28 |
| Manual-review flags written in REI (status left New) | 3 |
| Under Contract | 0 |
| Closed | 0 |

No lead legitimately required Under Contract or Closed in the sample — the entire New backlog splits cleanly into **New** (untouched) and **Evaluating** (any contact/analysis started).

---

## 3. Confirmed decision rules (validated in this run)

- **New** → no attached contact and no notes/activity. (Most freshly-imported leads.)
- **Evaluating** → any call/text/email/comps/offer activity on the attached contact. Set Market Status to **"Follow up"** (confirmed: "Follow up" records surface in the Evaluating rollup).
- **Under Contract** → signed contract / accepted offer. (None seen.)
- **Closed** → deal closed or dead per the most recent note. (None seen.)
- **Manual review** (leave status unchanged) → activity is unclear or conflicting.

**Read the attached CONTACT, not the property Notes tab** — the property Notes tab is almost always empty; the real activity lives on the contact.

**Tags vs. notes:** decide on notes/activity, not tags. Contacts frequently carry stale "Dead Lead / Lost Deal / Unresponsive" tags while the notes show active outreach. When a "dead" tag conflicts with a recent call/text and no note confirms the deal is dead → treat as active (Evaluating) if there's clear current outreach, or manual review if the signals are genuinely mixed.

**Save mechanism:** setting the dropdown value alone silently reverts. The value only persists when the field's save handler fires, and it must be reloaded to verify. Every Evaluating change below was reload-verified.

---

## 4. Leads set to Evaluating (saved & verified)

| Property | ID | Why Evaluating |
| :-- | :-- | :-- |
| 309 De Anza Dr (twin) | 3184216 | shared contact; call/analysis/follow-up |
| 309 De Anza Dr (twin) | 3184215 | same shared contact |
| 3770 Lincoln Blvd | 3184208 | Arleen Scoggins — call + follow-up text (Jul 11) |
| 1549 5th Avenue | 3180743 | MK Ding — comp analysis + text (Hot) |
| 16125 Bittner Road | 3180689 | Liam — multiple calls, visit scheduling |
| 450 Sebastopol Ave | 3184129 | Craig Larsen — answered call |
| 3028 Longview Rd | 3184025 | Daniel Viera — answered call (nurture) |
| 450 Country Club Dr | 3181032 | Peter Nordon — calls + text |
| 492 Umland Dr | 3180730 | Rob Walker — comps + offer worked + Monday visit |
| 1004 Rockspring Way | 3180644 | Manuel Ochoa — call + text |
| 1070 Bare Oak Ave | 3180623 | call + text (Jul 11) + follow-up task |

### PENDING — one record to double-check

| Property | ID | Decision | Status |
| :-- | :-- | :-- | :-- |
| 138 Penhurst Court, Daly City | 3180022 | Evaluating (full comp analysis Jul 10, offers $1.264M–$1.312M, calls/texts) | Save command fired (New → "Follow up") but the connection dropped before the reload-verify. Almost certainly committed (every prior save that reached this point persisted), but Jonathan should confirm this one record shows "Follow up." |

---

## 5. Leads left New (no attached contact + no notes — correct, no change)

1760 Magazine St (3184126) · 1549 5th Ave (3180745) · 16125 Bittner Rd (3184185) · 30011 Pocahantas Dr (3184223) · 26928 Palomares Rd (3184202) · 970 Camino Coronado (3184201) · 134 Hyde Pl (3184196) · 450 Countryside Cir (3184193) · 2729 78th Ave (3184188) · 2021 Del Monte St (3184183) · 212 Haven Ct (3184182) · 975 Merced Ave (3184172) · 3539 Chanslor Ave (3181001) · 1250 Louisiana St (3184098) · 128 Gardenia Way (3175686) · 721 S Elmhurst Ave (3184036) · 5726 Solano Ave (3184032) · 630 San Pedro Ave (3184005) · 399 Arroyo Ave (3170334) · 5521 Picardy Dr S (3183976) · 2932 Tourbrook Way (3181006) · 728 Tampico (3181008) · 1508 Bennington Ct (3181000) · 270 Grand Ave (3180803) · 2483 Diablo Ranch Pl (3180801) · 446 Silliman St (3180764) · 5 Lancaster Cir (3180760) · 492 Umland Dr (3180732) · 1185 Sterling Ave (3180614) · 11 Sims Rd (3180680) · 2925 Mabel St (3180607)

---

## 6. Flags

### Manual-review flags — written in REI as Notes (status left New)

| Property | ID | Reason |
| :-- | :-- | :-- |
| 4738 London Drive | 3184203 | Conflict: contact tagged Dead Lead/Lost Deal/Invalid Contact Info, but recent inbound text and no note confirming dead. Also state = "California". |
| 522 Seacliff Pl | 2972672 | Conflict: "Not Interested / Remove From List" history + Oct 2025 "no further actions" note vs. May 2026 re-inquiry. Duplicate (Pl/Place; internal dispute already filed). Conflicting ZIP (94801 vs 94804). |
| "Mariarivera @$icloud" | 3184226 | Invalid/malformed record — address field holds a name/email fragment; needs re-entry. |

### Duplicate flags — written in REI as Notes on BOTH records

- 16125 Bittner Rd (3184185) ↔ 16125 Bittner Road (3180689)
- 492 Umland Dr (3180732) ↔ 492 Umland Dr (3180730)
- 522 Seacliff Pl (2972672) → its "Place" twin (note on 2972672)

### Duplicate pairs IDENTIFIED but not yet flagged in REI (recommend flagging)

_(These were caught by scanning the address list — the efficient way to find dupes. The 309 and 1549 pairs were identified before the in-REI note method was adopted, so confirm/add their flags.)_

- 309 De Anza Dr (3184216 ↔ 3184215)
- 1549 5th Avenue (3180743) ↔ 1549 5th Ave (3180745)
- 12 E St, Empire (3180387 ↔ 3180425)
- 1746 Mirabella Ct (3179965) ↔ Court (3179938)
- 2215 Santa Fe Dr (3180229 ↔ 3179929)
- 2328 Lafayette Dr (3179883) ↔ Drive (3178819)

> **Split-data pattern:** in every duplicate pair, one twin holds the attached contact/activity and the other holds the cleaner address/ZIP. A human merge should keep the contact from one and the address from the other. Per SOP, records were flagged only — never merged, deleted, or cross-populated.

---

## 7. Two blockers that need a decision / design change

### A. Address "state" field cannot be set to "CA" via the UI — DECIDED: leave alone

The Edit Property Details → State/Province dropdown offers only full state names ("California"), no "CA". The SOP wants "CA" and says to leave-and-flag if CA can't be saved. **Decision made this run:** leave all state fields as-is (blank or "California"); do not force "California". Getting true "CA" requires a CSV export/re-import or API pass, which is out of scope for the interactive tool.

ZIPs that were missing but documented in a record's own notes were captured for reference: 450 Sebastopol 95401 · 3028 Longview 94509 · 450 Country Club 95401 · 1004 Rockspring 94531 · 1070 Bare Oak 93618 (Dinuba) · 1549 94606 · 138 Penhurst 94015.

### B. Connection reliability — the real blocker for scale

8+ disconnects across ~45 leads, several mid-action and twice mid-save; each required a manual extension reload. At this rate the 2,442-record backlog cannot run start-to-finish in the browser.

**Required for a full run (recommended: Claude Cowork batch mode):**

- Agentic batch execution, not interactive browser-driving.
- Checkpoint & resume every N records (e.g. 25) so a drop never loses place.
- Auto-verify every save (set → reload → confirm); retry on failure.
- Retry-on-drop: reconnect and re-verify the in-flight record before continuing.
- Process in per-page batches (100) with a summary for spot-checking.
- A stable, authenticated session for the run's duration.

---

## 8. Immediate next actions for Jonathan

1. **Confirm the Market Status mapping** for the two unresolved stages in SOP v2 §5: which value = Closed-won, which = Closed-dead; and assign the other granular values (Interested, Nurture, Made an Offer, Contract sent, Unresponsive, etc.) to a stage.
2. **Confirm one record:** 138 Penhurst Court (3180022) shows Market Status "Follow up" — the save was fired but not reload-verified before the connection dropped.
3. **Decide on the duplicate back-flags** for the six identified pairs in §6.
4. **Decide the address/state approach** (accept the leave-alone decision, or schedule a CSV/API state-normalization pass).
5. **Green-light the Cowork batch run** using SOP v2 + the §7 requirements.

---

_Everything written to REI in this run is reversible (all flags are Notes with edit/delete actions; all status changes are single-field edits). No records were merged, deleted, or had data moved between them._
