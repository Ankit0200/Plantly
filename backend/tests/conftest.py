"""Shared test setup. Runs before any test module imports the app.

The app binds its database when app.py is imported, so the test database must be chosen here, first.
Without this, the tests' db.drop_all() wiped the real backend/instance/plantly.db on every run."""
import os

import pytest

os.environ["DATABASE_URL"] = "sqlite://"  # in-memory; never the developer's real database


@pytest.fixture(autouse=True, scope="session")
def _refuse_real_database():
    from app import app
    from models import db
    with app.app_context():
        url = str(db.engine.url)
    if url != "sqlite://":
        pytest.exit(f"Refusing to run tests against a real database ({url}).", returncode=1)
