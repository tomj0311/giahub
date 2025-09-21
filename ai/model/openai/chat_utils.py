from os import getenv
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any, Union

import httpx

from ai.model.message import Message
from ai.model.response import ModelResponse
from ai.tools.function import FunctionCall
from ai.utils.log import logger
from ai.utils.timer import Timer
from ai.utils.tools import get_function_call_for_tool_call

try:
    MIN_OPENAI_VERSION = (1, 52, 0)  # v1.52.0

    # Check the installed openai version
    from openai import __version__ as installed_version

    # Convert installed version to a tuple of integers for comparison
    installed_version_tuple = tuple(map(int, installed_version.split(".")))
    if installed_version_tuple < MIN_OPENAI_VERSION:
        raise ImportError(
            f"`openai` version must be >= {'.'.join(map(str, MIN_OPENAI_VERSION))}, but found {installed_version}. "
            f"Please upgrade using `pip install --upgrade openai`."
        )

    from openai.types.chat.chat_completion_message import ChatCompletionMessage, ChatCompletionAudio
    from openai import OpenAI as OpenAIClient, AsyncOpenAI as AsyncOpenAIClient
    from openai.types.completion_usage import CompletionUsage
    from openai.types.chat.chat_completion import ChatCompletion
    from openai.types.chat.parsed_chat_completion import ParsedChatCompletion
    from openai.types.chat.chat_completion_chunk import (
        ChatCompletionChunk,
        ChoiceDelta,
        ChoiceDeltaToolCall,
    )

except ModuleNotFoundError:
    raise ImportError("`openai` not installed. Please install using `pip install openai`")


@dataclass
class Metrics:
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    prompt_tokens_details: Optional[dict] = None
    completion_tokens_details: Optional[dict] = None
    time_to_first_token: Optional[float] = None
    response_timer: Timer = field(default_factory=Timer)

    def log(self):
        logger.debug("**************** METRICS START ****************")
        if self.time_to_first_token is not None:
            logger.debug(f"* Time to first token:         {self.time_to_first_token:.4f}s")
        logger.debug(f"* Time to generate response:   {self.response_timer.elapsed:.4f}s")
        logger.debug(f"* Tokens per second:           {self.output_tokens / self.response_timer.elapsed:.4f} tokens/s")
        logger.debug(f"* Input tokens:                {self.input_tokens or self.prompt_tokens}")
        logger.debug(f"* Output tokens:               {self.output_tokens or self.completion_tokens}")
        logger.debug(f"* Total tokens:                {self.total_tokens}")
        if self.prompt_tokens_details is not None:
            logger.debug(f"* Prompt tokens details:       {self.prompt_tokens_details}")
        if self.completion_tokens_details is not None:
            logger.debug(f"* Completion tokens details:   {self.completion_tokens_details}")
        logger.debug("**************** METRICS END ******************")


@dataclass
class StreamData:
    response_content: str = ""
    response_audio: Optional[dict] = None
    response_tool_calls: Optional[List[ChoiceDeltaToolCall]] = None


