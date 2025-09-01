from __future__ import annotations

import json
from pathlib import Path
from uuid import uuid4
from os import getenv
from typing import (
    Any,
    Callable,
    Dict,
    List,
    Literal,
    Optional,
    Sequence,
    Tuple,
    Type,
    Union,
    Iterator,
    overload,
)
from collections import defaultdict

from pydantic import BaseModel, ConfigDict, field_validator, Field

from ai.model.content import Image, Video, Audio
from ai.knowledge.agent import AgentKnowledge
from ai.model.base import Model
from ai.memory.agent import AgentMemory, SessionSummary, AgentRun  # noqa: F401
from ai.prompt.template import PromptTemplate
from ai.storage.agent.base import AgentStorage
from ai.tools import Tool, Toolkit, Function
from ai.utils.log import logger, set_log_level_to_debug, set_log_level_to_info
from ai.utils.merge_dict import merge_dictionaries
from ai.run.response import RunResponse, RunResponseExtraData
from ai.model.message import Message
from ai.agent.core.print import create_panel, response, cli_app
from ai.agent.core.run import _aggregate_metrics_from_run_messages, generic_run_response, _run, run
from ai.agent.core.api import _create_run_data, log_agent_run, log_agent_session
from ai.agent.core.tools import get_tools, search_knowledge_base, add_to_knowledge, get_transfer_prompt, get_transfer_function
from ai.agent.core.messages import get_relevant_docs_from_knowledge, convert_documents_to_string, convert_context_to_string, get_system_message, get_json_output_prompt, get_user_message
from ai.agent.core.session_management import AgentSession, get_agent_session, from_agent_session, read_from_storage, write_to_storage, add_introduction, load_session, create_session, new_session
from ai.agent.core.agent_core_utils import (
    deep_copy_field, get_agent_data, get_session_data, get_chat_history, get_tool_call_history,
    update_memory, update_model, save_run_response_to_file, aggregate_metrics_from_run_messages,
    get_messages_for_run
)


