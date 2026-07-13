"""The decision engine — SOP v2 status logic.

Given a Property (with its attached Contact), decide the target stage and the
action the runner should take. This is pure, deterministic, and unit-tested:
it does no I/O so the logic can be validated without touching REI.

Rules (SOP v2 sections 3-5):
  * New            -> no attached contact AND no activity. Leave as-is.
  * Evaluating     -> any call/text/email/comps/offer activity on the contact.
                      Written as Market Status "Follow up".
  * Under Contract -> a signed contract / accepted offer is noted.
  * Closed         -> deal closed or dead per the most recent note.
  * Manual review  -> activity is unclear or conflicting. Leave status, note it.

Key nuances baked in from the July 11 test run:
  * Decide on notes/ACTIVITY, not tags. Stale "Dead Lead" tags are common on
    active contacts (section 4).
  * A "dead" tag that conflicts with recent outreach and is NOT confirmed by a
    note -> treat as active (Evaluating) if outreach is clearly current, else
    manual review.
  * Under Contract / Closed Market Status values are OPEN ITEMS (section 8).
    When we determine one of those stages but the mapping is unconfirmed, we
    HOLD and flag rather than guess.
"""

from __future__ import annotations

import re
from typing import Optional

from .config import Settings, get_settings
from .models import Action, Contact, Decision, Property, Stage

# Activity kinds that count as "someone worked this lead".
_OUTREACH_KINDS = {"call", "text", "email", "comps", "offer"}

# Tags that (stale-ly) suggest a dead lead. Used only for CONFLICT detection,
# never as the basis for a status decision.
_DEAD_TAG_PATTERNS = [
    r"dead\s*lead",
    r"lost\s*deal",
    r"not\s*interested",
    r"remove\s*from\s*list",
    r"unresponsive",
    r"invalid\s*contact",
]

# Note phrases that CONFIRM a deal is dead/closed.
_CLOSED_DEAD_PATTERNS = [r"\bdead\b", r"deal\s*(is\s*)?dead", r"closed\s*lost", r"no\s*further\s*action"]
_CLOSED_WON_PATTERNS = [r"closed\s*won", r"deal\s*closed", r"sold", r"funded"]
_UNDER_CONTRACT_PATTERNS = [r"under\s*contract", r"signed\s*contract", r"accepted\s*offer", r"contract\s*signed"]

# Phrases indicating the lead came BACK to life after a dead/closed signal.
# When these co-occur with a dead/closed note the signals conflict (e.g. 522
# Seacliff: Oct-2025 "no further actions" vs. May-2026 re-inquiry) -> manual
# review, never a silent Closed.
_REENGAGE_PATTERNS = [
    r"re-?inquiry", r"re-?engag", r"still\s*interested", r"reached\s*back\s*out",
    r"new\s*inquiry", r"circled\s*back", r"following\s*up\s*again",
]


def _matches_any(text: str, patterns: list[str]) -> bool:
    return any(re.search(p, text, re.IGNORECASE) for p in patterns)


def _has_dead_tag(contact: Contact) -> bool:
    joined = " | ".join(contact.tags).lower()
    return _matches_any(joined, _DEAD_TAG_PATTERNS)


def _notes_blob(contact: Contact) -> str:
    return " \n ".join(contact.notes)


def _hold_or_set(stage: Stage, value: Optional[str], prop: Property, reason: str) -> Decision:
    """Return SET_STATUS if the Market Status value is configured, else HOLD."""
    if value:
        return Decision(prop.property_id, Action.SET_STATUS, stage, value, reason)
    return Decision(
        prop.property_id,
        Action.HOLD,
        stage,
        None,
        reason + " — Market Status value for this stage is unconfirmed (SOP v2 §8); holding.",
        note=f"Determined stage '{stage.value}' but the Market Status mapping is not yet "
        f"confirmed. Holding write pending Jonathan's confirmation.",
    )


