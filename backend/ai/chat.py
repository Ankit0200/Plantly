"""Claude chat with tool use: Claude decides when it needs data, calls a tool, and Flask runs it.

    result = chat([{"role": "user", "content": "Why does Plot B need lime?"}], grower, data, notes)
    result["reply"]                 # Claude's answer
    result["tools_used"]            # what it looked up, for a "Looked up: ..." line in the UI
    result["unsupported_numbers"]   # numbers in the answer that no tool returned (should be empty)

Needs either ANTHROPIC_API_KEY (Claude) or GEMINI_API_KEY (Gemini, via ai/gemini.py); see chat_client().
"""
from __future__ import annotations

import json
import os
import re

from ai.ai_tools import TOOLS, ToolBox

MODEL = os.environ.get("CLAUDE_MODEL", "claude-sonnet-5-5")
MAX_TOOL_ROUNDS = 10  # photo questions look up the plan, problems, practices and notes before answering

SYSTEM_PROMPT = """You are the assistant inside Plantly, a season planner for small vegetable growers. \
You help one grower understand and adjust their plan for their plots. Their plot data is already loaded; \
you reach it, and the planner's research data, only through your tools.

WHERE NUMBERS COME FROM
- Every amount, rate, cost, soil level and crop suggestion comes from the planning engine and the data files. \
Never calculate, estimate or recall an agronomy number yourself, even if you think you know it.
- Before you state any amount, cost or crop suggestion, get it from get_plan (or run_what_if for a change) in \
this conversation, and quote it as the tool returned it. You may round what the tool shows (217.8 lb -> about 218 lb).
- If no tool result has the number the grower wants, say you don't have it and say what would give it \
(for example, the lime rate printed on their soil test report).

WHICH TOOL TO USE
- "What should I do / how much / what will it cost" -> get_plan.
- "What if I ..." (keep a crop, a different pH, more compost, a local price) -> run_what_if, then compare \
the two plans in one or two sentences using compared_to_current_plan.
- "Why ..." about something in the plan -> get_plan to find the line, then explain_rule with its rule_id.
- General questions about crops, pests, products or soil-test cutoffs -> lookup_data.
- Background questions (how rotation works, why compost helps, how a pest spreads) -> search_notes, and \
answer only from the notes it returns.
- Don't call a tool for greetings, or when an earlier tool result in this conversation already has the answer.
- If a tool returns an error, explain it in plain words and ask the grower for the missing or corrected value.

HOW TO ANSWER
- Write for a grower, not a scientist: plain words, short. Aim for under 120 words; the grower reads on a phone.
- Format in simple Markdown so it is easy to scan. Use only: "**Bold label**" lines as section headings, \
"- " bullets, "1. " numbered steps, and **bold** for the one key word or amount. No tables, no # headings, \
no long paragraphs.
- A one- or two-sentence answer needs no headings. Anything longer uses this shape (leave out a section that \
doesn't apply):
  **What's happening** - one or two bullets.
  **Why** - one or two bullets.
  **What to do** - up to 4 numbered steps, each one short line starting with a verb.
- Each bullet or step is one short sentence. Don't repeat what the grower said back to them.
- Name the plot and crop, and give units (lb, cu yd, $).
- End answers that use data with a last line "Source: <title> (<link>)" from the tool result. \
If that source or row has verified: false, add "(not yet checked by our team)".
- The plan avoids synthetic chemicals where it can. Recommend the plan's prevention steps. Never recommend a \
pesticide product or spray rate; if asked, say the plan focuses on prevention and suggest their county \
extension office.
- Stay on the grower's plots and season planning. For anything else, say briefly that you can only help with \
their plan."""

IMPLEMENTED_SYSTEM_EXTRA = """

IMPLEMENTED PLAN CONTEXT
You are chatting about a plan where the farmer has already ticked the steps they intend to do. \
Use get_implemented_items to see what they committed to and any recorded actual values.

RECORDING WHAT THEY ACTUALLY DID
- When the farmer tells you they used a different amount than planned, find the matching item with \
get_implemented_items, call propose_item_update with exactly the numbers the farmer gave, and ask them to confirm.
- Never change amounts yourself. Never record a number the farmer didn't say.
- After the farmer saves a change, you may compare planned vs actual using only those two numbers \
(e.g. "That's 12.3 lb more urea than planned."). Call run_what_if if they ask what the change means.

EMERGENCIES AND WEATHER EVENTS (heavy rain, flooding, drought, frost, hail, pest outbreak)
- First call get_plan and get_implemented_items to see which crops, plots and steps are involved.
- Then call search_notes for the situation (e.g. "heavy rain nitrogen loss sandy soil").
- Answer only from the notes and engine data returned: what's likely happening, which plots and crops \
are most affected, and what to check or do. End every answer with sources.
- If search_notes returns nothing useful, say so plainly and suggest contacting the county extension office. \
Never give amounts or rates that no tool returned.
- If the answer suggests a new step (e.g. extra side-dressing), offer to rerun the plan with run_what_if \
so any new amount comes from the engine."""

