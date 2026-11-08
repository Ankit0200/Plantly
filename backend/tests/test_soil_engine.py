"""Tests for soil_engine.py.  Run:  pytest -q

Set SOIL_DATA_DIR if the YAML files are not in ../data.
"""
import copy
import json
import os
import shutil
from pathlib import Path

import pytest

from engine.soil_engine import build_plan, check_grower, load_data, soil_level, LAB_LIME_RULE

HERE = Path(__file__).parent
BACKEND = HERE.parent
DATA_DIR = Path(os.environ.get("SOIL_DATA_DIR", BACKEND / "data"))


@pytest.fixture(scope="module")
def data():
    return load_data(DATA_DIR)


@pytest.fixture
def grower():
    return json.loads((BACKEND / "fixtures" / "demo_grower.json").read_text())


@pytest.fixture
def plan(grower, data):
    return build_plan(grower, data)


def plot(plan, plot_id):
    return next(p for p in plan["plots"] if p["plot_id"] == plot_id)


def rule_ids(p, category=None):
    return [l["rule_id"] for l in p["lines"] if category is None or l["category"] == category]


# ------------------------------------------------------------------ the demo story
def test_plot_a_moves_tomato_to_bush_bean(plan):
    a = plot(plan, "A")
    assert a["crop_suggested"] == "bush_bean"
    assert {"ROT-01", "ROT-02", "ROT-03"} <= set(rule_ids(a, "rotation"))


def test_plot_b_keeps_cabbage_with_legume_credit_and_lime(plan):
    b = plot(plan, "B")
    assert b["crop_suggested"] == "cabbage"
    assert rule_ids(b, "rotation") == []          # cabbage worms move, so no ROT-03
    assert "CRED-LEGUME" in rule_ids(b, "feeding")
    lime = next(l for l in b["lines"] if l["category"] == "soil")
    assert lime["quantity"] == pytest.approx(87.5)


def test_plot_c_moves_squash_to_cabbage_and_warns_about_p(plan):
    c = plot(plan, "C")
    assert c["crop_suggested"] == "cabbage"
    assert "ROT-01" in rule_ids(c, "rotation")
    assert "ROT-03" not in rule_ids(c)              # squash bugs fly in; rotation doesn't help
    assert c["p_level"] == "very_high"
    assert not any("P2O5" in l["text"] and l["category"] == "feeding" for l in c["lines"])
    assert "STL-P" in rule_ids(c, "nutrient_warning")


def test_demo_totals(plan):
    t = plan["totals"]
    assert t["baseline_usd"] == pytest.approx(132.00)
    assert t["plan_usd"] == pytest.approx(45.28)
    assert t["synthetic_n_lb_baseline"] == pytest.approx(33.0)
    assert t["synthetic_n_lb_plan"] < t["synthetic_n_lb_baseline"]
    assert t["pesticide_applications_baseline"] == 15


def test_plot_b_numbers(plan):
    b = plot(plan, "B")
    feed = {l["text"].split(" lb ")[1].split(" ")[0] if "Apply" in l["text"] else l["rule_id"]: l
            for l in b["lines"] if l["category"] == "feeding"}
    assert feed["Urea"]["quantity"] == pytest.approx(4.475 / 0.46, abs=0.01)
    assert feed["Triple"]["quantity"] == pytest.approx(6.55 / 0.46, abs=0.01)
    assert feed["Muriate"]["quantity"] == pytest.approx(3.05 / 0.60, abs=0.01)


# ------------------------------------------------------------------ invariants
def known_rule_ids(data):
    ids = set(data["rules"]) | set(data["crops"]) | {r["id"] for r in data["lime"]}
    ids |= {r["id"] for r in data["recs"].values()} | {c["id"] for c in data["credits"].values()}
    ids |= {s["id"] for s in data["levels"].values()} | {p["id"] for p in data["practices"]}
    return ids | {LAB_LIME_RULE}


def all_lines(plan):
    return [l for p in plan["plots"] for l in p["lines"]]


def test_every_line_cites_a_real_rule_and_source(plan, data):
    rules, sources = known_rule_ids(data), set(data["sources"])
    for l in all_lines(plan):
        assert l["rule_id"] in rules, l
        assert l["source_id"] in sources, l


def test_no_negative_numbers(plan):
    for l in all_lines(plan):
        assert (l["quantity"] or 0) >= 0 and (l["cost_usd"] or 0) >= 0, l


