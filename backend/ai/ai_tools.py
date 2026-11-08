"""Tools Claude can call from inside the app. Claude sees only these names and descriptions;
when a question needs data, it calls a tool and this file reads just the rows it needs.

    box = ToolBox(grower, data)
    text, is_error = box.run("explain_rule", {"rule_id": "LIME-SANDY-01"})
"""
from __future__ import annotations

import copy
import json
import math
import re
from collections import Counter

from engine.soil_engine import LAB_LIME_RULE, LAB_SOURCE, build_plan, check_grower

FILES = ["crops", "problems", "practices", "products", "rotation_rules", "lime_table",
         "soil_test_levels", "nutrient_recs", "credits", "sources"]

TOOLS = [
    {
        "name": "get_plan",
        "description": (
            "Get the farmer's current season plan from the planning engine: for each plot, the crop to plant, "
            "lime, compost and fertilizer amounts with costs, warnings and pest-prevention steps, plus farm totals "
            "compared with last season. Every line has a rule_id and source_id. Call this before stating any "
            "amount, cost or crop suggestion."),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "run_what_if",
        "description": (
            "Re-run the planning engine with changes and compare with the current plan. Use for questions like "
            "'what if I keep tomatoes in Plot A', 'what if my pH were 6.0', 'what if I had 5 cu yd of compost', "
            "or 'urea costs $25 a bag here'. Plot ids are the farmer's plot ids (e.g. 'A'). Nothing is saved."),
        "input_schema": {
            "type": "object",
            "properties": {
                "keep_planned_crop_for": {
                    "type": "array", "items": {"type": "string"},
                    "description": "Plot ids where the farmer wants to keep their planned crop despite rotation warnings."},
                "plot_changes": {
                    "type": "array",
                    "description": "Per-plot changes to the farmer's inputs.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "plot_id": {"type": "string"},
                            "crop_planned": {"type": "string", "description": "Crop id from crops.yaml, e.g. 'bush_bean'."},
                            "ph": {"type": "number"},
                            "p_ppm": {"type": "number"},
                            "k_ppm": {"type": "number"},
                            "lab_lime_lb_per_1000sqft": {"type": "number"},
                        },
                        "required": ["plot_id"],
                    },
                },
                "compost_available_cu_yd": {"type": "number"},
                "price_overrides": {
                    "type": "object", "additionalProperties": {"type": "number"},
                    "description": "Price per bag by product id, e.g. {\"urea-46-0-0\": 25}."},
            },
        },
    },
    {
        "name": "explain_rule",
        "description": (
            "Look up the data row behind a plan line by its rule_id (e.g. 'ROT-01', 'LIME-SANDY-01', "
            "'CRED-COMPOST', 'STL-P', 'NUT-P2O5-HEAVY', 'cabbage', 'PRAC-CABBAGE-WORMS'), with the file it came "
            "from and its source (title, link, verified). Use to answer 'why' questions about the plan."),
        "input_schema": {
            "type": "object",
            "properties": {"rule_id": {"type": "string"}},
            "required": ["rule_id"],
        },
    },
    {
        "name": "lookup_data",
        "description": (
            "Read rows from one of the planner's data files. Use for general questions such as which crops are "
            "legumes, what problems affect brassicas, what a product contains, or the soil-test cutoffs. "
            "Give an id for one row, or 'where' to filter (field equals value; for list fields, the list "
            "contains the value). Returns at most 30 rows."),
        "input_schema": {
            "type": "object",
            "properties": {
                "file": {"type": "string", "enum": FILES},
                "id": {"type": "string"},
                "where": {"type": "object", "description": "e.g. {\"family\": \"legume\"} or {\"crops\": \"cabbage\"}"},
            },
            "required": ["file"],
        },
    },
    {
        "name": "search_notes",
        "description": (
            "Search the team's research notes (short summaries of extension guides, each with its source) for "
            "background questions: how rotation fights disease, why compost helps, how a pest spreads, what "
            "soil-test levels mean. Answer only from the notes returned and cite their sources."),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 8},
            },
            "required": ["query"],
        },
    },
]


