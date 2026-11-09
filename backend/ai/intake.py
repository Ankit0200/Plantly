"""Extract a grower JSON from free-form text or an uploaded soil report.

Calls Gemini to parse the input into the exact shape of demo_grower.json.
"""
from __future__ import annotations

import base64
import json
import os


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


def _build_chat_system(data: dict) -> str:
    crop_names = {c["id"]: c["name"] for c in data["crops"].values()}
    problem_names = {p["id"]: p["name"] for p in data["problems"].values()}

    return f"""You are a farm planning assistant. You collect just 3 things, one at a time.

## STRICT RULES:
- Ask exactly ONE question per message. Keep replies to 1-2 sentences.
- After the user answers, acknowledge briefly and ask the next question.
- Use sensible defaults for everything else.

## Question order — ask these one at a time:
1. "Do you have a soil test report? If yes, share the numbers: pH, phosphorus (P), potassium (K), organic matter %. If not, just say 'no' and I'll use typical defaults."
2. "What did you grow in the last 2-3 seasons?" (accept whatever they say — last year and two years ago)
3. "What do you want to plant this season?"

That's it. After question 3, you have enough. Output the JSON immediately.

## Defaults (fill in automatically — do NOT ask the user):
- Farm name: null
- Plot name: "Plot A"
- Plot size: 5000 sq ft
- Soil texture: loam
- If no soil test: pH 6.5, P 30 ppm, K 100 ppm, OM 3.0%
- Problems: empty
- Baseline inputs: empty, pesticide apps: 0
- Compost: 0
- crops_needed: same as crop_planned across plots

## Match user's crop names to these IDs:
{json.dumps(crop_names, indent=2)}

## Match pest/disease names to these IDs (only if the user mentions them):
{json.dumps(problem_names, indent=2)}

## When you have enough data:
When the user says they're done or you have sufficient info, respond with EXACTLY this format:

READY_TO_PLAN
```json
<the complete grower JSON in the exact format below>
```

The JSON format:
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

Use null for anything you couldn't determine. Do NOT output JSON until the user is ready."""


def intake_chat(messages: list, data: dict) -> dict:
    """Multi-turn conversational intake. Returns reply text, and optionally extracted grower JSON."""
    from google import genai

    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY environment variable not set.")

    client = genai.Client(api_key=api_key)
    system_prompt = _build_chat_system(data)

    # Convert messages to Gemini format
    gemini_messages = []
    for m in messages:
        role = "user" if m["role"] == "user" else "model"
        gemini_messages.append({"role": role, "parts": [{"text": m["content"]}]})

    response = client.models.generate_content(
        model="gemini-3-flash-preview",
        contents=gemini_messages,
        config=genai.types.GenerateContentConfig(
            system_instruction=system_prompt,
            max_output_tokens=2048,
        ),
    )

    reply_text = response.text

    # Check if Gemini produced the final JSON
    grower = None
    if "READY_TO_PLAN" in reply_text:
        try:
            json_text = reply_text
            if "```json" in json_text:
                json_text = json_text.split("```json")[1].split("```")[0]
            elif "```" in json_text:
                json_text = json_text.split("```")[1].split("```")[0]
            grower = json.loads(json_text.strip())
            # Clean the reply to just the text before READY_TO_PLAN
            clean_reply = reply_text.split("READY_TO_PLAN")[0].strip()
            if clean_reply:
                reply_text = clean_reply + "\n\nI've got everything I need! Let me set up your plan."
            else:
                reply_text = "Great, I've got everything I need! Let me set up your plan."
        except (json.JSONDecodeError, IndexError):
            pass  # Not valid JSON yet, keep chatting

    return {"reply": reply_text, "grower": grower}


def extract_grower(text: str | None, file_data: bytes | None,
                   file_type: str | None, data: dict) -> dict:
    """Call Gemini to extract a grower JSON from text or a document/image."""
    from google import genai

    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY environment variable not set.")

    client = genai.Client(api_key=api_key)
    system_prompt = _build_extraction_prompt(data)

    parts = []

    if file_data:
        if file_type and (file_type.startswith("image/") or file_type == "application/pdf"):
            parts.append(genai.types.Part.from_bytes(
                data=file_data,
                mime_type=file_type,
            ))
        else:
            # Try as text
            parts.append(file_data.decode("utf-8", errors="replace"))

    if text:
        parts.append(f"Extract the farm data from this:\n\n{text}")
    elif not parts:
        raise ValueError("No input provided")
    else:
        parts.append("Extract the farm data from this document.")

    response = client.models.generate_content(
        model="gemini-3-flash-preview",
        contents=parts,
        config=genai.types.GenerateContentConfig(
            system_instruction=system_prompt,
            max_output_tokens=4096,
        ),
    )

    response_text = response.text

    # Parse JSON from response
    json_text = response_text
    if "```json" in json_text:
        json_text = json_text.split("```json")[1].split("```")[0]
    elif "```" in json_text:
        json_text = json_text.split("```")[1].split("```")[0]

    return json.loads(json_text.strip())
