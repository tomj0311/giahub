from __future__ import annotations

import json
from uuid import uuid4
from collections import defaultdict, deque
from typing import (
    Any,
    AsyncIterator,
    cast,
    Dict,
    Iterator,
    List,
    Literal,
    Optional,
    overload,
    Sequence,
    Tuple,
    Union,
)

from pydantic import BaseModel, ValidationError

from ai.model.message import Message
from ai.model.response import ModelResponse, ModelResponseEvent
from ai.run.response import RunResponse, RunEvent, RunResponseExtraData
from ai.utils.log import logger
from ai.utils.timer import Timer
from ai.model.base import Model
from ai.memory.agent import AgentRun

def _aggregate_metrics_from_run_messages(self: "Agent", messages: List[Message]) -> Dict[str, Any]:
    aggregated_metrics: Dict[str, Any] = defaultdict(list)

    # Use a defaultdict(list) to collect all values for each assistant message
    logger.debug(f"[METRICS_DEBUG] Aggregating metrics from {len(messages)} messages")
    for m in messages:
        logger.debug(f"[METRICS_DEBUG] Message role: {m.role}, has metrics: {m.metrics is not None}")
        if m.role == "assistant" and m.metrics is not None:
            logger.debug(f"[METRICS_DEBUG] Assistant message metrics: {m.metrics}")
            for k, v in m.metrics.items():
                logger.debug(f"[METRICS_DEBUG] Adding metric {k}={v} to aggregated_metrics")
                aggregated_metrics[k].append(v)
    
    logger.debug(f"[METRICS_DEBUG] Final aggregated metrics: {dict(aggregated_metrics)}")
    return aggregated_metrics


def generic_run_response(
    self: "Agent", content: Optional[str] = None, event: RunEvent = RunEvent.run_response
) -> RunResponse:
    return RunResponse(
        run_id=self.run_id,
        session_id=self.session_id,
        agent_id=self.agent_id,
        content=content,
        tools=self.run_response.tools,
        audio=self.run_response.audio,
        images=self.run_response.images,
        videos=self.run_response.videos,
        response_audio=self.run_response.response_audio,
        model=self.run_response.model,
        messages=self.run_response.messages,
        extra_data=self.run_response.extra_data,
        event=event.value,
    )

def reason(
    self: "Agent",
    system_message: Optional[Message], 
    user_messages: List[Message],
    messages_for_model: List[Message],
    stream_intermediate_steps: bool = False,
) -> Iterator[RunResponse]:
    """Perform reasoning on the task step by step."""
    logger.debug("Performing reasoning step by step")
    # For now, yield nothing - just a placeholder implementation
    if stream_intermediate_steps:
        yield self.generic_run_response("Starting reasoning process", RunEvent.reasoning_step)
    return

async def areason(
    self: "Agent",
    system_message: Optional[Message], 
    user_messages: List[Message],
    messages_for_model: List[Message],
    stream_intermediate_steps: bool = False,
) -> AsyncIterator[RunResponse]:
    """Perform reasoning on the task step by step (async version)."""
    logger.debug("Performing async reasoning step by step")
    # For now, yield nothing - just a placeholder implementation
    if stream_intermediate_steps:
        yield self.generic_run_response("Starting reasoning process", RunEvent.reasoning_step)
    return

