"""Soil-Smart Planner rules engine (reference implementation).

    data = load_data("data")
    plan = build_plan(grower, data)

The engine is a fixed pipeline of lookups in the YAML data files plus arithmetic:

    1. rotation   rotation_rules.yaml + crops.yaml + problems.yaml -> which crop goes here
    2. lime       lime_table.yaml (or the lab's own lime number)    -> lb of lime
    3. levels     soil_test_levels.yaml                             -> P and K level
    4. need       crops.yaml (N) + nutrient_recs.yaml (P2O5, K2O)   -> lb needed
    5. credits    credits.yaml                                      -> subtract legume + compost
    6. feeding    products.yaml                                     -> lb of product + cost
    7. warnings   last season's inputs vs. P/K level                -> over-fertilizing alerts
    8. practices  practices.yaml                                    -> pest prevention steps
    9. totals     baseline vs. plan cost and synthetic N

No agronomy numbers live in this file. Same input -> same output, every time.
Every plan line carries rule_id, source_id, verified and inputs_used for the Why? panel.
"""
from __future__ import annotations

import copy
import hashlib
from pathlib import Path

import yaml

LEVELS = ["very_low", "low", "medium", "high", "very_high"]
DATA_FILES = ["sources", "crops", "problems", "rotation_rules", "lime_table",
              "soil_test_levels", "nutrient_recs", "credits", "products", "practices"]
TOPUP_ROLES = {"N": "topup_n", "P2O5": "topup_p", "K2O": "topup_k"}
PCT_FIELD = {"N": "n_pct", "P2O5": "p2o5_pct", "K2O": "k2o_pct"}
# Rule id for a lime amount typed in from the grower's own soil report (not a data row).
LAB_LIME_RULE = "LAB-LIME"
LAB_SOURCE = "SRC-GROWER-LAB-REPORT"


# --------------------------------------------------------------------------- loading
def load_data(data_dir: str | Path = "data") -> dict:
    """Load and cross-check every data file. Raises ValueError naming file, row and field."""
    folder, raw, digest = Path(data_dir), {}, hashlib.sha256()
    for name in DATA_FILES:
        text = (folder / f"{name}.yaml").read_text()
        digest.update(text.encode())
        raw[name] = yaml.safe_load(text) or []
    data = {
        "sources": {s["id"]: s for s in raw["sources"]},
        "crops": {c["id"]: c for c in raw["crops"]},
        "problems": {p["id"]: p for p in raw["problems"]},
        "rules": {r["id"]: r for r in raw["rotation_rules"]},
        "lime": raw["lime_table"],
        "levels": {s["nutrient"]: s for s in raw["soil_test_levels"]},
        "recs": {(r["nutrient"], r["n_demand"]): r for r in raw["nutrient_recs"]},
        "credits": {c["kind"]: c for c in raw["credits"]},
        "products": {p["id"]: p for p in raw["products"]},
        "practices": raw["practices"],
        "version": digest.hexdigest()[:8],
    }
    _check(data, raw)
    return data


def _check(data: dict, raw: dict) -> None:
    errors = []
    for name, rows in raw.items():
        for row in rows:
            src = row.get("source")
            if src is not None and src not in data["sources"]:
                errors.append(f"{name}.yaml row {row.get('id')}: source '{src}' not in sources.yaml")
    families = {c["family"] for c in data["crops"].values()}
    for p in data["problems"].values():
        for f in p["affects_families"]:
            if f not in families:
                errors.append(f"problems.yaml row {p['id']}: family '{f}' not used by any crop")
    for pr in data["practices"]:
        errors += [f"practices.yaml row {pr['id']}: crop '{c}' not in crops.yaml"
                   for c in pr["crops"] if c not in data["crops"]]
        errors += [f"practices.yaml row {pr['id']}: problem '{p}' not in problems.yaml"
                   for p in pr["problems"] if p not in data["problems"]]
    for role in list(TOPUP_ROLES.values()) + ["lime"]:
        n = sum(1 for p in data["products"].values() if p.get("role") == role)
        if n != 1:
            errors.append(f"products.yaml: expected exactly one product with role '{role}', found {n}")
    for key in ("compost", "previous_legume"):
        if key not in data["credits"]:
            errors.append(f"credits.yaml: missing row with kind '{key}'")
    if errors:
        raise ValueError("Data check failed:\n  " + "\n  ".join(errors))


