"""Flask app — /api routes only."""

import base64
import json
import os
import traceback
import uuid
from datetime import datetime, timezone
from pathlib import Path

# Load backend/.env (gitignored) before the ai modules read their settings. Variables already set in the
# shell win, so a key exported in the terminal overrides the file.
_env_file = Path(__file__).parent / ".env"
if _env_file.exists():
    for _line in _env_file.read_text(encoding="utf-8").splitlines():
        _key, _sep, _value = _line.partition("=")
        if _sep and not _key.strip().startswith("#"):
            os.environ.setdefault(_key.strip(), _value.strip().strip('"').strip("'"))

from flask import Flask, jsonify, request, send_file
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash

from models import (db, User, Farm, PlotModel, SoilReport, PlanRecord,
                    Conversation, Message, Event, PestReport, Notification,
                    ImplementedItem, ItemChange, MessageAttachment, farm_to_grower, save_grower_to_farm)
from events import log_event, UI_EVENT_TYPES
from engine.soil_engine import load_data, build_plan, check_grower
from ai.ai_tools import load_notes, ToolBox, TOOLS
from ai.chat import chat, chat_client, chat_provider, SYSTEM_PROMPT, IMPLEMENTED_SYSTEM_EXTRA, PHOTO_SYSTEM_EXTRA
from ai.gemini import GEMINI_MODEL, gemini_client, gemini_key
from geo import load_centroids, miles_between, neighbors_within

app = Flask(__name__, instance_relative_config=True)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret-change-me")
# DATABASE_URL lets tests (tests/conftest.py) use an in-memory database. It must be set before this module
# is imported: Flask-SQLAlchemy creates the engine in init_app below, so changing the config later has no effect.
app.config["SQLALCHEMY_DATABASE_URI"] = (os.environ.get("DATABASE_URL")
                                         or "sqlite:///" + os.path.join(app.instance_path, "plantly.db"))
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
if os.environ.get("FLASK_ENV") == "production":
    app.config["SESSION_COOKIE_SECURE"] = True

os.makedirs(app.instance_path, exist_ok=True)
# Whole-request cap (photos are capped at 8 MB in plan_chat; this leaves room for the form fields).
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024
app.config["UPLOAD_DIR"] = os.path.join(app.instance_path, "uploads")

db.init_app(app)

login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = None  # API returns 401, not redirect


@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))


@login_manager.unauthorized_handler
def unauthorized():
    return jsonify({"error": "Login required"}), 401


@app.errorhandler(413)
def too_large(_err):
    return jsonify({"error": "Photo is too large (max 8 MB)."}), 413


# ------------------------------------------------------------------ data
DATA_DIR = os.environ.get("SOIL_DATA_DIR", str(Path(__file__).parent / "data"))
DATA = load_data(DATA_DIR)
NOTES = load_notes(DATA_DIR)
CENTROIDS = load_centroids(DATA_DIR)
FIXTURES_DIR = Path(__file__).parent / "fixtures"

PEST_ALERT_RADIUS_MILES = 10
PEST_REPORTS_PER_DAY = 10
PEST_DEDUP_DAYS = 7

with app.app_context():
    db.create_all()


# ================================================================== AUTH

