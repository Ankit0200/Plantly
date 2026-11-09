"""Tests for auth, plans, history, events, and chat-on-saved-plan."""
import json
import os
from pathlib import Path
from types import SimpleNamespace as NS

import pytest

# Ensure we can import from backend root
import sys
BACKEND = Path(__file__).parent.parent
sys.path.insert(0, str(BACKEND))

from app import app, DATA
from models import db, User, Farm, PlotModel, PlanRecord, Conversation, Message
from engine.soil_engine import build_plan


@pytest.fixture
def client():
    app.config["TESTING"] = True
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite://"  # in-memory
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


# ================================================================== AUTH

class TestAuth:
    def test_register_login_logout(self, client):
        # Register
        r = register(client)
        assert r.status_code == 201
        data = r.get_json()
        assert data["email"] == "alice@test.com"
        assert data["name"] == "Alice"
        assert "password" not in json.dumps(data)

        # /me works after register (auto-login)
        r = client.get("/api/auth/me")
        assert r.status_code == 200
        assert r.get_json()["email"] == "alice@test.com"

        # Logout
        r = client.post("/api/auth/logout")
        assert r.status_code == 200

        # /me returns 401 after logout
        r = client.get("/api/auth/me")
        assert r.status_code == 401

        # Login
        r = login(client)
        assert r.status_code == 200
        assert r.get_json()["email"] == "alice@test.com"

    def test_register_short_password(self, client):
        r = register(client, password="short")
        assert r.status_code == 400
        assert "8 characters" in r.get_json()["error"]

    def test_register_duplicate_email(self, client):
        register(client)
        r = register(client)
        assert r.status_code == 400
        assert "already registered" in r.get_json()["error"]

    def test_login_wrong_password(self, client):
        register(client)
        client.post("/api/auth/logout")
        r = login(client, password="wrongpass99")
        assert r.status_code == 401

    def test_protected_routes_require_login(self, client):
        # POST routes should return 401 without login
        for url in ["/api/check", "/api/plan", "/api/chat", "/api/events"]:
            r = client.post(url, json={})
            assert r.status_code == 401, f"POST {url} should require login"
        # GET routes should return 401 without login
        for url in ["/api/plans", "/api/farm"]:
            r = client.get(url)
            assert r.status_code == 401, f"GET {url} should require login"


# ================================================================== ISOLATION

class TestIsolation:
    def _setup_two_users(self, client):
        """Register two users, generate a plan for user A, return plan_id."""
        register(client, email="a@test.com", password="password123", name="A")
        # Generate plan for user A
        grower = demo_grower()
        r = client.post("/api/plan", json={"grower": grower})
        assert r.status_code == 200
        plan_id = r.get_json()["plan_record_id"]
        # Logout and register user B
        client.post("/api/auth/logout")
        register(client, email="b@test.com", password="password123", name="B")
        return plan_id

    def test_user_b_cannot_read_user_a_plan(self, client):
        plan_id = self._setup_two_users(client)
        r = client.get(f"/api/plans/{plan_id}")
        assert r.status_code == 404

    def test_user_b_cannot_chat_on_user_a_plan(self, client):
        plan_id = self._setup_two_users(client)
        r = client.post(f"/api/plans/{plan_id}/chat",
                        json={"message": "Tell me about Plot A"})
        assert r.status_code == 404

    def test_user_b_plans_list_is_empty(self, client):
        self._setup_two_users(client)
        r = client.get("/api/plans")
        assert r.status_code == 200
        assert r.get_json() == []


# ================================================================== PLANS

