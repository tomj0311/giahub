from __future__ import annotations

from collections import deque
from typing import (
    Any,
    AsyncIterator,
    Iterator,
    List,
    Optional,
)

from pydantic import BaseModel

from ai.model.base import Model
from ai.model.message import Message
from ai.reasoning.step import ReasoningStep, ReasoningSteps, NextAction
from ai.run.response import RunResponse, RunEvent, RunResponseExtraData
from ai.utils.log import logger


def get_reasoning_agent(self: "Agent", model: Optional[Model] = None) -> "Agent":
    return self.__class__(
        model=model,
        description="You are a meticulous and thoughtful assistant that solves a problem by thinking through it step-by-step.",
        instructions=[
            "First - Carefully analyze the task by spelling it out loud.",
            "Then, break down the problem by thinking through it step by step and develop multiple strategies to solve the problem."
            "Then, examine the users intent develop a step by step plan to solve the problem.",
            "Work through your plan step-by-step, executing any tools as needed. For each step, provide:\n"
            "  1. Title: A clear, concise title that encapsulates the step's main focus or objective.\n"
            "  2. Action: Describe the action you will take in the first person (e.g., 'I will...').\n"
            "  3. Result: Execute the action by running any necessary tools or providing an answer. Summarize the outcome.\n"
            "  4. Reasoning: Explain the logic behind this step in the first person, including:\n"
            "     - Necessity: Why this action is necessary.\n"
            "     - Considerations: Key considerations and potential challenges.\n"
            "     - Progression: How it builds upon previous steps (if applicable).\n"
            "     - Assumptions: Any assumptions made and their justifications.\n"
            "  5. Next Action: Decide on the next step:\n"
            "     - continue: If more steps are needed to reach an answer.\n"
            "     - validate: If you have reached an answer and should validate the result.\n"
            "     - final_answer: If the answer is validated and is the final answer.\n"
            "     Note: you must always validate the answer before providing the final answer.\n"
            "  6. Confidence score: A score from 0.0 to 1.0 reflecting your certainty about the action and its outcome.",
            "Handling Next Actions:\n"
            "  - If next_action is continue, proceed to the next step in your analysis.\n"
            "  - If next_action is validate, validate the result and provide the final answer.\n"
            "  - If next_action is final_answer, stop reasoning.",
            "Remember - If next_action is validate, you must validate your result\n"
            "  - Ensure the answer resolves the original request.\n"
            "  - Validate your result using any necessary tools or methods.\n"
            "  - If there is another method to solve the task, use that to validate the result.\n"
            "Ensure your analysis is:\n"
            "  - Complete: Validate results and run all necessary tools.\n"
            "  - Comprehensive: Consider multiple angles and potential outcomes.\n"
            "  - Logical: Ensure each step coherently follows from the previous one.\n"
            "  - Actionable: Provide clear, implementable steps or solutions.\n"
            "  - Insightful: Offer unique perspectives or innovative approaches when appropriate.",
            "Additional Guidelines:\n"
            "  - Remember to run any tools you need to solve the problem.\n"
            f"  - Take at least {self.reasoning_min_steps} steps to solve the problem.\n"
            "  - If you have all the information you need, provide the final answer.\n"
            "  - IMPORTANT: IF AT ANY TIME THE RESULT IS WRONG, RESET AND START OVER.",
        ],
        tools=self.tools,
        show_tool_calls=False,
        response_model=ReasoningSteps,
        structured_outputs=self.structured_outputs,
        monitoring=self.monitoring,
    )


def _update_run_response_with_reasoning(
    self: "Agent", reasoning_steps: List[ReasoningStep], reasoning_agent_messages: List[Message]
):
    if self.run_response.extra_data is None:
        self.run_response.extra_data = RunResponseExtraData()

    extra_data = self.run_response.extra_data

    # Update reasoning_steps
    if extra_data.reasoning_steps is None:
        extra_data.reasoning_steps = reasoning_steps
    else:
        extra_data.reasoning_steps.extend(reasoning_steps)

    # Update reasoning_messages
    if extra_data.reasoning_messages is None:
        extra_data.reasoning_messages = reasoning_agent_messages
    else:
        extra_data.reasoning_messages.extend(reasoning_agent_messages)


def _get_next_action(self: "Agent", reasoning_step: ReasoningStep) -> NextAction:
    next_action = reasoning_step.next_action or NextAction.FINAL_ANSWER
    if isinstance(next_action, str):
        try:
            return NextAction(next_action)
        except ValueError:
            logger.warning(f"Reasoning error. Invalid next action: {next_action}")
            return NextAction.FINAL_ANSWER
    return next_action