def update_usage_metrics(assistant_message: Message, metrics: Metrics, response_usage: Optional[CompletionUsage], model_metrics: Dict) -> None:
    """
    Update the usage metrics for the assistant message and the model.

    Args:
        assistant_message (Message): The assistant message.
        metrics (Metrics): The metrics.
        response_usage (Optional[CompletionUsage]): The response usage.
        model_metrics (Dict): The model's metrics dictionary.
    """
    # Update time taken to generate response
    assistant_message.metrics["time"] = metrics.response_timer.elapsed
    model_metrics.setdefault("response_times", []).append(metrics.response_timer.elapsed)
    if response_usage:
        prompt_tokens = response_usage.prompt_tokens
        completion_tokens = response_usage.completion_tokens
        total_tokens = response_usage.total_tokens

        if prompt_tokens is not None:
            metrics.input_tokens = prompt_tokens
            metrics.prompt_tokens = prompt_tokens
            assistant_message.metrics["input_tokens"] = prompt_tokens
            assistant_message.metrics["prompt_tokens"] = prompt_tokens
            model_metrics["input_tokens"] = model_metrics.get("input_tokens", 0) + prompt_tokens
            model_metrics["prompt_tokens"] = model_metrics.get("prompt_tokens", 0) + prompt_tokens
        if completion_tokens is not None:
            metrics.output_tokens = completion_tokens
            metrics.completion_tokens = completion_tokens
            assistant_message.metrics["output_tokens"] = completion_tokens
            assistant_message.metrics["completion_tokens"] = completion_tokens
            model_metrics["output_tokens"] = model_metrics.get("output_tokens", 0) + completion_tokens
            model_metrics["completion_tokens"] = model_metrics.get("completion_tokens", 0) + completion_tokens
        if total_tokens is not None:
            metrics.total_tokens = total_tokens
            assistant_message.metrics["total_tokens"] = total_tokens
            model_metrics["total_tokens"] = model_metrics.get("total_tokens", 0) + total_tokens
        if response_usage.prompt_tokens_details is not None:
            if isinstance(response_usage.prompt_tokens_details, dict):
                metrics.prompt_tokens_details = response_usage.prompt_tokens_details
            elif hasattr(response_usage.prompt_tokens_details, 'model_dump'):
                metrics.prompt_tokens_details = response_usage.prompt_tokens_details.model_dump(exclude_none=True)
            assistant_message.metrics["prompt_tokens_details"] = metrics.prompt_tokens_details
            if metrics.prompt_tokens_details is not None:
                for k, v in metrics.prompt_tokens_details.items():
                    model_metrics.get("prompt_tokens_details", {}).get(k, 0) + v
        if response_usage.completion_tokens_details is not None:
            if isinstance(response_usage.completion_tokens_details, dict):
                metrics.completion_tokens_details = response_usage.completion_tokens_details
            elif hasattr(response_usage.completion_tokens_details, 'model_dump'):
                metrics.completion_tokens_details = response_usage.completion_tokens_details.model_dump(
                    exclude_none=True
                )
            assistant_message.metrics["completion_tokens_details"] = metrics.completion_tokens_details
            if metrics.completion_tokens_details is not None:
                for k, v in metrics.completion_tokens_details.items():
                    model_metrics.get("completion_tokens_details", {}).get(k, 0) + v


def update_stream_metrics(assistant_message: Message, metrics: Metrics, model_metrics: Dict):
    """
    Update the usage metrics for the assistant message and the model.

    Args:
        assistant_message (Message): The assistant message.
        metrics (Metrics): The metrics.
        model_metrics (Dict): The model's metrics dictionary.
    """
    # Update time taken to generate response
    assistant_message.metrics["time"] = metrics.response_timer.elapsed
    model_metrics.setdefault("response_times", []).append(metrics.response_timer.elapsed)

    if metrics.time_to_first_token is not None:
        assistant_message.metrics["time_to_first_token"] = metrics.time_to_first_token
        model_metrics.setdefault("time_to_first_token", []).append(metrics.time_to_first_token)

    if metrics.input_tokens is not None:
        assistant_message.metrics["input_tokens"] = metrics.input_tokens
        model_metrics["input_tokens"] = model_metrics.get("input_tokens", 0) + metrics.input_tokens
    if metrics.output_tokens is not None:
        assistant_message.metrics["output_tokens"] = metrics.output_tokens
        model_metrics["output_tokens"] = model_metrics.get("output_tokens", 0) + metrics.output_tokens
    if metrics.prompt_tokens is not None:
        assistant_message.metrics["prompt_tokens"] = metrics.prompt_tokens
        model_metrics["prompt_tokens"] = model_metrics.get("prompt_tokens", 0) + metrics.prompt_tokens
    if metrics.completion_tokens is not None:
        assistant_message.metrics["completion_tokens"] = metrics.completion_tokens
        model_metrics["completion_tokens"] = model_metrics.get("completion_tokens", 0) + metrics.completion_tokens
    if metrics.total_tokens is not None:
        assistant_message.metrics["total_tokens"] = metrics.total_tokens
        model_metrics["total_tokens"] = model_metrics.get("total_tokens", 0) + metrics.total_tokens
    if metrics.prompt_tokens_details is not None:
        assistant_message.metrics["prompt_tokens_details"] = metrics.prompt_tokens_details
        for k, v in metrics.prompt_tokens_details.items():
            model_metrics.get("prompt_tokens_details", {}).get(k, 0) + v
    if metrics.completion_tokens_details is not None:
        assistant_message.metrics["completion_tokens_details"] = metrics.completion_tokens_details
        for k, v in metrics.completion_tokens_details.items():
            model_metrics.get("completion_tokens_details", {}).get(k, 0) + v