# --------------------------------------------------------------------------- helpers
def _line(category, text, rule_id, source_id, verified, inputs_used,
          quantity=None, unit=None, cost_usd=None) -> dict:
    r2 = lambda x: None if x is None else round(x, 2)
    return {"category": category, "text": text, "quantity": r2(quantity), "unit": unit,
            "cost_usd": r2(cost_usd), "rule_id": rule_id, "source_id": source_id,
            "verified": bool(verified), "inputs_used": inputs_used}


def check_grower(grower: dict, data: dict) -> list[str]:
    """Return a list of problems with the grower's input (empty list = OK).

    Run this on whatever Claude extracted from the soil report BEFORE build_plan,
    and show the errors to the farmer on the confirm screen.
    """
    errs, crops, problems, products = [], data["crops"], data["problems"], data["products"]
    textures = {r["soil_texture"] for r in data["lime"]}
    for c in grower.get("crops_needed", []):
        if c not in crops:
            errs.append(f"crops_needed: unknown crop '{c}'")
    for pid in grower.get("price_overrides", {}):
        if pid not in products:
            errs.append(f"price_overrides: unknown product '{pid}'")
    if grower.get("compost_available_cu_yd", 0) < 0:
        errs.append("compost_available_cu_yd cannot be negative")
    for plot in grower.get("plots", []):
        name, t = plot.get("name", plot.get("id", "?")), plot.get("soil_test", {})
        if plot.get("area_sqft", 0) <= 0:
            errs.append(f"{name}: area_sqft must be above 0")
        if plot.get("soil_texture") not in textures:
            errs.append(f"{name}: soil_texture must be one of {sorted(textures)}")
        for key in ("crop_planned", "crop_last_year", "crop_two_years_ago"):
            if plot.get(key) and plot[key] not in crops:
                errs.append(f"{name}: {key} '{plot[key]}' is not in crops.yaml")
        if not plot.get("crop_planned"):
            errs.append(f"{name}: crop_planned is required")
        for p in plot.get("problems", []):
            if p not in problems:
                errs.append(f"{name}: unknown problem '{p}'")
        if not 3.5 <= t.get("ph", 0) <= 9.5:
            errs.append(f"{name}: pH {t.get('ph')} is outside 3.5-9.5; check the report")
        for key in ("p_ppm", "k_ppm"):
            if t.get(key) is None or t[key] < 0:
                errs.append(f"{name}: {key} missing or negative")
        for i in plot.get("baseline", {}).get("inputs", []):
            if i["product_id"] not in products:
                errs.append(f"{name}: baseline product '{i['product_id']}' is not in products.yaml")
    return errs


def _verified(*rows) -> bool:
    return all(r.get("verified", False) for r in rows)


def _product(data, role):
    return next(p for p in data["products"].values() if p.get("role") == role)


def _price(product, grower) -> float:
    return grower.get("price_overrides", {}).get(product["id"], product["price_usd_per_bag"])


def soil_level(data: dict, nutrient: str, ppm: float) -> str:
    """Classify a soil-test value: at or below each upper bound, else very_high."""
    bounds = data["levels"][nutrient]["upper_bounds_ppm"]
    for level in LEVELS[:-1]:
        if ppm <= bounds[level]:
            return level
    return "very_high"