def _update_messages_with_reasoning(self: "Agent", reasoning_messages: List[Message], messages_for_model: List[Message]):
    messages_for_model.append(
        Message(
            role="assistant",
            content="I have worked through this problem in-depth, running all necessary tools and have included my raw, step by step research. ",
        )
    )
    messages_for_model.extend(reasoning_messages)
    messages_for_model.append(
        Message(
            role="assistant",
            content="Now I will summarize my reasoning and provide a final answer. I will skip any tool calls already executed and steps that are not relevant to the final answer.",
        )
    )


def reason(
    self: "Agent",
    system_message: Optional[Message],
    user_messages: List[Message],
    messages_for_model: List[Message],
    stream_intermediate_steps: bool = False,
) -> Iterator[RunResponse]:
    # -*- Yield the reasoning started event
    if stream_intermediate_steps:
        yield RunResponse(
            run_id=self.run_id,
            session_id=self.session_id,
            agent_id=self.agent_id,
            content="Reasoning started",
            event=RunEvent.reasoning_started.value,
        )

    # -*- Initialize reasoning
    reasoning_messages: List[Message] = []
    all_reasoning_steps: List[ReasoningStep] = []
    reasoning_model: Optional[Model] = self.reasoning_model
    reasoning_agent: Optional["Agent"] = self.reasoning_agent
    if reasoning_model is None and self.model is not None:
        reasoning_model = self.model.__class__(id=self.model.id)
    if reasoning_agent is None:
        reasoning_agent = get_reasoning_agent(self, model=reasoning_model)

    if reasoning_model is None or reasoning_agent is None:
        logger.warning("Reasoning error. Reasoning model or agent is None, continuing regular session...")
        return

    # Ensure the reasoning model and agent do not show tool calls
    reasoning_model.show_tool_calls = False
    reasoning_agent.show_tool_calls = False

    logger.debug(f"Reasoning Agent: {reasoning_agent.agent_id} | {reasoning_agent.session_id}")
    logger.debug("==== Starting Reasoning ====")

    step_count = 1
    next_action = NextAction.CONTINUE
    while next_action == NextAction.CONTINUE and step_count < self.reasoning_max_steps:
        step_count += 1
        logger.debug(f"==== Step {step_count} ====")
        try:
            # -*- Run the reasoning agent
            messages_for_reasoning_agent = (
                [system_message] + user_messages if system_message is not None else user_messages
            )
            reasoning_agent_response: RunResponse = reasoning_agent.run(messages=messages_for_reasoning_agent)
            if reasoning_agent_response.content is None or reasoning_agent_response.messages is None:
                logger.warning("Reasoning error. Reasoning response is empty, continuing regular session...")
                break

            if reasoning_agent_response.content.reasoning_steps is None:
                logger.warning("Reasoning error. Reasoning steps are empty, continuing regular session...")
                break

            reasoning_steps: List[ReasoningStep] = reasoning_agent_response.content.reasoning_steps
            all_reasoning_steps.extend(reasoning_steps)
            # -*- Yield reasoning steps
            if stream_intermediate_steps:
                for reasoning_step in reasoning_steps:
                    yield RunResponse(
                        run_id=self.run_id,
                        session_id=self.session_id,
                        agent_id=self.agent_id,
                        content=reasoning_step,
                        content_type=reasoning_step.__class__.__name__,
                        event=RunEvent.reasoning_step.value,
                    )

            # Find the index of the first assistant message
            first_assistant_index = next(
                (i for i, m in enumerate(reasoning_agent_response.messages) if m.role == "assistant"),
                len(reasoning_agent_response.messages),
            )
            # Extract reasoning messages starting from the message after the first assistant message
            reasoning_messages = reasoning_agent_response.messages[first_assistant_index:]

            # -*- Add reasoning step to the run_response
            _update_run_response_with_reasoning(
                self, reasoning_steps=reasoning_steps, reasoning_agent_messages=reasoning_agent_response.messages
            )

            next_action = _get_next_action(self, reasoning_steps[-1])
            if next_action == NextAction.FINAL_ANSWER:
                break
        except Exception as e:
            logger.error(f"Reasoning error: {e}")
            break

    logger.debug(f"Total Reasoning steps: {len(all_reasoning_steps)}")
    logger.debug("==== Reasoning finished====")

    # -*- Update the messages_for_model to include reasoning messages
    _update_messages_with_reasoning(self, reasoning_messages=reasoning_messages, messages_for_model=messages_for_model)

    # -*- Yield the final reasoning completed event
    if stream_intermediate_steps:
        yield RunResponse(
            run_id=self.run_id,
            session_id=self.session_id,
            agent_id=self.agent_id,
            content=ReasoningSteps(reasoning_steps=all_reasoning_steps),
            content_type=ReasoningSteps.__class__.__name__,
            event=RunEvent.reasoning_completed.value,
        )


