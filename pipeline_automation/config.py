"""Environment-driven configuration."""

from __future__ import annotations

from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    data_source: str = "fixture"  # "fixture" | "rei"

    # REI BlackBook API
    rei_api_base_url: str = "https://api.blackbookcloud.com"
    rei_api_key: str = ""
    rei_auth_style: str = "bearer"  # "bearer" | "header"
    rei_request_timeout: int = 30

    # Run behaviour
    checkpoint_every: int = 25
    page_size: int = 100
    max_verify_retries: int = 3
    dry_run: bool = True
    state_db: str = "./run_state.db"

    # Market Status mapping (REI "Market Status" value -> pipeline stage).
    # Blank values are unconfirmed (SOP v2 section 8) and cause a HOLD.
    market_status_evaluating: str = "Follow up"
    market_status_under_contract: Optional[str] = None
    market_status_closed_won: Optional[str] = None
    market_status_closed_dead: Optional[str] = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
