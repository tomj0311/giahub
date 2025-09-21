import json
from os import getenv
from typing import Optional

from ai.tools import Toolkit
from ai.utils.log import logger

try:
    import requests
except ImportError:
    raise ImportError("`requests` not installed. Please install using `pip install requests`")


class SerperTools(Toolkit):
    def __init__(
        self,
        api_key: str = None,
        num_results: Optional[int] = None,
        show_results: bool = False,
    ):
        super().__init__(name="serper")

        self.api_key = api_key or getenv("SERPER_API_KEY")
        if not self.api_key:
            logger.error("SERPER_API_KEY not set. Please set the SERPER_API_KEY environment variable.")
        else:
            logger.info("SerperTools initialized with API key")

        logger.debug(f"SerperTools configuration: num_results={num_results}, show_results={show_results}")

        self.show_results = show_results
        self.num_results = num_results

        self.register(self.search_serper)

    def search_serper(self, query: str, page: int = 1, num_results: int = 10) -> str:
        """Use this function to search Google using Serper API.

        Args:
            query (str): The query to search for.
            page (int): Page number for results. Defaults to 1.
            num_results (int): Number of results to return. Defaults to 10.

        Returns:
            str: The search results in JSON format.
        """
        logger.info(f"SerperTools search requested for: '{query}'")
        effective_num_results = self.num_results or num_results
        logger.debug(f"Search parameters: effective_num_results={effective_num_results}, requested_num_results={num_results}, tool_default_num_results={self.num_results}, page={page}")

        if not self.api_key:
            logger.error("Cannot perform search: SERPER_API_KEY not set")
            return "Please set the SERPER_API_KEY"

        try:
            url = "https://google.serper.dev/search"

            payload = json.dumps({"q": query, "page": page, "num": effective_num_results})
            logger.debug(f"Search payload: {payload}")

            headers = {"X-API-KEY": self.api_key, "Content-Type": "application/json"}
            logger.debug(f"Using headers: X-API-KEY=[REDACTED], Content-Type={headers['Content-Type']}")

            logger.info(f"Searching serper for: {query}")
            logger.debug(f"Using Serper search parameters: page={page}, num={effective_num_results}")

            logger.debug("Executing Serper API call")
            response = requests.post(url, headers=headers, data=payload)
            response.raise_for_status()  # Raise exception for non-200 status codes
            logger.debug(f"Serper API response status: {response.status_code}")

            results = response.json()
            logger.info(f"Received results from Serper")

                        # Log a truncated version of the raw results for inspection
            try:
                raw_results_str = json.dumps(results)
                logger.debug(
                    f"Raw Serper results (first 1000 chars): {raw_results_str[:1000]}{'...' if len(raw_results_str) > 1000 else ''}"
                )
            except Exception as log_err:
                logger.warning(f"Could not serialize raw Serper results for logging: {log_err}")

            formatted_results = json.dumps(results, indent=4)
            logger.debug(f"Formatted results JSON (length: {len(formatted_results)})")

            if self.show_results:
                logger.info(f"Serper search results:\n{formatted_results}")

            logger.debug("Serper search completed successfully.")
            return formatted_results

        except Exception as e:
            logger.error(f"Failed to search serper: {e}")
            import traceback

            logger.debug(f"Search error details: {traceback.format_exc()}")
            return f"Error searching Serper: {e}"
