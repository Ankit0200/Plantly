"""Shared Gemini client, plus an adapter that lets the Claude-style chat loop in ai/chat.py run on Gemini.

    client = gemini_client()                      # intake, recommendations, "Why?" explanations
    chat(messages, grower, data, client=GeminiChat())

Needs GEMINI_API_KEY (or GOOGLE_API_KEY) in the environment.
"""
from __future__ import annotations

import os
from types import SimpleNamespace

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3-flash-preview")


def gemini_key() -> str | None:
    return os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")


def gemini_client():
    from google import genai
    from google.genai import types

    key = gemini_key()
    if not key:
        raise ValueError("GEMINI_API_KEY environment variable not set.")
    # Preview models such as gemini-3-flash-preview are served on v1beta; google-genai 3.x defaults to v1.
    return genai.Client(api_key=key, http_options=types.HttpOptions(api_version="v1beta"))


class GeminiChat:
    """Stands in for anthropic.Anthropic() in ai.chat: `client.messages.create(...)` takes Anthropic-shaped
    messages and tools and returns an object with `.content` (text / tool_use blocks) and `.stop_reason`."""

    def __init__(self):
        self._client = gemini_client()  # keep a reference: the SDK closes clients that are dropped
        self._raw = {}                  # tool_use id -> the model's original reply (carries thought signatures)
        self._ids = 0
        self.messages = self

    def create(self, *, system: str, tools: list, messages: list, max_tokens: int, **_ignored):
        from google.genai import types

        config = types.GenerateContentConfig(
            system_instruction=system,
            max_output_tokens=max_tokens,
            tools=[types.Tool(function_declarations=[
                types.FunctionDeclaration(name=t["name"], description=t["description"],
                                          parameters_json_schema=t["input_schema"])
                for t in tools])],
        )
        resp = self._client.models.generate_content(model=GEMINI_MODEL, contents=self._contents(messages),
                                                    config=config)
        content = resp.candidates[0].content if resp.candidates else None
        blocks = []
        for part in (content.parts or []) if content else []:
            if part.function_call:
                self._ids += 1
                tool_id = part.function_call.id or f"gemini-call-{self._ids}"
                self._raw[tool_id] = content
                blocks.append({"type": "tool_use", "id": tool_id, "name": part.function_call.name,
                               "input": dict(part.function_call.args or {})})
            elif part.text and not part.thought:
                blocks.append({"type": "text", "text": part.text})
        stop = "tool_use" if any(b["type"] == "tool_use" for b in blocks) else "end_turn"
        return SimpleNamespace(content=blocks, stop_reason=stop)

    def _contents(self, messages: list) -> list:
        """Anthropic-format conversation -> Gemini contents."""
        from google.genai import types

        names, out = {}, []
        for m in messages:
            role = "user" if m["role"] == "user" else "model"
            content = m["content"]
            if isinstance(content, str):
                out.append(types.Content(role=role, parts=[types.Part(text=content)]))
                continue
            tool_ids = [b["id"] for b in content if b.get("type") == "tool_use"]
            for b in content:
                if b.get("type") == "tool_use":
                    names[b["id"]] = b["name"]
            if role == "model" and tool_ids and tool_ids[0] in self._raw:
                # Gemini 3 rejects a function-call turn unless it comes back exactly as the model sent it.
                out.append(self._raw[tool_ids[0]])
                continue
            parts = []
            for b in content:
                if b.get("type") == "tool_result":
                    key = "error" if b.get("is_error") else "result"
                    parts.append(types.Part(function_response=types.FunctionResponse(
                        name=names.get(b["tool_use_id"], ""), response={key: b["content"]})))
                elif b.get("type") == "text" and b.get("text"):
                    parts.append(types.Part(text=b["text"]))
            if parts:
                out.append(types.Content(role=role, parts=parts))
        return out
