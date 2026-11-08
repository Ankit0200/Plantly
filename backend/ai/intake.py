"""Extract a grower JSON from free-form text or an uploaded soil report.

Calls Claude to parse the input into the exact shape of demo_grower.json.
"""
from __future__ import annotations

import base64
import json
import os

import anthropic

MODEL = os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-20250514")


def _build_extraction_prompt(data: dict) -> str:
    crop_ids = sorted(data["crops"].keys())
    problem_ids = sorted(data["problems"].keys())
    product_ids = sorted(data["products"].keys())
    textures = sorted({r["soil_texture"] for r in data["lime"]})

    return f"""You extract farm data from text descriptions or soil test reports into a structured JSON object.

## Valid IDs (use ONLY these)
Crop IDs: {json.dumps(crop_ids)}
Problem IDs: {json.dumps(problem_ids)}
Product IDs: {json.dumps(product_ids)}
Soil textures: {json.dumps(textures)}

## Conversion rules
- If P or K values are given in lb per acre, convert to ppm by dividing by 2.
- If the report includes a lime recommendation rate, record it as lab_lime_lb_per_1000sqft in the soil_test object.
- Leave any field you cannot determine as null. NEVER guess a value.
- crop IDs and problem IDs MUST come from the valid lists above. If a crop or problem is mentioned but has no matching ID, leave it null and note the issue.

## Output format
Return ONLY valid JSON matching this exact structure (no markdown, no explanation):

{{
  "name": "string or null",
  "crops_needed": ["crop_id", ...],
  "compost_available_cu_yd": number or 0,
  "compost_price_usd_per_cu_yd": number or 0,
  "price_overrides": {{}},
  "plots": [
    {{
      "id": "A",
      "name": "string",
      "area_sqft": number,
      "soil_texture": "sandy|loam|clay",
      "soil_test": {{
        "ph": number,
        "p_ppm": number,
        "k_ppm": number,
        "organic_matter_pct": number or null,
        "lab_lime_lb_per_1000sqft": number or null
      }},
      "crop_two_years_ago": "crop_id or null",
      "crop_last_year": "crop_id or null",
      "crop_planned": "crop_id",
      "problems": ["problem_id", ...],
      "baseline": {{
        "inputs": [{{"product_id": "string", "amount_lb": number}}, ...],
        "pesticide_applications": number or 0
      }}
    }}
  ]
}}

Plot IDs should be sequential letters: A, B, C, etc."""


def extract_grower(text: str | None, file_data: bytes | None,
                   file_type: str | None, data: dict) -> dict:
    """Call Claude to extract a grower JSON from text or a document/image."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY environment variable not set.")

    client = anthropic.Anthropic(api_key=api_key)
    system_prompt = _build_extraction_prompt(data)

    content = []
    if file_data:
        if file_type and file_type.startswith("image/"):
            media_type = file_type
            content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": media_type,
                    "data": base64.b64encode(file_data).decode(),
                },
            })
        elif file_type == "application/pdf":
            content.append({
                "type": "document",
                "source": {
                    "type": "base64",
                    "media_type": "application/pdf",
                    "data": base64.b64encode(file_data).decode(),
                },
            })
        else:
            # Try as text
            content.append({"type": "text", "text": file_data.decode("utf-8", errors="replace")})

    if text:
        content.append({"type": "text", "text": f"Extract the farm data from this:\n\n{text}"})
    elif not content:
        raise ValueError("No input provided")
    else:
        content.append({"type": "text", "text": "Extract the farm data from this document."})

    response = client.messages.create(
        model=MODEL,
        max_tokens=4096,
        system=system_prompt,
        messages=[{"role": "user", "content": content}],
    )

    response_text = response.content[0].text

    # Parse JSON from response
    json_text = response_text
    if "```json" in json_text:
        json_text = json_text.split("```json")[1].split("```")[0]
    elif "```" in json_text:
        json_text = json_text.split("```")[1].split("```")[0]

    return json.loads(json_text.strip())
