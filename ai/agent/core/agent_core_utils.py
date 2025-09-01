from __future__ import annotations

import json
from copy import copy, deepcopy
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Type, Union, Callable

from pydantic import BaseModel

from ai.agent.core.tools import get_tools, get_transfer_prompt, get_transfer_function
from ai.agent.core.messages import get_system_message, get_user_message
from ai.model.content import Image, Video, Audio
from ai.model.message import Message
from ai.storage.agent.base import AgentStorage
from ai.run.response import RunResponse, RunResponseExtraData
from ai.utils.log import logger
from ai.tools import Tool, Toolkit, Function


def deep_copy_field(field_name: str, field_value: Any) -> Any:
    if field_name in ("memory", "model"):
        return field_value.deep_copy()

    if isinstance(field_value, (list, dict, set, AgentStorage)):
        try:
            return deepcopy(field_value)
        except Exception as e:
            logger.warning(f"Failed to deepcopy field: {field_name} - {e}")
            try:
                return copy(field_value)
            except Exception as e:
                logger.warning(f"Failed to copy field: {field_name} - {e}")
                return field_value

    if isinstance(field_value, BaseModel):
        try:
            return field_value.model_copy(deep=True)
        except Exception as e:
            logger.warning(f"Failed to deepcopy field: {field_name} - {e}")
            try:
                return field_value.model_copy(deep=False)
            except Exception as e:
                logger.warning(f"Failed to copy field: {field_name} - {e}")
                return field_value

    return field_value


def get_agent_data(agent) -> Dict[str, Any]:
    agent_data = agent.agent_data or {}
    if agent.name is not None:
        agent_data["name"] = agent.name
    if agent.model is not None:
        agent_data["model"] = agent.model.to_dict()
    if agent.images is not None:
        agent_data["images"] = [img if isinstance(img, dict) else img.model_dump() for img in agent.images]
    if agent.videos is not None:
        agent_data["videos"] = [vid if isinstance(vid, dict) else vid.model_dump() for vid in agent.videos]
    if agent.audio is not None:
        agent_data["audio"] = [aud if isinstance(aud, dict) else aud.model_dump() for aud in agent.audio]
    return agent_data


def get_session_data(agent) -> Dict[str, Any]:
    session_data = agent.session_data or {}
    if agent.session_name is not None:
        session_data["session_name"] = agent.session_name
    if len(agent.session_state) > 0:
        session_data["session_state"] = agent.session_state
    return session_data


def get_chat_history(agent, num_chats: Optional[int] = None) -> str:
    history: List[Dict[str, Any]] = []
    all_chats = agent.memory.get_message_pairs()
    if len(all_chats) == 0:
        return ""

    chats_added = 0
    for chat in all_chats[::-1]:
        history.insert(0, chat[1].to_dict())
        history.insert(0, chat[0].to_dict())
        chats_added += 1
        if num_chats is not None and chats_added >= num_chats:
            break
    return json.dumps(history)


def get_tool_call_history(agent, num_calls: int = 3) -> str:
    tool_calls = agent.memory.get_tool_calls(num_calls)
    if len(tool_calls) == 0:
        return ""
    logger.debug(f"tool_calls: {tool_calls}")
    return json.dumps(tool_calls)


def update_memory(agent, task: str) -> str:
    try:
        return agent.memory.update_memory(input=task, force=True) or "Memory updated successfully"
    except Exception as e:
        return f"Failed to update memory: {e}"


def update_model(agent) -> None:
    if agent.model is None:
        try:
            from ai.model.openai import OpenAIChat
        except ModuleNotFoundError as e:
            logger.exception(e)
            logger.error(
                "merlin uses `openai` as the default model provider. "
                "Please provide a `model` or install `openai`."
            )
            exit(1)
        agent.model = OpenAIChat()

    if agent.response_model is not None and agent.model.response_format is None:
        if agent.structured_outputs and agent.model.supports_structured_outputs:
            logger.debug("Setting Model.response_format to Agent.response_model")
            agent.model.response_format = agent.response_model
            agent.model.structured_outputs = True
        else:
            agent.model.response_format = {"type": "json_object"}

    agent_tools = get_tools(agent)
    if agent_tools is not None:
        for tool in agent_tools:
            if (
                agent.response_model is not None
                and agent.structured_outputs
                and agent.model.supports_structured_outputs
            ):
                agent.model.add_tool(tool=tool, strict=True, agent=agent)
            else:
                agent.model.add_tool(tool=tool, agent=agent)

    if agent.model.show_tool_calls is None and agent.show_tool_calls is not None:
        agent.model.show_tool_calls = agent.show_tool_calls

    if agent.model.tool_choice is None and agent.tool_choice is not None:
        agent.model.tool_choice = agent.tool_choice

    if agent.tool_call_limit is not None:
        agent.model.tool_call_limit = agent.tool_call_limit

    if agent.session_id is not None:
        agent.model.session_id = agent.session_id