def add_response_usage_to_metrics(metrics: Metrics, response_usage: CompletionUsage):
    """
    Add response usage to metrics.

    Args:
        metrics (Metrics): The metrics.
        response_usage (CompletionUsage): The response usage.
    """
    metrics.input_tokens = response_usage.prompt_tokens
    metrics.prompt_tokens = response_usage.prompt_tokens
    metrics.output_tokens = response_usage.completion_tokens
    metrics.completion_tokens = response_usage.completion_tokens
    metrics.total_tokens = response_usage.total_tokens
    if response_usage.prompt_tokens_details is not None:
        if isinstance(response_usage.prompt_tokens_details, dict):
            metrics.prompt_tokens_details = response_usage.prompt_tokens_details
        elif hasattr(response_usage.prompt_tokens_details, 'model_dump'):
            metrics.prompt_tokens_details = response_usage.prompt_tokens_details.model_dump(exclude_none=True)
    if response_usage.completion_tokens_details is not None:
        if isinstance(response_usage.completion_tokens_details, dict):
            metrics.completion_tokens_details = response_usage.completion_tokens_details
        elif hasattr(response_usage.completion_tokens_details, 'model_dump'):
            metrics.completion_tokens_details = response_usage.completion_tokens_details.model_dump(
                exclude_none=True
            )


def build_tool_calls(tool_calls_data: List[ChoiceDeltaToolCall]) -> List[Dict[str, Any]]:
    """
    Build tool calls from tool call data.

    Args:
        tool_calls_data (List[ChoiceDeltaToolCall]): The tool call data to build from.

    Returns:
        List[Dict[str, Any]]: The built tool calls.
    """
    tool_calls: List[Dict[str, Any]] = []
    for _tool_call in tool_calls_data:
        _index = _tool_call.index
        _tool_call_id = _tool_call.id
        _tool_call_type = _tool_call.type
        _function_name = _tool_call.function.name if _tool_call.function else None
        _function_arguments = _tool_call.function.arguments if _tool_call.function else None

        if len(tool_calls) <= _index:
            tool_calls.extend([{}] * (_index - len(tool_calls) + 1))
        tool_call_entry = tool_calls[_index]
        if not tool_call_entry:
            tool_call_entry["id"] = _tool_call_id
            tool_call_entry["type"] = _tool_call_type
            tool_call_entry["function"] = {
                "name": _function_name or "",
                "arguments": _function_arguments or "",
            }
        else:
            if _function_name:
                tool_call_entry["function"]["name"] += _function_name
            if _function_arguments:
                tool_call_entry["function"]["arguments"] += _function_arguments
            if _tool_call_id:
                tool_call_entry["id"] = _tool_call_id
            if _tool_call_type:
                tool_call_entry["type"] = _tool_call_type
    return tool_calls


def format_message(message: Message, images: Optional[List] = None, audio: Optional[dict] = None) -> Dict[str, Any]:
    """
    Format a message into the format expected by OpenAI.

    Args:
        message (Message): The message to format.
        images (Optional[List]): Optional images to add to the message.
        audio (Optional[dict]): Optional audio to add to the message.

    Returns:
        Dict[str, Any]: The formatted message.
    """
    formatted_message = message.to_dict()
    
    # Keep the original system role instead of mapping to "developer"
    # "developer" role is not supported by many APIs including Azure OpenAI
    # Standard OpenAI API supports both "system" and "developer", but others only support standard roles
    # if message.role == "system":
    #     formatted_message["role"] = "developer"

    if message.role == "user" and message.images is not None:
        # Handle images in user messages
        if "content" not in formatted_message or not isinstance(formatted_message["content"], list):
            if formatted_message.get("content") is None:
                formatted_message["content"] = []
            elif isinstance(formatted_message["content"], str):
                formatted_message["content"] = [{"type": "text", "text": formatted_message["content"]}]
        
        for image in message.images:
            # Format image URL correctly - could be a string URL or already an object
            if isinstance(image, str):
                # If image is a string, wrap it in the required object format
                formatted_message["content"].append({
                    "type": "image_url", 
                    "image_url": {
                        "url": image
                    }
                })
            elif isinstance(image, dict) and "url" in image:
                # If image is already a dict with url, use proper format
                formatted_message["content"].append({
                    "type": "image_url", 
                    "image_url": image
                })
            elif isinstance(image, dict) and "image_url" in image and "type" in image:
                # If image is already in the correct format, use it directly
                formatted_message["content"].append(image)
            else:
                # Default fallback
                logger.warning(f"Unsupported image format: {image}")

    if message.audio is not None:
        # Handle audio in messages
        if audio is not None:
            formatted_message["audio"] = audio

    return formatted_message