# --------------------------------------------------------------------------- 1. rotation
def rotation_step(plot: dict, grower: dict, data: dict, keep_planned: bool = False):
    crops, problems, rules = data["crops"], data["problems"], data["rules"]
    planned = crops[plot["crop_planned"]]
    r1, r2, r3 = rules["ROT-01"], rules["ROT-02"], rules["ROT-03"]
    history = [plot.get("crop_two_years_ago"), plot.get("crop_last_year")]
    recent = [c for c in history[-r1["years_back"]:] if c]
    recent_families = {crops[c]["family"] for c in recent}
    # Only problems that persist in the soil or debris count (rotation_helps).
    lasting = [p for p in plot.get("problems", []) if problems[p].get("rotation_helps", True)]
    lines, warnings = [], []

    same_family = planned["family"] in recent_families
    if same_family:
        lines.append(_line("rotation", r1["message"].format(
            crop=planned["name"], family=planned["family"], years_back=r1["years_back"]),
            "ROT-01", r1["source"], _verified(r1, planned),
            {"crop_planned": planned["id"], "recent_crops": recent}))
    hits = [p for p in lasting if planned["family"] in problems[p]["affects_families"]]
    for p in hits:
        lines.append(_line("rotation", r3["message"].format(
            problem=problems[p]["name"], family=planned["family"]),
            "ROT-03", problems[p]["source"], _verified(r3, problems[p]),
            {"problem": p, "crop_planned": planned["id"]}))

    if not (same_family or hits):
        return planned["id"], lines, warnings
    if keep_planned:
        why = r1 if same_family else r3
        lines.append(_line("rotation", f"Keeping {planned['name']} here as requested, despite the warning above.",
                           why["id"], why["source"], _verified(why), {"keep_planned": True}))
        return planned["id"], lines, warnings

    blocked = recent_families | {f for p in lasting for f in problems[p]["affects_families"]}
    last = crops.get(plot.get("crop_last_year") or "")
    after_heavy = bool(last) and last["n_demand"] == r2["after_demand"]
    options = [crops[c] for c in grower["crops_needed"] if crops[c]["family"] not in blocked]
    options.sort(key=lambda c: (not (after_heavy and c["n_demand"] == r2["prefer_demand"]), c["name"]))
    if not options:
        warnings.append(f"Plot {plot['name']}: no needed crop avoids the rotation problems; kept {planned['name']}.")
        return planned["id"], lines, warnings
    chosen = options[0]
    why = r1 if same_family else r3
    lines.append(_line("rotation", f"Suggested instead: {chosen['name']} ({chosen['family']} family).",
                       why["id"], why["source"], _verified(why, chosen),
                       {"blocked_families": sorted(blocked), "options": [c["id"] for c in options]}))
    if after_heavy and chosen["n_demand"] == r2["prefer_demand"]:
        lines.append(_line("rotation", r2["message"], "ROT-02", r2["source"], _verified(r2),
                           {"crop_last_year": last["id"], "crop_suggested": chosen["id"]}))
    return chosen["id"], lines, warnings


# --------------------------------------------------------------------------- 2. lime
def lime_step(plot: dict, crop: dict, grower: dict, data: dict):
    test, k = plot["soil_test"], plot["area_sqft"] / 1000
    lime = _product(data, "lime")
    lab_rate = test.get("lab_lime_lb_per_1000sqft")
    if lab_rate is not None:  # the lab's own recommendation always wins
        if lab_rate <= 0:
            return [_line("soil", "No lime needed (from your soil test report).", LAB_LIME_RULE, LAB_SOURCE,
                          True, {"lab_lime_lb_per_1000sqft": lab_rate})], 0.0
        lb = lab_rate * k
        # verified follows the lime product row too, since its price sets the cost
        return [_line("soil", f"Apply {lb:.0f} lb of {lime['name']} (rate from your soil test report).",
                      LAB_LIME_RULE, LAB_SOURCE, _verified(lime), {"lab_lime_lb_per_1000sqft": lab_rate},
                      lb, "lb", lb / lime["bag_lb"] * _price(lime, grower))], lb
    if test["ph"] >= crop["target_ph"]:
        return [_line("soil", f"No lime needed: pH {test['ph']} is at or above the {crop['target_ph']} target.",
                      crop["id"], crop["source"], _verified(crop),
                      {"ph": test["ph"], "target_ph": crop["target_ph"]})], 0.0
    row = next((r for r in data["lime"] if r["soil_texture"] == plot["soil_texture"]
                and r["target_ph"] == crop["target_ph"] and r["ph_min"] <= test["ph"] < r["ph_max"]), None)
    if row is None:
        return [_line("warning", f"No lime rate on file for {plot['soil_texture']} soil at pH {test['ph']} "
                      f"(target {crop['target_ph']}). Use the rate on your soil test report.",
                      crop["id"], crop["source"], False,
                      {"ph": test["ph"], "soil_texture": plot["soil_texture"]})], 0.0
    lb = row["lime_lb_per_1000sqft"] * k
    return [_line("soil", f"Apply {lb:.0f} lb of {lime['name']} 2-3 months before planting to raise pH "
                  f"from {test['ph']} toward {crop['target_ph']}.", row["id"], row["source"],
                  _verified(row, lime), {"ph": test["ph"], "soil_texture": plot["soil_texture"],
                                         "rate_lb_per_1000sqft": row["lime_lb_per_1000sqft"]},
                  lb, "lb", lb / lime["bag_lb"] * _price(lime, grower))], lb