PHOTO_SYSTEM_EXTRA = """

PHOTOS FROM THE GROWER
The grower can attach photos of their crops. Answer a photo with this shape, keeping each section to one or \
two bullets: **What I see**, **Most likely**, **How to confirm**, **What to do** (up to 4 numbered steps), then \
the Source line. Still under about 150 words. When a message includes a photo:
- First say briefly what you can see (which plant part; symptoms such as spots, yellowing, holes, wilting, \
insects, deformity). Do not name a cause before describing the evidence.
- Use get_plan and get_implemented_items to learn which crops and plots this grower has. If it is unclear \
which plot or crop the photo shows, ask. If the crop in the photo is not in their plan, say so and answer \
from the photo and Plantly's library; do not keep searching. Keep lookups few and focused.
- Then give the most likely cause and up to two alternatives, using honest confidence words ("most likely", \
"possibly"). Say what would confirm it (look under the leaves, check the stem base, check soil moisture, \
look for insects at dusk). A photo alone cannot confirm a diagnosis.
- Ground it in Plantly's data: call lookup_data on "problems" (filter by the crop's family) to see whether it \
matches a problem in the library. If it does, use lookup_data on "practices" and search_notes for prevention \
and management, and cite the sources they return. If it does not match, say it is outside Plantly's research \
library and suggest the county extension office or a plant diagnostic lab.
- Nutrient-looking symptoms (e.g. yellowing): relate them to the plan's soil test and feeding schedule from \
get_plan. Any amount, rate or cost must come from get_plan or run_what_if, never from you.
- Never name a pesticide product or rate unless a tool returned it; if one is used, tell them to follow the label.
- If the identified pest is in the problems library, suggest they use "Report a pest" so nearby growers \
are alerted.
- "Is this healthy?" questions: say what looks normal, what (if anything) looks off, and what to watch for.
- If the photo is blurry, too dark, too far away, or not a plant, say so and ask for a clearer photo \
(the whole plant plus a close-up of the problem, in daylight).
- This is planning support, not a certified diagnosis."""


def final_round(round_no: int) -> dict:
    """On the last allowed round, forbid more tool calls so the model answers with what it has already looked
    up, instead of the grower getting "couldn't finish looking that up"."""
    return {"tool_choice": {"type": "none"}} if round_no == MAX_TOOL_ROUNDS else {}


def chat_provider() -> str:
    """"anthropic" when CHAT_PROVIDER=anthropic (or, by default, when ANTHROPIC_API_KEY is set); else "gemini"."""
    return os.environ.get("CHAT_PROVIDER") or ("anthropic" if os.environ.get("ANTHROPIC_API_KEY") else "gemini")


def chat_client():
    if chat_provider() == "anthropic":
        import anthropic
        return anthropic.Anthropic()
    from ai.gemini import GeminiChat
    return GeminiChat()


def chat(messages: list, grower: dict, data: dict, notes: list | None = None,
         client=None, model: str = MODEL, implemented_items: list | None = None,
         system_extra: str = "") -> dict:
    """Run one chat turn. `messages` is the conversation so far as [{"role", "content"}], ending with the
    grower's new message. Claude may call tools several times before it answers."""
    if client is None:
        client = chat_client()
    box = ToolBox(grower, data, notes, implemented_items=implemented_items)
    convo, trace = list(messages), []
    system = SYSTEM_PROMPT + system_extra

    for round_no in range(MAX_TOOL_ROUNDS + 1):
        response = client.messages.create(model=model, max_tokens=1500, system=system,
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

    return {"reply": "Sorry, I couldn't finish looking that up. Could you ask about one plot at a time?",
            "tools_used": [{"tool": t["tool"], "input": t["input"], "is_error": t["is_error"]} for t in trace],
            "unsupported_numbers": []}


def _block(b) -> dict:
    """SDK content block (or dict) -> plain dict we can send back next round."""
    get = (lambda k: b.get(k)) if isinstance(b, dict) else (lambda k: getattr(b, k, None))
    if get("type") == "tool_use":
        return {"type": "tool_use", "id": get("id"), "name": get("name"), "input": get("input") or {}}
    if get("type") == "text":
        return {"type": "text", "text": get("text")}
    return b if isinstance(b, dict) else b.model_dump()


# ---------------------------------------------------------------------- number guard
_NUM = re.compile(r"(?<![A-Za-z])\$?(\d[\d,]*(?:\.\d+)?)")


def _numbers(text: str) -> set[float]:
    return {float(m.group(1).replace(",", "")) for m in _NUM.finditer(text)}


def unsupported_numbers(reply: str, trace: list, messages: list,
                        implemented_items: list | None = None) -> list[float]:
    """Numbers in Claude's reply that no tool output (or the grower) gave it.

    Small counts (10 and under) are ignored. A number counts as supported if a tool value rounds to it
    (217.8 -> 218). Numbers from the farmer's conversation messages and from implemented items are also
    considered supported. Show a "check this" badge when this isn't empty."""
    seen = set()
    for t in trace:
        seen |= _numbers(t["output"])
    for m in messages:
        content = m.get("content")
        if isinstance(content, str):
            seen |= _numbers(content)
        elif isinstance(content, list):  # a photo turn: text blocks alongside the image
            for b in content:
                if isinstance(b, dict) and b.get("type") == "text":
                    seen |= _numbers(b.get("text") or "")
    # Numbers from implemented items (planned and actual) are supported
    for item in (implemented_items or []):
        for field in ("quantity", "cost_usd", "actual_quantity"):
            v = item.get(field)
            if v is not None:
                seen.add(float(v))
    rounded = {round(v, nd) for v in seen for nd in (0, 1, 2)}
    return sorted(n for n in _numbers(reply) if n > 10 and n not in seen and n not in rounded)
