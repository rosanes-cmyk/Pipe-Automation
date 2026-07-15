"""SQLite-backed run state: checkpoint / resume + a record of every decision.

A dropped connection must never lose place (SOP v2 §9). Each processed lead is
recorded with its decision and outcome; a resumed run skips leads already marked
done. The dashboard reads this table for live cleanup progress.
"""

from __future__ import annotations

import sqlite3
from contextlib import closing
from dataclasses import dataclass
from typing import Optional

_SCHEMA = """
CREATE TABLE IF NOT EXISTS lead_state (
    property_id   TEXT PRIMARY KEY,
    action        TEXT NOT NULL,
    target_stage  TEXT NOT NULL,
    market_status TEXT,
    reason        TEXT,
    outcome       TEXT NOT NULL,   -- verified | held | flagged | left_new | error
    detail        TEXT,
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS run_meta (
    key   TEXT PRIMARY KEY,
    value TEXT
);
"""


@dataclass
class OutcomeCounts:
    verified: int = 0
    held: int = 0
    flagged: int = 0
    left_new: int = 0
    error: int = 0

    @property
    def total(self) -> int:
        return self.verified + self.held + self.flagged + self.left_new + self.error


class StateStore:
    def __init__(self, path: str):
        self.path = path
        with closing(self._conn()) as c:
            c.executescript(_SCHEMA)
            c.commit()

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        return conn

    def is_done(self, property_id: str) -> bool:
        with closing(self._conn()) as c:
            row = c.execute(
                "SELECT 1 FROM lead_state WHERE property_id = ?", (property_id,)
            ).fetchone()
            return row is not None

    def record(
        self,
        property_id: str,
        action: str,
        target_stage: str,
        market_status: Optional[str],
        reason: str,
        outcome: str,
        detail: str = "",
    ) -> None:
        with closing(self._conn()) as c:
            c.execute(
                """INSERT INTO lead_state
                   (property_id, action, target_stage, market_status, reason, outcome, detail, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
                   ON CONFLICT(property_id) DO UPDATE SET
                     action=excluded.action, target_stage=excluded.target_stage,
                     market_status=excluded.market_status, reason=excluded.reason,
                     outcome=excluded.outcome, detail=excluded.detail,
                     updated_at=datetime('now')""",
                (property_id, action, target_stage, market_status, reason, outcome, detail),
            )
            c.commit()

    def outcome_counts(self) -> OutcomeCounts:
        with closing(self._conn()) as c:
            rows = c.execute(
                "SELECT outcome, COUNT(*) AS n FROM lead_state GROUP BY outcome"
            ).fetchall()
        counts = OutcomeCounts()
        for r in rows:
            if hasattr(counts, r["outcome"]):
                setattr(counts, r["outcome"], r["n"])
        return counts

    def recent(self, limit: int = 50) -> list[dict]:
        with closing(self._conn()) as c:
            rows = c.execute(
                "SELECT * FROM lead_state ORDER BY updated_at DESC LIMIT ?", (limit,)
            ).fetchall()
        return [dict(r) for r in rows]

    def set_meta(self, key: str, value: str) -> None:
        with closing(self._conn()) as c:
            c.execute(
                "INSERT INTO run_meta(key, value) VALUES(?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (key, value),
            )
            c.commit()

    def get_meta(self, key: str) -> Optional[str]:
        with closing(self._conn()) as c:
            row = c.execute("SELECT value FROM run_meta WHERE key = ?", (key,)).fetchone()
            return row["value"] if row else None
