"""Command-line entry point.

    python -m pipeline_automation.cli run          # process the New bucket
    python -m pipeline_automation.cli run --limit 25
    python -m pipeline_automation.cli status        # show run-state summary
    python -m pipeline_automation.cli counts         # live pipeline stage counts
"""

from __future__ import annotations

import argparse
import sys

from .checkpoint import StateStore
from .config import get_settings
from .rei_client import build_client
from .runner import Runner


def _cmd_run(args: argparse.Namespace) -> int:
    settings = get_settings()
    mode = "DRY-RUN" if settings.dry_run else "LIVE"
    print(f"Source={settings.data_source}  Mode={mode}  StateDB={settings.state_db}")
    runner = Runner(settings=settings)
    stats = runner.run(limit=args.limit)
    print(
        f"\nDone. processed={stats.processed} verified={stats.verified} "
        f"held={stats.held} flagged={stats.flagged} left_new={stats.left_new} "
        f"errors={stats.errors}"
    )
    return 0


def _cmd_status(_: argparse.Namespace) -> int:
    store = StateStore(get_settings().state_db)
    counts = store.outcome_counts()
    print(
        f"processed={counts.total} verified={counts.verified} held={counts.held} "
        f"flagged={counts.flagged} left_new={counts.left_new} errors={counts.error}"
    )
    for row in store.recent(10):
        print(f"  {row['property_id']:>10}  {row['outcome']:<9}  {row['reason']}")
    return 0


def _cmd_counts(_: argparse.Namespace) -> int:
    client = build_client()
    for stage, n in client.stage_counts().items():
        print(f"  {stage:<16} {n}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pipeline_automation")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_run = sub.add_parser("run", help="process the New bucket")
    p_run.add_argument("--limit", type=int, default=None, help="max records this run")
    p_run.set_defaults(func=_cmd_run)

    sub.add_parser("status", help="show run-state summary").set_defaults(func=_cmd_status)
    sub.add_parser("counts", help="show live pipeline stage counts").set_defaults(func=_cmd_counts)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
