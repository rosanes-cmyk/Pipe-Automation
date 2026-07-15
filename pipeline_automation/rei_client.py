"""REI BlackBook client — the single integration point with REI.

Everything REI-specific lives here. Two implementations share one interface:

  * ``FixtureClient`` — reads bundled sample data (pipeline_automation/fixtures).
    No network. This is what runs when DATA_SOURCE=fixture, so the runner and
    dashboard work end-to-end today.
  * ``ReiApiClient``  — talks to the live REI BlackBook API.

    IMPORTANT: the REI developer portal (https://developer.blackbookcloud.com/)
    is credential-gated, so the endpoint PATHS and auth below are the
    integration seams, not verified specs. Before a live run, confirm each
    marked `CONFIRM:` line against the portal and adjust. The rest of the
    codebase does not change when you do — that's the point of this adapter.
"""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Iterator, Optional

from .config import Settings, get_settings
from .models import Activity, Contact, Property, Stage

_FIXTURE_PATH = Path(__file__).parent / "fixtures" / "sample_leads.json"


class PipelineClient(ABC):
    """Interface the runner and dashboard depend on."""

    @abstractmethod
    def stage_counts(self) -> dict[str, int]:
        """Return {stage_name: count} for the whole pipeline."""

    @abstractmethod
    def iter_new_leads(self, page_size: int) -> Iterator[Property]:
        """Yield every lead currently in the 'New' bucket, paged."""

    @abstractmethod
    def get_property(self, property_id: str) -> Optional[Property]:
        """Fetch a single property fresh (used for reload-verify)."""

    @abstractmethod
    def set_market_status(self, property_id: str, market_status: str) -> None:
        """Write the Market Status field. Must actually fire REI's save handler."""

    @abstractmethod
    def add_note(self, property_id: str, note: str) -> None:
        """Attach a note (used for flags — reversible, never destructive)."""


# --------------------------------------------------------------------------- #
# Fixture implementation
# --------------------------------------------------------------------------- #
def _property_from_dict(d: dict) -> Property:
    c = d.get("contact")
    contact = None
    if c:
        contact = Contact(
            contact_id=c.get("contact_id"),
            name=c.get("name", ""),
            tags=list(c.get("tags", [])),
            notes=list(c.get("notes", [])),
            activities=[Activity(**a) for a in c.get("activities", [])],
        )
    return Property(
        property_id=str(d["property_id"]),
        address=d.get("address", ""),
        city=d.get("city", ""),
        state=d.get("state", ""),
        zip_code=d.get("zip_code", ""),
        stage=Stage(d.get("stage", "New")),
        market_status=d.get("market_status", ""),
        contact=contact,
    )


class FixtureClient(PipelineClient):
    """In-memory client backed by a JSON fixture. Mutations persist for the
    lifetime of the process so the verify loop and dashboard behave realistically."""

    def __init__(self, path: Path = _FIXTURE_PATH):
        raw = json.loads(Path(path).read_text())
        self._props: dict[str, Property] = {
            p.property_id: p for p in (_property_from_dict(d) for d in raw)
        }
        self._notes: dict[str, list[str]] = {}

    def stage_counts(self) -> dict[str, int]:
        counts = {s.value: 0 for s in Stage}
        for p in self._props.values():
            counts[p.stage.value] += 1
        return counts

    def iter_new_leads(self, page_size: int) -> Iterator[Property]:
        for p in list(self._props.values()):
            if p.stage is Stage.NEW:
                yield p

    def get_property(self, property_id: str) -> Optional[Property]:
        return self._props.get(property_id)

    def set_market_status(self, property_id: str, market_status: str) -> None:
        p = self._props[property_id]
        p.market_status = market_status
        # In the fixture, "Follow up" rolls up to Evaluating (SOP v2 §3).
        if market_status == get_settings().market_status_evaluating:
            p.stage = Stage.EVALUATING

    def add_note(self, property_id: str, note: str) -> None:
        self._notes.setdefault(property_id, []).append(note)


