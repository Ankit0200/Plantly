"""Event logging helper. Every meaningful user choice is recorded."""
from flask_login import current_user
from models import db, Event

# Types allowed from POST /api/events (UI-only events)
UI_EVENT_TYPES = {
    "why_expanded",
    "plot_switched",
    "tab_switched",
    "plan_shared",
    "recommendation_viewed",
    "alert_opened",
}

# All valid event types (backend + UI)
ALL_EVENT_TYPES = UI_EVENT_TYPES | {
    "report_uploaded",
    "extraction_finished",
    "field_corrected",
    "extraction_confirmed",
    "plot_created",
    "plot_edited",
    "crops_needed_changed",
    "plan_generated",
    "what_if_run",
    "keep_my_crop",
    "plan_saved",
    "plan_renamed",
    "chat_question",
    "user_registered",
    "user_logged_in",
    "pest_reported",
    "item_implemented",
    "item_removed",
    "impl_chat_opened",
    "update_proposed",
    "update_saved",
    "update_cancelled",
    "emergency_question",
}


def log_event(event_type: str, payload: dict | None = None, plan_id: int | None = None,
              user_id: int | None = None):
    """Log an event. Uses current_user.id unless user_id is explicitly given."""
    uid = user_id or (current_user.id if current_user and current_user.is_authenticated else None)
    if uid is None:
        return
    # Never log sensitive data
    safe = {k: v for k, v in (payload or {}).items()
            if k not in ("password", "password_hash", "file_contents", "file_data")}
    ev = Event(user_id=uid, type=event_type, payload=safe, plan_id=plan_id)
    db.session.add(ev)
    db.session.commit()
