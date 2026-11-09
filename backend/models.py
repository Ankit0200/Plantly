"""SQLAlchemy models — SQLite at backend/instance/plantly.db."""
from datetime import datetime, timezone

from flask_login import UserMixin
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


def _utcnow():
    return datetime.now(timezone.utc)


class User(UserMixin, db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    name = db.Column(db.String(255), nullable=False)
    zip_code = db.Column(db.String(5), nullable=True, index=True)
    created_at = db.Column(db.DateTime, default=_utcnow)


class Farm(db.Model):
    __tablename__ = "farms"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    name = db.Column(db.String(255), default="")
    season = db.Column(db.String(20), default="spring")
    crops_needed = db.Column(db.JSON, default=list)
    compost_available_cu_yd = db.Column(db.Float, default=0)
    compost_price_usd_per_cu_yd = db.Column(db.Float, default=0)
    price_overrides = db.Column(db.JSON, default=dict)
    updated_at = db.Column(db.DateTime, default=_utcnow, onupdate=_utcnow)

    plots = db.relationship("PlotModel", backref="farm", cascade="all, delete-orphan", lazy=True)


class PlotModel(db.Model):
    __tablename__ = "plots"
    id = db.Column(db.Integer, primary_key=True)
    farm_id = db.Column(db.Integer, db.ForeignKey("farms.id"), nullable=False, index=True)
    plot_id = db.Column(db.String(10), nullable=False)  # user-facing id like "A"
    name = db.Column(db.String(255), default="")
    area_sqft = db.Column(db.Float, default=1000)
    soil_texture = db.Column(db.String(50), default="loam")
    soil_test = db.Column(db.JSON, default=dict)
    crop_two_years_ago = db.Column(db.String(100), nullable=True)
    crop_last_year = db.Column(db.String(100), default="")
    crop_planned = db.Column(db.String(100), default="")
    problems = db.Column(db.JSON, default=list)
    baseline = db.Column(db.JSON, default=dict)
    updated_at = db.Column(db.DateTime, default=_utcnow, onupdate=_utcnow)


class SoilReport(db.Model):
    __tablename__ = "soil_reports"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    plot_id = db.Column(db.Integer, db.ForeignKey("plots.id"), nullable=True)
    file_path = db.Column(db.String(500), nullable=True)
    extracted_json = db.Column(db.JSON, nullable=True)
    confirmed_json = db.Column(db.JSON, nullable=True)
    method = db.Column(db.String(50), nullable=True)
    sample_date = db.Column(db.Date, nullable=True)
    created_at = db.Column(db.DateTime, default=_utcnow)


class PlanRecord(db.Model):
    __tablename__ = "plans"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    farm_id = db.Column(db.Integer, db.ForeignKey("farms.id"), nullable=True)
    title = db.Column(db.String(255), default="")
    grower_json = db.Column(db.JSON, nullable=False)
    plan_json = db.Column(db.JSON, nullable=False)
    data_version = db.Column(db.String(100), nullable=False)
    keep_planned_crop_for = db.Column(db.JSON, default=list)
    created_at = db.Column(db.DateTime, default=_utcnow)

    conversations = db.relationship("Conversation", backref="plan", lazy=True)


class Conversation(db.Model):
    __tablename__ = "conversations"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    plan_id = db.Column(db.Integer, db.ForeignKey("plans.id"), nullable=False, index=True)
    title = db.Column(db.String(255), default="")
    context = db.Column(db.String(50), default="plan")  # "plan" or "implemented"
    created_at = db.Column(db.DateTime, default=_utcnow)

    messages = db.relationship("Message", backref="conversation", lazy=True,
                               order_by="Message.created_at")


class Message(db.Model):
    __tablename__ = "messages"
    id = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(db.Integer, db.ForeignKey("conversations.id"), nullable=False, index=True)
    role = db.Column(db.String(20), nullable=False)
    content = db.Column(db.Text, nullable=False)
    tools_used = db.Column(db.JSON, default=list)
    unsupported_numbers = db.Column(db.JSON, default=list)
    created_at = db.Column(db.DateTime, default=_utcnow)


class Event(db.Model):
    __tablename__ = "events"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    type = db.Column(db.String(100), nullable=False)
    payload = db.Column(db.JSON, default=dict)
    plan_id = db.Column(db.Integer, db.ForeignKey("plans.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=_utcnow)


class PestReport(db.Model):
    __tablename__ = "pest_reports"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    pest_id = db.Column(db.String(100), nullable=False)
    crop_id = db.Column(db.String(100), nullable=True)
    note = db.Column(db.Text, nullable=True)
    zip_code = db.Column(db.String(5), nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=_utcnow)
    updated_at = db.Column(db.DateTime, default=_utcnow, onupdate=_utcnow)


class ImplementedItem(db.Model):
    __tablename__ = "implemented_items"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    plan_id = db.Column(db.Integer, db.ForeignKey("plans.id"), nullable=False, index=True)
    plot_id = db.Column(db.String(10), nullable=False)
    plot_name = db.Column(db.String(255), default="")
    line_index = db.Column(db.Integer, nullable=False)
    category = db.Column(db.String(50), nullable=False)
    rule_id = db.Column(db.String(100), nullable=False)
    source_id = db.Column(db.String(100), nullable=True)
    text = db.Column(db.Text, nullable=False)
    quantity = db.Column(db.Float, nullable=True)
    unit = db.Column(db.String(50), nullable=True)
    cost_usd = db.Column(db.Float, nullable=True)
    actual_quantity = db.Column(db.Float, nullable=True)
    actual_unit = db.Column(db.String(50), nullable=True)
    actual_date = db.Column(db.String(20), nullable=True)
    actual_note = db.Column(db.String(300), nullable=True)
    created_at = db.Column(db.DateTime, default=_utcnow)
    updated_at = db.Column(db.DateTime, default=_utcnow, onupdate=_utcnow)

    __table_args__ = (
        db.UniqueConstraint("user_id", "plan_id", "plot_id", "line_index",
                            name="uq_implemented_user_plan_plot_line"),
    )


class ItemChange(db.Model):
    __tablename__ = "item_changes"
    id = db.Column(db.Integer, primary_key=True)
    item_id = db.Column(db.Integer, db.ForeignKey("implemented_items.id"), nullable=False, index=True)
    field = db.Column(db.String(50), nullable=False)
    old_value = db.Column(db.Text, nullable=True)
    new_value = db.Column(db.Text, nullable=True)
    source = db.Column(db.String(20), nullable=False)  # "chat" or "manual"
    created_at = db.Column(db.DateTime, default=_utcnow)


class Notification(db.Model):
    __tablename__ = "notifications"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    pest_report_id = db.Column(db.Integer, db.ForeignKey("pest_reports.id"), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    body = db.Column(db.Text, nullable=False)
    read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=_utcnow)


def farm_to_grower(farm: Farm) -> dict:
    """Convert a Farm+PlotModels into the engine's grower dict."""
    return {
        "name": farm.name,
        "season": farm.season or "spring",
        "crops_needed": farm.crops_needed or [],
        "compost_available_cu_yd": farm.compost_available_cu_yd or 0,
        "compost_price_usd_per_cu_yd": farm.compost_price_usd_per_cu_yd or 0,
        "price_overrides": farm.price_overrides or {},
        "plots": [
            {
                "id": p.plot_id,
                "name": p.name,
                "area_sqft": p.area_sqft,
                "soil_texture": p.soil_texture,
                "soil_test": p.soil_test or {},
                "crop_two_years_ago": p.crop_two_years_ago,
                "crop_last_year": p.crop_last_year or "",
                "crop_planned": p.crop_planned or "",
                "problems": p.problems or [],
                "baseline": p.baseline or {"inputs": [], "pesticide_applications": 0},
            }
            for p in farm.plots
        ],
    }


def save_grower_to_farm(farm: Farm, grower: dict):
    """Update a Farm+PlotModels from a grower dict."""
    farm.name = grower.get("name", "")
    farm.season = grower.get("season", "spring")
    farm.crops_needed = grower.get("crops_needed", [])
    farm.compost_available_cu_yd = grower.get("compost_available_cu_yd", 0)
    farm.compost_price_usd_per_cu_yd = grower.get("compost_price_usd_per_cu_yd", 0)
    farm.price_overrides = grower.get("price_overrides", {})

    # Sync plots
    existing = {p.plot_id: p for p in farm.plots}
    new_ids = set()
    for pg in grower.get("plots", []):
        pid = pg["id"]
        new_ids.add(pid)
        if pid in existing:
            p = existing[pid]
        else:
            p = PlotModel(farm=farm, plot_id=pid)
            db.session.add(p)
        p.name = pg.get("name", "")
        p.area_sqft = pg.get("area_sqft", 1000)
        p.soil_texture = pg.get("soil_texture", "loam")
        p.soil_test = pg.get("soil_test", {})
        p.crop_two_years_ago = pg.get("crop_two_years_ago")
        p.crop_last_year = pg.get("crop_last_year", "")
        p.crop_planned = pg.get("crop_planned", "")
        p.problems = pg.get("problems", [])
        p.baseline = pg.get("baseline", {"inputs": [], "pesticide_applications": 0})
    # Remove plots that are no longer in grower
    for pid, p in existing.items():
        if pid not in new_ids:
            db.session.delete(p)