async def areason(
    self: "Agent",
    system_message: Optional[Message],
    user_messages: List[Message],
    messages_for_model: List[Message],
    stream_intermediate_steps: bool = False,
) -> AsyncIterator[RunResponse]:
    # -*- Yield the reasoning started event
    if stream_intermediate_steps:
        yield RunResponse(
            run_id=self.run_id,
            session_id=self.session_id,
            agent_id=self.agent_id,
            content="Reasoning started",
            event=RunEvent.reasoning_started.value,
        )

    # -*- Initialize reasoning
    reasoning_messages: List[Message] = []
    all_reasoning_steps: List[ReasoningStep] = []
    reasoning_model: Optional[Model] = self.reasoning_model
    reasoning_agent: Optional["Agent"] = self.reasoning_agent
    if reasoning_model is None and self.model is not None:
        reasoning_model = self.model.__class__(id=self.model.id)
    if reasoning_agent is None:
        reasoning_agent = get_reasoning_agent(self, model=reasoning_model)

    if reasoning_model is None or reasoning_agent is None:
        logger.warning("Reasoning error. Reasoning model or agent is None, continuing regular session...")
        return

    # Ensure the reasoning model and agent do not show tool calls
    reasoning_model.show_tool_calls = False
    reasoning_agent.show_tool_calls = False

    logger.debug(f"Reasoning Agent: {reasoning_agent.agent_id} | {reasoning_agent.session_id}")
    logger.debug("==== Starting Reasoning ====")

    step_count = 0
    next_action = NextAction.CONTINUE
    while next_action == NextAction.CONTINUE and step_count < self.reasoning_max_steps:
        step_count += 1
        logger.debug(f"==== Step {step_count} ====")
        try:
            # -*- Run the reasoning agent
            messages_for_reasoning_agent = (
                [system_message] + user_messages if system_message is not None else user_messages
            )
            reasoning_agent_response: RunResponse = await reasoning_agent.arun(messages=messages_for_reasoning_agent)
            if reasoning_agent_response.content is None or reasoning_agent_response.messages is None:
                logger.warning("Reasoning error. Reasoning response is empty, continuing regular session...")
                break

            if reasoning_agent_response.content.reasoning_steps is None:
                logger.warning("Reasoning error. Reasoning steps are empty, continuing regular session...")
                break

            reasoning_steps: List[ReasoningStep] = reasoning_agent_response.content.reasoning_steps  # type: ignore
            all_reasoning_steps.extend(reasoning_steps)
            # -*- Yield reasoning steps
            if stream_intermediate_steps:
                for reasoning_step in reasoning_steps:
                    yield RunResponse(
                        run_id=self.run_id,
                        session_id=self.session_id,
                        agent_id=self.agent_id,
                        content=reasoning_step,
                        content_type=reasoning_step.__class__.__name__,
                        event=RunEvent.reasoning_step.value,
                    )

            # Find the index of the first assistant message
            first_assistant_index = next(
                (i for i, m in enumerate(reasoning_agent_response.messages) if m.role == "assistant"),
                len(reasoning_agent_response.messages),
            )
            # Extract reasoning messages starting from the message after the first assistant message
            reasoning_messages = reasoning_agent_response.messages[first_assistant_index:]

            # -*- Add reasoning step to the run_response
            _update_run_response_with_reasoning(
                self, reasoning_steps=reasoning_steps, reasoning_agent_messages=reasoning_agent_response.messages
            )

            next_action = _get_next_action(self, reasoning_steps[-1])
            if next_action == NextAction.FINAL_ANSWER:
                break
        except Exception as e:
            logger.error(f"Reasoning error: {e}")
            break

    logger.debug(f"Total Reasoning steps: {len(all_reasoning_steps)}")
    logger.debug("==== Reasoning finished====")

    # -*- Update the messages_for_model to include reasoning messages
    _update_messages_with_reasoning(self, reasoning_messages=reasoning_messages, messages_for_model=messages_for_model)

    # -*- Yield the final reasoning completed event
    if stream_intermediate_steps:
        yield RunResponse(
            run_id=self.run_id,
            session_id=self.session_id,
            agent_id=self.agent_id,
            content=ReasoningSteps(reasoning_steps=all_reasoning_steps),
            content_type=ReasoningSteps.__class__.__name__,
            event=RunEvent.reasoning_completed.value,
        )