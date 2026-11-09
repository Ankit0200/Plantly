"""Tests for /api/intake using a mocked Gemini client."""
import json
import os
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

from engine.soil_engine import load_data

HERE = Path(__file__).parent
BACKEND = HERE.parent
DATA_DIR = Path(os.environ.get("SOIL_DATA_DIR", BACKEND / "data"))

VALID_DRAFT = {
    "name": "Test Farm",
    "crops_needed": ["tomato", "cabbage"],
    "compost_available_cu_yd": 2.0,
    "compost_price_usd_per_cu_yd": 0,
    "price_overrides": {},
    "plots": [{
        "id": "A",
        "name": "Plot A",
        "area_sqft": 5000,
        "soil_texture": "loam",
        "soil_test": {"ph": 6.2, "p_ppm": 30, "k_ppm": 80, "organic_matter_pct": 3.0},
        "crop_two_years_ago": None,
        "crop_last_year": "tomato",
        "crop_planned": "cabbage",
        "problems": [],
        "baseline": {"inputs": [], "pesticide_applications": 0},
    }],
}


def _mock_genai_client(draft_json):
    """Create a mock genai.Client that returns the given draft as Gemini's response."""
    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.text = json.dumps(draft_json)
    mock_client.models.generate_content.return_value = mock_response
    return mock_client


@pytest.fixture(scope="module")
def data():
    return load_data(DATA_DIR)


def test_valid_extraction(data):
    from ai.intake import extract_grower
    mock_client = _mock_genai_client(VALID_DRAFT)
    with patch("google.genai.Client", return_value=mock_client):
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}):
            result = extract_grower("I have a 5000 sq ft plot", None, None, data)
    assert result["name"] == "Test Farm"
    assert result["plots"][0]["crop_planned"] == "cabbage"


def test_extraction_with_bad_crop_returns_errors(data):
    from ai.intake import extract_grower
    from engine.soil_engine import check_grower
    bad_draft = json.loads(json.dumps(VALID_DRAFT))
    bad_draft["plots"][0]["crop_planned"] = "tomatoes"  # invalid ID
    mock_client = _mock_genai_client(bad_draft)
    with patch("google.genai.Client", return_value=mock_client):
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}):
            result = extract_grower("My plot grows tomatoes", None, None, data)
    errors = check_grower(result, data)
    assert any("tomatoes" in e for e in errors)


def test_no_api_key_raises(data):
    from ai.intake import extract_grower
    with patch.dict(os.environ, {}, clear=True):
        os.environ.pop("GEMINI_API_KEY", None)
        os.environ.pop("GOOGLE_API_KEY", None)
        with pytest.raises(ValueError, match="GEMINI_API_KEY"):
            extract_grower("test", None, None, data)
