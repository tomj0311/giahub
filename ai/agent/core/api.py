from __future__ import annotations

import json
from typing import (
    Any,
    Dict,
)

from ai.agent.session import AgentSession
from ai.model.message import Message
from ai.run.response import RunResponse
from ai.utils.log import logger


def _create_run_data(self: "Agent") -> Dict[str, Any]:
    """Create and return the run data dictionary."""
    run_response_format = "text"
    if self.response_model is not None:
        run_response_format = "json"
    elif self.markdown:
        run_response_format = "markdown"

    functions = {}
    if self.model is not None and self.model.functions is not None:
        functions = {
            f_name: func.to_dict() for f_name, func in self.model.functions.items() if isinstance(func, Function)
        }

    run_data: Dict[str, Any] = {
        "functions": functions,
        "metrics": self.run_response.metrics if self.run_response is not None else None,
    }

    if self.monitoring:
        run_data.update(
            {
                "run_input": self.run_input,
                "run_response": self.run_response.to_dict(),
                "run_response_format": run_response_format,
            }
        )

    return run_data


def log_agent_run(self: "Agent") -> None:
    if not (self.telemetry or self.monitoring):
        return

    return 

async def alog_agent_run(self: "Agent") -> None:
    if not (self.telemetry or self.monitoring):
        return

    return

def log_agent_session(self: "Agent"):
    if not (self.telemetry or self.monitoring):
        return

    return

async def alog_agent_session(self: "Agent"):
    if not (self.telemetry or self.monitoring):
        return

    return
    
    # from merlin.phi.api_no.agent import acreate_agent_session, AgentSessionCreate

    # try:
    #     agent_session: AgentSession = self._agent_session or self.get_agent_session()
    #     await acreate_agent_session(
    #         session=AgentSessionCreate(
    #             session_id=agent_session.session_id,
    #             agent_data=agent_session.monitoring_data() if self.monitoring else agent_session.telemetry_data(),
    #         ),
    #         monitor=self.monitoring,
    #     )
    # except Exception as e:
    #     logger.debug(f"Could not create agent monitor: {e}")