def classify(prop: Property, settings: Optional[Settings] = None) -> Decision:
    """Return the Decision for a single property."""
    settings = settings or get_settings()
    contact = prop.contact

    # 1. Untouched -> stays New.
    if not prop.has_contact and (contact is None or not contact.has_activity):
        return Decision(
            prop.property_id, Action.LEAVE_NEW, Stage.NEW, None,
            "No attached contact and no activity — correct as New.",
        )

    # A contact exists (or activity exists). Inspect it.
    contact = contact or Contact()
    notes = _notes_blob(contact)
    reengaged = _matches_any(notes, _REENGAGE_PATTERNS)

    # A dead/closed note that co-occurs with a re-engagement signal is a genuine
    # conflict -> manual review (SOP v2 §5), before any Closed/UC determination.
    if reengaged and _matches_any(
        notes, _CLOSED_DEAD_PATTERNS + _CLOSED_WON_PATTERNS + _UNDER_CONTRACT_PATTERNS
    ):
        return Decision(
            prop.property_id, Action.MANUAL_REVIEW, Stage.NEW, None,
            "Conflict: a dead/closed note co-occurs with a re-engagement signal.",
            note="Conflicting notes — a dead/closed signal and a later re-inquiry both "
            "present. Left as-is for manual review.",
        )

    # 2. Under Contract — a note confirms a signed contract / accepted offer.
    if _matches_any(notes, _UNDER_CONTRACT_PATTERNS):
        return _hold_or_set(
            Stage.UNDER_CONTRACT, settings.market_status_under_contract, prop,
            "Note indicates a signed contract / accepted offer.",
        )

    # 3. Closed — a note confirms the deal closed (won) or is dead.
    if _matches_any(notes, _CLOSED_WON_PATTERNS):
        return _hold_or_set(
            Stage.CLOSED, settings.market_status_closed_won, prop,
            "Note indicates the deal closed (won).",
        )
    if _matches_any(notes, _CLOSED_DEAD_PATTERNS):
        return _hold_or_set(
            Stage.CLOSED, settings.market_status_closed_dead, prop,
            "Note confirms the deal is dead.",
        )

    # 4. Activity present -> Evaluating (decide on activity, not tags).
    if contact.has_activity:
        has_outreach = any(a.kind in _OUTREACH_KINDS for a in contact.activities)
        dead_tag = _has_dead_tag(contact)

        if has_outreach and not dead_tag:
            return Decision(
                prop.property_id, Action.SET_STATUS, Stage.EVALUATING,
                settings.market_status_evaluating,
                "Outreach/analysis activity on the attached contact.",
            )

        if has_outreach and dead_tag:
            # Conflict: stale dead tag vs. current outreach, no note confirming dead.
            recent_outreach = _most_recent_outreach_ts(contact)
            return Decision(
                prop.property_id, Action.SET_STATUS, Stage.EVALUATING,
                settings.market_status_evaluating,
                "Stale 'dead' tag conflicts with current outreach and no note confirms "
                f"the deal is dead (latest outreach {recent_outreach}); treating as active "
                "per SOP v2 §4.",
            )

        # Activity exists but it's non-outreach (e.g. only a system note/task) and
        # signals are mixed -> manual review.
        return Decision(
            prop.property_id, Action.MANUAL_REVIEW, Stage.NEW, None,
            "Activity present but not clear outreach; signals mixed.",
            note="Activity on the contact is ambiguous (no clear outreach and no "
            "confirming note). Left as-is for manual review.",
        )

    # 5. Contact attached but zero activity, with a stale dead tag and nothing else
    #    -> ambiguous. Leave and flag.
    if _has_dead_tag(contact):
        return Decision(
            prop.property_id, Action.MANUAL_REVIEW, Stage.NEW, None,
            "Contact carries a 'dead' tag but shows no activity to corroborate it.",
            note="Contact tagged dead but no activity/notes to confirm. Left as-is for "
            "manual review.",
        )

    # 6. Contact attached, no activity, no tags -> nobody worked it yet -> New.
    return Decision(
        prop.property_id, Action.LEAVE_NEW, Stage.NEW, None,
        "Contact attached but no activity yet — correct as New.",
    )


def _most_recent_outreach_ts(contact: Contact) -> str:
    ts = [a.timestamp for a in contact.activities if a.kind in _OUTREACH_KINDS and a.timestamp]
    return max(ts) if ts else "unknown"
