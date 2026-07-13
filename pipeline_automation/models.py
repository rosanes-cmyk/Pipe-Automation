"""Domain models for the pipeline cleanup.

These mirror the concepts in SOP v2: a Property (lead) in the pipeline, the
Contact attached to it (where the real activity lives), and the Decision the
engine produces for each lead.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class Stage(str, Enum):
    """Pipeline stages in REI BlackBook."""

    NEW = "New"
    EVALUATING = "Evaluating"
    UNDER_CONTRACT = "Under Contract"
    CLOSED = "Closed"


class Action(str, Enum):
    """What the runner should do with a lead."""

    LEAVE_NEW = "leave_new"          # no contact, no activity — correct as New
    SET_STATUS = "set_status"        # move to a determined stage
    MANUAL_REVIEW = "manual_review"  # ambiguous/conflicting — leave, write a note
    HOLD = "hold"                    # stage determined but Market Status value not
                                     # yet confirmed (SOP v2 section 8)


@dataclass
class Activity:
    """A single activity on the attached contact."""

    kind: str            # call | text | email | comps | offer | note | task
    timestamp: str       # ISO-8601; kept as string to avoid tz guessing
    detail: str = ""
    inbound: bool = False


@dataclass
class Contact:
    """The contact attached to a property. The real activity lives here, not on
    the property Notes tab (SOP v2 section 4)."""

    contact_id: Optional[str] = None
    name: str = ""
    tags: list[str] = field(default_factory=list)
    activities: list[Activity] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    @property
    def has_activity(self) -> bool:
        return bool(self.activities)


@dataclass
class Property:
    """A pipeline lead."""

    property_id: str
    address: str = ""
    city: str = ""
    state: str = ""
    zip_code: str = ""
    stage: Stage = Stage.NEW
    market_status: str = ""
    contact: Optional[Contact] = None

    @property
    def has_contact(self) -> bool:
        return self.contact is not None and (
            bool(self.contact.contact_id) or bool(self.contact.name)
        )


@dataclass
class Decision:
    """The engine's verdict for one lead."""

    property_id: str
    action: Action
    target_stage: Stage
    market_status: Optional[str]   # value to write, or None if HOLD/leave
    reason: str
    note: Optional[str] = None     # written to REI when MANUAL_REVIEW / flags

    @property
    def writes_status(self) -> bool:
        return self.action is Action.SET_STATUS and self.market_status is not None
