import json
from os import getenv
from typing import Optional, Literal, Dict, Any

from ai.tools import Toolkit
from ai.utils.log import logger

try:
    from tavily import TavilyClient
except ImportError:
    raise ImportError("`tavily-python` not installed. Please install using `pip install tavily-python`")


class TavilyTools(Toolkit):
    def __init__(
        self,
        api_key: str = None,
        search: bool = True,
        max_tokens: int = 1000,
        include_answer: bool = True,
        search_depth: Literal["basic", "advanced"] = "advanced",
        format: Literal["json", "markdown"] = "markdown",
        use_search_context: bool = False,
    ):
        super().__init__(name="tavily_tools")

        self.api_key = api_key or getenv("TAVILY_API_KEY")
        if not self.api_key:
            logger.error("TAVILY_API_KEY not provided")
        else:
            logger.info("TavilyTools initialized with API key")
            
        logger.debug(f"TavilyTools configuration: search_depth={search_depth}, max_tokens={max_tokens}, include_answer={include_answer}, format={format}, use_search_context={use_search_context}")

        self.client: TavilyClient = TavilyClient(api_key=self.api_key)
        self.search_depth: Literal["basic", "advanced"] = search_depth
        self.max_tokens: int = max_tokens
        self.include_answer: bool = include_answer
        self.format: Literal["json", "markdown"] = format

        if search:
            if use_search_context:
                self.register(self.web_search_with_tavily)
            else:
                self.register(self.web_search_using_tavily)

    def web_search_using_tavily(self, query: str, max_results: int = 5) -> str:
        """Use this function to search the web for a given query.
        This function uses the Tavily API to provide realtime online information about the query.

        Args:
            query (str): Query to search for.
            max_results (int): Maximum number of results to return. Defaults to 5.

        Returns:
            str: JSON string of results related to the query.
        """
        logger.info(f"TavilyTools search requested for: '{query}'")
        logger.debug(f"Search parameters: max_results={max_results}")

        if not self.api_key:
            logger.error("Cannot perform search: TAVILY_API_KEY not set")
            return "Please set the TAVILY_API_KEY"

        try:
            logger.info(f"Searching Tavily for: {query}")
            logger.debug("Executing Tavily search API call")
            response = self.client.search(
                query=query, search_depth=self.search_depth, include_answer=self.include_answer, max_results=max_results
            )

            # Be cautious logging raw results if they can be very large
            logger.debug(f"Raw Tavily results object type: {type(response)}")
            # Log a truncated version of the raw results for inspection
            try:
                raw_results_str = str(response)
                logger.debug(f"Raw Tavily results (first 1000 chars): {raw_results_str[:1000]}{'...' if len(raw_results_str) > 1000 else ''}")
            except Exception as log_err:
                logger.warning(f"Could not serialize raw Tavily results for logging: {log_err}")

            logger.info(f"Received {len(response.get('results', []))} results from Tavily")

            clean_response: Dict[str, Any] = {"query": query}
            if "answer" in response:
                clean_response["answer"] = response["answer"]

            clean_results = []
            current_token_count = len(json.dumps(clean_response))
            for i, result in enumerate(response.get("results", [])):
                logger.debug(f"Processing result {i+1}: {result['url']}")
                _result = {
                    "title": result["title"],
                    "url": result["url"],
                    "content": result["content"],
                    "score": result["score"],
                }
                current_token_count += len(json.dumps(_result))
                if current_token_count > self.max_tokens:
                    logger.debug(f"Token limit reached at result {i+1}, stopping processing")
                    break
                clean_results.append(_result)
                logger.debug(f"Added result {i+1} to clean results")

            clean_response["results"] = clean_results

            if self.format == "json":
                formatted_result = json.dumps(clean_response) if clean_response else "No results found."
            elif self.format == "markdown":
                _markdown = ""
                _markdown += f"# {query}\n\n"
                if "answer" in clean_response:
                    _markdown += "### Summary\n"
                    _markdown += f"{clean_response.get('answer')}\n\n"
                for result in clean_response["results"]:
                    _markdown += f"### [{result['title']}]({result['url']})\n"
                    _markdown += f"{result['content']}\n\n"
                formatted_result = _markdown

            logger.debug(f"Formatted {len(clean_results)} results into {self.format} string (length: {len(formatted_result)})")
            # Log truncated formatted results if they are very long
            logger.debug(f"Formatted results (first 1000 chars): {formatted_result[:1000]}{'...' if len(formatted_result) > 1000 else ''}")

            logger.debug("Tavily search completed successfully.")
            return formatted_result
        except Exception as e:
            logger.error(f"Failed to search Tavily: {e}")
            import traceback
            logger.debug(f"Search error details: {traceback.format_exc()}")
            return f"Error searching Tavily: {e}"

    def web_search_with_tavily(self, query: str) -> str:
        """Use this function to search the web for a given query.
        This function uses the Tavily API to provide realtime online information about the query.

        Args:
            query (str): Query to search for.

        Returns:
            str: JSON string of results related to the query.
        """
        logger.info(f"TavilyTools search context requested for: '{query}'")

        if not self.api_key:
            logger.error("Cannot perform search: TAVILY_API_KEY not set")
            return "Please set the TAVILY_API_KEY"

        try:
            logger.info(f"Searching Tavily for context: {query}")
            logger.debug("Executing Tavily get_search_context API call")
            result = self.client.get_search_context(
                query=query, search_depth=self.search_depth, max_tokens=self.max_tokens, include_answer=self.include_answer
            )

            logger.debug(f"Raw Tavily search context result type: {type(result)}")
            # Log a truncated version of the result for inspection
            try:
                result_str = str(result)
                logger.debug(f"Raw Tavily search context result (first 1000 chars): {result_str[:1000]}{'...' if len(result_str) > 1000 else ''}")
            except Exception as log_err:
                logger.warning(f"Could not serialize raw Tavily search context result for logging: {log_err}")

            logger.debug(f"Search context result length: {len(result) if isinstance(result, str) else 'N/A'}")
            logger.debug("Tavily search context completed successfully.")
            return result
        except Exception as e:
            logger.error(f"Failed to get search context from Tavily: {e}")
            import traceback
            logger.debug(f"Search context error details: {traceback.format_exc()}")
            return f"Error getting search context from Tavily: {e}"
