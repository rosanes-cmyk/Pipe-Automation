# Pipe-Automation

Working repository for the **Pipeline Status Cleanup** effort — Equity Track / Twin Home Buyer, on REI BlackBook.

## Goal

Clean up the ~2,442-lead "Add New Properties" pipeline in REI BlackBook: set each lead's correct status from its activity, confirm the attached contact, tidy addresses, and flag (never merge/delete) duplicates.

## Documents

| File | What it is |
| :-- | :-- |
| [`Pipeline_Status_Cleanup_SOP_v2.md`](./Pipeline_Status_Cleanup_SOP_v2.md) | The current standard operating procedure. v2 bakes in every fix from the July 11 test run. **Start here.** |
| [`Pipeline_Status_Cleanup_Test_Run_Handoff.md`](./Pipeline_Status_Cleanup_Test_Run_Handoff.md) | Handoff report from the July 11, 2026 manual proof-of-concept test run (~45 leads). Records what worked, what broke, and the decisions/next actions for Jonathan. |

## Status

- **Decision logic:** validated in the test run — sound.
- **Blocker for scale:** interactive browser-driving is unreliable (frequent disconnects). Full backlog should run in **Claude Cowork batch mode** with checkpoint/resume and auto-verify (see SOP v2 §9).
- **Open items before the full run:** see SOP v2 §8 and handoff report §8.
