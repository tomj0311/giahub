from __future__ import annotations

import json
from os import getenv
from uuid import uuid4
from pathlib import Path
from textwrap import dedent
from datetime import datetime
from collections import defaultdict, deque
from typing import (
    Any,
    AsyncIterator,
    Callable,
    cast,
    Dict,
    Iterator,
    List,
    Literal,
    Optional,
    overload,
    Sequence,
    Tuple,
    Type,
    Union,
)

from pydantic import BaseModel, ConfigDict, field_validator, Field, ValidationError

from ai.document import Document
from ai.agent.session import AgentSession
from ai.model.content import Image, Video, Audio
from ai.reasoning.step import ReasoningStep, ReasoningSteps, NextAction
from ai.run.response import RunEvent, RunResponse, RunResponseExtraData
from ai.knowledge.agent import AgentKnowledge
from ai.model.base import Model
from ai.model.message import Message, MessageReferences
from ai.model.response import ModelResponse, ModelResponseEvent
from ai.memory.agent import AgentMemory, MemoryRetrieval, Memory, AgentRun, SessionSummary  # noqa: F401
from ai.prompt.template import PromptTemplate
from ai.storage.agent.base import AgentStorage
from ai.tools import Tool, Toolkit, Function
from ai.utils.log import logger, set_log_level_to_debug, set_log_level_to_info
from ai.utils.message import get_text_from_message
from ai.utils.merge_dict import merge_dictionaries
from ai.utils.timer import Timer

from ai.agent.core.agent_core import Agent

Agent.model_rebuild()
