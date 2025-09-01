from __future__ import annotations

import json
from textwrap import dedent
from typing import (
    Any,
    Callable,
    Dict,
    List,
    Optional,
    Union,
)

from pydantic import BaseModel

from ai.document import Document
from ai.model.message import Message, MessageReferences
from ai.run.response import RunResponseExtraData
from ai.tools import Tool, Toolkit, Function
from ai.utils.log import logger
from ai.utils.timer import Timer
from ai.agent.core.messages import get_relevant_docs_from_knowledge, convert_documents_to_string


def get_transfer_function(self: "Agent", member_agent: "Agent", index: int) -> Function:
    def _transfer_task_to_agent(
        task_description: str, expected_output: str, additional_information: str
    ) -> str:
        # Update the member agent session_data to include leader_session_id, leader_agent_id and leader_run_id
        if member_agent.session_data is None:
            member_agent.session_data = {}
        member_agent.session_data["leader_session_id"] = self.session_id
        member_agent.session_data["leader_agent_id"] = self.agent_id
        member_agent.session_data["leader_run_id"] = self.run_id

        # -*- Run the agent
        member_agent_messages = f"{task_description}\n\nThe expected output is: {expected_output}"
        try:
            if additional_information is not None and additional_information.strip() != "":
                member_agent_messages += f"\n\nAdditional information: {additional_information}"
        except Exception as e:
            logger.warning(f"Failed to add additional information to the member agent: {e}")

        member_agent_session_id = member_agent.session_id
        member_agent_agent_id = member_agent.agent_id

        # Create a dictionary with member_session_id and member_agent_id
        member_agent_info = {
            "session_id": member_agent_session_id,
            "agent_id": member_agent_agent_id,
        }
        # Update the leader agent session_data to include member_agent_info
        if self.session_data is None:
            self.session_data = {"members": [member_agent_info]}
        else:
            if "members" not in self.session_data:
                self.session_data["members"] = []
            # Check if member_agent_info is already in the list
            if member_agent_info not in self.session_data["members"]:
                self.session_data["members"].append(member_agent_info)

        if self.stream and member_agent.is_streamable:
            member_agent_run_response_stream = member_agent.run(member_agent_messages, stream=True)
            for member_agent_run_response_chunk in member_agent_run_response_stream:
                yield member_agent_run_response_chunk.content  # type: ignore
        else:
            member_agent_run_response = member_agent.run(member_agent_messages, stream=False)
            if member_agent_run_response.content is None:
                yield "No response from the member agent."
            elif isinstance(member_agent_run_response.content, str):
                yield member_agent_run_response.content
            elif issubclass(member_agent_run_response.content, BaseModel):
                try:
                    yield member_agent_run_response.content.model_dump_json(indent=2)
                except Exception as e:
                    yield str(e)
            else:
                try:
                    yield json.dumps(member_agent_run_response.content, indent=2)
                except Exception as e:
                    yield str(e)
        yield self.team_response_separator

    # Give a name to the member agent
    agent_name = member_agent.name.replace(" ", "_").lower() if member_agent.name else f"agent_{index}"
    if member_agent.name is None:
        member_agent.name = agent_name

    transfer_function = Function.from_callable(_transfer_task_to_agent)
    transfer_function.name = f"transfer_task_to_{agent_name}"
    transfer_function.description = dedent(f"""\
    Use this function to transfer a task to {agent_name}
    You must provide a clear and concise description of the task the agent should achieve AND the expected output.
    Args:
        task_description (str): A clear and concise description of the task the agent should achieve.
        expected_output (str): The expected output from the agent.
        additional_information (Optional[str]): Additional information that will help the agent complete the task.
    Returns:
        str: The result of the delegated task.
    """)

    # If the member agent is set to respond directly, show the result of the function call and stop the model execution
    if member_agent.respond_directly:
        transfer_function.show_result = True
        transfer_function.stop_after_tool_call = True

    return transfer_function


