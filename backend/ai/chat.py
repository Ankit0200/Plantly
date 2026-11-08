"""Claude chat with tool use: Claude decides when it needs data, calls a tool, and Flask runs it.

    result = chat([{"role": "user", "content": "Why does Plot B need lime?"}], grower, data, notes)
    result["reply"]                 # Claude's answer
    result["tools_used"]            # what it looked up, for a "Looked up: ..." line in the UI
    result["unsupported_numbers"]   # numbers in the answer that no tool returned (should be empty)

Needs:  pip install anthropic   and   ANTHROPIC_API_KEY in the environment.
"""
from __future__ import annotations

import json
import os
import re

from ai.ai_tools import TOOLS, ToolBox

MODEL = os.environ.get("CLAUDE_MODEL", "claude-sonnet-5-5")
MAX_TOOL_ROUNDS = 6

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
- Write for a grower, not a scientist: plain words, 2 to 6 sentences or a short list.
- Name the plot and crop, and give units (lb, cu yd, $).
- End answers that use data with "Source:" and the source title and link from the tool result. \
If that source or row has verified: false, add "(not yet checked by our team)".
- The plan avoids synthetic chemicals where it can. Recommend the plan's prevention steps. Never recommend a \
pesticide product or spray rate; if asked, say the plan focuses on prevention and suggest their county \
extension office.
- Stay on the grower's plots and season planning. For anything else, say briefly that you can only help with \
their plan."""


def chat(messages: list, grower: dict, data: dict, notes: list | None = None,
         client=None, model: str = MODEL) -> dict:
    """Run one chat turn. `messages` is the conversation so far as [{"role", "content"}], ending with the
    grower's new message. Claude may call tools several times before it answers."""
    if client is None:
        import anthropic
        client = anthropic.Anthropic()
    box = ToolBox(grower, data, notes)
    convo, trace = list(messages), []

    for _ in range(MAX_TOOL_ROUNDS + 1):
        response = client.messages.create(model=model, max_tokens=1500, system=SYSTEM_PROMPT,
                                          tools=TOOLS, messages=convo)
        blocks = [_block(b) for b in response.content]
        convo.append({"role": "assistant", "content": blocks})
        if response.stop_reason != "tool_use":
            reply = "".join(b["text"] for b in blocks if b["type"] == "text").strip()
            return {"reply": reply,
                    "tools_used": [{"tool": t["tool"], "input": t["input"], "is_error": t["is_error"]} for t in trace],
                    "unsupported_numbers": unsupported_numbers(reply, trace, messages)}
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


def unsupported_numbers(reply: str, trace: list, messages: list) -> list[float]:
    """Numbers in Claude's reply that no tool output (or the grower) gave it.

    Small counts (10 and under) are ignored. A number counts as supported if a tool value rounds to it
    (217.8 -> 218). Show a "check this" badge, or ask Claude to fix the answer, when this isn't empty."""
    seen = set()
    for t in trace:
        seen |= _numbers(t["output"])
    for m in messages:
        if isinstance(m.get("content"), str):
            seen |= _numbers(m["content"])
    rounded = {round(v, nd) for v in seen for nd in (0, 1, 2)}
    return sorted(n for n in _numbers(reply) if n > 10 and n not in seen and n not in rounded)