@app.post("/api/auth/register")
def register():
    body = request.get_json()
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    name = (body.get("name") or "").strip()
    zip_code = (body.get("zip_code") or "").strip()
    if not email or "@" not in email:
        return jsonify({"error": "Valid email is required"}), 400
    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400
    if not name:
        return jsonify({"error": "Name is required"}), 400
    if zip_code and (len(zip_code) != 5 or not zip_code.isdigit()):
        return jsonify({"error": "ZIP code must be exactly 5 digits"}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email already registered"}), 400
    user = User(email=email, password_hash=generate_password_hash(password),
                name=name, zip_code=zip_code or None)
    db.session.add(user)
    db.session.flush()
    farm = Farm(user_id=user.id, name=f"{name}'s Farm")
    db.session.add(farm)
    db.session.commit()
    login_user(user)
    log_event("user_registered", {"email": email})
    return jsonify({"id": user.id, "email": user.email, "name": user.name,
                    "zip_code": user.zip_code}), 201


@app.post("/api/auth/login")
def login():
    body = request.get_json()
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    user = User.query.filter_by(email=email).first()
    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({"error": "Invalid email or password"}), 401
    login_user(user)
    log_event("user_logged_in", {})
    return jsonify({"id": user.id, "email": user.email, "name": user.name,
                    "zip_code": user.zip_code})


@app.post("/api/auth/logout")
def logout():
    logout_user()
    return jsonify({"ok": True})


@app.get("/api/auth/me")
def me():
    if current_user.is_authenticated:
        return jsonify({"id": current_user.id, "email": current_user.email,
                        "name": current_user.name, "zip_code": current_user.zip_code})
    return jsonify({"error": "Not logged in"}), 401


# ================================================================== FARM (load/save)

@app.get("/api/farm")
@login_required
def get_farm():
    farm = Farm.query.filter_by(user_id=current_user.id).first()
    if not farm:
        return jsonify({"grower": None})
    return jsonify({"grower": farm_to_grower(farm), "farm_id": farm.id})


@app.post("/api/farm")
@login_required
def save_farm():
    body = request.get_json()
    grower = body.get("grower")
    if not grower:
        return jsonify({"error": "grower is required"}), 400
    farm = Farm.query.filter_by(user_id=current_user.id).first()
    if not farm:
        farm = Farm(user_id=current_user.id)
        db.session.add(farm)
        db.session.flush()
    save_grower_to_farm(farm, grower)
    db.session.commit()
    return jsonify({"farm_id": farm.id, "grower": farm_to_grower(farm)})


# ================================================================== PUBLIC ROUTES

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
    return jsonify({"crops": crops, "problems": problems, "products": products,
                    "data_version": DATA["version"], "unverified_count": unverified})


@app.route("/api/demo-grower")
def demo_grower():
    path = FIXTURES_DIR / "demo_grower.json"
    with open(path) as f:
        data = json.load(f)
    return jsonify(data)


# ================================================================== ENGINE ROUTES

@app.post("/api/check")
@login_required
def check():
    body = request.get_json()
    grower = body.get("grower", body)
    return jsonify({"errors": check_grower(grower, DATA)})


@app.post("/api/plan/preview")
@login_required
def plan_preview():
    """Run the engine without saving — for what-if / cost report previews."""
    body = request.get_json()
    grower = body.get("grower", body)
    keep = body.get("keep_planned_crop_for", [])
    try:
        result = build_plan(grower, DATA, keep)
        return jsonify(result)
    except ValueError as e:
        # check_grower inside build_plan may reject the modified grower.
        # Return the validation errors so the frontend can display them.
        return jsonify({"error": str(e)}), 400
    except Exception:
        traceback.print_exc()
        return jsonify({"error": "Internal server error"}), 500


@app.post("/api/plan")
@login_required
def plan():
    body = request.get_json()
    grower = body.get("grower", body)
    keep = body.get("keep_planned_crop_for", [])
    errors = check_grower(grower, DATA)
    if errors:
        return jsonify({"errors": errors}), 400
    try:
        result = build_plan(grower, DATA, keep)
        # Save snapshot
        farm = Farm.query.filter_by(user_id=current_user.id).first()
        crops_in_plan = list({p["crop_suggested"] for p in result["plots"]})
        title = f"Plan — {', '.join(crops_in_plan[:3])}"
        if len(crops_in_plan) > 3:
            title += f" +{len(crops_in_plan) - 3}"
        record = PlanRecord(
            user_id=current_user.id,
            farm_id=farm.id if farm else None,
            title=title,
            grower_json=grower,
            plan_json=result,
            data_version=DATA["version"],
            keep_planned_crop_for=keep,
        )
        db.session.add(record)
        db.session.commit()
        log_event("plan_generated", {
            "plan_id": record.id,
            "season": grower.get("season"),
            "totals": result["totals"],
            "crops": crops_in_plan,
        }, plan_id=record.id)
        # Also save farm data
        if farm:
            save_grower_to_farm(farm, grower)
            db.session.commit()
        result["plan_record_id"] = record.id
        return jsonify(result)
    except Exception:
        traceback.print_exc()
        return jsonify({"error": "Internal server error"}), 500


@app.post("/api/chat")
@login_required
def chat_route():
    body = request.get_json()
    messages = body.get("messages") or []
    grower = body.get("grower")
    if not grower:
        return jsonify({"error": "grower is required"}), 400
    if not messages or messages[-1].get("role") != "user":
        return jsonify({"error": "messages must end with the grower's message"}), 400
    try:
        log_event("chat_question", {"question": messages[-1]["content"]})
        impl_items = [_serialize_item(i) for i in
                      ImplementedItem.query.filter_by(user_id=current_user.id).all()]
        result = chat(messages, grower, DATA, NOTES, implemented_items=impl_items)
        return jsonify(result)
    except Exception:
        traceback.print_exc()
        return jsonify({"error": "Internal server error"}), 500


@app.post("/api/intake")
@login_required
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
                # Save uploaded file
                upload_dir = Path(app.instance_path) / "uploads" / str(current_user.id)
                upload_dir.mkdir(parents=True, exist_ok=True)
                ext = Path(f.filename or "file").suffix
                saved_name = f"{uuid.uuid4().hex}{ext}"
                saved_path = upload_dir / saved_name
                saved_path.write_bytes(file_data)
                log_event("report_uploaded", {"filename": f.filename, "size": len(file_data)})
        else:
            body = request.get_json()
            text = body.get("text") if body else None

        if not text and not file_data:
            return jsonify({"error": "Provide either text or a file"}), 400

        draft = extract_grower(text, file_data, file_type, DATA)
        draft.setdefault("name", None)
        draft.setdefault("season", "spring")
        draft.setdefault("crops_needed", [])
        draft.setdefault("compost_available_cu_yd", 0)
        draft.setdefault("compost_price_usd_per_cu_yd", 0)
        draft.setdefault("price_overrides", {})
        for plot in draft.get("plots", []):
            plot["area_sqft"] = plot.get("area_sqft") or 5000
            plot["soil_texture"] = plot.get("soil_texture") or "loam"
            st = plot.setdefault("soil_test", {})
            st["ph"] = st.get("ph") or 6.5
            st["p_ppm"] = st.get("p_ppm") or 30
            st["k_ppm"] = st.get("k_ppm") or 100
            st.setdefault("organic_matter_pct", 3.0)
            plot.setdefault("crop_two_years_ago", None)
            plot["crop_last_year"] = plot.get("crop_last_year") or ""
            plot["crop_planned"] = plot.get("crop_planned") or ""
            plot.setdefault("problems", [])
            plot.setdefault("baseline", {"inputs": [], "pesticide_applications": 0})
        try:
            errors = check_grower(draft, DATA)
        except Exception:
            errors = ["Extracted data has issues — please review and fix below."]
        log_event("extraction_finished", {"plot_count": len(draft.get("plots", []))})
        return jsonify({"draft": draft, "errors": errors})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception:
        traceback.print_exc()
        return jsonify({"error": "Internal server error"}), 500


@app.post("/api/recommend")
@login_required
def recommend():
    body = request.get_json()
    grower = body.get("grower")
    plan_result = body.get("plan")
    if not grower or not plan_result:
        return jsonify({"error": "grower and plan are required"}), 400
    try:
        if not gemini_key():
            return jsonify({"error": "GEMINI_API_KEY not set"}), 500
        client = gemini_client()
        crop_info = {c["id"]: {"name": c["name"], "family": c["family"], "n_demand": c.get("n_demand", "medium")}
                     for c in DATA["crops"].values()}
        problem_info = {p["id"]: p["name"] for p in DATA["problems"].values()}
        plots_summary = []
        plot_id_map = {}  # name -> id, for fixing Gemini's response
        for pp in plan_result.get("plots", []):
            plot_grower = next((p for p in grower["plots"] if p["id"] == pp["plot_id"]), {})
            pid = pp["plot_id"]
            pname = pp.get("plot_name", pid)
            plot_id_map[pname] = pid
            plot_id_map[pid] = pid  # identity mapping too
            plots_summary.append({
                "plot_id": pid,
                "plot_name": pname,
                "area_sqft": pp.get("area_sqft"),
                "soil_texture": plot_grower.get("soil_texture"),
                "soil_test": plot_grower.get("soil_test", {}),
                "crop_last_year": plot_grower.get("crop_last_year"),
                "crop_two_years_ago": plot_grower.get("crop_two_years_ago"),
                "crop_planned": pp.get("crop_planned"),
                "crop_suggested_by_engine": pp.get("crop_suggested"),
                "problems": plot_grower.get("problems", []),
                "p_level": pp.get("p_level"),
                "k_level": pp.get("k_level"),
                "plan_cost": pp.get("plan_cost_usd"),
            })
        prompt = f"""You are a friendly garden advisor talking to a home gardener. Suggest the 3 best crops for each plot.

## RULES for reasons:
- Write like you're chatting with a neighbor. No jargon, no science words.
- Each reason = 1 short simple sentence a beginner would understand.
- Focus on practical benefits: "saves money", "helps your soil recover", "less pest trouble"
- Give exactly 2 reasons per crop. Keep them short.

## Available crops:
{json.dumps(crop_info, indent=2)}

## Known problems:
{json.dumps(problem_info, indent=2)}

## Plots:
{json.dumps(plots_summary, indent=2)}

Think about:
- Don't grow the same thing in the same spot year after year
- Match crops to the soil (acidic soil? low nutrients?)
- Pick crops that avoid last year's pest problems
- Suggest things that save money or are easy to grow

Return ONLY valid JSON, no markdown, in this exact format:
{{
  "plots": [
    {{
      "plot_id": "A",
      "plot_name": "Plot A",
      "recommendations": [
        {{
          "crop_id": "crop_id_here",
          "crop_name": "Crop Name",
          "reasons": ["simple reason 1", "simple reason 2"]
        }},
        ...3 total
      ]
    }}
  ]
}}"""
        resp = client.models.generate_content(model=GEMINI_MODEL, contents=prompt)
        response_text = resp.text
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0]
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0]
        recommendations = json.loads(response_text.strip())
        # Fix plot_id: Gemini often returns the plot name instead of the real ID
        for plot in recommendations.get("plots", []):
            raw_id = plot.get("plot_id", "")
            plot["plot_id"] = plot_id_map.get(raw_id, plot_id_map.get(plot.get("plot_name", ""), raw_id))
        return jsonify(recommendations)
    except Exception:
        traceback.print_exc()
        return jsonify({"error": "Could not generate recommendations"}), 500