def test_nothing_verified_while_data_is_unverified(plan):
    # Every data row is still verified: false, so no line may claim to be verified.
    assert not any(l["verified"] for l in all_lines(plan))


def test_same_input_same_output(grower, data):
    assert build_plan(grower, data) == build_plan(grower, data)


def test_input_is_not_changed(grower, data):
    before = copy.deepcopy(grower)
    build_plan(grower, data)
    assert grower == before


def test_compost_never_exceeds_supply(plan, grower):
    assert sum(p["compost_cu_yd"] for p in plan["plots"]) <= grower["compost_available_cu_yd"] + 1e-9


def test_totals_equal_sum_of_plots(plan):
    t = plan["totals"]
    assert t["plan_usd"] == pytest.approx(sum(p["plan_cost_usd"] for p in plan["plots"]))
    assert t["baseline_usd"] == pytest.approx(sum(p["baseline_cost_usd"] for p in plan["plots"]))


# ------------------------------------------------------------------ soil-test level boundaries
@pytest.mark.parametrize("nutrient,ppm,level", [
    ("P", 0, "very_low"), ("P", 10, "very_low"), ("P", 10.5, "low"), ("P", 20, "low"),
    ("P", 27, "medium"), ("P", 40, "high"), ("P", 40.5, "very_high"),
    ("K", 35, "very_low"), ("K", 78, "low"), ("K", 91, "medium"), ("K", 117.5, "high"), ("K", 118, "very_high"),
])
def test_level_boundaries(data, nutrient, ppm, level):
    assert soil_level(data, nutrient, ppm) == level


# ------------------------------------------------------------------ what-ifs and overrides
def test_keep_tomato_in_plot_a(grower, data):
    plan = build_plan(grower, data, keep_planned_crop_for=["A"])
    a = plot(plan, "A")
    assert a["crop_suggested"] == "tomato"
    assert {"ROT-01", "ROT-03"} <= set(rule_ids(a, "rotation"))   # still warned
    assert a["compost_cu_yd"] == pytest.approx(3.0)                 # biggest N need gets the compost first
    assert plan["totals"]["synthetic_n_lb_plan"] > build_plan(grower, data)["totals"]["synthetic_n_lb_plan"]


def test_lab_lime_rate_wins(grower, data):
    grower["plots"][1]["soil_test"]["lab_lime_lb_per_1000sqft"] = 40
    lime = next(l for l in plot(build_plan(grower, data), "B")["lines"] if l["category"] == "soil")
    assert lime["rule_id"] == LAB_LIME_RULE
    assert lime["quantity"] == pytest.approx(100)


def test_lab_says_no_lime(grower, data):
    grower["plots"][1]["soil_test"]["lab_lime_lb_per_1000sqft"] = 0
    b = plot(build_plan(grower, data), "B")
    assert not any(l["category"] == "soil" and l["quantity"] for l in b["lines"])


def test_ph_off_the_table_gives_warning_not_number(grower, data):
    grower["plots"][1]["soil_test"]["ph"] = 4.6
    b = plot(build_plan(grower, data), "B")
    lime = [l for l in b["lines"] if "lime" in l["text"].lower()]
    assert lime and lime[0]["category"] == "warning" and lime[0]["quantity"] is None


def test_price_override_changes_cost(grower, data):
    grower["price_overrides"] = {"urea-46-0-0": 40.0}
    assert build_plan(grower, data)["totals"]["plan_usd"] > 45.28


# ------------------------------------------------------------------ bad input is caught
def test_check_grower_flags_bad_extraction(grower, data):
    grower["plots"][0]["crop_planned"] = "tomatoes"
    grower["plots"][1]["soil_test"]["ph"] = 54
    errs = check_grower(grower, data)
    assert any("tomatoes" in e for e in errs) and any("pH 54" in e for e in errs)
    with pytest.raises(ValueError):
        build_plan(grower, data)


def test_demo_input_is_clean(grower, data):
    assert check_grower(grower, data) == []


def test_load_data_names_broken_reference(tmp_path):
    shutil.copytree(DATA_DIR, tmp_path / "d")
    f = tmp_path / "d" / "crops.yaml"
    f.chmod(0o644)
    f.write_text(f.read_text().replace("SRC-CLEMSON-FERTVEG", "SRC-TYPO", 1))
    with pytest.raises(ValueError, match="SRC-TYPO"):
        load_data(tmp_path / "d")
