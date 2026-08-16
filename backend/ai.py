"""Direct AI provider layer — official Anthropic + OpenAI SDKs.

Replaces the Emergent-hosted `emergentintegrations` library so every AI feature
runs on keys the business owns:
  - ANTHROPIC_API_KEY  → copywriter drafts, coach templates, plan checks
  - OPENAI_API_KEY     → video frame analysis (gpt-4o vision), Whisper STT

Clients are created lazily so .env (loaded in server.py) is honored, and a
missing key surfaces as RuntimeError at call time — the API layer maps that
to a 502, matching the previous EMERGENT_LLM_KEY behavior.
"""
import os

from anthropic import AsyncAnthropic
from openai import AsyncOpenAI

_anthropic_client = None
_openai_client = None


def _anthropic() -> AsyncAnthropic:
    global _anthropic_client
    if _anthropic_client is None:
        key = os.environ.get("ANTHROPIC_API_KEY")
        if not key:
            raise RuntimeError("ANTHROPIC_API_KEY is not configured.")
        _anthropic_client = AsyncAnthropic(api_key=key)
    return _anthropic_client


def _openai() -> AsyncOpenAI:
    global _openai_client
    if _openai_client is None:
        key = os.environ.get("OPENAI_API_KEY")
        if not key:
            raise RuntimeError("OPENAI_API_KEY is not configured.")
        _openai_client = AsyncOpenAI(api_key=key)
    return _openai_client


async def claude_complete(*, system: str, prompt: str, model: str, max_tokens: int = 4096) -> str:
    resp = await _anthropic().messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": prompt}],
    )
    return "".join(block.text for block in resp.content if block.type == "text")


async def openai_vision_complete(*, system: str, prompt: str, images_base64: list,
                                 model: str = "gpt-4o", max_tokens: int = 1024) -> str:
    content = [{"type": "text", "text": prompt}]
    content += [{"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b}"}}
                for b in images_base64]
    resp = await _openai().chat.completions.create(
        model=model,
        max_tokens=max_tokens,
        messages=[{"role": "system", "content": system},
                  {"role": "user", "content": content}],
    )
    return resp.choices[0].message.content or ""


async def transcribe_wav(wav_path) -> str:
    with open(wav_path, "rb") as f:
        resp = await _openai().audio.transcriptions.create(
            model="whisper-1", file=f, response_format="json", language="en")
    return (getattr(resp, "text", "") or "").strip()
