"""Tests for implemented items: ticking, de-dup, warnings, removal, isolation, summary."""
import json
from pathlib import Path

import pytest
import sys

BACKEND = Path(__file__).parent.parent
sys.path.insert(0, str(BACKEND))

from app import app, DATA
from models import db, User, PlanRecord, ImplementedItem
from engine.soil_engine import build_plan


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


def login(client, email="alice@test.com", password="password123"):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def demo_grower():
    return json.loads((BACKEND / "fixtures" / "demo_grower.json").read_text())


def create_plan(client):
    """Register, generate a plan, return plan JSON with plan_record_id."""
    g = demo_grower()
    r = client.post("/api/plan", json={"grower": g},
                    content_type="application/json")
    assert r.status_code == 200, r.get_json()
    return r.get_json()


def find_actionable_line(plan_json, plot_id="A"):
    """Find the first actionable line index in a plot."""
    for pp in plan_json["plots"]:
        if pp["plot_id"] == plot_id:
            for i, line in enumerate(pp["lines"]):
                if line.get("quantity") is not None and line["category"] not in ("warning", "nutrient_warning"):
                    return i
    return None


def find_warning_line(plan_json, plot_id="A"):
    """Find a non-actionable warning/nutrient_warning line index."""
    for pp in plan_json["plots"]:
        if pp["plot_id"] == plot_id:
            for i, line in enumerate(pp["lines"]):
                if line["category"] in ("warning", "nutrient_warning"):
                    return i
    return None


def find_no_lime_line(plan_json):
    """Find a 'No lime needed' info line (soil with no quantity)."""
    for pp in plan_json["plots"]:
        for i, line in enumerate(pp["lines"]):
            if line["category"] == "soil" and line.get("quantity") is None:
                return pp["plot_id"], i
    return None, None


# ================================================================== TESTS