# --------------------------------------------------------------------------- 3-4. levels and need
def need_step(plot: dict, crop: dict, data: dict) -> dict:
    test, k = plot["soil_test"], plot["area_sqft"] / 1000
    p_level, k_level = soil_level(data, "P", test["p_ppm"]), soil_level(data, "K", test["k_ppm"])
    p_row, k_row = data["recs"][("P2O5", crop["n_demand"])], data["recs"][("K2O", crop["n_demand"])]
    return {"N": crop["n_need_lb_per_1000sqft"] * k,
            "P2O5": p_row["lb_per_1000sqft"][p_level] * k,
            "K2O": k_row["lb_per_1000sqft"][k_level] * k,
            "p_level": p_level, "k_level": k_level,
            "rows": {"N": crop, "P2O5": p_row, "K2O": k_row}}


# --------------------------------------------------------------------------- 7. warnings
def overuse_warnings(plot: dict, need: dict, data: dict) -> list:
    lines = []
    for nutrient, level_key, stl in (("P2O5", "p_level", "P"), ("K2O", "k_level", "K")):
        added = sum(i["amount_lb"] * data["products"][i["product_id"]][PCT_FIELD[nutrient]] / 100
                    for i in plot.get("baseline", {}).get("inputs", []))
        level = need[level_key]
        if added > 0 and level in ("high", "very_high"):
            row = data["levels"][stl]
            lines.append(_line("nutrient_warning",
                               f"Last season added {added:.1f} lb {nutrient} to soil already rated "
                               f"{level.replace('_', ' ')} for {stl}. Skip {nutrient} this season.",
                               row["id"], row["source"], _verified(row),
                               {"added_lb": added, "level": level}))
    return lines


# --------------------------------------------------------------------------- 8. practices
def practice_lines(plot: dict, crop: dict, data: dict) -> list:
    plot_problems = set(plot.get("problems", []))
    return [_line("pest_prevention", " ".join(p["text"].split()), p["id"], p["source"], _verified(p),
                  {"crop": crop["id"], "problems": sorted(plot_problems & set(p["problems"]))})
            for p in data["practices"]
            if crop["id"] in p["crops"] and (not p["problems"] or plot_problems & set(p["problems"]))]