def get_transfer_prompt(self: "Agent") -> str:
    if self.team and len(self.team) > 0:
        transfer_prompt = "## Agents in your team:"
        transfer_prompt += "\nYou can transfer tasks to the following agents:"
        for agent_index, agent in enumerate(self.team):
            transfer_prompt += f"\nAgent {agent_index + 1}:\n"
            if agent.name:
                transfer_prompt += f"Name: {agent.name}\n"
            if agent.role:
                transfer_prompt += f"Role: {agent.role}\n"
            if agent.tools is not None:
                _tools = []
                for _tool in agent.tools:
                    if isinstance(_tool, Toolkit):
                        _tools.extend(list(_tool.functions.keys()))
                    elif isinstance(_tool, Function):
                        _tools.append(_tool.name)
                    elif callable(_tool):
                        _tools.append(_tool.__name__)
                transfer_prompt += f"Available tools: {', '.join(_tools)}\n"
        return transfer_prompt
    return ""


def get_tools(self: "Agent") -> Optional[List[Union[Tool, Toolkit, Callable, Dict, Function]]]:
    tools: List[Union[Tool, Toolkit, Callable, Dict, Function]] = []

    # Add provided tools
    if self.tools is not None:
        for tool in self.tools:
            tools.append(tool)

    # Add tools for accessing memory
    if self.read_chat_history:
        tools.append(self.get_chat_history)
    if self.read_tool_call_history:
        tools.append(self.get_tool_call_history)
    if self.memory.create_user_memories:
        tools.append(self.update_memory)

    # Add tools for accessing knowledge
    if self.knowledge is not None:
        if self.search_knowledge:
            tools.append(search_knowledge_base(self, query=""))
        if self.update_knowledge:
            tools.append(add_to_knowledge(self, query="", result=""))

    # Add transfer tools
    if self.team is not None and len(self.team) > 0:
        for agent_index, agent in enumerate(self.team):
            tools.append(get_transfer_function(self, agent, agent_index))

    return tools


def search_knowledge_base(self: "Agent", query: str) -> str:
    """Use this function to search the knowledge base for information about a query.

    Args:
        query: The query to search for.

    Returns:
        str: A string containing the response from the knowledge base.
    """

    # Get the relevant documents from the knowledge base
    retrieval_timer = Timer()
    retrieval_timer.start()
    docs_from_knowledge = get_relevant_docs_from_knowledge(self, query=query)
    if docs_from_knowledge is not None:
        references = MessageReferences(
            query=query, references=docs_from_knowledge, time=round(retrieval_timer.elapsed, 4)
        )
        # Add the references to the run_response
        if self.run_response.extra_data is None:
            self.run_response.extra_data = RunResponseExtraData()
        if self.run_response.extra_data.references is None:
            self.run_response.extra_data.references = []
        self.run_response.extra_data.references.append(references)
    retrieval_timer.stop()
    logger.debug(f"Time to get references: {retrieval_timer.elapsed:.4f}s")

    if docs_from_knowledge is None:
        return "No documents found"
    return convert_documents_to_string(self, docs_from_knowledge)


def add_to_knowledge(self: "Agent", query: str, result: str) -> str:
    """Use this function to add information to the knowledge base for future use.

    Args:
        query: The query to add.
        result: The result of the query.

    Returns:
        str: A string indicating the status of the addition.
    """
    if self.knowledge is None:
        return "Knowledge base not available"
    document_name = self.name
    if document_name is None:
        document_name = query.replace(" ", "_").replace("?", "").replace("!", "").replace(".", "")
    document_content = json.dumps({"query": query, "result": result})
    logger.info(f"Adding document to knowledge base: {document_name}: {document_content}")
    self.knowledge.load_document(
        document=Document(
            name=document_name,
            content=document_content,
        )
    )
    return "Successfully added to knowledge base"