def save_run_response_to_file(agent, message: Optional[Union[str, List, Dict, Message]] = None) -> None:
    if agent.save_response_to_file is not None and agent.run_response is not None:
        message_str = None
        if message is not None:
            if isinstance(message, str):
                message_str = message
            else:
                logger.warning("Did not use message in output file name: message is not a string")
        try:
            fn = agent.save_response_to_file.format(
                name=agent.name, session_id=agent.session_id, user_id=agent.user_id, message=message_str
            )
            fn_path = Path(fn)
            if not fn_path.parent.exists():
                fn_path.parent.mkdir(parents=True, exist_ok=True)
            if isinstance(agent.run_response.content, str):
                fn_path.write_text(agent.run_response.content)
            else:
                fn_path.write_text(json.dumps(agent.run_response.content, indent=2))
        except Exception as e:
            logger.warning(f"Failed to save output to file: {e}")


def aggregate_metrics_from_run_messages(messages: List[Message]) -> Dict[str, Any]:
    from collections import defaultdict
    
    aggregated_metrics: Dict[str, Any] = defaultdict(list)

    for m in messages:
        if m.role == "assistant" and m.metrics is not None:
            for k, v in m.metrics.items():
                aggregated_metrics[k].append(v)
    return aggregated_metrics


def get_messages_for_run(
    agent,
    *,
    message: Optional[Union[str, List, Dict, Message]] = None,
    audio: Optional[Any] = None,
    images: Optional[Sequence[Any]] = None,
    videos: Optional[Sequence[Any]] = None,
    messages: Optional[Sequence[Union[Dict, Message]]] = None,
    **kwargs: Any,
) -> tuple[Optional[Message], List[Message], List[Message]]:
    messages_for_model: List[Message] = []

    system_message = get_system_message(agent)
    if system_message is not None:
        messages_for_model.append(system_message)

    if agent.add_messages is not None:
        _add_messages: List[Message] = []
        for _m in agent.add_messages:
            if isinstance(_m, Message):
                _add_messages.append(_m)
                messages_for_model.append(_m)
            elif isinstance(_m, dict):
                try:
                    _m_parsed = Message.model_validate(_m)
                    _add_messages.append(_m_parsed)
                    messages_for_model.append(_m_parsed)
                except Exception as e:
                    logger.warning(f"Failed to validate message: {e}")
        if len(_add_messages) > 0:
            logger.debug(f"Adding {len(_add_messages)} extra messages")
            if agent.run_response.extra_data is None:
                agent.run_response.extra_data = RunResponseExtraData(add_messages=_add_messages)
            else:
                if agent.run_response.extra_data.add_messages is None:
                    agent.run_response.extra_data.add_messages = _add_messages
                else:
                    agent.run_response.extra_data.extend(_add_messages)

    if agent.add_history_to_messages:
        history: List[Message] = agent.memory.get_messages_from_last_n_runs(
            last_n=agent.num_history_responses, skip_role=agent.system_message_role
        )
        if len(history) > 0:
            logger.debug(f"Adding {len(history)} messages from history")
            if agent.run_response.extra_data is None:
                agent.run_response.extra_data = RunResponseExtraData(history=history)
            else:
                if agent.run_response.extra_data.history is None:
                    agent.run_response.extra_data.history = history
                else:
                    agent.run_response.extra_data.history.extend(history)
            messages_for_model += history

    user_messages: List[Message] = []
    if message is not None:
        if isinstance(message, Message):
            user_messages.append(message)
        elif isinstance(message, str) or isinstance(message, list):
            user_message: Optional[Message] = get_user_message(
                agent, message=message, audio=audio, images=images, videos=videos, **kwargs
            )
            if user_message is not None:
                user_messages.append(user_message)
        elif isinstance(message, dict):
            try:
                user_messages.append(Message.model_validate(message))
            except Exception as e:
                logger.warning(f"Failed to validate message: {e}")
        else:
            logger.warning(f"Invalid message type: {type(message)}")
    elif messages is not None and len(messages) > 0:
        for _m in messages:
            if isinstance(_m, Message):
                user_messages.append(_m)
            elif isinstance(_m, dict):
                try:
                    user_messages.append(Message.model_validate(_m))
                except Exception as e:
                    logger.warning(f"Failed to validate message: {e}")
    messages_for_model.extend(user_messages)
    agent.run_response.messages = messages_for_model

    return system_message, user_messages, messages_for_model
