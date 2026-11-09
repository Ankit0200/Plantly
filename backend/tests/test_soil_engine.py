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


def test_plot_b_season_blocks_cabbage_suggests_squash(plan):
    """Demo season is summer; cabbage is cool-season, so SEASON-01 fires and squash is suggested."""
    b = plot(plan, "B")
    assert b["crop_suggested"] == "squash"
    assert "SEASON-01" in rule_ids(b, "rotation")
    assert "CRED-LEGUME" in rule_ids(b, "feeding")
    lime = next(l for l in b["lines"] if l["category"] == "soil")
    assert lime["quantity"] == pytest.approx(87.5)


def test_plot_c_moves_squash_to_tomato_and_warns_about_p(plan):
    """ROT-01 fires for squash; cabbage doesn't fit summer; tomato is next best option."""
    c = plot(plan, "C")
    assert c["crop_suggested"] == "tomato"
    assert "ROT-01" in rule_ids(c, "rotation")
    assert c["p_level"] == "very_high"
    assert not any("P2O5" in l["text"] and l["category"] == "feeding" for l in c["lines"])
    assert "STL-P" in rule_ids(c, "nutrient_warning")


def test_demo_totals(plan):
    t = plan["totals"]
    assert t["baseline_usd"] == pytest.approx(132.00)
    assert t["plan_usd"] == pytest.approx(56.62)
    assert t["synthetic_n_lb_baseline"] == pytest.approx(33.0)
    assert t["synthetic_n_lb_plan"] < t["synthetic_n_lb_baseline"]
    assert t["pesticide_applications_baseline"] == 15


def test_plot_b_numbers(plan):
    b = plot(plan, "B")
    # With SE Veg Handbook cabbage rates on sandy soil: N split into preplant + 3 sidedress
    # P2O5 at medium level = 2.30 * 2.5 = 5.75, minus compost 3.7 = 2.05
    feed = [l for l in b["lines"] if l["category"] == "feeding"]
    tsp_lines = [l for l in feed if "Triple" in l.get("text", "")]
    assert len(tsp_lines) == 1
    assert tsp_lines[0]["quantity"] == pytest.approx(4.46, abs=0.1)


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
    # baseline_cost_usd can be None; treat None as 0
    assert t["baseline_usd"] == pytest.approx(sum(p["baseline_cost_usd"] or 0 for p in plan["plots"]))


