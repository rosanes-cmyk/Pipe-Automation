"""Unit tests for the SOP v2 decision engine."""

from pipeline_automation.config import Settings
from pipeline_automation.decision import classify
from pipeline_automation.models import Action, Activity, Contact, Property, Stage


def _settings(**over) -> Settings:
    base = dict(
        data_source="fixture",
        market_status_evaluating="Follow up",
        market_status_under_contract=None,
        market_status_closed_won=None,
        market_status_closed_dead=None,
    )
    base.update(over)
    return Settings(**base)


def prop(contact=None, **kw) -> Property:
    return Property(property_id=kw.get("pid", "p1"), contact=contact)


def test_no_contact_no_activity_stays_new():
    d = classify(prop(contact=None), _settings())
    assert d.action is Action.LEAVE_NEW
    assert d.target_stage is Stage.NEW


def test_contact_no_activity_stays_new():
    c = Contact(name="Someone", tags=["Seller"], activities=[])
    d = classify(prop(contact=c), _settings())
    assert d.action is Action.LEAVE_NEW


def test_outreach_becomes_evaluating_follow_up():
    c = Contact(name="A", activities=[Activity("call", "2026-07-11T09:00:00")])
    d = classify(prop(contact=c), _settings())
    assert d.action is Action.SET_STATUS
    assert d.target_stage is Stage.EVALUATING
    assert d.market_status == "Follow up"


def test_stale_dead_tag_with_outreach_treated_active():
    c = Contact(
        name="A", tags=["Dead Lead", "Lost Deal"],
        activities=[Activity("text", "2026-07-11T09:00:00")],
    )
    d = classify(prop(contact=c), _settings())
    assert d.action is Action.SET_STATUS
    assert d.target_stage is Stage.EVALUATING
    assert "stale" in d.reason.lower()


def test_dead_tag_no_activity_is_manual_review():
    c = Contact(name="A", tags=["Dead Lead"], activities=[])
    d = classify(prop(contact=c), _settings())
    assert d.action is Action.MANUAL_REVIEW
    assert d.note


def test_under_contract_note_holds_when_mapping_unconfirmed():
    c = Contact(name="A", activities=[Activity("offer", "2026-07-01T10:00:00")],
                notes=["Signed contract received, accepted offer"])
    d = classify(prop(contact=c), _settings())
    assert d.action is Action.HOLD
    assert d.target_stage is Stage.UNDER_CONTRACT
    assert d.market_status is None


def test_under_contract_sets_when_mapping_confirmed():
    c = Contact(name="A", activities=[Activity("offer", "2026-07-01T10:00:00")],
                notes=["accepted offer, contract signed"])
    d = classify(prop(contact=c), _settings(market_status_under_contract="Contract sent"))
    assert d.action is Action.SET_STATUS
    assert d.market_status == "Contract sent"


def test_closed_dead_note_holds():
    c = Contact(name="A", activities=[Activity("call", "2026-06-01T10:00:00")],
                notes=["Seller confirmed deal is dead, no further action"])
    d = classify(prop(contact=c), _settings())
    assert d.action is Action.HOLD
    assert d.target_stage is Stage.CLOSED


def test_dead_note_with_reengagement_is_manual_review():
    # 522 Seacliff pattern: old "no further actions" vs. a later re-inquiry.
    c = Contact(
        name="A", activities=[Activity("note", "2026-05-02T09:00:00")],
        notes=["Oct 2025: no further actions", "May 2026: re-inquiry received"],
    )
    d = classify(prop(contact=c), _settings())
    assert d.action is Action.MANUAL_REVIEW
    assert "conflict" in d.reason.lower()


def test_closed_won_note_sets_when_confirmed():
    c = Contact(name="A", activities=[Activity("call", "2026-06-01T10:00:00")],
                notes=["Deal closed and funded"])
    d = classify(prop(contact=c), _settings(market_status_closed_won="Closed - Won"))
    assert d.action is Action.SET_STATUS
    assert d.target_stage is Stage.CLOSED
    assert d.market_status == "Closed - Won"