def load_notes(data_dir) -> list:
    """The research notes used by search_notes (source_notes.yaml)."""
    import yaml
    from pathlib import Path
    return yaml.safe_load((Path(data_dir) / "source_notes.yaml").read_text()) or []


class ToolError(Exception):
    """A problem Claude should see and explain to the farmer."""


class ToolBox:
    def __init__(self, grower: dict, data: dict, notes: list | None = None):
        self.grower, self.data = grower, data
        self.notes = notes if notes is not None else data.get("notes", [])
        self._plan = None
        self._index = _NoteIndex(self.notes)

    # ------------------------------------------------------------------ dispatch
    def run(self, name: str, args: dict) -> tuple[str, bool]:
        """Run one tool. Returns (JSON text for Claude, is_error)."""
        handler = getattr(self, f"_tool_{name}", None)
        if handler is None:
            return json.dumps({"error": f"Unknown tool '{name}'."}), True
        try:
            return json.dumps(handler(**(args or {})), ensure_ascii=False), False
        except ToolError as e:
            return json.dumps({"error": str(e)}), True
        except (TypeError, KeyError, ValueError) as e:
            return json.dumps({"error": f"{type(e).__name__}: {e}"}), True

    # ------------------------------------------------------------------ tools
    def _tool_get_plan(self):
        return _compact(self._current_plan())

    def _tool_run_what_if(self, keep_planned_crop_for=(), plot_changes=(), compost_available_cu_yd=None,
                          price_overrides=None):
        grower = copy.deepcopy(self.grower)
        plots = {p["id"]: p for p in grower["plots"]}
        unknown = [pid for pid in list(keep_planned_crop_for) + [c.get("plot_id") for c in plot_changes]
                   if pid not in plots]
        if unknown:
            raise ToolError(f"Unknown plot id(s) {unknown}. Plot ids are {sorted(plots)}.")
        for change in plot_changes:
            plot = plots[change["plot_id"]]
            if "crop_planned" in change:
                plot["crop_planned"] = change["crop_planned"]
            for key in ("ph", "p_ppm", "k_ppm", "lab_lime_lb_per_1000sqft"):
                if key in change:
                    plot["soil_test"][key] = change[key]
        if compost_available_cu_yd is not None:
            grower["compost_available_cu_yd"] = compost_available_cu_yd
        if price_overrides:
            grower.setdefault("price_overrides", {}).update(price_overrides)
        errors = check_grower(grower, self.data)
        if errors:
            raise ToolError("That change can't be planned: " + "; ".join(errors))
        before, after = self._current_plan(), build_plan(grower, self.data, list(keep_planned_crop_for))
        return {
            "changes": {"keep_planned_crop_for": list(keep_planned_crop_for), "plot_changes": list(plot_changes),
                        "compost_available_cu_yd": compost_available_cu_yd, "price_overrides": price_overrides},
            "compared_to_current_plan": {
                "plan_usd": [before["totals"]["plan_usd"], after["totals"]["plan_usd"]],
                "synthetic_n_lb": [before["totals"]["synthetic_n_lb_plan"], after["totals"]["synthetic_n_lb_plan"]],
                "crops": {b["plot_id"]: [b["crop_suggested"], a["crop_suggested"]]
                          for b, a in zip(before["plots"], after["plots"])},
                "note": "Each pair is [current plan, what-if plan].",
            },
            "what_if_plan": _compact(after),
        }

    def _tool_explain_rule(self, rule_id):
        d = self.data
        if rule_id == LAB_LIME_RULE:
            return {"rule_id": rule_id, "file": "farmer's soil test report",
                    "row": {"meaning": "Lime rate typed in from the farmer's own lab report; it replaces lime_table.yaml."},
                    "source": d["sources"].get(LAB_SOURCE)}
        tables = [("rotation_rules", d["rules"].values()), ("crops", d["crops"].values()), ("lime_table", d["lime"]),
                  ("nutrient_recs", d["recs"].values()), ("credits", d["credits"].values()),
                  ("soil_test_levels", d["levels"].values()), ("practices", d["practices"]),
                  ("problems", d["problems"].values()), ("products", d["products"].values())]
        for file, rows in tables:
            row = next((r for r in rows if r.get("id") == rule_id), None)
            if row:
                return {"rule_id": rule_id, "file": f"{file}.yaml", "row": row,
                        "source": d["sources"].get(row.get("source")) if row.get("source") else None}
        raise ToolError(f"No data row has id '{rule_id}'. Use a rule_id exactly as it appears in the plan.")

    def _tool_lookup_data(self, file, id=None, where=None):
        rows = self._rows(file)
        if id is not None:
            rows = [r for r in rows if r.get("id") == id]
            if not rows:
                raise ToolError(f"No row with id '{id}' in {file}.yaml.")
        for field, value in (where or {}).items():
            rows = [r for r in rows if (value in r.get(field, []) if isinstance(r.get(field), list)
                                        else r.get(field) == value)]
        return {"file": f"{file}.yaml", "count": len(rows), "rows": rows[:30]}

    def _tool_search_notes(self, query, limit=5):
        hits = self._index.search(query, limit)
        if not hits:
            return {"query": query, "notes": [], "message": "No research note matches. Say you don't have a source for this."}
        return {"query": query, "notes": [
            {"id": n["id"], "note": n["note"], "where_in_source": n.get("page"),
             "source": {k: self.data["sources"].get(n["source"], {}).get(k) for k in ("id", "title", "url", "verified")}}
            for n in hits]}

    # ------------------------------------------------------------------ helpers
    def _current_plan(self):
        if self._plan is None:
            errors = check_grower(self.grower, self.data)
            if errors:
                raise ToolError("The farmer's inputs need fixing first: " + "; ".join(errors))
            self._plan = build_plan(self.grower, self.data)
        return self._plan

    def _rows(self, file):
        d = self.data
        return {"crops": list(d["crops"].values()), "problems": list(d["problems"].values()),
                "practices": d["practices"], "products": list(d["products"].values()),
                "rotation_rules": list(d["rules"].values()), "lime_table": d["lime"],
                "soil_test_levels": list(d["levels"].values()), "nutrient_recs": list(d["recs"].values()),
                "credits": list(d["credits"].values()), "sources": list(d["sources"].values())}[file]


