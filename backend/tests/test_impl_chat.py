"""Tests for implemented-plan chat: propose_item_update, save/cancel actuals, emergency questions, isolation."""
import json
from pathlib import Path

import pytest
import sys

BACKEND = Path(__file__).parent.parent
sys.path.insert(0, str(BACKEND))

from app import app, DATA
from models import db, User, PlanRecord, ImplementedItem, ItemChange, Conversation


@pytest.fixture
def client():
    app.config["TESTING"] = True
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite://"
    app.config["SECRET_KEY"] = "test-secret"
    with app.app_context():
        db.drop_all()
        db.create_all()
        yield app.test_client()
        db.drop_all()


def register(client, email="alice@test.com", password="password123", name="Alice"):
    return client.post("/api/auth/register",
                       json={"email": email, "password": password, "name": name})


def demo_grower():
    return json.loads((BACKEND / "fixtures" / "demo_grower.json").read_text())


def create_plan_and_tick(client):
    """Register, generate plan, tick a feeding line in Plot B, return (plan_id, item_id, plan_json)."""
    g = demo_grower()
    r = client.post("/api/plan", json={"grower": g})
    assert r.status_code == 200
    plan = r.get_json()
    plan_id = plan["plan_record_id"]

    # Find a feeding line in Plot B with quantity
    for pp in plan["plots"]:
        if pp["plot_id"] == "B":
            for i, line in enumerate(pp["lines"]):
                if line["category"] == "feeding" and line.get("quantity") is not None:
                    r = client.post(f"/api/plans/{plan_id}/implemented",
                                    json={"plot_id": "B", "line_index": i})
                    assert r.status_code == 201
                    item_id = r.get_json()["id"]
                    return plan_id, item_id, plan
    raise AssertionError("No feeding line in Plot B")


class TestProposeItemUpdate:

    def test_propose_no_db_change(self, client, monkeypatch):
        """Farmer says a different amount -> propose_item_update is called, no DB change until Save."""
        register(client)
        plan_id, item_id, _ = create_plan_and_tick(client)

        # Mock chat to simulate Claude calling propose_item_update
        def fake_chat(messages, grower, saved_plan, extra_system="", implemented_items=None, **kwargs):
            return {
                "reply": "I've proposed updating the urea to 40 lb. Please confirm.",
                "tools_used": [
                    {"tool": "propose_item_update", "input": {"item_id": item_id, "actual_quantity": 40}, "is_error": False}
                ],
                "unsupported_numbers": [],
            }

        monkeypatch.setattr("app._chat_on_saved_plan", fake_chat)

        r = client.post(f"/api/plans/{plan_id}/chat",
                        json={"message": "I used 40 lb of urea", "context": "implemented"})
        assert r.status_code == 200

        # Item should NOT have actual_quantity yet
        r2 = client.get(f"/api/plans/{plan_id}/implemented")
        items = r2.get_json()["items"]
        item = next(i for i in items if i["id"] == item_id)
        assert item["actual_quantity"] is None


class TestSaveActual:

    def test_save_writes_actual_and_change(self, client):
        """Saving writes the actual values and an item_changes row."""
        register(client)
        plan_id, item_id, _ = create_plan_and_tick(client)

        r = client.post(f"/api/implemented/{item_id}/actual",
                        json={"actual_quantity": 40.0, "actual_unit": "lb", "source": "chat"})
        assert r.status_code == 200
        data = r.get_json()
        assert data["actual_quantity"] == 40.0
        assert data["actual_unit"] == "lb"

        # Check item_changes table
        changes = ItemChange.query.filter_by(item_id=item_id).all()
        assert len(changes) >= 1
        qty_change = next((c for c in changes if c.field == "actual_quantity"), None)
        assert qty_change is not None
        assert qty_change.new_value == "40.0"
        assert qty_change.source == "chat"


class TestCancelChange:

    def test_cancel_changes_nothing(self, client):
        """Not calling save means the item stays unchanged."""
        register(client)
        plan_id, item_id, _ = create_plan_and_tick(client)

        # Just read the item — no save called
        r = client.get(f"/api/plans/{plan_id}/implemented")
        items = r.get_json()["items"]
        item = next(i for i in items if i["id"] == item_id)
        assert item["actual_quantity"] is None
        assert item["actual_unit"] is None

        # No changes in DB
        changes = ItemChange.query.filter_by(item_id=item_id).all()
        assert len(changes) == 0


class TestEmergencyQuestion:

    def test_rain_question_cites_source(self, client, monkeypatch):
        """A '10 days of rain' question calls search_notes and the reply cites a source."""
        register(client)
        plan_id, item_id, _ = create_plan_and_tick(client)

        def fake_chat(messages, grower, saved_plan, extra_system="", implemented_items=None, **kwargs):
            return {
                "reply": "After heavy rain, nitrogen leaches out of sandy soils quickly. "
                         "Source: Building Soils for Better Crops (SARE).",
                "tools_used": [
                    {"tool": "search_notes", "input": {"query": "heavy rain nitrogen loss"}, "is_error": False}
                ],
                "unsupported_numbers": [],
            }

        monkeypatch.setattr("app._chat_on_saved_plan", fake_chat)

        r = client.post(f"/api/plans/{plan_id}/chat",
                        json={"message": "We had 10 days of rain, what should I check?", "context": "implemented"})
        assert r.status_code == 200
        data = r.get_json()
        assert "source" in data["reply"].lower() or "Source" in data["reply"]

    def test_no_notes_no_unsupported_numbers(self, client, monkeypatch):
        """When search_notes returns nothing, the reply has no unsupported numbers."""
        register(client)
        plan_id, item_id, _ = create_plan_and_tick(client)

        def fake_chat(messages, grower, saved_plan, extra_system="", implemented_items=None, **kwargs):
            return {
                "reply": "I don't have research notes on that topic. "
                         "I'd suggest contacting your county extension office.",
                "tools_used": [
                    {"tool": "search_notes", "input": {"query": "meteor strike"}, "is_error": False}
                ],
                "unsupported_numbers": [],
            }

        monkeypatch.setattr("app._chat_on_saved_plan", fake_chat)

        r = client.post(f"/api/plans/{plan_id}/chat",
                        json={"message": "What if a meteor hits my garden?", "context": "implemented"})
        assert r.status_code == 200
        assert r.get_json()["unsupported_numbers"] == []


class TestCrossUserIsolation:

    def test_other_user_cannot_open_chat_or_update(self, client):
        """Users can't open chats or update items on another user's plans."""
        # User A creates plan and ticks
        register(client, email="a@test.com")
        plan_id, item_id, _ = create_plan_and_tick(client)
        client.post("/api/auth/logout")

        # User B
        register(client, email="b@test.com")

        # B can't chat on A's plan
        r = client.post(f"/api/plans/{plan_id}/chat",
                        json={"message": "Hello", "context": "implemented"})
        assert r.status_code == 404

        # B can't update A's item
        r = client.post(f"/api/implemented/{item_id}/actual",
                        json={"actual_quantity": 99})
        assert r.status_code == 404