def _run(
    self: "Agent",
    message: Optional[Union[str, List, Dict, Message]] = None,
    *,
    stream: bool = False,
    audio: Optional[Any] = None,
    images: Optional[Sequence[Any]] = None,
    videos: Optional[Sequence[Any]] = None,
    messages: Optional[Sequence[Union[Dict, Message]]] = None,
    stream_intermediate_steps: bool = False,
    **kwargs: Any,
) -> Iterator[RunResponse]:
    # Check if streaming is enabled
    self.stream = stream and self.is_streamable
    # Check if streaming intermediate steps is enabled
    self.stream_intermediate_steps = stream_intermediate_steps and self.stream
    # Create the run_response object
    self.run_id = str(uuid4())
    self.run_response = RunResponse(run_id=self.run_id, session_id=self.session_id, agent_id=self.agent_id)

    logger.debug(f"*********** Agent Run Start: {self.run_response.run_id} ***********")

    # 1. Setup: Update the model class and resolve context
    self.update_model()
    self.run_response.model = self.model.id if self.model is not None else None
    if self.context is not None and self.resolve_context:
        self._resolve_context()

    # 2. Read existing session from storage
    self.read_from_storage()

    # 3. Prepare messages for this run
    system_message, user_messages, messages_for_model = self.get_messages_for_run(
        message=message, audio=audio, images=images, videos=videos, messages=messages, **kwargs
    )

    # 4. Reason about the task if reasoning is enabled
    if self.reasoning:
        reason_generator = reason(
            self,
            system_message=system_message,
            user_messages=user_messages,
            messages_for_model=messages_for_model,
            stream_intermediate_steps=self.stream_intermediate_steps,
        )

        if self.stream:
            yield from reason_generator
        else:
            # Consume the generator without yielding
            deque(reason_generator, maxlen=0)

    # Get the number of messages in messages_for_model that form the input for this run
    # We track these to skip when updating memory
    num_input_messages = len(messages_for_model)

    # Yield a RunStarted event
    if self.stream_intermediate_steps:
        yield self.generic_run_response("Run started", RunEvent.run_started)

    # 5. Generate a response from the Model (includes running function calls)
    model_response: ModelResponse
    self.model = cast(Model, self.model)
    if self.stream:
        model_response = ModelResponse(content="")
        for model_response_chunk in self.model.response_stream(messages=messages_for_model):
            # Handle content chunks
            if model_response_chunk.event == ModelResponseEvent.assistant_response.value:
                if model_response_chunk.content is not None and model_response.content is not None:
                    model_response.content += model_response_chunk.content
                    self.run_response.content = model_response_chunk.content
                    self.run_response.created_at = model_response_chunk.created_at
                    yield self.run_response
                
                # Handle audio chunks (content may be None for audio-only chunks)
                if model_response_chunk.audio is not None:
                    if self.run_response.audio is None:
                        self.run_response.audio = []
                        logger.info(f"🎵 [AGENT] Audio streaming started")
                    self.run_response.audio.append(model_response_chunk.audio)
                    self.run_response.response_audio = model_response_chunk.audio
                    # Yield the response with audio data even if there's no content
                    yield self.run_response

            elif model_response_chunk.event == ModelResponseEvent.tool_call_started.value:
                # Add tool call to the run_response
                tool_call_dict = model_response_chunk.tool_call
                if tool_call_dict is not None:
                    if self.run_response.tools is None:
                        self.run_response.tools = []
                    self.run_response.tools.append(tool_call_dict)
                if self.stream_intermediate_steps:
                    yield self.generic_run_response(
                        content=model_response_chunk.content,
                        event=RunEvent.tool_call_started,
                    )
            elif model_response_chunk.event == ModelResponseEvent.tool_call_completed.value:
                # Update the existing tool call in the run_response
                tool_call_dict = model_response_chunk.tool_call
                if tool_call_dict is not None and self.run_response.tools:
                    tool_call_id_to_update = tool_call_dict["tool_call_id"]
                    # Use a dictionary comprehension to create a mapping of tool_call_id to index
                    tool_call_index_map = {tc["tool_call_id"]: i for i, tc in enumerate(self.run_response.tools)}
                    # Update the tool call if it exists
                    if tool_call_id_to_update in tool_call_index_map:
                        self.run_response.tools[tool_call_index_map[tool_call_id_to_update]] = tool_call_dict
                if self.stream_intermediate_steps:
                    yield self.generic_run_response(
                        content=model_response_chunk.content,
                        event=RunEvent.tool_call_completed,
                    )
    else:
        model_response = self.model.response(messages=messages_for_model)
        # Handle structured outputs
        if self.response_model is not None and self.structured_outputs and model_response.parsed is not None:
            self.run_response.content = model_response.parsed
            self.run_response.content_type = self.response_model.__name__
        else:
            self.run_response.content = model_response.content
        if model_response.audio is not None:
            self.run_response.response_audio = model_response.audio
        self.run_response.messages = messages_for_model
        self.run_response.created_at = model_response.created_at

    # Build a list of messages that belong to this particular run
    run_messages = user_messages + messages_for_model[num_input_messages:]
    if system_message is not None:
        run_messages.insert(0, system_message)
    # Update the run_response
    self.run_response.messages = run_messages
    self.run_response.metrics = self._aggregate_metrics_from_run_messages(run_messages)
    # Update the run_response content if streaming as run_response will only contain the last chunk
    if self.stream:
        self.run_response.content = model_response.content
        if model_response.audio is not None:
            self.run_response.response_audio = model_response.audio

    # 6. Update Memory
    if self.stream_intermediate_steps:
        yield self.generic_run_response(
            content="Updating memory",
            event=RunEvent.updating_memory,
        )

    # Add the system message to the memory
    if system_message is not None:
        self.memory.add_system_message(system_message, system_message_role=self.system_message_role)
    # Add the user messages and model response messages to memory
    self.memory.add_messages(messages=(user_messages + messages_for_model[num_input_messages:]))

    # Create an AgentRun object to add to memory
    agent_run = AgentRun(response=self.run_response)
    if message is not None:
        user_message_for_memory: Optional[Message] = None
        if isinstance(message, str):
            user_message_for_memory = Message(role=self.user_message_role, content=message)
        elif isinstance(message, Message):
            user_message_for_memory = message
        if user_message_for_memory is not None:
            agent_run.message = user_message_for_memory
            # Update the memories with the user message if needed
            if self.memory.create_user_memories and self.memory.update_user_memories_after_run:
                self.memory.update_memory(input=user_message_for_memory.get_content_string())
    elif messages is not None and len(messages) > 0:
        for _m in messages:
            _um = None
            if isinstance(_m, Message):
                _um = _m
            elif isinstance(_m, dict):
                try:
                    _um = Message.model_validate(_m)
                except Exception as e:
                    logger.warning(f"Failed to validate message: {e}")
            else:
                logger.warning(f"Unsupported message type: {type(_m)}")
                continue
            if _um:
                if agent_run.messages is None:
                    agent_run.messages = []
                agent_run.messages.append(_um)
                if self.memory.create_user_memories and self.memory.update_user_memories_after_run:
                    self.memory.update_memory(input=_um.get_content_string())
            else:
                logger.warning("Unable to add message to memory")
    # Add AgentRun to memory
    self.memory.add_run(agent_run)

    # Update the session summary if needed
    if self.memory.create_session_summary and self.memory.update_session_summary_after_run:
        self.memory.update_summary()

    # 7. Save session to storage
    self.write_to_storage()

    # 8. Save output to file if save_response_to_file is set
    self.save_run_response_to_file(message=message)

    # 9. Set the run_input
    if message is not None:
        if isinstance(message, str):
            self.run_input = message
        elif isinstance(message, Message):
            self.run_input = message.to_dict()
        else:
            self.run_input = message
    elif messages is not None:
        self.run_input = [m.to_dict() if isinstance(m, Message) else m for m in messages]

    # Log Agent Run
    self.log_agent_run()

    logger.debug(f"*********** Agent Run End: {self.run_response.run_id} ***********")
    if self.stream_intermediate_steps:
        yield self.generic_run_response(
            content=self.run_response.content,
            event=RunEvent.run_completed,
        )

    # -*- Yield final response if not streaming so that run() can get the response
    if not self.stream:
        yield self.run_response