@app.post("/api/intake-chat")
@login_required
def intake_chat_route():
    try:
        from ai.intake import intake_chat
        body = request.get_json()
        messages = body.get("messages") or []
        if not messages or messages[-1].get("role") != "user":
            return jsonify({"error": "messages must end with a user message"}), 400
        result = intake_chat(messages, DATA)
        resp = {"reply": result["reply"]}
        if result.get("grower"):
            resp["grower"] = result["grower"]
            resp["errors"] = check_grower(result["grower"], DATA)
        return jsonify(resp)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception:
        traceback.print_exc()
        return jsonify({"error": "Internal server error"}), 500


@app.post("/api/explain-line")
@login_required
def explain_line():
    body = request.get_json()
    line = body.get("line")
    plot_context = body.get("plot_context", {})
    if not line:
        return jsonify({"error": "line is required"}), 400
    try:
        if not gemini_key():
            return jsonify({"error": "GEMINI_API_KEY not set"}), 500
        client = gemini_client()
        rule_id = line.get("rule_id", "")
        source_id = line.get("source_id", "")
        source_info = DATA["sources"].get(source_id, {})
        source_title = source_info.get("title", source_id)
        relevant_notes = []
        for note in NOTES:
            if note.get("source") == source_id or rule_id.split("-")[0].lower() in [t.lower() for t in note.get("topics", [])]:
                relevant_notes.append(note.get("note", ""))
                if len(relevant_notes) >= 3:
                    break
        prompt = f"""You are explaining a garden recommendation to someone who is NOT a scientist. They just want to understand why.

## RULES:
- Use plain everyday English. No Latin names, no scientific terms, no jargon.
- Write like you're talking to a neighbor over the fence.
- 2-3 short bullet points max. Each bullet = 1 simple sentence.
- Say what the PROBLEM is and how this FIXES it.
- Do NOT mention rule IDs, source IDs, or citations.

## The recommendation:
"{line.get("text", "")}"

## What triggered it:
{json.dumps(line.get("inputs_used", {}), indent=2)}

## Plot info:
{json.dumps(plot_context, indent=2)}

## Background (use to inform your answer, but don't quote directly):
{chr(10).join(f"- {n}" for n in relevant_notes) if relevant_notes else "None"}

Reply with ONLY the bullet points. Use • for bullets. Keep it simple."""
        resp = client.models.generate_content(model=GEMINI_MODEL, contents=prompt)
        return jsonify({"explanation": resp.text})
    except Exception:
        traceback.print_exc()
        return jsonify({"error": "Could not generate explanation"}), 500


@app.route("/api/data-status")
@login_required
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
            rows.append({"file": filename, "id": item.get("id"),
                         "verified": item.get("verified", False), "source": item.get("source")})
    return jsonify({"rows": rows, "counts": counts, "warnings": []})


# ================================================================== PLANS & HISTORY

@app.get("/api/plans")
@login_required
def list_plans():
    plans = PlanRecord.query.filter_by(user_id=current_user.id)\
        .order_by(PlanRecord.created_at.desc()).all()
    return jsonify([{
        "id": p.id,
        "title": p.title,
        "season": p.plan_json.get("season") or p.grower_json.get("season"),
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "data_version": p.data_version,
        "crops": list({pp["crop_suggested"] for pp in p.plan_json.get("plots", [])}),
        "plot_crops": {pp["plot_id"]: pp["crop_suggested"] for pp in p.plan_json.get("plots", [])},
        "totals": p.plan_json.get("totals"),
    } for p in plans])


