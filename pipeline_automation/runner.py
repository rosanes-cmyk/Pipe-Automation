"""The batch runner — SOP v2 §9 flow.

Per lead:  fetch -> decide -> (write) -> reload & verify -> checkpoint.

Reliability properties:
  * Checkpoint/resume: every lead is recorded in the StateStore; a resumed run
    skips leads already done, so a dropped connection never loses place.
  * Auto-verify: after writing Market Status, the record is re-fetched and the
    value confirmed (the dropdown silently reverts otherwise — SOP v2 §5).
  * Retry: the set->reload->verify cycle retries up to MAX_VERIFY_RETRIES.
  * Dry-run: DRY_RUN=true computes and records decisions without writing to REI.
  * Hold: a determined stage whose Market Status value is unconfirmed is held +
    flagged, never guessed (SOP v2 §8).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Optional

from .checkpoint import StateStore
from .config import Settings, get_settings
from .decision import classify
from .models import Action, Decision, Property
from .rei_client import PipelineClient, build_client


@dataclass
class RunStats:
    processed: int = 0
    verified: int = 0
    held: int = 0
    flagged: int = 0
    left_new: int = 0
    errors: int = 0


class VerificationError(RuntimeError):
    pass


class Runner:
    def __init__(
        self,
        client: Optional[PipelineClient] = None,
        store: Optional[StateStore] = None,
        settings: Optional[Settings] = None,
        log: Callable[[str], None] = print,
    ):
        self.settings = settings or get_settings()
        self.client = client or build_client(self.settings)
        self.store = store or StateStore(self.settings.state_db)
        self.log = log

    # -- public API --------------------------------------------------------- #
    def run(self, limit: Optional[int] = None) -> RunStats:
        stats = RunStats()
        for prop in self.client.iter_new_leads(self.settings.page_size):
            if limit is not None and stats.processed >= limit:
                break
            if self.store.is_done(prop.property_id):
                continue  # resume: already handled in a previous run
            self._process_one(prop, stats)
            stats.processed += 1
            if stats.processed % self.settings.checkpoint_every == 0:
                self.store.set_meta("last_property_id", prop.property_id)
                self.log(
                    f"[checkpoint] {stats.processed} processed "
                    f"(verified={stats.verified} held={stats.held} "
                    f"flagged={stats.flagged} new={stats.left_new} err={stats.errors})"
                )
        return stats

    # -- per-lead ----------------------------------------------------------- #
    def _process_one(self, prop: Property, stats: RunStats) -> None:
        decision = classify(prop, self.settings)
        try:
            if decision.action is Action.SET_STATUS:
                self._apply_status(decision)
                stats.verified += 1
                self._record(decision, "verified")
            elif decision.action is Action.HOLD:
                stats.held += 1
                self._flag(decision)
                self._record(decision, "held")
            elif decision.action is Action.MANUAL_REVIEW:
                stats.flagged += 1
                self._flag(decision)
                self._record(decision, "flagged")
            else:  # LEAVE_NEW
                stats.left_new += 1
                self._record(decision, "left_new")
        except Exception as exc:  # noqa: BLE001 — record and continue the batch
            stats.errors += 1
            self._record(decision, "error", detail=str(exc))
            self.log(f"[error] {prop.property_id}: {exc}")

    def _apply_status(self, decision: Decision) -> None:
        assert decision.market_status is not None
        if self.settings.dry_run:
            self.log(
                f"[dry-run] would set {decision.property_id} -> "
                f"'{decision.market_status}' ({decision.target_stage.value})"
            )
            return
        last_err: Optional[Exception] = None
        for attempt in range(1, self.settings.max_verify_retries + 1):
            try:
                self.client.set_market_status(decision.property_id, decision.market_status)
                if self._verify(decision):
                    return
                last_err = VerificationError(
                    f"value did not persist (attempt {attempt})"
                )
            except Exception as exc:  # noqa: BLE001
                last_err = exc
            self.log(f"[retry {attempt}] {decision.property_id}: {last_err}")
        raise VerificationError(
            f"failed to verify {decision.property_id} after "
            f"{self.settings.max_verify_retries} attempts: {last_err}"
        )

    def _verify(self, decision: Decision) -> bool:
        """Reload the record and confirm the write stuck (SOP v2 §5)."""
        fresh = self.client.get_property(decision.property_id)
        return fresh is not None and fresh.market_status == decision.market_status

    def _flag(self, decision: Decision) -> None:
        if not decision.note:
            return
        if self.settings.dry_run:
            self.log(f"[dry-run] would flag {decision.property_id}: {decision.note}")
            return
        self.client.add_note(decision.property_id, decision.note)

    def _record(self, decision: Decision, outcome: str, detail: str = "") -> None:
        self.store.record(
            property_id=decision.property_id,
            action=decision.action.value,
            target_stage=decision.target_stage.value,
            market_status=decision.market_status,
            reason=decision.reason,
            outcome=outcome,
            detail=detail or decision.reason,
        )
