"""Flask app — /api routes only."""

import json
import os
import traceback
from pathlib import Path

from flask import Flask, jsonify, request

from engine.soil_engine import load_data, build_plan, check_grower
from ai.ai_tools import load_notes
from ai.chat import chat

app = Flask(__name__)

DATA_DIR = os.environ.get("SOIL_DATA_DIR", str(Path(__file__).parent / "data"))
DATA = load_data(DATA_DIR)
NOTES = load_notes(DATA_DIR)

FIXTURES_DIR = Path(__file__).parent / "fixtures"


@app.route("/api/health")
def health():
    return jsonify({"status": "ok", "data_version": DATA["version"]})


@app.route("/api/reference")
def reference():
    crops = list(DATA["crops"].values())
    problems = list(DATA["problems"].values())
    products = list(DATA["products"].values())

    unverified = 0
    for collection in [crops, problems, products, DATA["lime"],
                       list(DATA["levels"].values()), list(DATA["recs"].values()),
                       list(DATA["credits"].values()), list(DATA["rules"].values()),
                       DATA["practices"], list(DATA["sources"].values())]:
        for row in collection:
            if not row.get("verified", False):
                unverified += 1

    return jsonify({
        "crops": crops,
        "problems": problems,
        "products": products,
        "data_version": DATA["version"],
        "unverified_count": unverified,
    })


@app.route("/api/demo-grower")
def demo_grower():
    path = FIXTURES_DIR / "demo_grower.json"
    with open(path) as f:
        data = json.load(f)
    return jsonify(data)


@app.post("/api/check")
def check():
    body = request.get_json()
    grower = body.get("grower", body)
    return jsonify({"errors": check_grower(grower, DATA)})


@app.post("/api/plan")
def plan():
    body = request.get_json()
    grower = body.get("grower", body)
    keep = body.get("keep_planned_crop_for", [])
    errors = check_grower(grower, DATA)
    if errors:
        return jsonify({"errors": errors}), 400
    try:
        result = build_plan(grower, DATA, keep)
        return jsonify(result)
    except Exception:
        traceback.print_exc()
        return jsonify({"error": "Internal server error"}), 500


@app.post("/api/chat")
def chat_route():
    body = request.get_json()
    messages = body.get("messages") or []
    grower = body.get("grower")
    if not grower:
        return jsonify({"error": "grower is required"}), 400
    if not messages or messages[-1].get("role") != "user":
        return jsonify({"error": "messages must end with the grower's message"}), 400
    try:
        result = chat(messages, grower, DATA, NOTES)
        return jsonify(result)
    except Exception:
        traceback.print_exc()
        return jsonify({"error": "Internal server error"}), 500


@app.post("/api/intake")
def intake():
    try:
        from ai.intake import extract_grower
        text = None
        file_data = None
        file_type = None

        if request.content_type and "multipart" in request.content_type:
            text = request.form.get("text")
            f = request.files.get("file")
            if f:
                file_data = f.read()
                file_type = f.content_type
        else:
            body = request.get_json()
            text = body.get("text") if body else None

        if not text and not file_data:
            return jsonify({"error": "Provide either text or a file"}), 400

        draft = extract_grower(text, file_data, file_type, DATA)
        errors = check_grower(draft, DATA)
        return jsonify({"draft": draft, "errors": errors})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception:
        traceback.print_exc()
        return jsonify({"error": "Internal server error"}), 500


@app.post("/api/explain-line")
def explain_line():
    """Use Gemini to explain why a plan line was generated, in bullet points."""
    body = request.get_json()
    line = body.get("line")
    plot_context = body.get("plot_context", {})
    if not line:
        return jsonify({"error": "line is required"}), 400

    try:
        from google import genai

        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            return jsonify({"error": "GEMINI_API_KEY not set"}), 500

        client = genai.Client(api_key=api_key)

        # Gather context from the data
        rule_id = line.get("rule_id", "")
        source_id = line.get("source_id", "")
        inputs_used = line.get("inputs_used", {})

        # Look up the source info
        source_info = DATA["sources"].get(source_id, {})
        source_title = source_info.get("title", source_id)
        source_url = source_info.get("url", "")

        # Find relevant notes from source_notes
        relevant_notes = []
        for note in NOTES:
            if note.get("source") == source_id or rule_id.split("-")[0].lower() in [t.lower() for t in note.get("topics", [])]:
                relevant_notes.append(note.get("note", ""))
                if len(relevant_notes) >= 3:
                    break

        prompt = f"""You are an agricultural advisor explaining a recommendation from a soil-smart planning engine.

Explain why this recommendation was made in 2-4 bullet points. Be concise, practical, and grower-friendly. Reference the science or source material briefly.

Recommendation: {line.get("text", "")}
Category: {line.get("category", "")}
Rule: {rule_id}
Source: {source_title}
{f'Source URL: {source_url}' if source_url else ''}

Inputs that triggered this rule:
{json.dumps(inputs_used, indent=2)}

Plot context:
{json.dumps(plot_context, indent=2)}

{f"Background notes from the source material:" if relevant_notes else ""}
{chr(10).join(f"- {n}" for n in relevant_notes)}

Reply with ONLY the bullet points, no intro or outro. Use • for bullets."""

        resp = client.models.generate_content(
            model="gemini-3-flash-preview",
            contents=prompt,
        )
        explanation = resp.text
        return jsonify({"explanation": explanation})

    except Exception:
        traceback.print_exc()
        return jsonify({"error": "Could not generate explanation"}), 500


@app.route("/api/data-status")
def data_status():
    rows = []
    files = {
        "sources.yaml": list(DATA["sources"].values()),
        "crops.yaml": list(DATA["crops"].values()),
        "problems.yaml": list(DATA["problems"].values()),
        "rotation_rules.yaml": list(DATA["rules"].values()),
        "lime_table.yaml": DATA["lime"],
        "soil_test_levels.yaml": list(DATA["levels"].values()),
        "nutrient_recs.yaml": list(DATA["recs"].values()),
        "credits.yaml": list(DATA["credits"].values()),
        "products.yaml": list(DATA["products"].values()),
        "practices.yaml": DATA["practices"],
    }
    counts = {}
    for filename, items in files.items():
        total = len(items)
        verified = sum(1 for item in items if item.get("verified", False))
        counts[filename] = {"verified": verified, "total": total}
        for item in items:
            rows.append({
                "file": filename,
                "id": item.get("id"),
                "verified": item.get("verified", False),
                "source": item.get("source"),
            })

    return jsonify({"rows": rows, "counts": counts, "warnings": []})
