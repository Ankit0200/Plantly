"""Tests for crop photos in the plan chat: upload validation, storage, replay to the model, and access control.
The AI call is mocked; no network."""
import base64
import io
import json
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).parent.parent
sys.path.insert(0, str(BACKEND))

from app import app, MAX_PHOTO_BYTES, PHOTO_ONLY_TEXT  # noqa: E402
from ai.chat import unsupported_numbers  # noqa: E402
from ai.gemini import GeminiChat  # noqa: E402
from models import db, MessageAttachment  # noqa: E402

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 200  # starts with the JPEG signature


@pytest.fixture
def client(tmp_path):
    app.config.update(TESTING=True, SQLALCHEMY_DATABASE_URI="sqlite://", SECRET_KEY="test-secret",
                      UPLOAD_DIR=str(tmp_path))
    with app.app_context():
        db.drop_all()
        db.create_all()
        yield app.test_client()
        db.drop_all()


@pytest.fixture
def calls(monkeypatch):
    """Replace the AI turn; record what the route sent it."""
    seen = []

    def fake_chat(messages, grower, saved_plan, extra_system="", implemented_items=None, **kwargs):
        seen.append({"messages": messages, "extra_system": extra_system})
        return {"reply": "Looks like early blight.", "tools_used": [], "unsupported_numbers": []}

    monkeypatch.setattr("app._chat_on_saved_plan", fake_chat)
    return seen


def register(client, email="alice@test.com"):
    r = client.post("/api/auth/register", json={"email": email, "password": "password123", "name": "A"})
    assert r.status_code in (200, 201)


def make_plan(client):
    grower = json.loads((BACKEND / "fixtures" / "demo_grower.json").read_text())
    r = client.post("/api/plan", json={"grower": grower})
    assert r.status_code == 200
    return r.get_json()["plan_record_id"]


def send_photo(client, plan_id, data=JPEG, message="What's wrong with this crop?", **extra):
    form = {"message": message, "context": "implemented",
            "image": (io.BytesIO(data), "leaf.jpg", "image/jpeg"), **extra}
    return client.post(f"/api/plans/{plan_id}/chat", data=form, content_type="multipart/form-data")


def stored_files(tmp_path):
    return [p for p in Path(tmp_path).rglob("*") if p.is_file()]


def test_photo_is_sent_to_model_saved_and_served(client, calls, tmp_path):
    register(client)
    plan_id = make_plan(client)
    r = send_photo(client, plan_id)
    assert r.status_code == 200, r.get_json()
    att_id = r.get_json()["attachment_id"]
    assert att_id

    last = calls[0]["messages"][-1]
    assert last["role"] == "user" and isinstance(last["content"], list)
    image, text = last["content"]
    assert image["source"]["media_type"] == "image/jpeg"
    assert base64.b64decode(image["source"]["data"]) == JPEG
    assert text == {"type": "text", "text": "What's wrong with this crop?"}
    assert "PHOTOS FROM THE GROWER" in calls[0]["extra_system"]

    got = client.get(f"/api/attachments/{att_id}")
    assert got.status_code == 200 and got.data == JPEG and got.mimetype == "image/jpeg"
    assert len(stored_files(tmp_path)) == 1


def test_photo_without_text_uses_default_question(client, calls):
    register(client)
    plan_id = make_plan(client)
    r = send_photo(client, plan_id, message="")
    assert r.status_code == 200
    assert calls[0]["messages"][-1]["content"][1]["text"] == PHOTO_ONLY_TEXT


def test_text_only_json_still_works(client, calls):
    register(client)
    plan_id = make_plan(client)
    r = client.post(f"/api/plans/{plan_id}/chat", json={"message": "How much lime?", "context": "implemented"})
    assert r.status_code == 200
    assert r.get_json()["attachment_id"] is None
    assert calls[0]["messages"][-1] == {"role": "user", "content": "How much lime?"}
    assert "PHOTOS FROM THE GROWER" not in calls[0]["extra_system"]


def test_rejects_file_that_is_not_an_image(client, calls, tmp_path):
    register(client)
    plan_id = make_plan(client)
    r = send_photo(client, plan_id, data=b"just some text pretending to be a jpeg")
    assert r.status_code == 400
    assert "JPEG" in r.get_json()["error"]
    assert calls == [] and stored_files(tmp_path) == []


def test_rejects_photo_over_8_mb(client, calls, tmp_path):
    register(client)
    plan_id = make_plan(client)
    r = send_photo(client, plan_id, data=JPEG + b"\x00" * MAX_PHOTO_BYTES)
    assert r.status_code == 413
    assert "8 MB" in r.get_json()["error"]
    assert calls == [] and stored_files(tmp_path) == []


def test_follow_up_question_still_includes_the_photo(client, calls):
    register(client)
    plan_id = make_plan(client)
    convo_id = send_photo(client, plan_id).get_json()["conversation_id"]
    r = client.post(f"/api/plans/{plan_id}/chat",
                    json={"message": "How do I treat it?", "conversation_id": convo_id})
    assert r.status_code == 200
    history = calls[1]["messages"]
    assert isinstance(history[0]["content"], list) and history[0]["content"][0]["type"] == "image"
    assert history[-1] == {"role": "user", "content": "How do I treat it?"}
    assert "PHOTOS FROM THE GROWER" in calls[1]["extra_system"]


def test_failed_turn_leaves_no_photo_behind(client, monkeypatch, tmp_path):
    register(client)
    plan_id = make_plan(client)

    def boom(*args, **kwargs):
        raise RuntimeError("model unavailable")

    monkeypatch.setattr("app._chat_on_saved_plan", boom)
    r = send_photo(client, plan_id)
    assert r.status_code == 500
    assert stored_files(tmp_path) == []
    assert MessageAttachment.query.count() == 0


def test_other_user_cannot_see_photo(client, calls):
    register(client, "alice@test.com")
    plan_id = make_plan(client)
    att_id = send_photo(client, plan_id).get_json()["attachment_id"]
    client.post("/api/auth/logout")
    register(client, "bob@test.com")
    assert client.get(f"/api/attachments/{att_id}").status_code == 404


def test_gemini_adapter_converts_image_block():
    adapter = GeminiChat.__new__(GeminiChat)  # skip __init__: no API key or network needed
    adapter._raw = {}
    block = {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg",
                                         "data": base64.b64encode(JPEG).decode()}}
    contents = adapter._contents([{"role": "user", "content": [block, {"type": "text", "text": "Healthy?"}]}])
    image_part, text_part = contents[0].parts
    assert image_part.inline_data.mime_type == "image/jpeg" and image_part.inline_data.data == JPEG
    assert text_part.text == "Healthy?"


def test_numbers_typed_with_a_photo_count_as_supported():
    messages = [{"role": "user", "content": [{"type": "image", "source": {}},
                                             {"type": "text", "text": "I spread 25 lb of compost"}]}]
    assert unsupported_numbers("You used 25 lb of compost.", [], messages) == []