def get_client_params(model) -> Dict[str, Any]:
    """
    Returns client parameters for OpenAI API.

    Args:
        model: The model with configuration parameters.

    Returns:
        Dict[str, Any]: A dictionary of client parameters.
    """
    client_params: Dict[str, Any] = {}

    api_key = model.api_key or getenv("OPENAI_API_KEY")
    if not api_key:
        logger.error("OPENAI_API_KEY not set. Please set the OPENAI_API_KEY environment variable.")

    if api_key is not None:
        client_params["api_key"] = api_key
    if model.organization is not None:
        client_params["organization"] = model.organization
    if model.base_url is not None:
        client_params["base_url"] = model.base_url
    if model.timeout is not None:
        client_params["timeout"] = model.timeout
    if model.max_retries is not None:
        client_params["max_retries"] = model.max_retries
    if model.default_headers is not None:
        client_params["default_headers"] = model.default_headers
    if model.default_query is not None:
        client_params["default_query"] = model.default_query
    if model.client_params is not None:
        client_params.update(model.client_params)
    return client_params


def create_assistant_message(
    response_message: ChatCompletionMessage,
    metrics: Metrics,
    response_usage: Optional[CompletionUsage],
    model_metrics: Dict,
) -> Message:
    """
    Create an assistant message from the response.

    Args:
        response_message (ChatCompletionMessage): The response message.
        metrics (Metrics): The metrics.
        response_usage (Optional[CompletionUsage]): The response usage.
        model_metrics (Dict): The model's metrics dictionary.

    Returns:
        Message: The assistant message.
    """
    assistant_message = Message(
        role=response_message.role or "assistant",
        content=response_message.content,
    )
    if response_message.tool_calls is not None and len(response_message.tool_calls) > 0:
        try:
            assistant_message.tool_calls = [t.model_dump() for t in response_message.tool_calls]
        except Exception as e:
            logger.warning(f"Error processing tool calls: {e}")
    if hasattr(response_message, "audio") and response_message.audio is not None:
        try:
            assistant_message.audio = response_message.audio.model_dump()
        except Exception as e:
            logger.warning(f"Error processing audio: {e}")

    # Update metrics
    update_usage_metrics(assistant_message, metrics, response_usage, model_metrics)
    return assistant_message


def get_request_kwargs(model) -> Dict[str, Any]:
    """
    Returns keyword arguments for API requests.

    Args:
        model: The model with configuration parameters.

    Returns:
        Dict[str, Any]: A dictionary of keyword arguments for API requests.
    """
    request_params: Dict[str, Any] = {}
    if model.store is not None:
        request_params["store"] = model.store
    if model.frequency_penalty is not None:
        request_params["frequency_penalty"] = model.frequency_penalty
    if model.logit_bias is not None:
        request_params["logit_bias"] = model.logit_bias
    if model.logprobs is not None:
        request_params["logprobs"] = model.logprobs
    if model.top_logprobs is not None:
        request_params["top_logprobs"] = model.top_logprobs
    if model.max_tokens is not None:
        request_params["max_tokens"] = model.max_tokens
    if model.max_completion_tokens is not None:
        request_params["max_completion_tokens"] = model.max_completion_tokens
    if model.modalities is not None:
        request_params["modalities"] = model.modalities
    if model.audio is not None:
        request_params["audio"] = model.audio
    if model.presence_penalty is not None:
        request_params["presence_penalty"] = model.presence_penalty
    if model.response_format is not None:
        request_params["response_format"] = model.response_format
    if model.seed is not None:
        request_params["seed"] = model.seed
    if model.stop is not None:
        request_params["stop"] = model.stop
    if model.temperature is not None:
        request_params["temperature"] = model.temperature
    if model.user is not None:
        request_params["user"] = model.user
    if model.top_p is not None:
        request_params["top_p"] = model.top_p
    if model.extra_headers is not None:
        request_params["extra_headers"] = model.extra_headers
    if model.extra_query is not None:
        request_params["extra_query"] = model.extra_query
    if model.tools is not None:
        request_params["tools"] = model.get_tools_for_api()
        if model.tool_choice is None:
            request_params["tool_choice"] = "auto"
        else:
            request_params["tool_choice"] = model.tool_choice
    if model.request_params is not None:
        request_params.update(model.request_params)
    return request_params


