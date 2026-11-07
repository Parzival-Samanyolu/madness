"""Alembic environment. Migrations run automatically at API startup (see app/db.py)."""
from alembic import context
from sqlalchemy import engine_from_config, pool

from app import models  # noqa: F401  (registers tables)
from app.db import Base

config = context.config
target_metadata = Base.metadata


def run_migrations_offline():
    context.configure(url=config.get_main_option("sqlalchemy.url"), target_metadata=target_metadata,
                      literal_binds=True, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    connectable = config.attributes.get("connection")
    if connectable is None:
        connectable = engine_from_config(config.get_section(config.config_ini_section, {}),
                                         prefix="sqlalchemy.", poolclass=pool.NullPool)
        with connectable.connect() as conn:
            _run(conn)
    else:
        _run(connectable)


def _run(conn):
    # render_as_batch lets ALTER TABLE work on SQLite (dev) as well as Postgres
    context.configure(connection=conn, target_metadata=target_metadata, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