class TestPlans:
    def test_plan_saves_snapshot_and_logs_event(self, client):
        register(client)
        grower = demo_grower()
        r = client.post("/api/plan", json={"grower": grower})
        assert r.status_code == 200
        plan_id = r.get_json()["plan_record_id"]
        assert plan_id is not None

        # Plan appears in list
        r = client.get("/api/plans")
        plans = r.get_json()
        assert len(plans) == 1
        assert plans[0]["id"] == plan_id

        # Plan detail has snapshot
        r = client.get(f"/api/plans/{plan_id}")
        detail = r.get_json()
        assert detail["grower_json"]["name"] == "Demo Market Garden"
        assert "plots" in detail["plan_json"]

        # Event was logged
        r = client.get("/api/history")
        items = r.get_json()["items"]
        event_types = [i["type"] for i in items if i["kind"] == "event"]
        assert "plan_generated" in event_types

    def test_plan_snapshot_survives_farm_edit(self, client):
        """Editing the farm after generating a plan doesn't change the saved snapshot."""
        register(client)
        grower = demo_grower()
        r = client.post("/api/plan", json={"grower": grower})
        plan_id = r.get_json()["plan_record_id"]

        # Edit the farm
        grower["name"] = "Changed Name"
        grower["plots"][0]["crop_planned"] = "pepper"
        client.post("/api/farm", json={"grower": grower})

        # Snapshot still has original data
        r = client.get(f"/api/plans/{plan_id}")
        assert r.get_json()["grower_json"]["name"] == "Demo Market Garden"
        assert r.get_json()["grower_json"]["plots"][0]["crop_planned"] == "tomato"


# ================================================================== EVENTS

class TestEvents:
    def test_reject_unknown_event_type(self, client):
        register(client)
        r = client.post("/api/events", json={"type": "delete_all_data", "payload": {}})
        assert r.status_code == 400

    def test_accept_known_event_type(self, client):
        register(client)
        r = client.post("/api/events", json={"type": "why_expanded", "payload": {"line_idx": 0}})
        assert r.status_code == 200


# ================================================================== CHAT ON SAVED PLAN

class TestChatOnPlan:
    def test_chat_uses_saved_snapshot(self, client, monkeypatch):
        """Chat on a saved plan should use the saved grower_json, even after farm is edited."""
        register(client)
        grower = demo_grower()

        # Generate plan
        r = client.post("/api/plan", json={"grower": grower})
        plan_id = r.get_json()["plan_record_id"]

        # Edit the farm (change Plot A crop)
        grower["plots"][0]["crop_planned"] = "pepper"
        client.post("/api/farm", json={"grower": grower})

        # Mock the chat function to capture what grower it receives
        captured = {}

        def fake_chat_on_saved(messages, grower_arg, saved_plan, extra_system="", **kwargs):
            captured["grower"] = grower_arg
            return {"reply": "Test reply", "tools_used": [], "unsupported_numbers": []}

        monkeypatch.setattr("app._chat_on_saved_plan", fake_chat_on_saved)

        r = client.post(f"/api/plans/{plan_id}/chat",
                        json={"message": "Why does Plot B need lime?"})
        assert r.status_code == 200
        # The grower passed to chat should be the SAVED snapshot (tomato), not current (pepper)
        assert captured["grower"]["plots"][0]["crop_planned"] == "tomato"

    def test_chat_saves_messages(self, client, monkeypatch):
        register(client)
        grower = demo_grower()
        r = client.post("/api/plan", json={"grower": grower})
        plan_id = r.get_json()["plan_record_id"]

        def fake_chat_on_saved(messages, grower_arg, saved_plan, extra_system="", **kwargs):
            return {"reply": "Here's why...", "tools_used": [{"tool": "get_plan", "input": {}, "is_error": False}],
                    "unsupported_numbers": []}

        monkeypatch.setattr("app._chat_on_saved_plan", fake_chat_on_saved)

        r = client.post(f"/api/plans/{plan_id}/chat",
                        json={"message": "Why lime?"})
        assert r.status_code == 200
        convo_id = r.get_json()["conversation_id"]

        # Check plan detail includes the conversation
        r = client.get(f"/api/plans/{plan_id}")
        convos = r.get_json()["conversations"]
        assert len(convos) == 1
        assert convos[0]["id"] == convo_id
        assert len(convos[0]["messages"]) == 2  # user + assistant
        assert convos[0]["messages"][0]["role"] == "user"
        assert convos[0]["messages"][1]["role"] == "assistant"
