# Pipe-Automation

Working repository for the **Pipeline Status Cleanup** effort — Equity Track / Twin Home Buyer, on REI BlackBook.

## Goal

Clean up the ~2,442-lead "Add New Properties" pipeline in REI BlackBook: set each lead's correct status from its activity, confirm the attached contact, tidy addresses, and flag (never merge/delete) duplicates.

## Documents

| File | What it is |
| :-- | :-- |
| [`Pipeline_Status_Cleanup_SOP_v2.md`](./Pipeline_Status_Cleanup_SOP_v2.md) | The current standard operating procedure. v2 bakes in every fix from the July 11 test run. **Start here.** |
| [`Pipeline_Status_Cleanup_Test_Run_Handoff.md`](./Pipeline_Status_Cleanup_Test_Run_Handoff.md) | Handoff report from the July 11, 2026 manual proof-of-concept test run (~45 leads). Records what worked, what broke, and the decisions/next actions for Jonathan. |
| [`docs/automation_flow.md`](./docs/automation_flow.md) | The full automation flow — architecture, per-lead flow, reliability design, and how to run it. |

## Automation & dashboard

A runnable scaffold that implements the SOP as an API-driven batch job with a live dashboard.

```bash
pip install -r requirements.txt
cp .env.example .env

# Runs offline against bundled fixtures (DATA_SOURCE=fixture) — no REI needed:
python -m pipeline_automation.cli counts     # pipeline stage counts
python -m pipeline_automation.cli run        # cleanup run (dry-run by default)
python -m pipeline_automation.cli status     # run-state summary
pytest -q                                    # decision-logic tests

# Live dashboard (stat tiles, progress, stage breakdown, decision log):
uvicorn pipeline_automation.dashboard.app:app --reload
```

Set `DATA_SOURCE=rei` + credentials in `.env` to run against the live REI
BlackBook API. All REI-specifics are isolated in `pipeline_automation/rei_client.py`
(endpoint paths marked `CONFIRM:` need checking against the
[developer portal](https://developer.blackbookcloud.com/)). Key safety
properties: dry-run by default, checkpoint/resume, set→reload→verify on every
write, and **hold-and-flag** (never guess) for status values not yet confirmed.

### Layout

```
pipeline_automation/
  decision.py     # SOP v2 status logic (pure, unit-tested)
  rei_client.py   # REI adapter — FixtureClient (offline) + ReiApiClient (live)
  runner.py       # batch loop: fetch → decide → write → verify → checkpoint
  checkpoint.py   # SQLite run-state / resume
  cli.py          # run / status / counts
  dashboard/      # FastAPI backend + single-file live UI
  fixtures/       # sample leads exercising every decision path
tests/            # decision-engine tests
```

## Status

- **Decision logic:** validated in the test run — sound.
- **Blocker for scale:** interactive browser-driving is unreliable (frequent disconnects). Full backlog should run in **Claude Cowork batch mode** with checkpoint/resume and auto-verify (see SOP v2 §9).
- **Open items before the full run:** see SOP v2 §8 and handoff report §8.