@overload
def run(
    self: "Agent",
    message: Optional[Union[str, List, Dict, Message]] = None,
    *,
    stream: Literal[False] = False,
    audio: Optional[Any] = None,
    images: Optional[Sequence[Any]] = None,
    videos: Optional[Sequence[Any]] = None,
    messages: Optional[Sequence[Union[Dict, Message]]] = None,
    **kwargs: Any,
) -> RunResponse: ...


@overload
def run(
    self: "Agent",
    message: Optional[Union[str, List, Dict, Message]] = None,
    *,
    stream: Literal[True] = True,
    audio: Optional[Any] = None,
    images: Optional[Sequence[Any]] = None,
    videos: Optional[Sequence[Any]] = None,
    messages: Optional[Sequence[Union[Dict, Message]]] = None,
    stream_intermediate_steps: bool = False,
    **kwargs: Any,
) -> Iterator[RunResponse]: ...


def run(
    self: "Agent",
    message: Optional[Union[str, List, Dict, Message]] = None,
    *,
    stream: bool = False,
    audio: Optional[Any] = None,
    images: Optional[Sequence[Any]] = None,
    videos: Optional[Sequence[Any]] = None,
    messages: Optional[Sequence[Union[Dict, Message]]] = None,
    stream_intermediate_steps: bool = False,
    **kwargs: Any,
) -> Union[RunResponse, Iterator[RunResponse]]:
    """Run the Agent with a message and return the response."""

    # If a response_model is set, return the response as a structured output
    if self.response_model is not None and self.parse_response:
        # Set stream=False and run the agent
        logger.debug("Setting stream=False as response_model is set")
        run_response: RunResponse = next(
            self._run(
                message=message,
                stream=False,
                audio=audio,
                images=images,
                videos=videos,
                messages=messages,
                stream_intermediate_steps=stream_intermediate_steps,
                **kwargs,
            )
        )

        # If the model natively supports structured outputs, the content is already in the structured format
        if self.structured_outputs:
            # Do a final check confirming the content is in the response_model format
            if isinstance(run_response.content, self.response_model):
                return run_response

        # Otherwise convert the response to the structured format
        if isinstance(run_response.content, str):
            try:
                structured_output = None
                try:
                    structured_output = self.response_model.model_validate_json(run_response.content)
                except ValidationError as exc:
                    logger.warning(f"Failed to convert response to pydantic model: {exc}")
                    # Check if response starts with ```json
                    if run_response.content.startswith("```json"):
                        run_response.content = run_response.content.replace("```json\n", "").replace("\n```", "")
                        try:
                            structured_output = self.response_model.model_validate_json(run_response.content)
                        except ValidationError as exc:
                            logger.warning(f"Failed to convert response to pydantic model: {exc}")

                # -*- Update Agent response
                if structured_output is not None:
                    run_response.content = structured_output
                    run_response.content_type = self.response_model.__name__
                    if self.run_response is not None:
                        self.run_response.content = structured_output
                        self.run_response.content_type = self.response_model.__name__
                else:
                    logger.warning("Failed to convert response to response_model")
            except Exception as e:
                logger.warning(f"Failed to convert response to output model: {e}")
        else:
            logger.warning("Something went wrong. Run response content is not a string")
        return run_response
    else:
        if stream and self.is_streamable:
            resp = self._run(
                message=message,
                stream=True,
                audio=audio,
                images=images,
                videos=videos,
                messages=messages,
                stream_intermediate_steps=stream_intermediate_steps,
                **kwargs,
            )
            return resp
        else:
            resp = self._run(
                message=message,
                stream=False,
                audio=audio,
                images=images,
                videos=videos,
                messages=messages,
                stream_intermediate_steps=stream_intermediate_steps,
                **kwargs,
            )
            return next(resp)