@app.get("/api/plans/<int:plan_id>")
@login_required
def get_plan(plan_id):
    p = PlanRecord.query.filter_by(id=plan_id, user_id=current_user.id).first()
    if not p:
        return jsonify({"error": "Not found"}), 404
    convos = Conversation.query.filter_by(plan_id=p.id, user_id=current_user.id)\
        .order_by(Conversation.created_at.desc()).all()
    stale = p.data_version != DATA["version"]
    return jsonify({
        "id": p.id,
        "title": p.title,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "grower_json": p.grower_json,
        "plan_json": p.plan_json,
        "data_version": p.data_version,
        "stale": stale,
        "conversations": [{
            "id": c.id,
            "title": c.title,
            "context": c.context or "plan",
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "messages": [{"role": m.role, "content": m.content,
                          "tools_used": m.tools_used, "unsupported_numbers": m.unsupported_numbers}
                         for m in c.messages],
        } for c in convos],
    })


# ------------------------------------------------------------------ chat photos
MAX_PHOTO_BYTES = 8 * 1024 * 1024
PHOTO_EXT = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic"}
PHOTOS_REPLAYED = 3  # only the most recent photos are re-sent to the model, to keep each turn affordable
PHOTO_ONLY_TEXT = "Please look at this photo of my crop."


def _sniff_image(data: bytes) -> str | None:
    """The real image type from the file's first bytes (the client's content-type is not trusted)."""
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[4:12] in (b"ftypheic", b"ftypheix", b"ftypmif1", b"ftypheif"):
        return "image/heic"
    return None


def _image_block(data: bytes, mime: str) -> dict:
    """Claude-style image block; Claude takes it as is and ai/gemini.py converts it for Gemini."""
    return {"type": "image", "source": {"type": "base64", "media_type": mime,
                                        "data": base64.b64encode(data).decode("ascii")}}


def _chat_history(messages: list) -> list:
    """DB messages -> chat-loop messages. Photo turns become [image, text] blocks for the most recent
    PHOTOS_REPLAYED photos; older photos are replaced by a short note so long chats stay affordable."""
    atts = {a.message_id: a for a in MessageAttachment.query.filter(
        MessageAttachment.message_id.in_([m.id for m in messages])).all()} if messages else {}
    replay = {m.id for m in messages if m.id in atts}
    replay = set(sorted(replay)[-PHOTOS_REPLAYED:])
    out = []
    for m in messages:
        att = atts.get(m.id)
        if not att:
            out.append({"role": m.role, "content": m.content})
            continue
        path = Path(app.config["UPLOAD_DIR"]) / att.path
        if m.id in replay and path.exists():
            out.append({"role": m.role, "content": [_image_block(path.read_bytes(), att.mime_type),
                                                    {"type": "text", "text": m.content}]})
        else:
            out.append({"role": m.role, "content": f"[Photo shared earlier] {m.content}"})
    return out


@app.post("/api/plans/<int:plan_id>/chat")
@login_required
def plan_chat(plan_id):
    p = PlanRecord.query.filter_by(id=plan_id, user_id=current_user.id).first()
    if not p:
        return jsonify({"error": "Not found"}), 404

    # JSON for text-only messages; multipart/form-data when a photo is attached.
    photo, photo_mime = None, None
    if request.content_type and "multipart" in request.content_type:
        body = request.form
        f = request.files.get("image")
        if f:
            photo = f.read(MAX_PHOTO_BYTES + 1)
            if len(photo) > MAX_PHOTO_BYTES:
                return jsonify({"error": "Photo is too large (max 8 MB)."}), 413
            photo_mime = _sniff_image(photo)
            if not photo_mime:
                return jsonify({"error": "Please upload a JPEG, PNG, WEBP or HEIC photo."}), 400
            if photo_mime == "image/heic" and chat_provider() == "anthropic":
                return jsonify({"error": "HEIC photos aren't supported with the current AI provider. "
                                         "Please send a JPEG or PNG."}), 400
    else:
        body = request.get_json(silent=True) or {}
    message_text = (body.get("message") or "").strip()
    conversation_id = body.get("conversation_id") or None
    if not message_text and not photo:
        return jsonify({"error": "message is required"}), 400
    if not message_text:
        message_text = PHOTO_ONLY_TEXT

    # Get or create conversation
    context = body.get("context") or "plan"
    if conversation_id:
        convo = Conversation.query.filter_by(id=conversation_id, plan_id=plan_id,
                                             user_id=current_user.id).first()
        if not convo:
            return jsonify({"error": "Not found"}), 404
    else:
        title = "Photo question" if photo and message_text == PHOTO_ONLY_TEXT else message_text[:60]
        convo = Conversation(user_id=current_user.id, plan_id=plan_id, title=title, context=context)
        db.session.add(convo)
        db.session.flush()
        if context == "implemented":
            log_event("impl_chat_opened", {"plan_id": plan_id}, plan_id=plan_id)

    # Rebuild message history from DB (earlier photos included), then add this turn
    existing = Message.query.filter_by(conversation_id=convo.id)\
        .order_by(Message.created_at).all()
    chat_messages = _chat_history(existing)
    has_photo = bool(photo) or any(isinstance(m["content"], list) or
                                   str(m["content"]).startswith("[Photo shared earlier]")
                                   for m in chat_messages)
    if photo:
        chat_messages.append({"role": "user", "content": [_image_block(photo, photo_mime),
                                                          {"type": "text", "text": message_text}]})
    else:
        chat_messages.append({"role": "user", "content": message_text})

    # Save user message
    user_msg = Message(conversation_id=convo.id, role="user", content=message_text)
    db.session.add(user_msg)

    # Use the saved snapshot, not current farm data
    grower = p.grower_json
    stale = p.data_version != DATA["version"]

    # Use conversation's saved context for existing conversations
    if conversation_id and convo.context:
        context = convo.context

    try:
        # Build system prompt addition for stale data
        extra_system = ""
        if stale:
            extra_system = ("\n\nIMPORTANT: This plan was generated with data version "
                          f"{p.data_version}, but the current data version is {DATA['version']}. "
                          "Some numbers may have changed. Mention this if the farmer asks about "
                          "specific rates or costs.")
        if context == "implemented":
            extra_system += IMPLEMENTED_SYSTEM_EXTRA
        if has_photo:
            extra_system += PHOTO_SYSTEM_EXTRA

        # Override the chat tools to use saved plan_json
        impl_items = [_serialize_item(i) for i in
                      ImplementedItem.query.filter_by(user_id=current_user.id,
                                                      plan_id=plan_id).all()]
        result = _chat_on_saved_plan(chat_messages, grower, p.plan_json, extra_system,
                                     implemented_items=impl_items)

        # Save assistant message
        asst_msg = Message(
            conversation_id=convo.id, role="assistant", content=result["reply"],
            tools_used=result.get("tools_used", []),
            unsupported_numbers=result.get("unsupported_numbers", []),
        )
        db.session.add(asst_msg)

        # Store the photo only once the reply succeeded, so a failed turn leaves no orphan file.
        attachment = None
        if photo:
            db.session.flush()  # assigns user_msg.id
            rel = Path(str(current_user.id)) / "chat" / f"{uuid.uuid4().hex}{PHOTO_EXT[photo_mime]}"
            dest = Path(app.config["UPLOAD_DIR"]) / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(photo)
            attachment = MessageAttachment(message_id=user_msg.id, user_id=current_user.id,
                                           path=rel.as_posix(), mime_type=photo_mime, size=len(photo))
            db.session.add(attachment)
        db.session.commit()

        log_event("chat_question", {"question": message_text, "plan_id": plan_id}, plan_id=plan_id)
        if photo:
            log_event("chat_photo", {"plan_id": plan_id, "size": len(photo), "mime": photo_mime},
                      plan_id=plan_id)

        return jsonify({
            "conversation_id": convo.id,
            "reply": result["reply"],
            "tools_used": result.get("tools_used", []),
            "unsupported_numbers": result.get("unsupported_numbers", []),
            "stale": stale,
            "attachment_id": attachment.id if attachment else None,
        })
    except Exception:
        traceback.print_exc()
        db.session.rollback()
        return jsonify({"error": "Internal server error"}), 500