class Agent(BaseModel):
    model: Optional[Model] = Field(None, alias="provider")
    name: Optional[str] = None
    agent_id: Optional[str] = Field(None, validate_default=True)
    introduction: Optional[str] = None
    images: Optional[List[Image]] = None
    videos: Optional[List[Video]] = None
    audio: Optional[List[Audio]] = None
    agent_data: Optional[Dict[str, Any]] = None
    user_id: Optional[str] = None
    user_data: Optional[Dict[str, Any]] = None
    session_id: Optional[str] = Field(None, validate_default=True)
    session_name: Optional[str] = None
    session_state: Dict[str, Any] = Field(default_factory=dict)
    session_data: Optional[Dict[str, Any]] = None
    memory: AgentMemory = AgentMemory()
    add_history_to_messages: bool = Field(False, alias="add_chat_history_to_messages")
    num_history_responses: int = 3
    knowledge: Optional[AgentKnowledge] = Field(None, alias="knowledge_base")
    add_references: bool = Field(False)
    retriever: Optional[Callable[..., Optional[list[dict]]]] = None
    references_format: Literal["json", "yaml"] = Field("json")
    storage: Optional[AgentStorage] = None
    _agent_session: Optional[None] = None
    tools: Optional[List[Union[Tool, Toolkit, Callable, Dict, Function]]] = None
    show_tool_calls: bool = False
    tool_call_limit: Optional[int] = None
    tool_choice: Optional[Union[str, Dict[str, Any]]] = None
    context: Optional[Dict[str, Any]] = None
    add_context: bool = False
    resolve_context: bool = True
    reasoning: bool = False
    reasoning_model: Optional[Model] = None
    reasoning_agent: Optional[Agent] = None
    reasoning_min_steps: int = 1
    reasoning_max_steps: int = 10
    read_chat_history: bool = False
    search_knowledge: bool = True
    update_knowledge: bool = False
    read_tool_call_history: bool = False
    add_messages: Optional[List[Union[Dict, "Message"]]] = None
    system_prompt: Optional[Union[str, Callable]] = None
    system_prompt_template: Optional[PromptTemplate] = None
    use_default_system_message: bool = True
    system_message_role: str = "system"
    description: Optional[str] = None
    task: Optional[str] = None
    instructions: Optional[Union[str, List[str], Callable]] = None
    guidelines: Optional[List[str]] = None
    expected_output: Optional[str] = None
    additional_context: Optional[str] = None
    prevent_hallucinations: bool = False
    prevent_prompt_leakage: bool = False
    limit_tool_access: bool = False
    markdown: bool = False
    add_name_to_instructions: bool = False
    add_datetime_to_instructions: bool = False
    user_prompt: Optional[Union[List, Dict, str, Callable]] = None
    user_prompt_template: Optional[PromptTemplate] = None
    use_default_user_message: bool = True
    user_message_role: str = "user"
    response_model: Optional[Type[BaseModel]] = Field(None, alias="output_model")
    parse_response: bool = True
    structured_outputs: bool = False
    save_response_to_file: Optional[str] = None
    team: Optional[List["Agent"]] = None
    role: Optional[str] = None
    respond_directly: bool = False
    add_transfer_instructions: bool = True
    team_response_separator: str = "\n"
    debug_mode: bool = Field(False, validate_default=True)
    monitoring: bool = getenv("MONITORING", "false").lower() == "true"
    telemetry: bool = getenv("TELEMETRY", "true").lower() == "true"
    run_id: Optional[str] = None
    run_input: Optional[Union[str, List, Dict]] = None
    run_response: "RunResponse" = Field(default_factory=lambda: RunResponse())
    stream: Optional[bool] = None
    stream_intermediate_steps: bool = False

    model_config = ConfigDict(arbitrary_types_allowed=True, populate_by_name=True, extra="allow")

    @field_validator("agent_id", mode="before")
    def set_agent_id(cls, v: Optional[str]) -> str:
        agent_id = v or str(uuid4())
        return agent_id

    @field_validator("session_id", mode="before")
    def set_session_id(cls, v: Optional[str]) -> str:
        session_id = v or str(uuid4())
        return session_id

    @field_validator("debug_mode", mode="before")
    def set_log_level(cls, v: bool) -> bool:
        if v or getenv("DEBUG", "false").lower() == "true":
            set_log_level_to_debug()
            logger.debug("Debug logs enabled")
        elif v is False:
            set_log_level_to_info()
        return v

    @property
    def is_streamable(self) -> bool:
        return self.response_model is None

    @property
    def identifier(self) -> Optional[str]:
        return self.name or self.agent_id

    def deep_copy(self, *, update: Optional[Dict[str, Any]] = None) -> "Agent":
        logger.debug(f"Creating deep copy of agent {self.agent_id} with updates: {update if update else 'None'}")
        fields_for_new_agent = {}
        for field_name in self.model_fields_set:
            field_value = getattr(self, field_name)
            if field_value is not None:
                logger.debug(f"Copying field: {field_name}")
                fields_for_new_agent[field_name] = self._deep_copy_field(field_name, field_value)
            else:
                logger.debug(f"Skipping field (None): {field_name}")
        if update:
            logger.debug(f"Applying updates: {update}")
            fields_for_new_agent.update(update)
        logger.debug(f"Final fields for new agent: {fields_for_new_agent}")
        new_agent = self.__class__(**fields_for_new_agent)
        logger.debug(f"Created new Agent: agent_id: {new_agent.agent_id} | session_id: {new_agent.session_id}")
        logger.info(f"Agent deep copy complete: {new_agent.agent_id}")
        return new_agent

    def _deep_copy_field(self, field_name: str, field_value: Any) -> Any:
        return deep_copy_field(field_name, field_value)

    def has_team(self) -> bool:
        return self.team is not None and len(self.team) > 0

    def get_agent_data(self) -> Dict[str, Any]:
        return get_agent_data(self)

    def get_session_data(self) -> Dict[str, Any]:
        return get_session_data(self)

    def get_chat_history(self, num_chats: Optional[int] = None) -> str:
        return get_chat_history(self, num_chats)

    def get_tool_call_history(self, num_calls: int = 3) -> str:
        return get_tool_call_history(self, num_calls)

    def update_memory(self, task: str) -> str:
        return update_memory(self, task)

    def update_model(self) -> None:
        return update_model(self)

    def ask(
        self,
        message: Optional[Union[List, Dict, str, Message]] = None,
        *,
        messages: Optional[List[Union[Dict, Message]]] = None,
        stream: bool = False,
        markdown: bool = False,
        show_message: bool = True,
        show_reasoning: bool = True,
        show_full_reasoning: bool = False,
        console: Optional[Any] = None,
        **kwargs: Any,
    ) -> None:
        return response(self, message=message, messages=messages, stream=stream, markdown=markdown, show_message=show_message, show_reasoning=show_reasoning, show_full_reasoning=show_full_reasoning, console=console, **kwargs)

    def cli_app(
        self,
        message: Optional[str] = None,
        user: str = "User",
        emoji: str = ":sunglasses:",
        stream: bool = False,
        markdown: bool = False,
        exit_on: Optional[List[str]] = None,
        **kwargs: Any,
    ) -> None:
        return cli_app(self, message=message, user=user, emoji=emoji, stream=stream, markdown=markdown, exit_on=exit_on, **kwargs)

    @overload
    def run(
        self,
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
        self,
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
        self,
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
        logger.info(f"Agent {self.agent_id} starting run with message type: {type(message).__name__}")
        logger.debug(f"Run parameters - stream: {stream}, stream_intermediate_steps: {stream_intermediate_steps}")
        logger.debug(f"Run input message: {message}")
        logger.debug(f"Run kwargs: {kwargs}")
        if messages:
            logger.debug(f"Number of additional messages: {len(messages)}")
            logger.debug(f"Additional messages content: {messages}")
        if images:
            logger.debug(f"Number of images: {len(images)}")
        if audio:
            logger.debug(f"Audio input provided: {bool(audio)}")
        if videos:
            logger.debug(f"Number of videos: {len(videos)}")
        return run(self, message=message, stream=stream, audio=audio, images=images, videos=videos, messages=messages, stream_intermediate_steps=stream_intermediate_steps, **kwargs)

    def _run(
        self,
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
        logger.debug(f"Agent {self.agent_id} entering _run method.")
        logger.debug(f"_run parameters - stream: {stream}, stream_intermediate_steps: {stream_intermediate_steps}")
        logger.debug(f"_run input message: {message}")
        logger.debug(f"_run kwargs: {kwargs}")
        if messages:
            logger.debug(f"_run number of additional messages: {len(messages)}")
            logger.debug(f"_run additional messages content: {messages}")
        if images:
            logger.debug(f"_run number of images: {len(images)}")
        if audio:
            logger.debug(f"_run audio input provided: {bool(audio)}")
        if videos:
            logger.debug(f"_run number of videos: {len(videos)}")
        return _run(self, message=message, stream=stream, audio=audio, images=images, videos=videos, messages=messages, stream_intermediate_steps=stream_intermediate_steps, **kwargs)

    def get_agent_session(self) -> AgentSession:
        return get_agent_session(self)

    def from_agent_session(self, session: AgentSession):
        return from_agent_session(self, session)

    def read_from_storage(self) -> Optional[AgentSession]:
        return read_from_storage(self)

    def write_to_storage(self) -> Optional[AgentSession]:
        logger.info(f"Writing agent {self.agent_id} session {self.session_id} to storage")
        logger.debug(f"Session state keys: {list(self.session_state.keys())}")
        logger.debug(f"Session data keys: {list(self.session_data.keys()) if self.session_data else 'None'}")
        return write_to_storage(self)

    def add_introduction(self, introduction: str) -> None:
        return add_introduction(self, introduction)

    def load_session(self, force: bool = False) -> Optional[str]:
        return load_session(self, force)

    def create_session(self) -> Optional[str]:
        return create_session(self)

    def new_session(self) -> None:
        return new_session(self)

    def _create_run_data(self) -> Dict[str, Any]:
        return _create_run_data(self)

    def log_agent_run(self) -> None:
        return log_agent_run(self)

    def log_agent_session(self):
        return log_agent_session(self)

    def get_messages_for_run(
        self,
        *,
        message: Optional[Union[str, List, Dict, Message]] = None,
        audio: Optional[Any] = None,
        images: Optional[Sequence[Any]] = None,
        videos: Optional[Sequence[Any]] = None,
        messages: Optional[Sequence[Union[Dict, Message]]] = None,
        **kwargs: Any,
    ) -> Tuple[Optional[Message], List[Message], List[Message]]:
        logger.debug(f"Getting messages for run - Agent: {self.agent_id}, Session: {self.session_id}")
        logger.debug(f"Input message type: {type(message).__name__}")
        logger.debug(f"Input message content: {message}")
        logger.debug(f"Additional messages count: {len(messages) if messages else 0}")
        logger.debug(f"Additional messages content: {messages}")
        logger.debug(f"Images count: {len(images) if images else 0}")
        logger.debug(f"Audio provided: {bool(audio)}")
        logger.debug(f"Videos count: {len(videos) if videos else 0}")
        logger.debug(f"kwargs: {kwargs}")
        result = get_messages_for_run(self, message=message, audio=audio, images=images, videos=videos, messages=messages, **kwargs)
        logger.debug(f"Generated user message: {result[0]}")
        logger.debug(f"Generated system messages count: {len(result[1])}")
        logger.debug(f"Generated tool messages count: {len(result[2])}")
        return result

    def save_run_response_to_file(self, message: Optional[Union[str, List, Dict, Message]] = None) -> None:
        return save_run_response_to_file(self, message)

    def _aggregate_metrics_from_run_messages(self, messages: List[Message]) -> Dict[str, Any]:
        return aggregate_metrics_from_run_messages(messages)

    def load_user_memories(self) -> None:
        if self.memory.create_user_memories:
            if self.user_id is not None:
                pass

    def get_transfer_prompt(self) -> str:
        return get_transfer_prompt(self)

    def get_transfer_function(self, member_agent: "Agent", index: int) -> Function:
        logger.debug(f"Getting transfer function for member agent: {member_agent.name or member_agent.agent_id} at index {index}")
        return get_transfer_function(self, member_agent, index)

    def get_tools(self) -> Optional[List[Union[Tool, Toolkit, Callable, Dict, Function]]]:
        logger.debug(f"Getting tools for agent {self.agent_id}")
        tools_result = get_tools(self)
        logger.debug(f"Retrieved tools: {tools_result}")
        return tools_result

    def add_image(self, image: Image) -> None:
        """Add an image to the agent's images list"""
        logger.debug(f"Adding image to agent {self.agent_id}")
        if self.images is None:
            self.images = []
        self.images.append(image)
        if self.run_response is not None:
            if self.run_response.images is None:
                self.run_response.images = []
            self.run_response.images.append(image)

    def add_video(self, video: Video) -> None:
        """Add a video to the agent's videos list"""
        logger.debug(f"Adding video to agent {self.agent_id}")
        if self.videos is None:
            self.videos = []
        self.videos.append(video)
        if self.run_response is not None:
            if self.run_response.videos is None:
                self.run_response.videos = []
            self.run_response.videos.append(video)

    def add_audio(self, audio: Audio) -> None:
        """Add audio to the agent's audio list"""
        logger.debug(f"Adding audio to agent {self.agent_id}")
        if self.audio is None:
            self.audio = []
        self.audio.append(audio)
        if self.run_response is not None:
            if self.run_response.audio is None:
                self.run_response.audio = []
            self.run_response.audio.append(audio)

    def get_images(self) -> Optional[List[Image]]:
        """Get the agent's images list"""
        return self.images

    def get_videos(self) -> Optional[List[Video]]:
        """Get the agent's videos list"""
        return self.videos

    def get_audio(self) -> Optional[List[Audio]]:
        """Get the agent's audio list"""
        return self.audio