async def _arun(
    self: "Agent",
    message: Optional[Union[str, List, Dict, Message]] = None,
    *,
    stream: bool = False,
    audio: Optional[Any] = None,
    images: Optional[Sequence[Any]] = None,
    videos: Optional[Sequence[Any]] = None,
    messages: Optional[Sequence[Union[Dict, Message]]] = None,
    stream_intermediate_steps: bool = False,
    **kwargs: Any,
) -> AsyncIterator[RunResponse]:
    """Async Run the Agent with a message and return the response.

    Steps:
    1. Update the Model (set defaults, add tools, etc.)
    2. Read existing session from storage
    3. Prepare messages for this run
    4. Reason about the task if reasoning is enabled
    5. Generate a response from the Model (includes running function calls)
    6. Update Memory
    7. Save session to storage
    8. Save output to file if save_output_to_file is set
    """
    # Check if streaming is enabled
    self.stream = stream and self.is_streamable
    # Check if streaming intermediate steps is enabled
    self.stream_intermediate_steps = stream_intermediate_steps and self.stream
    # Create the run_response object
    self.run_id = str(uuid4())
    self.run_response = RunResponse(run_id=self.run_id, session_id=self.session_id, agent_id=self.agent_id)

    logger.debug(f"*********** Async Agent Run Start: {self.run_response.run_id} ***********")

    # 1. Update the Model (set defaults, add tools, etc.)
    self.update_model()
    self.run_response.model = self.model.id if self.model is not None else None

    # 2. Read existing session from storage
    self.read_from_storage()

    # 3. Prepare messages for this run
    system_message, user_messages, messages_for_model = self.get_messages_for_run(
        message=message, audio=audio, images=images, videos=videos, messages=messages, **kwargs
    )

    # 4. Reason about the task if reasoning is enabled
    if self.reasoning:
        areason_generator = areason(
            self,
            system_message=system_message,
            user_messages=user_messages,
            messages_for_model=messages_for_model,
            stream_intermediate_steps=self.stream_intermediate_steps,
        )

        if self.stream:
            async for item in areason_generator:
                yield item
        else:
            # Consume the generator without yielding
            async for _ in areason_generator:
                pass

    # Get the number of messages in messages_for_model that form the input for this run
    # We track these to skip when updating memory
    num_input_messages = len(messages_for_model)

    # Yield a RunStarted event
    if self.stream_intermediate_steps:
        yield self.generic_run_response("Run started", RunEvent.run_started)

    # 5. Generate a response from the Model (includes running function calls)
    model_response: ModelResponse
    self.model = cast(Model, self.model)
    if stream and self.is_streamable:
        model_response = ModelResponse(content="")
        if hasattr(self.model, "aresponse_stream"):
            model_response_stream = self.model.aresponse_stream(messages=messages_for_model)
        else:
            raise NotImplementedError(f"{self.model.id} does not support streaming")
        async for model_response_chunk in model_response_stream:  # type: ignore
            if model_response_chunk.event == ModelResponseEvent.assistant_response.value:
                if model_response_chunk.content is not None and model_response.content is not None:
                    model_response.content += model_response_chunk.content
                    self.run_response.content = model_response_chunk.content
                    self.run_response.created_at = model_response_chunk.created_at
                    yield self.run_response
            elif model_response_chunk.event == ModelResponseEvent.tool_call_started.value:
                # Add tool call to the run_response
                tool_call_dict = model_response_chunk.tool_call
                if tool_call_dict is not None:
                    if self.run_response.tools is None:
                        self.run_response.tools = []
                    self.run_response.tools.append(tool_call_dict)
                if self.stream_intermediate_steps:
                    yield self.generic_run_response(
                        content=model_response_chunk.content,
                        event=RunEvent.tool_call_started,
                    )
            elif model_response_chunk.event == ModelResponseEvent.tool_call_completed.value:
                # Update the existing tool call in the run_response
                tool_call_dict = model_response_chunk.tool_call
                if tool_call_dict is not None and self.run_response.tools:
                    tool_call_id = tool_call_dict["tool_call_id"]
                    # Use a dictionary comprehension to create a mapping of tool_call_id to index
                    tool_call_index_map = {tc["tool_call_id"]: i for i, tc in enumerate(self.run_response.tools)}
                    # Update the tool call if it exists
                    if tool_call_id in tool_call_index_map:
                        self.run_response.tools[tool_call_index_map[tool_call_id]] = tool_call_dict
                if self.stream_intermediate_steps:
                    yield self.generic_run_response(
                        content=model_response_chunk.content,
                        event=RunEvent.tool_call_completed,
                    )
    else:
        model_response = await self.model.aresponse(messages=messages_for_model)
        # Handle structured outputs
        if self.response_model is not None and self.structured_outputs and model_response.parsed is not None:
            self.run_response.content = model_response.parsed
            self.run_response.content_type = self.response_model.__name__
        else:
            self.run_response.content = model_response.content
        self.run_response.messages = messages_for_model
        self.run_response.created_at = model_response.created_at

    # Build a list of messages that belong to this particular run
    run_messages = user_messages + messages_for_model[num_input_messages:]
    if system_message is not None:
        run_messages.insert(0, system_message)
    # Update the run_response
    self.run_response.messages = run_messages
    self.run_response.metrics = self._aggregate_metrics_from_run_messages(run_messages)
    # Update the run_response content if streaming as run_response will only contain the last chunk
    if self.stream:
        self.run_response.content = model_response.content
        if model_response.audio is not None:
            self.run_response.response_audio = model_response.audio

    # 6. Update Memory
    if self.stream_intermediate_steps:
        yield self.generic_run_response(
            content="Updating memory",
            event=RunEvent.updating_memory,
        )

    # Add the system message to the memory
    if system_message is not None:
        self.memory.add_system_message(system_message, system_message_role=self.system_message_role)
    # Add the user messages and model response messages to memory
    self.memory.add_messages(messages=(user_messages + messages_for_model[num_input_messages:]))

    # Create an AgentRun object to add to memory
    agent_run = AgentRun(response=self.run_response)
    if message is not None:
        user_message_for_memory: Optional[Message] = None
        if isinstance(message, str):
            user_message_for_memory = Message(role=self.user_message_role, content=message)
        elif isinstance(message, Message):
            user_message_for_memory = message
        if user_message_for_memory is not None:
            agent_run.message = user_message_for_memory
            # Update the memories with the user message if needed
            if self.memory.create_user_memories and self.memory.update_user_memories_after_run:
                await self.memory.aupdate_memory(input=user_message_for_memory.get_content_string())
    elif messages is not None and len(messages) > 0:
        for _m in messages:
            _um = None
            if isinstance(_m, Message):
                _um = _m
            elif isinstance(_m, dict):
                try:
                    _um = Message.model_validate(_m)
                except Exception as e:
                    logger.warning(f"Failed to validate message: {e}")
            else:
                logger.warning(f"Unsupported message type: {type(_m)}")
                continue
            if _um:
                if agent_run.messages is None:
                    agent_run.messages = []
                agent_run.messages.append(_um)
                if self.memory.create_user_memories and self.memory.update_user_memories_after_run:
                    await self.memory.aupdate_memory(input=_um.get_content_string())
            else:
                logger.warning("Unable to add message to memory")
    # Add AgentRun to memory
    self.memory.add_run(agent_run)

    # Update the session summary if needed
    if self.memory.create_session_summary and self.memory.update_session_summary_after_run:
        await self.memory.aupdate_summary()

    # 7. Save session to storage
    self.write_to_storage()

    # 8. Save output to file if save_response_to_file is set
    self.save_run_response_to_file(message=message)

    # 9. Set the run_input
    if message is not None:
        if isinstance(message, str):
            self.run_input = message
        elif isinstance(message, Message):
            self.run_input = message.to_dict()
        else:
            self.run_input = message
    elif messages is not None:
        self.run_input = [m.to_dict() if isinstance(m, Message) else m for m in messages]

    # Log Agent Run
    await self.alog_agent_run()

    logger.debug(f"*********** Async Agent Run End: {self.run_response.run_id} ***********")
    if self.stream_intermediate_steps:
        yield self.generic_run_response(
            content=self.run_response.content,
            event=RunEvent.run_completed,
        )

    # -*- Yield final response if not streaming so that run() can get the response
    if not self.stream:
        yield self.run_response