@app.get("/api/attachments/<int:attachment_id>")
@login_required
def get_attachment(attachment_id):
    """A chat photo, only for the user who sent it (anyone else gets the same 404 as a missing id)."""
    att = MessageAttachment.query.filter_by(id=attachment_id, user_id=current_user.id).first()
    path = Path(app.config["UPLOAD_DIR"]) / att.path if att else None
    if not att or not path.exists():
        return jsonify({"error": "Not found"}), 404
    return send_file(path, mimetype=att.mime_type, max_age=3600)


def _chat_on_saved_plan(messages, grower, saved_plan_json, extra_system="",
                        implemented_items=None):
    """Chat using a saved plan snapshot — get_plan returns the saved plan, not a live rebuild."""
    from ai.chat import MODEL, MAX_TOOL_ROUNDS, _block, final_round, unsupported_numbers

    client = chat_client()
    box = ToolBox(grower, DATA, NOTES, implemented_items=implemented_items)
    # Override _current_plan to return saved snapshot
    box._plan = saved_plan_json

    convo, trace = list(messages), []
    system = SYSTEM_PROMPT + extra_system

    for round_no in range(MAX_TOOL_ROUNDS + 1):
        response = client.messages.create(model=MODEL, max_tokens=1500, system=system,
                                          tools=TOOLS, messages=convo, **final_round(round_no))
        blocks = [_block(b) for b in response.content]
        convo.append({"role": "assistant", "content": blocks})
        if response.stop_reason != "tool_use":
            reply = "".join(b["text"] for b in blocks if b["type"] == "text").strip()
            return {"reply": reply,
                    "tools_used": [{"tool": t["tool"], "input": t["input"], "is_error": t["is_error"]} for t in trace],
                    "unsupported_numbers": unsupported_numbers(reply, trace, messages, implemented_items)}
        results = []
        for b in blocks:
            if b["type"] == "tool_use":
                output, is_error = box.run(b["name"], b["input"])
                trace.append({"tool": b["name"], "input": b["input"], "output": output, "is_error": is_error})
                results.append({"type": "tool_result", "tool_use_id": b["id"], "content": output,
                                "is_error": is_error})
        convo.append({"role": "user", "content": results})

    return {"reply": "Sorry, I couldn't finish looking that up.",
            "tools_used": [{"tool": t["tool"], "input": t["input"], "is_error": t["is_error"]} for t in trace],
            "unsupported_numbers": []}


@app.get("/api/history")
@login_required
def history():
    page = request.args.get("page", 1, type=int)
    per_page = 20
    offset = (page - 1) * per_page

    # Combine plans and events, newest first
    plans = PlanRecord.query.filter_by(user_id=current_user.id)\
        .order_by(PlanRecord.created_at.desc()).limit(per_page).offset(offset).all()
    events = Event.query.filter_by(user_id=current_user.id)\
        .order_by(Event.created_at.desc()).limit(per_page).offset(offset).all()

    items = []
    for p in plans:
        items.append({
            "kind": "plan",
            "id": p.id,
            "title": p.title,
            "timestamp": p.created_at.isoformat() if p.created_at else None,
            "data_version": p.data_version,
            "totals": p.plan_json.get("totals"),
        })
    for e in events:
        items.append({
            "kind": "event",
            "id": e.id,
            "type": e.type,
            "payload": e.payload,
            "plan_id": e.plan_id,
            "timestamp": e.created_at.isoformat() if e.created_at else None,
        })
    items.sort(key=lambda x: x["timestamp"] or "", reverse=True)
    return jsonify({"items": items[:per_page], "page": page})


# ================================================================== IMPLEMENTED ITEMS

def _line_is_actionable(line: dict) -> bool:
    """True if this plan line represents an action the farmer can choose to do."""
    cat = line.get("category", "")
    if cat in ("warning", "nutrient_warning"):
        return False
    if cat == "pest_prevention":
        return True
    if cat == "soil" and line.get("quantity") is not None:
        return True
    if cat == "feeding" and line.get("quantity") is not None:
        return True
    if cat == "rotation" and "Suggested instead:" in line.get("text", ""):
        return True
    return False


