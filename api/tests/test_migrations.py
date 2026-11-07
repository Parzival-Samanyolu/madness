import os

from alembic import command
from alembic.config import Config


def test_models_match_migrations(client, tmp_path):
    """Fails if app/models.py changed without a new migration (run alembic revision --autogenerate)."""
    from app import db
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    cfg = Config(os.path.join(here, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(here, "migrations"))
    with db._engine.connect() as conn:
        cfg.attributes["connection"] = conn
        command.check(cfg)  # raises if there are un-migrated model changes