# --------------------------------------------------------------------------- #
# Live REI BlackBook implementation
# --------------------------------------------------------------------------- #
class ReiApiClient(PipelineClient):
    """Live client. Requires httpx and valid credentials."""

    def __init__(self, settings: Optional[Settings] = None):
        import httpx  # imported lazily so fixture mode has no hard dependency

        self.s = settings or get_settings()
        headers = {"Accept": "application/json"}
        # CONFIRM: auth scheme against the portal.
        if self.s.rei_auth_style == "bearer":
            headers["Authorization"] = f"Bearer {self.s.rei_api_key}"
        else:
            headers["X-API-Key"] = self.s.rei_api_key
        self.http = httpx.Client(
            base_url=self.s.rei_api_base_url,
            headers=headers,
            timeout=self.s.rei_request_timeout,
        )

    def stage_counts(self) -> dict[str, int]:
        # CONFIRM: endpoint + response shape.
        r = self.http.get("/v1/pipeline/summary")
        r.raise_for_status()
        data = r.json()
        return {stage: int(count) for stage, count in data.get("counts", {}).items()}

    def iter_new_leads(self, page_size: int) -> Iterator[Property]:
        # CONFIRM: listing endpoint, filter param, and pagination style.
        page = 1
        while True:
            r = self.http.get(
                "/v1/properties",
                params={"stage": "New", "page": page, "per_page": page_size},
            )
            r.raise_for_status()
            payload = r.json()
            items = payload.get("data", [])
            if not items:
                break
            for item in items:
                yield self._to_property(item)
            if len(items) < page_size:
                break
            page += 1

    def get_property(self, property_id: str) -> Optional[Property]:
        # CONFIRM: single-record endpoint.
        r = self.http.get(f"/v1/properties/{property_id}")
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return self._to_property(r.json().get("data", r.json()))

    def set_market_status(self, property_id: str, market_status: str) -> None:
        # CONFIRM: the field name REI expects and that this fires the save handler.
        r = self.http.patch(
            f"/v1/properties/{property_id}",
            json={"market_status": market_status},
        )
        r.raise_for_status()

    def add_note(self, property_id: str, note: str) -> None:
        # CONFIRM: notes endpoint.
        r = self.http.post(
            f"/v1/properties/{property_id}/notes",
            json={"body": note},
        )
        r.raise_for_status()

    # -- mapping helpers ---------------------------------------------------- #
    def _to_property(self, item: dict) -> Property:
        # CONFIRM: field names in the REI payload.
        contact = None
        c = item.get("contact") or item.get("primary_contact")
        if c:
            contact = Contact(
                contact_id=str(c.get("id", "")) or None,
                name=c.get("name", ""),
                tags=[t.get("name", t) if isinstance(t, dict) else t for t in c.get("tags", [])],
                notes=[n.get("body", n) if isinstance(n, dict) else n for n in c.get("notes", [])],
                activities=[self._to_activity(a) for a in c.get("activities", [])],
            )
        return Property(
            property_id=str(item.get("id")),
            address=item.get("address", ""),
            city=item.get("city", ""),
            state=item.get("state", ""),
            zip_code=item.get("zip", "") or item.get("postal_code", ""),
            stage=Stage(item.get("stage", "New")),
            market_status=item.get("market_status", ""),
            contact=contact,
        )

    @staticmethod
    def _to_activity(a: dict) -> Activity:
        return Activity(
            kind=(a.get("type") or a.get("kind") or "note").lower(),
            timestamp=a.get("created_at", "") or a.get("timestamp", ""),
            detail=a.get("body", "") or a.get("detail", ""),
            inbound=bool(a.get("inbound", False)),
        )


def build_client(settings: Optional[Settings] = None) -> PipelineClient:
    settings = settings or get_settings()
    if settings.data_source == "rei":
        return ReiApiClient(settings)
    return FixtureClient()
