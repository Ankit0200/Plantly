"""Tests for the tools and the chat loop, using a fake Claude client (no API key needed)."""
import json
import os
from pathlib import Path
from types import SimpleNamespace as NS

import pytest

from ai.ai_tools import TOOLS, ToolBox, load_notes
from ai.chat import chat, unsupported_numbers
from engine.soil_engine import load_data

HERE = Path(__file__).parent
BACKEND = HERE.parent
DATA_DIR = Path(os.environ.get("SOIL_DATA_DIR", BACKEND / "data"))


@pytest.fixture(scope="module")
def data():
    return load_data(DATA_DIR)


@pytest.fixture(scope="module")
def notes():
    return load_notes(DATA_DIR)


@pytest.fixture
def grower():
    return json.loads((BACKEND / "fixtures" / "demo_grower.json").read_text())


class FakeClaude:
    """Plays back scripted responses and records what it was sent."""

    def __init__(self, script):
        self.script, self.calls = list(script), []
        self.messages = self

    def create(self, **kwargs):
        self.calls.append(json.loads(json.dumps(kwargs["messages"])))
        return self.script.pop(0)


def tool_call(name, args, id="t1"):
    return NS(stop_reason="tool_use", content=[NS(type="tool_use", id=id, name=name, input=args)])


def answer(text):
    return NS(stop_reason="end_turn", content=[NS(type="text", text=text)])


# ------------------------------------------------------------------ tools
def test_every_tool_has_a_handler(grower, data, notes):
    box = ToolBox(grower, data, notes)
    for t in TOOLS:
        assert hasattr(box, f"_tool_{t['name']}"), t["name"]


def test_what_if_keep_tomato(grower, data, notes):
    out, err = ToolBox(grower, data, notes).run("run_what_if", {"keep_planned_crop_for": ["A"]})
    cmp = json.loads(out)["compared_to_current_plan"]
    assert not err and cmp["crops"]["A"] == ["bush_bean", "tomato"]
    assert cmp["synthetic_n_lb"][1] > cmp["synthetic_n_lb"][0]


def test_what_if_rejects_bad_values(grower, data, notes):
    box = ToolBox(grower, data, notes)
    assert box.run("run_what_if", {"plot_changes": [{"plot_id": "Z"}]})[1]
    assert box.run("run_what_if", {"plot_changes": [{"plot_id": "B", "crop_planned": "tomatoes"}]})[1]


def test_what_if_does_not_touch_the_real_grower(grower, data, notes):
    before = json.dumps(grower, sort_keys=True)
    ToolBox(grower, data, notes).run("run_what_if", {"plot_changes": [{"plot_id": "B", "ph": 6.6}]})
    assert json.dumps(grower, sort_keys=True) == before


def test_explain_rule_returns_row_and_source(grower, data, notes):
    out = json.loads(ToolBox(grower, data, notes).run("explain_rule", {"rule_id": "CRED-COMPOST"})[0])
    assert out["file"] == "credits.yaml" and out["source"]["id"] == "SRC-WSU-COMPOST"


def test_every_plan_rule_can_be_explained(grower, data, notes):
    box = ToolBox(grower, data, notes)
    plan = json.loads(box.run("get_plan", {})[0])
    for p in plan["plots"]:
        for line in p["lines"]:
            assert not box.run("explain_rule", {"rule_id": line["rule_id"]})[1], line["rule_id"]


def test_lookup_and_search(grower, data, notes):
    box = ToolBox(grower, data, notes)
    legumes = json.loads(box.run("lookup_data", {"file": "crops", "where": {"family": "legume"}})[0])
    assert {r["id"] for r in legumes["rows"]} >= {"bush_bean"}
    hits = json.loads(box.run("search_notes", {"query": "squash bugs spread"})[0])["notes"]
    assert hits and hits[0]["source"]["url"]


def test_unknown_tool_is_an_error(grower, data, notes):
    assert ToolBox(grower, data, notes).run("delete_everything", {})[1]


# ------------------------------------------------------------------ chat loop
def test_chat_calls_tools_then_answers(grower, data, notes):
    fake = FakeClaude([
        tool_call("get_plan", {}, "t1"),
        tool_call("explain_rule", {"rule_id": "LIME-SANDY-01"}, "t2"),
        answer("Plot B's pH is 5.4, below cabbage's 6.5 target, so the plan adds 87.5 lb of lime ($8.75)."),
    ])
    out = chat([{"role": "user", "content": "Why does Plot B need lime?"}], grower, data, notes, client=fake)
    assert [t["tool"] for t in out["tools_used"]] == ["get_plan", "explain_rule"]
    assert out["unsupported_numbers"] == []
    # the tool result went back to Claude with the matching id
    last_sent = fake.calls[-1][-1]["content"][0]
    assert last_sent["type"] == "tool_result" and last_sent["tool_use_id"] == "t2"


def test_chat_without_tools(grower, data, notes):
    fake = FakeClaude([answer("Hi! Ask me anything about your plots.")])
    out = chat([{"role": "user", "content": "hello"}], grower, data, notes, client=fake)
    assert out["tools_used"] == [] and out["reply"].startswith("Hi")


def test_guard_flags_made_up_numbers(grower, data, notes):
    fake = FakeClaude([tool_call("get_plan", {}), answer("Put 120 lb of lime on Plot B; it costs $8.75.")])
    out = chat([{"role": "user", "content": "lime for B?"}], grower, data, notes, client=fake)
    assert out["unsupported_numbers"] == [120.0]


def test_guard_accepts_rounding():
    trace = [{"output": '{"quantity": 217.8, "cost_usd": 21.78}'}]
    assert unsupported_numbers("About 218 lb of lime, $21.78.", trace, []) == []
