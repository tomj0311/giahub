from os import getenv
from dataclasses import dataclass, field
from typing import Optional, List, Iterator, Dict, Any, Union

import httpx
from pydantic import BaseModel

from ai.model.base import Model
from ai.model.message import Message
from ai.model.response import ModelResponse
from ai.tools.function import FunctionCall
from ai.utils.log import logger
from ai.utils.timer import Timer
from ai.utils.tools import get_function_call_for_tool_call
from ai.model.openai.chat_utils import (
    Metrics, 
    StreamData, 
    update_usage_metrics, 
    update_stream_metrics,
    add_response_usage_to_metrics,
    build_tool_calls,
    format_message,
    get_client_params,
    create_assistant_message,
    get_request_kwargs,
    handle_tool_calls,
    handle_stream_tool_calls
)

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
    from openai import OpenAI as OpenAIClient
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


class OpenAIChat(Model):
    """
    A class for interacting with OpenAI models.

    For more information, see: https://platform.openai.com/docs/api-reference/chat/create
    """

    id: str = "gpt-4o"
    api_key: str = "None"
    name: Optional[str] = "OpenAIChat"
    provider: Optional[str] = "OpenAI"

    # Request parameters
    store: Optional[bool] = None
    metadata: Optional[Dict[str, Any]] = None
    frequency_penalty: Optional[float] = None
    logit_bias: Optional[Any] = None
    logprobs: Optional[bool] = None
    top_logprobs: Optional[int] = None
    max_tokens: Optional[int] = None
    max_completion_tokens: Optional[int] = None
    modalities: Optional[List[str]] = None
    audio: Optional[Dict[str, Any]] = None
    presence_penalty: Optional[float] = None
    response_format: Optional[Any] = None
    seed: Optional[int] = None
    stop: Optional[Union[str, List[str]]] = None
    temperature: Optional[float] = None
    user: Optional[str] = None
    top_p: Optional[float] = None
    extra_headers: Optional[Any] = None
    extra_query: Optional[Any] = None
    request_params: Optional[Dict[str, Any]] = None

    # Client parameters
    organization: Optional[str] = None
    base_url: Optional[Union[str, httpx.URL]] = None
    timeout: Optional[float] = None
    max_retries: Optional[int] = None
    default_headers: Optional[Any] = None
    default_query: Optional[Any] = None
    http_client: Optional[httpx.Client] = None
    client_params: Optional[Dict[str, Any]] = None
    # OpenAI clients
    client: Optional[OpenAIClient] = None
    # Whether to use the structured outputs with this Model.
    structured_outputs: Optional[bool] = False
    # Whether the Model supports structured outputs.
    supports_structured_outputs: Optional[bool] = True
    # Whether to log API request and response payloads at INFO level
    verbose_logging: Optional[bool] = False

    def __init__(self, **kwargs: Any):
        super().__init__(**kwargs)
        if self.metrics is None:
            self.metrics = {}

    def get_client_params(self) -> Dict[str, Any]:
        """
        Returns client parameters for OpenAI API.
        """
        params = get_client_params(self)
        logger.debug(f"Generated OpenAI client parameters: {params}")
        return params

    def get_client(self) -> OpenAIClient:
        """
        Returns an OpenAI client.

        Returns:
            OpenAIClient: An instance of the OpenAI client.
        """
        if self.client:
            logger.debug("Using existing OpenAI client")
            return self.client

        client_params: Dict[str, Any] = self.get_client_params()
        # Log parameters safely, especially API key
        log_params = client_params.copy()
        if "api_key" in log_params:
            log_params["api_key"] = f"***{log_params['api_key'][-4:]}" if log_params["api_key"] else "Not Set"
        logger.debug(f"OpenAI client parameters for initialization: {log_params}")
        if self.http_client is not None:
            client_params["http_client"] = self.http_client
            logger.debug("Using custom HTTP client for OpenAI")

        logger.info(f"Creating new OpenAI client with parameters: base_url={client_params.get('base_url')}, organization={client_params.get('organization')}")
        new_client = OpenAIClient(**client_params)
        logger.debug("New OpenAI client created successfully.")
        return new_client

    @property
    def request_kwargs(self) -> Dict[str, Any]:
        """
        Returns keyword arguments for API requests.
        """
        kwargs = get_request_kwargs(self)
        logger.debug(f"Generated OpenAI request kwargs: {kwargs}")
        return kwargs

    def to_dict(self) -> Dict[str, Any]:
        """
        Convert the model to a dictionary.
        """
        model_dict = super().to_dict()
        if self.store is not None:
            model_dict["store"] = self.store
        if self.frequency_penalty is not None:
            model_dict["frequency_penalty"] = self.frequency_penalty
        if self.logit_bias is not None:
            model_dict["logit_bias"] = self.logit_bias
        if self.logprobs is not None:
            model_dict["logprobs"] = self.logprobs
        if self.top_logprobs is not None:
            model_dict["top_logprobs"] = self.top_logprobs
        if self.max_tokens is not None:
            model_dict["max_tokens"] = self.max_tokens
        if self.max_completion_tokens is not None:
            model_dict["max_completion_tokens"] = self.max_completion_tokens
        if self.modalities is not None:
            model_dict["modalities"] = self.modalities
        if self.audio is not None:
            model_dict["audio"] = self.audio
        if self.presence_penalty is not None:
            model_dict["presence_penalty"] = self.presence_penalty
        if self.response_format is not None:
            model_dict["response_format"] = (
                self.response_format if isinstance(self.response_format, dict) else str(self.response_format)
            )
        if self.seed is not None:
            model_dict["seed"] = self.seed
        if self.stop is not None:
            model_dict["stop"] = self.stop
        if self.temperature is not None:
            model_dict["temperature"] = self.temperature
        if self.user is not None:
            model_dict["user"] = self.user
        if self.top_p is not None:
            model_dict["top_p"] = self.top_p
        if self.extra_headers is not None:
            model_dict["extra_headers"] = self.extra_headers
        if self.extra_query is not None:
            model_dict["extra_query"] = self.extra_query
        if self.tools is not None:
            model_dict["tools"] = self.get_tools_for_api()
            if self.tool_choice is None:
                model_dict["tool_choice"] = "auto"
            else:
                model_dict["tool_choice"] = self.tool_choice
        if self.verbose_logging is not None:
            model_dict["verbose_logging"] = self.verbose_logging
        return model_dict

    def format_message(self, message: Message) -> Dict[str, Any]:
        """
        Format a message into the format expected by OpenAI.
        """
        formatted = format_message(message, message.images, message.audio)
        logger.debug(f"Formatted message for OpenAI API: {formatted}")
        return formatted

    def invoke(self, messages: List[Message]) -> Union[ChatCompletion, ParsedChatCompletion]:
        """
        Send a chat completion request to the OpenAI API.
        """
        logger.info(f"Invoking OpenAI model: {self.id}")
        request_kwargs = self.request_kwargs
        formatted_messages = [self.format_message(m) for m in messages] # type: ignore
        
        if self.verbose_logging:
            logger.info(f"Request parameters: {request_kwargs}")
            logger.info(f"Number of messages in request: {len(formatted_messages)}")
            logger.info(f"Formatted messages payload: {formatted_messages}")
        else:
            logger.debug(f"Request parameters: {request_kwargs}")
            logger.debug(f"Number of messages in request: {len(formatted_messages)}")
            logger.debug(f"Formatted messages payload: {formatted_messages}")

        if self.response_format is not None and self.structured_outputs:
            try:
                if isinstance(self.response_format, type) and issubclass(self.response_format, BaseModel):
                    logger.debug(f"Using structured output with format: {self.response_format.__name__}")
                    logger.debug("Calling OpenAI beta.chat.completions.parse")
                    logger.debug(f"Parse request payload - model: {self.id}, messages: {formatted_messages}, kwargs: {request_kwargs}")
                    response = self.get_client().beta.chat.completions.parse(
                        model=self.id,
                        messages=formatted_messages,
                        **request_kwargs,
                    )
                    if self.verbose_logging:
                        logger.info(f"Received parsed response from OpenAI: {response}")
                    else:
                        logger.debug(f"Received parsed response from OpenAI: {type(response)}")
                        logger.debug(f"Raw parsed response object: {response}")
                    return response
                else:
                    error_msg = "response_format must be a subclass of BaseModel if structured_outputs=True"
                    logger.error(error_msg)
                    raise ValueError(error_msg)
            except Exception as e:
                logger.error(f"Error during structured output parsing call: {e}")
                raise

        logger.debug(f"Sending chat completion request to OpenAI with model {self.id}")
        try:
            if self.verbose_logging:
                logger.info(f"Create request payload - model: {self.id}, messages: {formatted_messages}, kwargs: {request_kwargs}")
            else:
                logger.debug(f"Create request payload - model: {self.id}, messages: {formatted_messages}, kwargs: {request_kwargs}")
                
            response = self.get_client().chat.completions.create(
                model=self.id,
                messages=formatted_messages,
                **request_kwargs,
            )
            
            if self.verbose_logging:
                logger.info(f"Raw OpenAI response received: {response}")
                logger.info(f"Received response from OpenAI: finish_reason={response.choices[0].finish_reason}")
            else:
                logger.debug(f"Raw OpenAI response received: {response}")
                logger.debug(f"Received response from OpenAI: finish_reason={response.choices[0].finish_reason}")
            return response
        except Exception as e:
            logger.error(f"Error calling OpenAI chat.completions.create: {e}")
            raise

    def invoke_stream(self, messages: List[Message]) -> Iterator[ChatCompletionChunk]:
        """
        Send a streaming chat completion request to the OpenAI API.
        """
        logger.info(f"Invoking OpenAI model {self.id} with streaming")
        formatted_messages = [self.format_message(m) for m in messages] # type: ignore
        
        if self.verbose_logging:
            logger.info(f"Number of messages in streaming request: {len(formatted_messages)}")
            logger.info(f"Formatted messages payload for stream: {formatted_messages}")
        else:
            logger.debug(f"Number of messages in streaming request: {len(formatted_messages)}")
            logger.debug(f"Formatted messages payload for stream: {formatted_messages}")

        client = self.get_client()
        request_kwargs = self.request_kwargs
        
        if self.verbose_logging:
            logger.info(f"Starting stream with parameters: {request_kwargs}")
        else:
            logger.debug(f"Starting stream with parameters: {request_kwargs}")

        try:
            if self.verbose_logging:
                logger.info(f"Stream request payload - model: {self.id}, messages: {formatted_messages}, stream: True, stream_options: {{'include_usage': True}}, kwargs: {request_kwargs}")
            else:
                logger.debug(f"Stream request payload - model: {self.id}, messages: {formatted_messages}, stream: True, stream_options: {{'include_usage': True}}, kwargs: {request_kwargs}")
                
            stream = client.chat.completions.create(
                model=self.id,
                messages=formatted_messages,
                stream=True,
                stream_options={"include_usage": True},
                **request_kwargs,
            )

            logger.debug("Stream initialized, yielding chunks")
            for chunk in stream:  # type: ignore
                if self.verbose_logging:
                    logger.info(f"Received stream chunk: {chunk}")
                else:
                    # logger.debug(f"Received stream chunk: {chunk}")
                    pass
                yield chunk
            logger.debug("Finished yielding stream chunks.")
        except Exception as e:
            logger.error(f"Error during OpenAI stream creation or iteration: {e}")
            raise

    def handle_tool_calls(
        self,
        assistant_message: Message,
        messages: List[Message],
        model_response: ModelResponse,
        tool_role: str = "tool",
    ) -> Optional[ModelResponse]:
        """
        Handle tool calls in the assistant message.
        """
        logger.debug(f"Handling tool calls for assistant message: {assistant_message.tool_calls}")
        logger.debug(f"Input messages state (before tool call handling): {messages}")
        logger.debug(f"Input model_response state: {model_response}")
        result = handle_tool_calls(
            assistant_message=assistant_message,
            messages=messages,
            model_response=model_response,
            model=self,
            tool_role=tool_role,
        )
        logger.debug(f"Tool call handling result type: {type(result)}")
        logger.debug(f"Tool call handling result value: {result}")
        logger.debug(f"Messages state after tool call handling: {messages}")
        return result

    def update_usage_metrics(
        self, assistant_message: Message, metrics: Metrics, response_usage: Optional[CompletionUsage]
    ) -> None:
        """
        Update the usage metrics for the assistant message and the model.
        """
        update_usage_metrics(assistant_message, metrics, response_usage, self.metrics)

    def create_assistant_message(
        self,
        response_message: ChatCompletionMessage,
        metrics: Metrics,
        response_usage: Optional[CompletionUsage],
    ) -> Message:
        """
        Create an assistant message from the response.
        """
        return create_assistant_message(
            response_message=response_message, 
            metrics=metrics, 
            response_usage=response_usage, 
            model_metrics=self.metrics
        )

    def response(self, messages: List[Message]) -> ModelResponse:
        """
        Generate a response from OpenAI.
        """
        logger.debug("---------- OpenAI Response Start ----------")
        logger.info(f"Generating response with model {self.id}")
        logger.debug(f"Input messages for response generation: {messages}")
        self._log_messages(messages)
        model_response = ModelResponse()
        metrics = Metrics()

        # -*- Generate response
        logger.debug("Starting response timer")
        metrics.response_timer.start()
        try:
            logger.debug("Calling invoke method...")
            response: Union[ChatCompletion, ParsedChatCompletion] = self.invoke(messages=messages)
            logger.debug("Invoke method returned.")
        except Exception as e:
            logger.error(f"Failed to invoke OpenAI model: {e}")
            # Potentially return an error response or re-raise
            model_response.error = str(e)
            logger.debug("---------- OpenAI Response End (Error) ----------")
            return model_response
        metrics.response_timer.stop()
        logger.debug(f"Response time: {metrics.response_timer.elapsed:.4f}s")
        logger.debug(f"Full OpenAI response object: {response}")

        # -*- Parse response
        logger.debug("Parsing response...")
        response_message: ChatCompletionMessage = response.choices[0].message
        response_usage: Optional[CompletionUsage] = response.usage
        response_audio: Optional[ChatCompletionAudio] = response_message.audio
        logger.debug(f"Response message: {response_message}")
        logger.debug(f"Response usage: {response_usage}")
        logger.debug(f"Response audio: {response_audio}")

        if response_usage:
            logger.info(f"Usage - Prompt tokens: {response_usage.prompt_tokens}, Completion tokens: {response_usage.completion_tokens}, Total tokens: {response_usage.total_tokens}")

        # -*- Parse transcript if available
        if response_audio:
            if response_audio.transcript and not response_message.content:
                logger.debug("Using audio transcript as message content.")
                response_message.content = response_audio.transcript

        # -*- Parse structured outputs
        try:
            if (
                self.response_format is not None
                and self.structured_outputs
                and issubclass(self.response_format, BaseModel)
            ):
                logger.debug("Attempting to parse structured output.")
                parsed_object = response_message.parsed  # type: ignore
                if parsed_object is not None:
                    logger.debug(f"Successfully parsed structured output: {parsed_object}")
                    model_response.parsed = parsed_object
                else:
                    logger.debug("No structured output found in response.")
        except Exception as e:
            logger.warning(f"Error retrieving structured outputs: {e}")

        # -*- Create assistant message
        logger.debug("Creating assistant message from response...")
        assistant_message = self.create_assistant_message(
            response_message=response_message, metrics=metrics, response_usage=response_usage
        )
        logger.debug(f"Created assistant message: {assistant_message}")

        # -*- Add assistant message to messages
        logger.debug("Appending assistant message to messages list...")
        messages.append(assistant_message)

        # -*- Log response and metrics
        assistant_message.log()
        metrics.log()

        # -*- Update model response with assistant message content and audio
        if assistant_message.content is not None:
            # add the content to the model response
            model_response.content = assistant_message.get_content_string()
            logger.debug(f"ModelResponse content set: {model_response.content}")
        if assistant_message.audio is not None:
            # add the audio to the model response
            model_response.audio = assistant_message.audio
            logger.debug(f"ModelResponse audio set: {model_response.audio}")

        # -*- Handle tool calls
        tool_role = "tool"
        if (
            assistant_message.tool_calls is not None and
            len(assistant_message.tool_calls) > 0 and
            self.run_tools
        ):
            logger.debug("Assistant message has tool calls, proceeding to handle.")
            logger.debug(f"Calling handle_tool_calls with assistant_message: {assistant_message}, messages: {messages}, model_response: {model_response}, tool_role: {tool_role}")
            tool_call_response = self.handle_tool_calls(
                assistant_message=assistant_message,
                messages=messages,
                model_response=model_response,
                tool_role=tool_role,
            )
            if tool_call_response is not None:
                logger.debug("Tool call handling returned a response, returning it.")
                logger.debug(f"Returning tool_call_response: {tool_call_response}")
                logger.debug("---------- OpenAI Response End (After Tool Call) ----------")
                return tool_call_response
            else:
                # This case might indicate an issue or a scenario where no further action is needed after tool call handling
                logger.debug("Tool call handling did not return a response, returning current model_response.")
        else:
            logger.debug("No tool calls in assistant message or run_tools is False.")

        logger.debug(f"Final ModelResponse before returning: {model_response}")
        logger.debug("---------- OpenAI Response End ----------")
        return model_response

    def update_stream_metrics(self, assistant_message: Message, metrics: Metrics):
        """
        Update the usage metrics for the assistant message and the model.
        """
        update_stream_metrics(assistant_message, metrics, self.metrics)

    def handle_stream_tool_calls(
        self,
        assistant_message: Message,
        messages: List[Message],
        tool_role: str = "tool",
    ) -> Iterator[ModelResponse]:
        """
        Handle tool calls for response stream.
        """
        logger.debug(f"Handling stream tool calls for assistant message: {assistant_message.tool_calls}")
        logger.debug(f"Input messages state (before stream tool call handling): {messages}")
        yield from handle_stream_tool_calls(
            assistant_message=assistant_message,
            messages=messages,
            model=self,
            tool_role=tool_role
        )
        logger.debug("Finished handling stream tool calls.")
        logger.debug(f"Messages state after stream tool call handling: {messages}")


    def response_stream(self, messages: List[Message]) -> Iterator[ModelResponse]:
        """
        Generate a streaming response from OpenAI.
        """
        logger.debug("---------- OpenAI Stream Response Start ----------")
        self._log_messages(messages)
        stream_data: StreamData = StreamData()
        metrics: Metrics = Metrics()

        # -*- Generate response
        metrics.response_timer.start()
        logger.debug("Invoking stream...")
        try:
            stream_iterator = self.invoke_stream(messages=messages)
            for response in stream_iterator:
                # logger.debug(f"Processing stream chunk: {response}")
                if len(response.choices) > 0:
                    metrics.completion_tokens += 1
                    if metrics.completion_tokens == 1:
                        metrics.time_to_first_token = metrics.response_timer.elapsed
                        logger.debug(f"Time to first token: {metrics.time_to_first_token:.4f}s")

                    response_delta: ChoiceDelta = response.choices[0].delta

                    if response_delta.content is not None:
                        stream_data.response_content += response_delta.content
                        # logger.debug(f"Yielding content chunk: {response_delta.content}")
                        yield ModelResponse(content=response_delta.content)

                    if hasattr(response_delta, "audio"):
                        response_audio = response_delta.audio
                        stream_data.response_audio = response_audio
                        logger.debug(f"Yielding audio chunk: {response_audio}")
                        yield ModelResponse(audio=response_audio)

                    if response_delta.tool_calls is not None:
                        logger.debug(f"Received tool call chunk: {response_delta.tool_calls}")
                        if stream_data.response_tool_calls is None:
                            stream_data.response_tool_calls = []
                        stream_data.response_tool_calls.extend(response_delta.tool_calls)
                        logger.debug(f"Aggregated tool calls so far: {stream_data.response_tool_calls}")

                if response.usage is not None:
                    add_response_usage_to_metrics(metrics=metrics, response_usage=response.usage)
            metrics.response_timer.stop()
            logger.debug(f"Stream finished. Total response time: {metrics.response_timer.elapsed:.4f}s")
            logger.debug(f"Final aggregated stream data: content_len={len(stream_data.response_content)}, audio_present={stream_data.response_audio is not None}, tool_calls_present={stream_data.response_tool_calls is not None}")
        except Exception as e:
            metrics.response_timer.stop()
            logger.error(f"Error during stream processing: {e}")
            # Use content parameter instead of unsupported error parameter
            yield ModelResponse(content=f"Error: {str(e)}")
            logger.debug("---------- OpenAI Stream Response End (Error) ----------")
            return # Stop iteration on error

        # -*- Create assistant message
        logger.debug("Creating final assistant message from aggregated stream data...")
        assistant_message = Message(role="assistant")
        if stream_data.response_content != "":
            assistant_message.content = stream_data.response_content
        if stream_data.response_audio is not None:
            assistant_message.audio = stream_data.response_audio
        if stream_data.response_tool_calls is not None:
            logger.debug("Building final tool calls from aggregated chunks...")
            _tool_calls = build_tool_calls(stream_data.response_tool_calls)
            if len(_tool_calls) > 0:
                assistant_message.tool_calls = _tool_calls
                logger.debug(f"Built tool calls: {_tool_calls}")
            else:
                logger.debug("No valid tool calls built from chunks.")

        # -*- Update usage metrics
        logger.debug("Updating stream metrics...")
        self.update_stream_metrics(assistant_message=assistant_message, metrics=metrics)

        # -*- Add assistant message to messages
        logger.debug("Appending final assistant message to messages list...")
        messages.append(assistant_message)

        # -*- Log response and metrics
        assistant_message.log()
        metrics.log()

        # -*- Handle tool calls
        if assistant_message.tool_calls is not None and len(assistant_message.tool_calls) > 0 and self.run_tools:
            logger.debug("Assistant message from stream has tool calls, proceeding to handle.")
            tool_role = "tool"
            try:
                logger.debug(f"Calling handle_stream_tool_calls with assistant_message: {assistant_message}, messages: {messages}, tool_role: {tool_role}")
                yield from self.handle_stream_tool_calls(
                    assistant_message=assistant_message, messages=messages, tool_role=tool_role
                )
                logger.debug("Handling post-tool call messages stream.")
                yield from self.handle_post_tool_call_messages_stream(messages=messages)
            except Exception as e:
                logger.error(f"Error during stream tool call handling: {e}")
                # Use content parameter instead of unsupported error parameter
                yield ModelResponse(content=f"Error: {str(e)}")
        else:
            logger.debug("No tool calls in assistant message from stream or run_tools is False.")

        logger.debug("---------- OpenAI Stream Response End ----------")
