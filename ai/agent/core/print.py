from __future__ import annotations

import json
from typing import (
    Any,
    Dict,
    Generator,
    List,
    Optional,
    Union,
)

from pydantic import BaseModel

from ai.model.message import Message
from ai.reasoning.step import ReasoningStep
from ai.run.response import RunResponse, RunEvent
from ai.utils.log import logger
from ai.utils.message import get_text_from_message
from ai.utils.timer import Timer


def create_panel(self: "Agent", content, title, border_style="blue"):
    pass


def response(
    self: "Agent",
    message: Optional[Union[List, Dict, str, Message]] = None,
    *,
    messages: Optional[List[Union[Dict, Message]]] = None,
    stream: bool = False,
    markdown: bool = False,
    show_message: bool = True,
    show_reasoning: bool = True,
    show_full_reasoning: bool = False,
    console: Optional[Any] = None,
    return_generator: bool = True,
    **kwargs: Any,
) -> Optional[Generator[str, None, None]]:

    if markdown:
        self.markdown = True

    if self.response_model is not None:
        markdown = False
        self.markdown = False
        stream = False

    if stream:
        _response_content: str = ""
        reasoning_steps: List[ReasoningStep] = []
        response_timer = Timer()
        response_timer.start()

        if message and show_message and not return_generator:
            message_content = get_text_from_message(message)
            print(f"Message: {message_content}")

        def stream_generator():
            nonlocal _response_content, reasoning_steps
            
            if message and show_message and return_generator:
                message_content = get_text_from_message(message)

            for resp in self.run(message=message, messages=messages, stream=True, **kwargs):
                if isinstance(resp, RunResponse) and isinstance(resp.content, str):
                    if resp.event == RunEvent.run_response:
                        if return_generator:
                            yield resp.content
                        else:
                            print(resp.content, end="", flush=True)
                        _response_content = resp.content
                    if resp.extra_data is not None and resp.extra_data.reasoning_steps is not None:
                        reasoning_steps = resp.extra_data.reasoning_steps

                if len(reasoning_steps) > 0 and show_reasoning:
                    for i, step in enumerate(reasoning_steps, 1):
                        step_content = f"{step.title}\n{step.action or ''}"
                        if show_full_reasoning:
                            step_content += "\n"
                            if step.result:
                                step_content += f"\nResult: {step.result}"
                            if step.reasoning:
                                step_content += f"\nReasoning: {step.reasoning}"
                            if step.confidence is not None:
                                step_content += f"\nConfidence: {step.confidence}"
                        if return_generator:
                            yield f"Reasoning step {i}: {step_content}\n"
                        else:
                            print(f"Reasoning step {i}: {step_content}")

        if return_generator:
            return stream_generator()
        else:
            for _ in stream_generator():
                pass
            response_timer.stop()
    else:
        response_timer = Timer()
        response_timer.start()

        if message and show_message and not return_generator:
            message_content = get_text_from_message(message)
            print(f"Message: {message_content}")

        run_response = self.run(message=message, messages=messages, stream=False, **kwargs)
        response_timer.stop()

        reasoning_steps = []
        if (
            isinstance(run_response, RunResponse)
            and run_response.extra_data is not None
            and run_response.extra_data.reasoning_steps is not None
        ):
            reasoning_steps = run_response.extra_data.reasoning_steps

        def batch_generator():
            if message and show_message and return_generator:
                message_content = get_text_from_message(message)
                yield f"Message: {message_content}\n"
                
            if len(reasoning_steps) > 0 and show_reasoning:
                for i, step in enumerate(reasoning_steps, 1):
                    step_content = f"{step.title}\n{step.action or ''}"
                    if show_full_reasoning:
                        step_content += "\n"
                        if step.result:
                            step_content += f"\nResult: {step.result}"
                        if step.reasoning:
                            step_content += f"\nReasoning: {step.reasoning}"
                        if step.confidence is not None:
                            step_content += f"\nConfidence: {step.confidence}"
                    yield f"Reasoning step {i}: {step_content}\n"

            response_content_batch: Union[str, str] = ""
            if isinstance(run_response, RunResponse):
                if isinstance(run_response.content, str):
                    response_content_batch = (
                        run_response.content
                        if self.markdown
                        else run_response.get_content_as_string(indent=4)
                    )
                elif self.response_model is not None and isinstance(run_response.content, BaseModel):
                    try:
                        response_content_batch = json.dumps(run_response.content.model_dump(exclude_none=True), indent=2)
                    except Exception as e:
                        logger.warning(f"Failed to convert response to JSON: {e}")
                else:
                    try:
                        response_content_batch = json.dumps(run_response.content, indent=4)
                    except Exception as e:
                        logger.warning(f"Failed to convert response to JSON: {e}")

            yield f"Response ({response_timer.elapsed:.1f}s): {response_content_batch}"

        if return_generator:
            return batch_generator()
        else:
            if len(reasoning_steps) > 0 and show_reasoning:
                for i, step in enumerate(reasoning_steps, 1):
                    step_content = f"{step.title}\n{step.action or ''}"
                    if show_full_reasoning:
                        step_content += "\n"
                        if step.result:
                            step_content += f"\nResult: {step.result}"
                        if step.reasoning:
                            step_content += f"\nReasoning: {step.reasoning}"
                        if step.confidence is not None:
                            step_content += f"\nConfidence: {step.confidence}"
                    print(f"Reasoning step {i}: {step_content}")

            response_content_batch: Union[str, str] = ""
            if isinstance(run_response, RunResponse):
                if isinstance(run_response.content, str):
                    response_content_batch = (
                        run_response.content
                        if self.markdown
                        else run_response.get_content_as_string(indent=4)
                    )
                elif self.response_model is not None and isinstance(run_response.content, BaseModel):
                    try:
                        response_content_batch = json.dumps(run_response.content.model_dump(exclude_none=True), indent=2)
                    except Exception as e:
                        logger.warning(f"Failed to convert response to JSON: {e}")
                else:
                    try:
                        response_content_batch = json.dumps(run_response.content, indent=4)
                    except Exception as e:
                        logger.warning(f"Failed to convert response to JSON: {e}")

            print(f"Response ({response_timer.elapsed:.1f}s): {response_content_batch}")
    
    return None


def cli_app(
    self: "Agent",
    message: Optional[str] = None,
    user: str = "User",
    emoji: str = ":sunglasses:",
    stream: bool = False,
    markdown: bool = False,
    exit_on: Optional[List[str]] = None,
    **kwargs: Any,
) -> None:

    if message:
        response(self=self, message=message, stream=stream, markdown=markdown, **kwargs)

    _exit_on = exit_on or ["exit", "quit", "bye"]
    while True:
        message = input(f" {emoji} {user} ")
        if message in _exit_on:
            break

        response(self=self, message=message, stream=stream, markdown=markdown, **kwargs)