def _serialize_item(item: ImplementedItem) -> dict:
    return {
        "id": item.id,
        "plan_id": item.plan_id,
        "plot_id": item.plot_id,
        "plot_name": item.plot_name,
        "line_index": item.line_index,
        "category": item.category,
        "rule_id": item.rule_id,
        "source_id": item.source_id,
        "text": item.text,
        "quantity": item.quantity,
        "unit": item.unit,
        "cost_usd": item.cost_usd,
        "actual_quantity": item.actual_quantity,
        "actual_unit": item.actual_unit,
        "actual_date": item.actual_date,
        "actual_note": item.actual_note,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
    }


@app.post("/api/plans/<int:plan_id>/implemented")
@login_required
def add_implemented(plan_id):
    p = PlanRecord.query.filter_by(id=plan_id, user_id=current_user.id).first()
    if not p:
        return jsonify({"error": "Not found"}), 404

    body = request.get_json()
    plot_id = body.get("plot_id")
    line_index = body.get("line_index")
    if plot_id is None or line_index is None:
        return jsonify({"error": "plot_id and line_index are required"}), 400

    # Find the plot in the saved snapshot
    plot_data = next((pp for pp in p.plan_json.get("plots", []) if pp["plot_id"] == plot_id), None)
    if not plot_data:
        return jsonify({"error": "Plot not found in plan"}), 404

    lines = plot_data.get("lines", [])
    if not isinstance(line_index, int) or line_index < 0 or line_index >= len(lines):
        return jsonify({"error": "Invalid line_index"}), 400

    line = lines[line_index]
    if not _line_is_actionable(line):
        return jsonify({"error": "This line is not an actionable step"}), 400

    # Check for duplicate
    existing = ImplementedItem.query.filter_by(
        user_id=current_user.id, plan_id=plan_id,
        plot_id=plot_id, line_index=line_index
    ).first()
    if existing:
        return jsonify(_serialize_item(existing))

    item = ImplementedItem(
        user_id=current_user.id,
        plan_id=plan_id,
        plot_id=plot_id,
        plot_name=plot_data.get("plot_name", plot_id),
        line_index=line_index,
        category=line["category"],
        rule_id=line.get("rule_id", ""),
        source_id=line.get("source_id"),
        text=line["text"],
        quantity=line.get("quantity"),
        unit=line.get("unit"),
        cost_usd=line.get("cost_usd"),
    )
    db.session.add(item)
    db.session.commit()
    log_event("item_implemented", {"plan_id": plan_id, "plot_id": plot_id,
              "line_index": line_index, "rule_id": line.get("rule_id")}, plan_id=plan_id)
    return jsonify(_serialize_item(item)), 201


@app.delete("/api/implemented/<int:item_id>")
@login_required
def remove_implemented(item_id):
    item = ImplementedItem.query.filter_by(id=item_id, user_id=current_user.id).first()
    if not item:
        return jsonify({"error": "Not found"}), 404
    plan_id = item.plan_id
    log_event("item_removed", {"plan_id": plan_id, "plot_id": item.plot_id,
              "line_index": item.line_index, "rule_id": item.rule_id}, plan_id=plan_id)
    db.session.delete(item)
    db.session.commit()
    return jsonify({"ok": True})


@app.get("/api/plans/<int:plan_id>/implemented")
@login_required
def get_plan_implemented(plan_id):
    p = PlanRecord.query.filter_by(id=plan_id, user_id=current_user.id).first()
    if not p:
        return jsonify({"error": "Not found"}), 404
    items = ImplementedItem.query.filter_by(
        user_id=current_user.id, plan_id=plan_id
    ).order_by(ImplementedItem.created_at).all()
    return jsonify({"items": [_serialize_item(i) for i in items]})


@app.get("/api/implemented")
@login_required
def get_all_implemented():
    items = ImplementedItem.query.filter_by(user_id=current_user.id)\
        .order_by(ImplementedItem.created_at.desc()).all()
    total_cost = sum(i.cost_usd or 0 for i in items)
    return jsonify({
        "items": [_serialize_item(i) for i in items],
        "count": len(items),
        "total_cost_usd": round(total_cost, 2),
    })


@app.post("/api/implemented/<int:item_id>/actual")
@login_required
def update_implemented_actual(item_id):
    """Record what the farmer actually did for an implemented item."""
    item = ImplementedItem.query.filter_by(id=item_id, user_id=current_user.id).first()
    if not item:
        return jsonify({"error": "Not found"}), 404

    body = request.get_json()
    changes_logged = []
    source = body.get("source", "manual")
    if source not in ("chat", "manual"):
        source = "manual"

    for field in ("actual_quantity", "actual_unit", "actual_date", "actual_note"):
        if field in body:
            new_val = body[field]
            if field == "actual_note" and new_val and len(str(new_val)) > 300:
                return jsonify({"error": "actual_note must be 300 characters or fewer"}), 400
            old_val = getattr(item, field)
            old_str = str(old_val) if old_val is not None else None
            new_str = str(new_val) if new_val is not None else None
            if old_str != new_str:
                change = ItemChange(
                    item_id=item.id,
                    field=field,
                    old_value=old_str,
                    new_value=new_str,
                    source=source,
                )
                db.session.add(change)
                changes_logged.append(field)
            setattr(item, field, new_val)

    db.session.commit()
    log_event("update_saved", {
        "item_id": item_id, "plan_id": item.plan_id,
        "plot_id": item.plot_id, "fields": changes_logged,
    }, plan_id=item.plan_id)
    return jsonify(_serialize_item(item))


# ================================================================== PROFILE

@app.patch("/api/auth/profile")
@login_required
def update_profile():
    body = request.get_json()
    zip_code = (body.get("zip_code") or "").strip()
    if zip_code and (len(zip_code) != 5 or not zip_code.isdigit()):
        return jsonify({"error": "ZIP code must be exactly 5 digits"}), 400
    current_user.zip_code = zip_code or None
    db.session.commit()
    return jsonify({"id": current_user.id, "email": current_user.email,
                    "name": current_user.name, "zip_code": current_user.zip_code})