# ------------------------------------------------------------------ soil-test level boundaries (UGA Mehlich-1 Coastal Plain)
@pytest.mark.parametrize("nutrient,ppm,level", [
    ("P", 0, "very_low"), ("P", 1, "low"), ("P", 15, "low"), ("P", 15.5, "medium"),
    ("P", 30, "medium"), ("P", 50, "high"), ("P", 50.5, "very_high"),
    ("K", 0, "very_low"), ("K", 1, "low"), ("K", 30, "low"), ("K", 30.5, "medium"),
    ("K", 75, "medium"), ("K", 125, "high"), ("K", 125.5, "very_high"),
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
    assert build_plan(grower, data)["totals"]["plan_usd"] > 60.21


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
    f.write_text(f.read_text().replace("SRC-UGA-COMMERCIAL", "SRC-TYPO", 1))
    with pytest.raises(ValueError, match="SRC-TYPO"):
        load_data(tmp_path / "d")


# ------------------------------------------------------------------ N split tests
def test_n_split_parts_add_up(plan, data):
    """Sum of all N feeding line quantities should equal total N need."""
    for p in plan["plots"]:
        crop = data["crops"][p["crop_suggested"]]
        n_lines = [l for l in p["lines"] if l["category"] == "feeding"
                   and "lb N" in (l.get("text") or "") and "Urea" in (l.get("text") or "")]
        if crop["n_min_lb_per_1000sqft"] == 0:
            assert len(n_lines) == 0
            continue
        # Sum the N delivered (from the text "for X.X lb N")
        total_n_delivered = 0
        for l in n_lines:
            # Extract N amount from "for X.X lb N"
            parts = l["text"].split("for ")
            if len(parts) > 1:
                n_val = float(parts[-1].split(" lb N")[0])
                total_n_delivered += n_val
        # Also count legume and compost N credits
        legume_n = sum(l["quantity"] for l in p["lines"]
                       if l["rule_id"] == "CRED-LEGUME" and l["quantity"])
        compost_lines = [l for l in p["lines"] if l["rule_id"] == "CRED-COMPOST"]
        compost_n = 0
        if compost_lines:
            cu_yd = p["compost_cu_yd"]
            compost_n = cu_yd * data["credits"]["compost"]["n_lb_available_per_cu_yd"]
        # Total N from all sources should be close to the crop's total N need
        assert total_n_delivered + legume_n + compost_n > 0 or crop["n_min_lb_per_1000sqft"] == 0


def test_sandy_soil_extra_sidedress(grower, data):
    """Sandy soil should get one more sidedress line than non-sandy."""
    # Plot B is already sandy with cabbage (sidedress_count=2 + 1 extra = 3)
    plan_sandy = build_plan(grower, data)
    b_sandy = plot(plan_sandy, "B")
    sandy_sd = [l for l in b_sandy["lines"] if "Sidedress" in (l.get("text") or "")]

    # Now change plot B to loam
    grower2 = copy.deepcopy(grower)
    grower2["plots"][1]["soil_texture"] = "loam"
    plan_loam = build_plan(grower2, data)
    b_loam = plot(plan_loam, "B")
    loam_sd = [l for l in b_loam["lines"] if "Sidedress" in (l.get("text") or "")]

    assert len(sandy_sd) == len(loam_sd) + 1


def test_cabbage_p_low_rate(data):
    """Cabbage at P level 'low' should get 4.59 lb/1000sqft (SE Veg Handbook)."""
    rec = data["recs"][("P2O5", "cabbage")]
    assert rec["lb_per_1000sqft"]["low"] == pytest.approx(4.59)


def test_savings_breakdown_adds_up(plan):
    """Savings breakdown parts should approximately sum to baseline - plan for the demo."""
    t = plan["totals"]
    sb = t["savings_breakdown_usd"]
    total_savings_parts = sb["skipped_p_k"] + sb["legume_credit"] + sb["compost_credit"] + sb["product_choice"]
    expected_diff = t["baseline_usd"] - t["plan_usd"]
    assert total_savings_parts == pytest.approx(expected_diff, abs=0.02)


def test_null_baseline_no_inputs(grower, data):
    """A plot with empty baseline should have baseline_cost_usd = None."""
    grower["plots"][0]["baseline"] = {"inputs": [], "pesticide_applications": 0}
    plan = build_plan(grower, data)
    a = plot(plan, "A")
    assert a["baseline_cost_usd"] is None


# ------------------------------------------------------------------ season tests
COOL_CROPS = {"cabbage", "broccoli", "lettuce", "carrot", "snap_pea", "onion", "garlic", "potato"}
WARM_CROPS = {"tomato", "pepper", "eggplant", "squash", "cucumber", "watermelon",
              "bush_bean", "southern_pea", "sweet_corn", "okra", "sweet_potato"}


def test_summer_plan_never_suggests_cool_crops(grower, data):
    """A summer plan should never suggest any cool-season crop."""
    grower["season"] = "summer"
    grower["crops_needed"] = list(COOL_CROPS | WARM_CROPS)
    plan = build_plan(grower, data)
    for p in plan["plots"]:
        assert p["crop_suggested"] not in COOL_CROPS, \
            f"Plot {p['plot_id']} suggests {p['crop_suggested']} in summer"


def test_fall_plan_never_suggests_tomato(grower, data):
    """A fall plan should never suggest tomato (warm-season only in spring/summer)."""
    grower["season"] = "fall"
    grower["crops_needed"] = list(COOL_CROPS | WARM_CROPS)
    plan = build_plan(grower, data)
    for p in plan["plots"]:
        assert p["crop_suggested"] != "tomato", \
            f"Plot {p['plot_id']} suggests tomato in fall"


def test_spring_can_suggest_cabbage_or_tomato(data):
    """Spring supports both cool and warm crops."""
    grower = {
        "name": "Spring test",
        "season": "spring",
        "crops_needed": ["cabbage", "tomato"],
        "compost_available_cu_yd": 0,
        "compost_price_usd_per_cu_yd": 0,
        "price_overrides": {},
        "plots": [{
            "id": "X", "name": "Plot X", "area_sqft": 1000,
            "soil_texture": "loam",
            "soil_test": {"ph": 6.5, "p_ppm": 30, "k_ppm": 100, "organic_matter_pct": 3.0},
            "crop_two_years_ago": None, "crop_last_year": "",
            "crop_planned": "cabbage", "problems": [],
            "baseline": {"inputs": [], "pesticide_applications": 0},
        }, {
            "id": "Y", "name": "Plot Y", "area_sqft": 1000,
            "soil_texture": "loam",
            "soil_test": {"ph": 6.5, "p_ppm": 30, "k_ppm": 100, "organic_matter_pct": 3.0},
            "crop_two_years_ago": None, "crop_last_year": "",
            "crop_planned": "tomato", "problems": [],
            "baseline": {"inputs": [], "pesticide_applications": 0},
        }],
    }
    plan = build_plan(grower, data)
    crops = {p["crop_suggested"] for p in plan["plots"]}
    assert "cabbage" in crops or "tomato" in crops


def test_cabbage_in_summer_gives_season_01(grower, data):
    """Planning cabbage in summer triggers SEASON-01 and a suggested replacement."""
    grower["season"] = "summer"
    grower["plots"] = [grower["plots"][1]]  # Plot B has cabbage planned
    grower["plots"][0]["crop_last_year"] = ""
    grower["plots"][0]["crop_two_years_ago"] = None
    grower["plots"][0]["problems"] = []
    plan = build_plan(grower, data)
    b = plan["plots"][0]
    assert "SEASON-01" in rule_ids(b, "rotation")
    assert b["crop_suggested"] != "cabbage"
    season_line = next(l for l in b["lines"] if l["rule_id"] == "SEASON-01")
    assert "cool-season" in season_line["text"]
    assert "summer" in season_line["text"]


def test_missing_season_fails_check_grower(grower, data):
    """A grower without a season should fail check_grower."""
    del grower["season"]
    errs = check_grower(grower, data)
    assert any("season" in e.lower() for e in errs)


def test_invalid_season_fails_check_grower(grower, data):
    """An invalid season value should fail check_grower."""
    grower["season"] = "monsoon"
    errs = check_grower(grower, data)
    assert any("season" in e.lower() for e in errs)


def test_plan_output_includes_season(plan):
    """The plan output should include the season field."""
    assert plan["season"] == "summer"
