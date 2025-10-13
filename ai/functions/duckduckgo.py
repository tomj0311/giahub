import json
from typing import Any, Optional

from ai.tools import Toolkit
from ai.utils.log import logger

try:
    from ddgs import DDGS
except ImportError:
    raise ImportError("`ddgs` not installed. Please install using `pip install ddgs`")


class DuckDuckGoTools(Toolkit):
    """Toolkit wrapper exposing DuckDuckGo search and news.

    Mirrors the Toolkit style used across ai.functions (e.g., ExaTools/SerperTools).

    Args:
        search: Register the general text search tool.
        news: Register the news search tool.
        modifier: Optional leading modifier added to every query.
        fixed_max_results: Optional fixed max results; overrides per-call value when set.
        proxy: Optional proxy string.
        timeout: Timeout in seconds for network requests. Defaults to 10.
        verify_ssl: Whether to verify SSL certificates. Defaults to True.
        show_results: If True, logs the formatted results at info level.
    """

    def __init__(
        self,
        search: bool = True,
        news: bool = True,
        modifier: Optional[str] = None,
        fixed_max_results: Optional[int] = None,
        proxy: Optional[str] = None,
        timeout: Optional[int] = 10,
        verify_ssl: bool = True,
        show_results: bool = False,
    ):
        super().__init__(name="duckduckgo")

        self.proxy: Optional[str] = proxy
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
            proxy=self.proxy,
            timeout=self.timeout,
            verify=self.verify_ssl,
        )

    def duckduckgo_search(self, query: str, max_results: int = 5) -> str:
        """Search DuckDuckGo for information. Provide a search query string to find relevant results.

        Args:
            query (str): The search query string. Required. Example: "Epic: The Musical song list"
            max_results (int): The maximum number of results to return. Optional, defaults to 5.

        Returns:
            str: JSON string containing search results with titles, links, and snippets.
        
        Example:
            duckduckgo_search(query="Python programming tutorial", max_results=10)
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
            results = ddgs.text(query=q, max_results=effective_max)
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
        """Get the latest news from DuckDuckGo. Provide a news search query string.

        Args:
            query (str): The news search query string. Required. Example: "artificial intelligence latest news"
            max_results (int): The maximum number of results to return. Optional, defaults to 5.

        Returns:
            str: JSON string containing news results with titles, links, dates, and sources.
        
        Example:
            duckduckgo_news(query="technology news today", max_results=10)
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
            results = ddgs.news(query=q, max_results=effective_max)
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