# ================================================================== PEST ALERTS

@app.post("/api/pest-reports")
@login_required
def create_pest_report():
    body = request.get_json()
    pest_id = (body.get("pest_id") or "").strip()
    crop_id = (body.get("crop_id") or "").strip() or None
    note = (body.get("note") or "").strip() or None

    if not pest_id:
        return jsonify({"error": "pest_id is required"}), 400
    if pest_id not in DATA["problems"]:
        return jsonify({"error": f"Unknown pest: {pest_id}"}), 400
    if crop_id and crop_id not in DATA["crops"]:
        return jsonify({"error": f"Unknown crop: {crop_id}"}), 400

    zip_code = current_user.zip_code
    if not zip_code:
        return jsonify({"error": "Set your ZIP code in your profile before reporting pests"}), 400

    # Rate limit: 10 per day
    from datetime import timedelta
    day_ago = datetime.now(timezone.utc) - timedelta(days=1)
    today_count = PestReport.query.filter(
        PestReport.user_id == current_user.id,
        PestReport.created_at >= day_ago
    ).count()
    if today_count >= PEST_REPORTS_PER_DAY:
        return jsonify({"error": "Rate limit: max 10 pest reports per day"}), 429

    # De-duplication: same user + pest + zip within 7 days → update existing
    dedup_cutoff = datetime.now(timezone.utc) - timedelta(days=PEST_DEDUP_DAYS)
    existing = PestReport.query.filter(
        PestReport.user_id == current_user.id,
        PestReport.pest_id == pest_id,
        PestReport.zip_code == zip_code,
        PestReport.created_at >= dedup_cutoff
    ).first()

    if existing:
        existing.crop_id = crop_id
        existing.note = note
        existing.updated_at = datetime.now(timezone.utc)
        db.session.commit()
        log_event("pest_reported", {"pest_id": pest_id, "deduplicated": True})
        return jsonify({"id": existing.id, "pest_id": pest_id, "updated": True})

    report = PestReport(user_id=current_user.id, pest_id=pest_id,
                        crop_id=crop_id, note=note, zip_code=zip_code)
    db.session.add(report)
    db.session.flush()

    # Notify nearby farmers
    pest_name = DATA["problems"][pest_id]["name"]
    nearby_zips = neighbors_within(zip_code, PEST_ALERT_RADIUS_MILES, CENTROIDS)
    nearby_zips.append(zip_code)  # include same ZIP
    nearby_users = User.query.filter(
        User.zip_code.in_(nearby_zips),
        User.id != current_user.id
    ).all()
    for u in nearby_users:
        notif = Notification(
            user_id=u.id,
            pest_report_id=report.id,
            title=f"{pest_name} spotted nearby",
            body=f"A farmer in your area reported {pest_name}. Check your plants!",
        )
        db.session.add(notif)

    db.session.commit()
    log_event("pest_reported", {"pest_id": pest_id, "notified": len(nearby_users)})
    return jsonify({"id": report.id, "pest_id": pest_id,
                    "notified_count": len(nearby_users)}), 201


@app.get("/api/notifications")
@login_required
def get_notifications():
    notifs = Notification.query.filter_by(user_id=current_user.id)\
        .order_by(Notification.created_at.desc()).limit(50).all()
    unread = sum(1 for n in notifs if not n.read)
    return jsonify({
        "notifications": [{
            "id": n.id,
            "title": n.title,
            "body": n.body,
            "read": n.read,
            "created_at": n.created_at.isoformat() if n.created_at else None,
        } for n in notifs],
        "unread_count": unread,
    })


@app.post("/api/notifications/<int:notif_id>/read")
@login_required
def mark_notification_read(notif_id):
    n = Notification.query.filter_by(id=notif_id, user_id=current_user.id).first()
    if not n:
        return jsonify({"error": "Not found"}), 404
    n.read = True
    db.session.commit()
    return jsonify({"ok": True})


@app.post("/api/notifications/read-all")
@login_required
def mark_all_notifications_read():
    Notification.query.filter_by(user_id=current_user.id, read=False)\
        .update({"read": True})
    db.session.commit()
    return jsonify({"ok": True})


# ================================================================== UI EVENTS

@app.post("/api/events")
@login_required
def post_events():
    body = request.get_json()
    event_type = body.get("type")
    if event_type not in UI_EVENT_TYPES:
        return jsonify({"error": f"Unknown event type: {event_type}"}), 400
    log_event(event_type, body.get("payload", {}), plan_id=body.get("plan_id"))
    return jsonify({"ok": True})


# ================================================================== SEED COMMAND

