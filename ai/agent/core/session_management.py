from __future__ import annotations

import json
from uuid import uuid4
from typing import (
    Any,
    Dict,
    Optional,
)

from ai.agent.session import AgentSession
from ai.model.message import Message
from ai.run.response import RunResponse
from ai.utils.log import logger
from ai.utils.merge_dict import merge_dictionaries
from ai.memory.agent import AgentRun, Memory, SessionSummary


def get_agent_session(self: "Agent") -> AgentSession:
    """Get an AgentSession object, which can be saved to the database"""
    return AgentSession(
        session_id=self.session_id,
        agent_id=self.agent_id,
        user_id=self.user_id,
        memory=self.memory.to_dict(),
        agent_data=self.get_agent_data(),
        user_data=self.user_data,
        session_data=self.get_session_data(),
    )


def from_agent_session(self: "Agent", session: AgentSession):
    """Load the existing Agent from an AgentSession (from the database)"""

    # Get the session_id, agent_id and user_id from the database
    if self.session_id is None and session.session_id is not None:
        self.session_id = session.session_id
    if self.agent_id is None and session.agent_id is not None:
        self.agent_id = session.agent_id
    if self.user_id is None and session.user_id is not None:
        self.user_id = session.user_id

    # Read agent_data from the database
    if session.agent_data is not None:
        # Get name from database and update the agent name if not set
        if self.name is None and "name" in session.agent_data:
            self.name = session.agent_data.get("name")

        # Get model data from the database and update the model
        if "model" in session.agent_data:
            model_data = session.agent_data.get("model")
            # Update model metrics from the database
            if model_data is not None and isinstance(model_data, dict):
                model_metrics_from_db = model_data.get("metrics")
                if model_metrics_from_db is not None and isinstance(model_metrics_from_db, dict) and self.model:
                    try:
                        self.model.metrics = model_metrics_from_db
                    except Exception as e:
                        logger.warning(f"Failed to load model from AgentSession: {e}")

        # Get images, videos, and audios from the database
        if "images" in session.agent_data:
            images_from_db = session.agent_data.get("images")
            if self.images is not None and isinstance(self.images, list):
                self.images.extend([Image.model_validate(img) for img in self.images])
            else:
                self.images = images_from_db
        if "videos" in session.agent_data:
            videos_from_db = session.agent_data.get("videos")
            if self.videos is not None and isinstance(self.videos, list):
                self.videos.extend([Video.model_validate(vid) for vid in self.videos])
            else:
                self.videos = videos_from_db
        if "audio" in session.agent_data:
            audio_from_db = session.agent_data.get("audio")
            if self.audio is not None and isinstance(self.audio, list):
                self.audio.extend([Audio.model_validate(aud) for aud in self.audio])
            else:
                self.audio = audio_from_db

        # If agent_data is set in the agent, update the database agent_data with the agent's agent_data
        if self.agent_data is not None:
            # Updates agent_session.agent_data in place
            merge_dictionaries(session.agent_data, self.agent_data)
        self.agent_data = session.agent_data

    # Read user_data from the database
    if session.user_data is not None:
        # If user_data is set in the agent, update the database user_data with the agent's user_data
        if self.user_data is not None:
            # Updates agent_session.user_data in place
            merge_dictionaries(session.user_data, self.user_data)
        self.user_data = session.user_data

    # Read session_data from the database
    if session.session_data is not None:
        # Get the session_name from database and update the current session_name if not set
        if self.session_name is None and "session_name" in session.session_data:
            self.session_name = session.session_data.get("session_name")

        # Get the session_state from database and update the current session_state
        if "session_state" in session.session_data:
            session_state_from_db = session.session_data.get("session_state")
            if (
                session_state_from_db is not None
                and isinstance(session_state_from_db, dict)
                and len(session_state_from_db) > 0
            ):
                # If the session_state is already set, merge the session_state from the database with the current session_state
                if len(self.session_state) > 0:
                    # This updates session_state_from_db
                    merge_dictionaries(session_state_from_db, self.session_state)
                # Update the current session_state
                self.session_state = session_state_from_db

        # If session_data is set in the agent, update the database session_data with the agent's session_data
        if self.session_data is not None:
            # Updates agent_session.session_data in place
            merge_dictionaries(session.session_data, self.session_data)
        self.session_data = session.session_data

    # Read memory from the database
    if session.memory is not None:
        try:
            if "runs" in session.memory:
                try:
                    self.memory.runs = [AgentRun(**m) for m in session.memory["runs"]]
                except Exception as e:
                    logger.warning(f"Failed to load runs from memory: {e}")
            # For backwards compatibility
            if "chats" in session.memory:
                try:
                    self.memory.runs = [AgentRun(**m) for m in session.memory["chats"]]
                except Exception as e:
                    logger.warning(f"Failed to load chats from memory: {e}")
            if "messages" in session.memory:
                try:
                    self.memory.messages = [Message(**m) for m in session.memory["messages"]]
                except Exception as e:
                    logger.warning(f"Failed to load messages from memory: {e}")
            if "summary" in session.memory:
                try:
                    self.memory.summary = SessionSummary(**session.memory["summary"])
                except Exception as e:
                    logger.warning(f"Failed to load session summary from memory: {e}")
            if "memories" in session.memory:
                try:
                    self.memory.memories = [Memory(**m) for m in session.memory["memories"]]
                except Exception as e:
                    logger.warning(f"Failed to load user memories: {e}")
        except Exception as e:
            logger.warning(f"Failed to load AgentMemory: {e}")
    logger.debug(f"-*- AgentSession loaded: {session.session_id}")


