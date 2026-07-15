# Full Automation Flow — Pipeline Status Cleanup

End-to-end design for the automated run of `Pipeline_Status_Cleanup_SOP_v2.md`,
plus how the runnable scaffold in `pipeline_automation/` implements it.

The July 11 test proved the **decision logic** is sound; the blocker was
**execution reliability** in the browser. Since REI BlackBook exposes an API,
the automation targets the **API** (reliable) instead of driving the web UI.

---

## 1. Architecture

```
                    ┌─────────────────────────────┐
                    │        REI BlackBook         │
                    │            API               │
                    └──────────────┬──────────────┘
                                   │  (single integration point)
                          ┌────────▼─────────┐
                          │   rei_client.py   │  ReiApiClient / FixtureClient
                          └────────┬─────────┘
             fetch New leads       │        set status / add note
                          ┌────────▼─────────┐
        decision.py ─────▶│     runner.py     │◀───── config.py (.env)
      (SOP v2 logic)      │  fetch→decide→    │
                          │  write→verify→    │
                          │  checkpoint       │
                          └────┬─────────┬────┘
                    records    │         │  reads progress
                          ┌────▼───┐  ┌──▼─────────────┐
                          │checkpoint│  │  dashboard/    │  FastAPI + live UI
                          │ .py     │  │  app.py        │
                          │(SQLite) │  └────────────────┘
                          └─────────┘
```

Everything REI-specific is isolated in `rei_client.py`. Swapping fixtures for
the live API is a one-line config change (`DATA_SOURCE=rei`); nothing else moves.

---

## 2. Per-lead flow

```
for each lead in New bucket (paged, PAGE_SIZE=100):
    if already recorded in state DB:   # resume
        skip
    decision = classify(lead)          # pure SOP v2 logic, no I/O
    switch decision.action:
        SET_STATUS:
            set Market Status
            reload record and VERIFY the value persisted   ← retries MAX_VERIFY_RETRIES
            record outcome = verified
        HOLD:          # stage known, Market Status value unconfirmed (§8)
            write a note explaining the hold
            record outcome = held
        MANUAL_REVIEW: # ambiguous / conflicting
            write a note
            record outcome = flagged
        LEAVE_NEW:     # untouched lead
            record outcome = left_new
    every CHECKPOINT_EVERY leads: persist checkpoint marker
```

### Decision logic (`decision.py`)

| Condition (on the **attached contact**, not the property Notes tab) | Result |
| :-- | :-- |
| No contact **and** no activity | **Leave New** |
| Contact attached, no activity, no dead tag | **Leave New** |
| Any call/text/email/comps/offer activity | **Evaluating** → Market Status "Follow up" |
| Stale "dead" tag **+** current outreach, no note confirming dead | **Evaluating** (treat as active, §4) |
| Dead tag, no activity to corroborate | **Manual review** |
| Note: signed contract / accepted offer | **Under Contract** (held if value unconfirmed) |
| Note: deal closed/funded | **Closed-won** (held if value unconfirmed) |
| Note: deal dead / no further action | **Closed-dead** (held if value unconfirmed) |
| Dead/closed note **+** a re-engagement signal | **Manual review** (conflict, §5) |
| Activity present but not clear outreach; mixed | **Manual review** |

Decisions are made on **notes/activity, never tags**. Tags are used only to
*detect conflict*.

---

## 3. Reliability properties (the §7/§9 requirements, satisfied)

| SOP v2 requirement | How it's met |
| :-- | :-- |
| Agentic batch, not browser-driving | API client + `runner.py` loop |
| Checkpoint & resume every N | `StateStore` records every lead; resumed runs skip done leads (`CHECKPOINT_EVERY`) |
| Auto-verify every save | `Runner._verify` reloads and confirms the value stuck |
| Retry on failure | set→reload→verify retries up to `MAX_VERIFY_RETRIES` |
| Retry-on-drop | a failed verify/exception is recorded as `error` and the batch continues; a re-run retries that lead (not yet marked done) |
| Per-page batches (100) | `PAGE_SIZE`, paged in `iter_new_leads` |
| Nothing guessed | unconfirmed Market Status values → **HOLD + flag**, never a guess (§8) |
| Everything reversible | only single-field Market Status edits + additive Notes; no merge/delete |

---

## 4. Running it

```bash
pip install -r requirements.txt
cp .env.example .env          # edit as needed

# Safe, offline, no REI needed — runs against bundled fixtures:
python -m pipeline_automation.cli counts      # pipeline stage counts
python -m pipeline_automation.cli run         # dry-run cleanup (DRY_RUN defaults true)
python -m pipeline_automation.cli status      # run-state summary

# Live dashboard:
uvicorn pipeline_automation.dashboard.app:app --reload   # http://127.0.0.1:8000
```

### Going live against REI

1. In `.env`: `DATA_SOURCE=rei`, set `REI_API_BASE_URL`, `REI_API_KEY`,
   `REI_AUTH_STYLE`.
2. **Confirm** the endpoint paths and field names marked `CONFIRM:` in
   `rei_client.py` against the REI developer portal
   (<https://developer.blackbookcloud.com/>). These are the only REI-specific
   assumptions in the codebase.
3. Fill in the confirmed Market Status values in `.env`
   (`MARKET_STATUS_UNDER_CONTRACT`, `MARKET_STATUS_CLOSED_WON`,
   `MARKET_STATUS_CLOSED_DEAD`) — until then those leads are held, not guessed.
4. Do a bounded `DRY_RUN=true` pass (`--limit 25`), spot-check the dashboard,
   then set `DRY_RUN=false` and run for real. Resume is automatic if it drops.

---

## 5. Open items before a full production run

These are inputs the automation needs but cannot invent (also in SOP v2 §8):

1. **Confirmed REI API endpoints/auth** (the `CONFIRM:` seams in `rei_client.py`).
2. **Market Status → stage mapping** for Under Contract, Closed-won, Closed-dead,
   and the granular values (Interested, Nurture, Made an Offer, Contract sent,
   Unresponsive, …).
3. **State-field normalization** decision (leave-alone vs. a separate CSV/API
   pass) — out of scope for this flow per §7A.