@app.cli.command("seed-demo")
def seed_demo():
    """Create demo@plantly.test / demo-pass-123 with farm, plots, plan, conversation."""
    with app.app_context():
        if User.query.filter_by(email="demo@plantly.test").first():
            print("Demo user already exists, skipping.")
            return

        user = User(
            email="demo@plantly.test",
            password_hash=generate_password_hash("demo-pass-123"),
            name="Demo Farmer",
            zip_code="30602",  # Athens, GA
        )
        db.session.add(user)
        db.session.flush()

        # Load demo grower
        grower_data = json.loads((FIXTURES_DIR / "demo_grower.json").read_text())

        # Create farm
        farm = Farm(user_id=user.id, name=grower_data["name"],
                    season=grower_data.get("season", "spring"),
                    crops_needed=grower_data["crops_needed"],
                    compost_available_cu_yd=grower_data["compost_available_cu_yd"],
                    compost_price_usd_per_cu_yd=grower_data["compost_price_usd_per_cu_yd"],
                    price_overrides=grower_data.get("price_overrides", {}))
        db.session.add(farm)
        db.session.flush()

        # Create plots
        for pg in grower_data["plots"]:
            p = PlotModel(
                farm_id=farm.id, plot_id=pg["id"], name=pg["name"],
                area_sqft=pg["area_sqft"], soil_texture=pg["soil_texture"],
                soil_test=pg["soil_test"],
                crop_two_years_ago=pg.get("crop_two_years_ago"),
                crop_last_year=pg["crop_last_year"],
                crop_planned=pg["crop_planned"],
                problems=pg.get("problems", []),
                baseline=pg.get("baseline", {"inputs": [], "pesticide_applications": 0}),
            )
            db.session.add(p)

        # Build and save a plan
        plan_result = build_plan(grower_data, DATA)
        crops_in_plan = list({p["crop_suggested"] for p in plan_result["plots"]})
        record = PlanRecord(
            user_id=user.id, farm_id=farm.id,
            title=f"Demo Plan — {', '.join(crops_in_plan[:3])}",
            grower_json=grower_data, plan_json=plan_result,
            data_version=DATA["version"], keep_planned_crop_for=[],
        )
        db.session.add(record)
        db.session.flush()

        # Create a short conversation
        convo = Conversation(user_id=user.id, plan_id=record.id,
                             title="Why does Main Bed need lime?")
        db.session.add(convo)
        db.session.flush()

        msgs = [
            ("user", "Why does Main Bed need lime?"),
            ("assistant", "Main Bed's soil pH is 5.4, which is too acidic for tomato (it likes 6.5). "
             "The plan adds lime to raise the pH gradually. "
             "Source: UGA Soil Test Crop Sheets."),
        ]
        for role, content in msgs:
            db.session.add(Message(conversation_id=convo.id, role=role, content=content))

        # Log an event
        db.session.add(Event(user_id=user.id, type="plan_generated",
                             payload={"crops": crops_in_plan}, plan_id=record.id))

        # Tick some implemented items for demo — soil and first feeding line
        first_feeding_ticked = False
        for pp in plan_result.get("plots", []):
            for i, line in enumerate(pp.get("lines", [])):
                should_tick = False
                if line.get("category") == "soil" and line.get("quantity") is not None:
                    should_tick = True
                elif line.get("category") == "feeding" and line.get("quantity") is not None and not first_feeding_ticked:
                    should_tick = True
                    first_feeding_ticked = True
                if should_tick:
                    item = ImplementedItem(
                        user_id=user.id, plan_id=record.id,
                        plot_id=pp["plot_id"], plot_name=pp.get("plot_name", pp["plot_id"]),
                        line_index=i, category=line["category"],
                        rule_id=line.get("rule_id", ""), source_id=line.get("source_id"),
                        text=line["text"], quantity=line.get("quantity"),
                        unit=line.get("unit"), cost_usd=line.get("cost_usd"),
                    )
                    db.session.add(item)

        # Neighbor users for pest alert demo
        neighbors = [
            ("alice@plantly.test", "Alice Green", "30601"),     # Athens, GA ~1mi
            ("bob@plantly.test", "Bob Fields", "30605"),        # Athens, GA ~3mi
            ("carol@plantly.test", "Carol Harvest", "30606"),   # Athens, GA ~5mi
            ("dave@plantly.test", "Dave Rows", "31601"),        # Albany, GA ~150mi (too far)
        ]
        neighbor_users = []
        for email, name, zc in neighbors:
            if not User.query.filter_by(email=email).first():
                nu = User(email=email, password_hash=generate_password_hash("demo-pass-123"),
                          name=name, zip_code=zc)
                db.session.add(nu)
                db.session.flush()
                Farm(user_id=nu.id, name=f"{name}'s Farm")
                db.session.add(Farm(user_id=nu.id, name=f"{name}'s Farm"))
                neighbor_users.append(nu)

        # Two pest reports from Alice (neighbor)
        alice = User.query.filter_by(email="alice@plantly.test").first()
        if alice:
            r1 = PestReport(user_id=alice.id, pest_id="tomato-hornworm",
                            crop_id="tomato", note="Found on my tomato plants",
                            zip_code=alice.zip_code)
            db.session.add(r1)
            db.session.flush()
            # Notify demo user
            n1 = Notification(user_id=user.id, pest_report_id=r1.id,
                              title="Tomato Hornworm spotted nearby",
                              body="A farmer in your area reported Tomato Hornworm. Check your plants!")
            db.session.add(n1)

            r2 = PestReport(user_id=alice.id, pest_id="squash-bugs",
                            crop_id="squash", zip_code=alice.zip_code)
            db.session.add(r2)
            db.session.flush()
            n2 = Notification(user_id=user.id, pest_report_id=r2.id,
                              title="Squash Bugs spotted nearby",
                              body="A farmer in your area reported Squash Bugs. Check your plants!")
            db.session.add(n2)

        db.session.flush()

        # Implemented chat with one recorded change
        impl_convo = Conversation(user_id=user.id, plan_id=record.id,
                                   title="I used more urea on Main Bed",
                                   context="implemented")
        db.session.add(impl_convo)
        db.session.flush()

        impl_msgs = [
            ("user", "I ended up using 12 lb of urea on Main Bed instead of what the plan said."),
            ("assistant", "I found your urea item for Main Bed. "
             "That's more than planned. I've proposed the update — please confirm "
             "in the card above."),
        ]
        for role, content in impl_msgs:
            db.session.add(Message(conversation_id=impl_convo.id, role=role, content=content))

        # Record the actual change on the feeding item
        feeding_item = ImplementedItem.query.filter_by(
            user_id=user.id, plan_id=record.id, plot_id="A", category="feeding"
        ).first()
        if feeding_item:
            feeding_item.actual_quantity = 12.0
            feeding_item.actual_unit = feeding_item.unit
            feeding_item.actual_note = "Used a bit extra because of heavy rain last week"
            change = ItemChange(
                item_id=feeding_item.id,
                field="actual_quantity",
                old_value=None,
                new_value="12.0",
                source="chat",
            )
            db.session.add(change)

        db.session.commit()
        print(f"Seeded: demo@plantly.test / demo-pass-123 (user_id={user.id}, plan_id={record.id})")
        print(f"  + {len(neighbor_users)} neighbor users, 2 pest reports, 2 notifications")
        print(f"  + implemented chat with 1 recorded change")
