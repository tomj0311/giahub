"""Dummy test Model implementation for offline backend and frontend tests.

Avoids external API calls while exercising the agent runtime / streaming
pipeline. It echoes the last user message token-by-token (whitespace split)
with an initial banner so tests can assert streamed chunks.
"""
from __future__ import annotations

from typing import Iterator, List, Dict, Any
from ai.model.base import Model
from ai.model.message import Message
from ai.model.response import ModelResponse


class DummyEchoModel(Model):  # pragma: no cover (integration exercised)
    id: str | None = "dummy-echo"
    name: str | None = "DummyEcho"
    provider: str | None = "dummy"

    @property
    def request_kwargs(self) -> Dict[str, Any]:  # minimal
        return {}

    def response(self, messages: List[Message]) -> ModelResponse:  # non-stream
        last = messages[-1].content if messages else ""
        return ModelResponse(content=f"ECHO: {last}")

    def response_stream(self, messages: List[Message]) -> Iterator[ModelResponse]:  # streaming
        last = messages[-1].content if messages else ""
        yield ModelResponse(content="ECHO:")
        for tok in last.split():
            yield ModelResponse(content=tok)

    # Simpler invoke wrappers
    def invoke(self, *a, **k):  # pragma: no cover
        return self.response(k.get("messages") or [])

    def invoke_stream(self, *a, **k):  # pragma: no cover
        return self.response_stream(k.get("messages") or [])

    async def aresponse(self, messages: List[Message]):  # pragma: no cover
        return self.response(messages)

    async def ainvoke(self, *a, **k):  # pragma: no cover
        return self.invoke(*a, **k)

    async def ainvoke_stream(self, *a, **k):  # pragma: no cover
        return self.invoke_stream(*a, **k)