def handle_tool_calls(
    assistant_message: Message,
    messages: List[Message],
    model_response: ModelResponse,
    model,
    tool_role: str = "tool",
) -> Optional[ModelResponse]:
    """
    Handle tool calls in the assistant message.

    Args:
        assistant_message (Message): The assistant message.
        messages (List[Message]): The list of messages.
        model_response (ModelResponse): The model response.
        model: The model with configuration parameters.
        tool_role (str): The role of the tool call. Defaults to "tool".

    Returns:
        Optional[ModelResponse]: The model response after handling tool calls.
    """
    if assistant_message.tool_calls is not None and len(assistant_message.tool_calls) > 0 and model.run_tools:
        if model_response.content is None:
            model_response.content = ""
        function_call_results: List[Message] = []
        function_calls_to_run: List[FunctionCall] = []
        for tool_call in assistant_message.tool_calls:
            _tool_call_id = tool_call.get("id")
            _function_call = get_function_call_for_tool_call(tool_call, model.functions)
            if _function_call is None:
                messages.append(
                    Message(
                        role="tool",
                        tool_call_id=_tool_call_id,
                        content="Could not find function to call.",
                    )
                )
                continue
            if _function_call.error is not None:
                messages.append(
                    Message(
                        role="tool",
                        tool_call_id=_tool_call_id,
                        content=_function_call.error,
                    )
                )
                continue
            function_calls_to_run.append(_function_call)

        if model.show_tool_calls:
            model_response.content += "\nRunning:"
            for _f in function_calls_to_run:
                model_response.content += f"\n - {_f.get_call_str()}"
            model_response.content += "\n\n"

        for _ in model.run_function_calls(
            function_calls=function_calls_to_run, function_call_results=function_call_results, tool_role=tool_role
        ):
            pass

        if len(function_call_results) > 0:
            messages.extend(function_call_results)

        return model_response
    return None


def handle_stream_tool_calls(
    assistant_message: Message,
    messages: List[Message],
    model,
    tool_role: str = "tool",
):
    """
    Handle tool calls for response stream.

    Args:
        assistant_message (Message): The assistant message.
        messages (List[Message]): The list of messages.
        model: The model with configuration parameters.
        tool_role (str): The role of the tool call. Defaults to "tool".

    Returns:
        Iterator[ModelResponse]: An iterator of the model response.
    """
    if assistant_message.tool_calls is not None and len(assistant_message.tool_calls) > 0 and model.run_tools:
        function_calls_to_run: List[FunctionCall] = []
        function_call_results: List[Message] = []
        for tool_call in assistant_message.tool_calls:
            _tool_call_id = tool_call.get("id")
            _function_call = get_function_call_for_tool_call(tool_call, model.functions)
            if _function_call is None:
                messages.append(
                    Message(
                        role=tool_role,
                        tool_call_id=_tool_call_id,
                        content="Could not find function to call.",
                    )
                )
                continue
            if _function_call.error is not None:
                messages.append(
                    Message(
                        role=tool_role,
                        tool_call_id=_tool_call_id,
                        content=_function_call.error,
                    )
                )
                continue
            function_calls_to_run.append(_function_call)

        if model.show_tool_calls:
            yield ModelResponse(content="\nRunning:")
            for _f in function_calls_to_run:
                yield ModelResponse(content=f"\n - {_f.get_call_str()}")
            yield ModelResponse(content="\n\n")

        for function_call_response in model.run_function_calls(
            function_calls=function_calls_to_run, function_call_results=function_call_results, tool_role=tool_role
        ):
            yield function_call_response

        if len(function_call_results) > 0:
            messages.extend(function_call_results)