# --------------------------------------------------------------------------- pipeline
def build_plan(grower: dict, data: dict, keep_planned_crop_for=()) -> dict:
    errors = check_grower(grower, data)
    if errors:
        raise ValueError("Grower input check failed:\n  " + "\n  ".join(errors))
    grower = copy.deepcopy(grower)  # never mutate the caller's input
    plots, warnings = [], []
    legume, compost = data["credits"]["previous_legume"], data["credits"]["compost"]

    for plot in grower["plots"]:
        crop_id, rot_lines, rot_warn = rotation_step(plot, grower, data, plot["id"] in keep_planned_crop_for)
        crop, k = data["crops"][crop_id], plot["area_sqft"] / 1000
        lime_lines, _ = lime_step(plot, crop, grower, data)
        need = need_step(plot, crop, data)
        feed = []
        last = data["crops"].get(plot.get("crop_last_year") or "")
        if last and last["family"] == "legume" and need["N"] > 0:
            credit = min(legume["n_lb_per_1000sqft"] * k, need["N"])
            need["N"] -= credit
            feed.append(_line("feeding", f"Credit {credit:.1f} lb N left by last year's {last['name'].lower()}.",
                              legume["id"], legume["source"], _verified(legume),
                              {"crop_last_year": last["id"], "credit_lb_per_1000sqft": legume["n_lb_per_1000sqft"]},
                              credit, "lb N"))
        plots.append({"plot": plot, "crop": crop, "k": k, "need": need, "lines": rot_lines + lime_lines,
                      "feed": feed})
        warnings += rot_warn

    # 5. compost: largest N need first, capped per plot, until the grower's supply runs out
    left = float(grower.get("compost_available_cu_yd", 0))
    for p in sorted(plots, key=lambda p: (-p["need"]["N"], p["plot"]["id"])):
        cu_yd = min(left, compost["max_cu_yd_per_1000sqft"] * p["k"]) if p["need"]["N"] > 0 else 0.0
        left -= cu_yd
        p["compost"] = cu_yd
        if cu_yd > 0:
            for nutrient, field in (("N", "n_lb_available_per_cu_yd"), ("P2O5", "p2o5_lb_per_cu_yd"),
                                    ("K2O", "k2o_lb_per_cu_yd")):
                p["need"][nutrient] = max(p["need"][nutrient] - cu_yd * compost[field], 0.0)
            p["feed"].append(_line("feeding", f"Spread {cu_yd:.2f} cu yd of compost.", compost["id"],
                                   compost["source"], _verified(compost),
                                   {"cap_cu_yd_per_1000sqft": compost["max_cu_yd_per_1000sqft"]},
                                   cu_yd, "cu yd", cu_yd * grower.get("compost_price_usd_per_cu_yd", 0)))

    # 6. top-up products, 7. warnings, 8. practices, 9. totals
    out, total_base, total_plan, n_base, n_plan = [], 0.0, 0.0, 0.0, 0.0
    for p in plots:
        plot, crop, need = p["plot"], p["crop"], p["need"]
        synthetic_n = 0.0
        for nutrient, role in TOPUP_ROLES.items():
            if need[nutrient] <= 1e-9:
                continue
            prod, row = _product(data, role), need["rows"][nutrient]
            lb = need[nutrient] / (prod[PCT_FIELD[nutrient]] / 100)
            if nutrient == "N" and prod["type"] == "synthetic":
                synthetic_n += need[nutrient]
            p["feed"].append(_line("feeding", f"Apply {lb:.1f} lb {prod['name']} for {need[nutrient]:.1f} lb {nutrient}.",
                                   row["id"], row["source"], _verified(row, prod),
                                   {"need_lb": need[nutrient], "p_level": need["p_level"], "k_level": need["k_level"]},
                                   lb, "lb", lb / prod["bag_lb"] * _price(prod, grower)))
        lines = p["lines"] + p["feed"] + overuse_warnings(plot, need, data) + practice_lines(plot, crop, data)
        base_inputs = plot.get("baseline", {}).get("inputs", [])
        base_cost = sum(i["amount_lb"] / data["products"][i["product_id"]]["bag_lb"]
                        * _price(data["products"][i["product_id"]], grower) for i in base_inputs)
        base_n = sum(i["amount_lb"] * data["products"][i["product_id"]]["n_pct"] / 100 for i in base_inputs
                     if data["products"][i["product_id"]]["type"] == "synthetic")
        base_cost, base_n, synthetic_n = round(base_cost, 2), round(base_n, 2), round(synthetic_n, 2)
        plan_cost = round(sum(l["cost_usd"] or 0 for l in lines), 2)
        total_base, total_plan, n_base, n_plan = total_base + base_cost, total_plan + plan_cost, n_base + base_n, n_plan + synthetic_n
        out.append({"plot_id": plot["id"], "plot_name": plot["name"], "area_sqft": plot["area_sqft"],
                    "crop_planned": plot["crop_planned"], "crop_suggested": crop["id"],
                    "p_level": need["p_level"], "k_level": need["k_level"], "compost_cu_yd": round(p["compost"], 2),
                    "lines": lines, "baseline_cost_usd": base_cost, "plan_cost_usd": plan_cost,
                    "synthetic_n_lb_baseline": base_n, "synthetic_n_lb_plan": synthetic_n})
    return {"grower_name": grower["name"], "data_version": data["version"], "plots": out,
            "totals": {"baseline_usd": round(total_base, 2), "plan_usd": round(total_plan, 2),
                       "difference_usd": round(total_plan - total_base, 2),
                       "synthetic_n_lb_baseline": round(n_base, 2), "synthetic_n_lb_plan": round(n_plan, 2),
                       "pesticide_applications_baseline": sum(pl.get("baseline", {}).get("pesticide_applications", 0)
                                                              for pl in grower["plots"])},
            "warnings": warnings}


# --------------------------------------------------------------------------- demo
if __name__ == "__main__":
    import json
    import sys
    data_dir = sys.argv[1] if len(sys.argv) > 1 else "data"
    grower_file = sys.argv[2] if len(sys.argv) > 2 else "demo_grower.json"
    plan = build_plan(json.loads(Path(grower_file).read_text()), load_data(data_dir))
    for p in plan["plots"]:
        print(f"\n== {p['plot_name']} ({p['area_sqft']:,} sq ft): {p['crop_planned']} -> {p['crop_suggested']} "
              f"| P {p['p_level']}, K {p['k_level']} | ${p['plan_cost_usd']:.2f} (last season ${p['baseline_cost_usd']:.2f})")
        for l in p["lines"]:
            cost = f"  ${l['cost_usd']:.2f}" if l["cost_usd"] else ""
            print(f"  [{l['category']}] {l['text']}{cost}  <{l['rule_id']} / {l['source_id']}>")
    t = plan["totals"]
    print(f"\nTotal: ${t['plan_usd']:.2f} vs ${t['baseline_usd']:.2f} last season; "
          f"synthetic N {t['synthetic_n_lb_plan']:.1f} lb vs {t['synthetic_n_lb_baseline']:.1f} lb")
    for w in plan["warnings"]:
        print("WARNING:", w)