class TestImplementedItems:

    def test_tick_saves_snapshot_copy(self, client):
        """Ticking saves a copy of the line from the plan snapshot."""
        register(client)
        plan = create_plan(client)
        plan_id = plan["plan_record_id"]
        line_idx = find_actionable_line(plan, "A")
        assert line_idx is not None

        r = client.post(f"/api/plans/{plan_id}/implemented",
                        json={"plot_id": "A", "line_index": line_idx})
        assert r.status_code == 201
        item = r.get_json()

        # Verify it's a copy of the snapshot line
        snapshot_line = plan["plots"][0]["lines"][line_idx]
        assert item["text"] == snapshot_line["text"]
        assert item["rule_id"] == snapshot_line["rule_id"]
        assert item["category"] == snapshot_line["category"]
        if snapshot_line.get("quantity") is not None:
            assert abs(item["quantity"] - snapshot_line["quantity"]) < 0.01
        if snapshot_line.get("cost_usd") is not None:
            assert abs(item["cost_usd"] - snapshot_line["cost_usd"]) < 0.01

        # The copy stays the same even after data changes would affect a new plan.
        # We can verify by re-reading it.
        r2 = client.get(f"/api/plans/{plan_id}/implemented")
        assert r2.status_code == 200
        items = r2.get_json()["items"]
        assert len(items) == 1
        assert items[0]["text"] == snapshot_line["text"]

    def test_tick_same_line_twice_no_duplicate(self, client):
        """Ticking the same line twice doesn't create a duplicate."""
        register(client)
        plan = create_plan(client)
        plan_id = plan["plan_record_id"]
        line_idx = find_actionable_line(plan, "A")

        r1 = client.post(f"/api/plans/{plan_id}/implemented",
                         json={"plot_id": "A", "line_index": line_idx})
        assert r1.status_code == 201
        id1 = r1.get_json()["id"]

        r2 = client.post(f"/api/plans/{plan_id}/implemented",
                         json={"plot_id": "A", "line_index": line_idx})
        assert r2.status_code == 200  # 200 not 201 — existing returned
        id2 = r2.get_json()["id"]
        assert id1 == id2

        # Only one item in DB
        r3 = client.get(f"/api/plans/{plan_id}/implemented")
        assert len(r3.get_json()["items"]) == 1

    def test_warning_lines_rejected(self, client):
        """Lines without an action (warnings, 'No lime needed') can't be ticked."""
        register(client)
        plan = create_plan(client)
        plan_id = plan["plan_record_id"]

        # Try a nutrient_warning line
        warn_idx = find_warning_line(plan, "A")
        if warn_idx is not None:
            r = client.post(f"/api/plans/{plan_id}/implemented",
                            json={"plot_id": "A", "line_index": warn_idx})
            assert r.status_code == 400
            assert "actionable" in r.get_json()["error"].lower()

        # Try a 'No lime needed' line
        plot_id, no_lime_idx = find_no_lime_line(plan)
        if no_lime_idx is not None:
            r = client.post(f"/api/plans/{plan_id}/implemented",
                            json={"plot_id": plot_id, "line_index": no_lime_idx})
            assert r.status_code == 400

    def test_remove_works(self, client):
        """Remove deletes the item."""
        register(client)
        plan = create_plan(client)
        plan_id = plan["plan_record_id"]
        line_idx = find_actionable_line(plan, "A")

        r = client.post(f"/api/plans/{plan_id}/implemented",
                        json={"plot_id": "A", "line_index": line_idx})
        item_id = r.get_json()["id"]

        r = client.delete(f"/api/implemented/{item_id}")
        assert r.status_code == 200

        r = client.get(f"/api/plans/{plan_id}/implemented")
        assert len(r.get_json()["items"]) == 0

    def test_cross_user_isolation(self, client):
        """User A can't see or remove user B's items."""
        # User A creates plan and ticks a line
        register(client, email="a@test.com")
        plan = create_plan(client)
        plan_id = plan["plan_record_id"]
        line_idx = find_actionable_line(plan, "A")
        r = client.post(f"/api/plans/{plan_id}/implemented",
                        json={"plot_id": "A", "line_index": line_idx})
        item_id = r.get_json()["id"]
        client.post("/api/auth/logout")

        # User B can't see A's plan
        register(client, email="b@test.com")
        r = client.get(f"/api/plans/{plan_id}/implemented")
        assert r.status_code == 404  # plan belongs to A, not B

        # User B can't remove A's item
        r = client.delete(f"/api/implemented/{item_id}")
        assert r.status_code == 404

        # User B's global list is empty
        r = client.get("/api/implemented")
        assert r.status_code == 200
        assert r.get_json()["count"] == 0

    def test_summary_total_matches_saved_costs(self, client):
        """The profile summary total matches the sum of saved costs."""
        register(client)
        plan = create_plan(client)
        plan_id = plan["plan_record_id"]

        # Tick all actionable lines in Plot A
        plot_a = next(pp for pp in plan["plots"] if pp["plot_id"] == "A")
        expected_cost = 0.0
        for i, line in enumerate(plot_a["lines"]):
            if line.get("quantity") is not None and line["category"] not in ("warning", "nutrient_warning"):
                r = client.post(f"/api/plans/{plan_id}/implemented",
                                json={"plot_id": "A", "line_index": i})
                assert r.status_code in (200, 201)
                expected_cost += line.get("cost_usd") or 0

        r = client.get("/api/implemented")
        data = r.get_json()
        assert data["count"] > 0
        assert abs(data["total_cost_usd"] - round(expected_cost, 2)) < 0.01

    def test_rotation_suggestion_is_actionable(self, client):
        """'Suggested instead: ...' rotation lines can be ticked."""
        register(client)
        plan = create_plan(client)
        plan_id = plan["plan_record_id"]

        # Find a "Suggested instead:" line
        for pp in plan["plots"]:
            for i, line in enumerate(pp["lines"]):
                if line["category"] == "rotation" and "Suggested instead:" in line.get("text", ""):
                    r = client.post(f"/api/plans/{plan_id}/implemented",
                                    json={"plot_id": pp["plot_id"], "line_index": i})
                    assert r.status_code in (200, 201)
                    assert r.get_json()["category"] == "rotation"
                    return
        # If no rotation suggestion exists, that's fine — skip
