import json
from typing import Any, Optional

from ai.tools import Toolkit
from ai.utils.log import logger

try:
    from duckduckgo_search import DDGS
except ImportError:
    raise ImportError("`duckduckgo-search` not installed. Please install using `pip install duckduckgo-search`")


class DuckDuckGoTools(Toolkit):
    """Toolkit wrapper exposing DuckDuckGo search and news.

    Mirrors the Toolkit style used across ai.functions (e.g., ExaTools/SerperTools).

    Args:
        search: Register the general text search tool.
        news: Register the news search tool.
        modifier: Optional leading modifier added to every query.
        fixed_max_results: Optional fixed max results; overrides per-call value when set.
        headers: Optional headers forwarded to DDGS.
        proxy: Optional proxy string.
        proxies: Optional proxies mapping.
        timeout: Timeout in seconds for network requests.
        verify_ssl: Whether to verify SSL certificates.
        show_results: If True, logs the formatted results at info level.
    """

    def __init__(
        self,
        search: bool = True,
        news: bool = True,
        modifier: Optional[str] = None,
        fixed_max_results: Optional[int] = None,
        headers: Optional[Any] = None,
        proxy: Optional[str] = None,
        proxies: Optional[Any] = None,
        timeout: Optional[int] = 10,
        verify_ssl: bool = True,
        show_results: bool = False,
    ):
        super().__init__(name="duckduckgo")

        self.headers: Optional[Any] = headers
        self.proxy: Optional[str] = proxy
        self.proxies: Optional[Any] = proxies
        self.timeout: Optional[int] = timeout
        self.fixed_max_results: Optional[int] = fixed_max_results
        self.modifier: Optional[str] = modifier
        self.verify_ssl: bool = verify_ssl
        self.show_results: bool = show_results

        logger.debug(
            f"DuckDuckGoTools configuration: fixed_max_results={fixed_max_results}, modifier={modifier}, "
            f"proxy={'set' if proxy else 'none'}, timeout={timeout}, verify_ssl={verify_ssl}, show_results={show_results}"
        )

        if search:
            self.register(self.duckduckgo_search)
        if news:
            self.register(self.duckduckgo_news)

    def _client(self) -> DDGS:
        return DDGS(
            headers=self.headers,
            proxy=self.proxy,
            proxies=self.proxies,
            timeout=self.timeout,
            verify=self.verify_ssl,
        )

    def duckduckgo_search(self, query: str, max_results: int = 5) -> str:
        """Use this function to search DuckDuckGo for a query.

        Args:
            query: The query to search for.
            max_results: The maximum number of results to return. Default is 5.

        Returns:
            JSON string with search results.
        """
        logger.info(f"DuckDuckGoTools search requested for: '{query}'")
        effective_max = self.fixed_max_results or max_results
        logger.debug(
            f"Search parameters: effective_max_results={effective_max}, requested_max_results={max_results}, "
            f"tool_fixed_max_results={self.fixed_max_results}"
        )

        try:
            ddgs = self._client()
            q = f"{self.modifier} {query}".strip() if self.modifier else query
            logger.debug(f"Executing DDG text search with query='{q}'")
            results = ddgs.text(keywords=q, max_results=effective_max)
            formatted = json.dumps(results, indent=2)
            logger.debug(f"Formatted results JSON length: {len(formatted)}")
            if self.show_results:
                logger.info(f"DuckDuckGo search results:\n{formatted}")
            return formatted
        except Exception as e:
            logger.error(f"Failed to perform DuckDuckGo search: {e}")
            import traceback

            logger.debug(f"DuckDuckGo search error details: {traceback.format_exc()}")
            return f"Error searching DuckDuckGo: {e}"

    def duckduckgo_news(self, query: str, max_results: int = 5) -> str:
        """Use this function to get the latest news from DuckDuckGo.

        Args:
            query: The query to search for.
            max_results: The maximum number of results to return. Default is 5.

        Returns:
            JSON string with news results.
        """
        logger.info(f"DuckDuckGoTools news requested for: '{query}'")
        effective_max = self.fixed_max_results or max_results
        logger.debug(
            f"News parameters: effective_max_results={effective_max}, requested_max_results={max_results}, "
            f"tool_fixed_max_results={self.fixed_max_results}"
        )

        try:
            ddgs = self._client()
            q = f"{self.modifier} {query}".strip() if self.modifier else query
            logger.debug(f"Executing DDG news search with query='{q}'")
            results = ddgs.news(keywords=q, max_results=effective_max)
            formatted = json.dumps(results, indent=2)
            logger.debug(f"Formatted news JSON length: {len(formatted)}")
            if self.show_results:
                logger.info(f"DuckDuckGo news results:\n{formatted}")
            return formatted
        except Exception as e:
            logger.error(f"Failed to perform DuckDuckGo news search: {e}")
            import traceback

            logger.debug(f"DuckDuckGo news error details: {traceback.format_exc()}")
            return f"Error searching DuckDuckGo news: {e}"