def read_from_storage(self: "Agent") -> Optional[AgentSession]:
    """Load the AgentSession from storage

    Returns:
        Optional[AgentSession]: The loaded AgentSession or None if not found.
    """
    if self.storage is not None and self.session_id is not None:
        self._agent_session = self.storage.read(session_id=self.session_id)
        if self._agent_session is not None:
            self.from_agent_session(session=self._agent_session)
    self.load_user_memories()
    return self._agent_session


def write_to_storage(self: "Agent") -> Optional[AgentSession]:
    """Save the AgentSession to storage

    Returns:
        Optional[AgentSession]: The saved AgentSession or None if not saved.
    """
    if self.storage is not None:
        self._agent_session = self.storage.upsert(session=self.get_agent_session())
    return self._agent_session


def add_introduction(self: "Agent", introduction: str) -> None:
    """Add an introduction to the chat history"""

    if introduction is not None:
        # Add an introduction as the first response from the Agent
        if len(self.memory.runs) == 0:
            self.memory.add_run(
                AgentRun(
                    response=RunResponse(
                        content=introduction, messages=[Message(role="assistant", content=introduction)]
                    )
                )
            )


def load_session(self: "Agent", force: bool = False) -> Optional[str]:
    """Load an existing session from the database and return the session_id.
    If a session does not exist, create a new session.

    - If a session exists in the database, load the session.
    - If a session does not exist in the database, create a new session.
    """
    # If an agent_session is already loaded, return the session_id from the agent_session
    # if session_id matches the session_id from the agent_session
    if self._agent_session is not None and not force:
        if self.session_id is not None and self._agent_session.session_id == self.session_id:
            return self._agent_session.session_id

    # Load an existing session or create a new session
    if self.storage is not None:
        # Load existing session if session_id is provided
        logger.debug(f"Reading AgentSession: {self.session_id}")
        self.read_from_storage()

        # Create a new session if it does not exist
        if self._agent_session is None:
            logger.debug("-*- Creating new AgentSession")
            if self.introduction is not None:
                self.add_introduction(self.introduction)
            # write_to_storage() will create a new AgentSession
            # and populate self._agent_session with the new session
            self.write_to_storage()
            if self._agent_session is None:
                raise Exception("Failed to create new AgentSession in storage")
            logger.debug(f"-*- Created AgentSession: {self._agent_session.session_id}")
            self.log_agent_session()
    return self.session_id


def create_session(self: "Agent") -> Optional[str]:
    """Create a new session and return the session_id

    If a session already exists, return the session_id from the existing session.
    """
    return self.load_session()


def new_session(self: "Agent") -> None:
    """Create a new session
    - Clear the model
    - Clear the memory
    - Create a new session_id
    - Load the new session
    """
    self._agent_session = None
    if self.model is not None:
        self.model.clear()
    if self.memory is not None:
        self.memory.clear()
    self.session_id = str(uuid4())
    self.load_session(force=True)