def _compact(plan: dict) -> dict:
    """The plan without the per-line inputs_used detail, to keep tool results short."""
    out = copy.deepcopy(plan)
    for p in out["plots"]:
        for line in p["lines"]:
            line.pop("inputs_used", None)
            for key in ("quantity", "unit", "cost_usd"):
                if line[key] is None:
                    line.pop(key)
    return out


# ---------------------------------------------------------------------- note search (no extra packages)
_STOP = set("a an and are as at be by can do does for from how i in is it my of on or should that the this to "
            "what when where which why will with you your".split())


def _tokens(text: str) -> list[str]:
    words = re.findall(r"[a-z0-9]+", text.lower().replace("_", " ").replace("-", " "))
    return [_stem(w) for w in words if w not in _STOP]


def _stem(w: str) -> str:
    for end in ("ies", "es", "s"):
        if len(w) > 4 and w.endswith(end):
            return w[: -len(end)] + ("y" if end == "ies" else "")
    return w


class _NoteIndex:
    """BM25-style keyword search over source_notes.yaml. Topics count double."""

    def __init__(self, notes: list):
        self.notes = notes
        self.docs = [Counter(_tokens(n["note"]) + 2 * _tokens(" ".join(n.get("topics", [])))) for n in notes]
        self.avg = sum(sum(d.values()) for d in self.docs) / max(len(self.docs), 1)
        df = Counter(t for d in self.docs for t in d)
        self.idf = {t: math.log(1 + (len(self.docs) - n + 0.5) / (n + 0.5)) for t, n in df.items()}

    def search(self, query: str, limit: int = 5) -> list:
        q = set(_tokens(query))
        scored = []
        for note, doc in zip(self.notes, self.docs):
            length = sum(doc.values())
            score = sum(self.idf[t] * doc[t] * 2.2 / (doc[t] + 1.2 * (0.25 + 0.75 * length / self.avg))
                        for t in q if t in doc)
            if score > 0:
                scored.append((score, note["id"], note))
        return [n for _, _, n in sorted(scored, key=lambda s: (-s[0], s[1]))[:limit]]