async def arun(
    self: "Agent",
    message: Optional[Union[str, List, Dict, Message]] = None,
    *,
    stream: bool = False,
    audio: Optional[Any] = None,
    images: Optional[Sequence[Any]] = None,
    videos: Optional[Sequence[Any]] = None,
    messages: Optional[Sequence[Union[Dict, Message]]] = None,
    stream_intermediate_steps: bool = False,
    **kwargs: Any,
) -> Any:
    """Async Run the Agent with a message and return the response."""

    # If a response_model is set, return the response as a structured output
    if self.response_model is not None and self.parse_response:
        # Set stream=False and run the agent
        logger.debug("Setting stream=False as response_model is set")
        run_response = await self._arun(
            message=message,
            stream=False,
            audio=audio,
            images=images,
            videos=videos,
            messages=messages,
            stream_intermediate_steps=stream_intermediate_steps,
            **kwargs,
        ).__anext__()

        # If the model natively supports structured outputs, the content is already in the structured format
        if self.structured_outputs:
            # Do a final check confirming the content is in the response_model format
            if isinstance(run_response.content, self.response_model):
                return run_response

        # Otherwise convert the response to the structured format
        if isinstance(run_response.content, str):
            try:
                structured_output = None
                try:
                    structured_output = self.response_model.model_validate_json(run_response.content)
                except ValidationError as exc:
                    logger.warning(f"Failed to convert response to pydantic model: {exc}")
                    # Check if response starts with ```json
                    if run_response.content.startswith("```json"):
                        run_response.content = run_response.content.replace("```json\n", "").replace("\n```", "")
                        try:
                            structured_output = self.response_model.model_validate_json(run_response.content)
                        except ValidationError as exc:
                            logger.warning(f"Failed to convert response to pydantic model: {exc}")

                # -*- Update Agent response
                if structured_output is not None:
                    run_response.content = structured_output
                    run_response.content_type = self.response_model.__name__
                    if self.run_response is not None:
                        self.run_response.content = structured_output
                        self.run_response.content_type = self.response_model.__name__
            except Exception as e:
                logger.warning(f"Failed to convert response to output model: {e}")
        else:
            logger.warning("Something went wrong. Run response content is not a string")
        return run_response
    else:
        if stream and self.is_streamable:
            resp = self._arun(
                message=message,
                stream=True,
                audio=audio,
                images=images,
                videos=videos,
                messages=messages,
                stream_intermediate_steps=stream_intermediate_steps,
                **kwargs,
            )
            return resp
        else:
            resp = self._arun(
                message=message,
                stream=False,
                audio=audio,
                images=images,
                videos=videos,
                messages=messages,
                stream_intermediate_steps=stream_intermediate_steps,
                **kwargs,
            )
            return await resp.__anext__()