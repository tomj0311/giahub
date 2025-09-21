import json
from typing import Optional, Any, List, Dict

from ai.tools import Toolkit
from ai.utils.log import logger

try:
    # We rely on the lightweight googlesearch-python package
    from googlesearch import search  # type: ignore
except ImportError:  # pragma: no cover
    raise ImportError("`googlesearch-python` not installed. Please install using `pip install googlesearch-python`")

try:
    from pycountry import pycountry  # type: ignore
except ImportError:  # pragma: no cover
    raise ImportError("`pycountry` not installed. Please install using `pip install pycountry`")


class GoogleSearchTools(Toolkit):
    """Toolkit wrapper exposing a Google search function using googlesearch-python.

    Mirrors the Toolkit style used across ai.functions (e.g., ExaTools/SerperTools).

    Args:
        fixed_max_results: Optional fixed max results; overrides per-call value when set.
        fixed_language: Optional fixed language (ISO 639-1 like 'en' or name like 'English').
        headers: Optional headers for requests (forwarded to underlying library if supported).
        proxy: Optional proxy string for network requests.
        timeout: Optional timeout (seconds) used by the underlying library when applicable.
        show_results: If True, logs the formatted results at info level.
    """

    def __init__(
        self,
        fixed_max_results: Optional[int] = None,
        fixed_language: Optional[str] = None,
        headers: Optional[Any] = None,
        proxy: Optional[str] = None,
        timeout: Optional[int] = 10,
        show_results: bool = False,
    ):
        super().__init__(name="google_search")

        self.fixed_max_results = fixed_max_results
        self.fixed_language = fixed_language
        self.headers = headers
        self.proxy = proxy
        self.timeout = timeout
        self.show_results = show_results

        logger.debug(
            f"GoogleSearchTools configuration: fixed_max_results={fixed_max_results}, fixed_language={fixed_language}, "
            f"proxy={'set' if proxy else 'none'}, timeout={timeout}, show_results={show_results}"
        )

        # Register tool function
        self.register(self.search_google)

    def _normalize_language(self, language: str) -> str:
        """Return ISO 639-1 code when given full language name or code; defaults to 'en'."""
        if not language:
            return "en"
        if len(language) == 2:
            return language
        try:
            _lang = pycountry.languages.lookup(language)
            if _lang and getattr(_lang, "alpha_2", None):
                return _lang.alpha_2
        except Exception:
            pass
        return "en"

    def search_google(self, query: str, max_results: int = 5, language: str = "en") -> str:
        """Use this function to search Google for a specified query.

        Args:
            query: The query to search for.
            max_results: Maximum number of results to return. Default is 5.
            language: Language of the search results (name or 2-letter code). Default is 'en'.

        Returns:
            JSON string containing the search results with title, url, and description.
        """
        logger.info(f"GoogleSearchTools search requested for: '{query}'")

        effective_max = self.fixed_max_results or max_results
        effective_lang = self._normalize_language(self.fixed_language or language)
        logger.debug(
            f"Search parameters: effective_max_results={effective_max}, requested_max_results={max_results}, "
            f"language={effective_lang} (raw={language}, fixed={self.fixed_language})"
        )

        if not query:
            logger.warning("Empty query provided to Google search")
            return json.dumps([])

        try:
            logger.debug("Executing googlesearch-python search call")
            results_iter = search(
                query,
                num_results=effective_max,
                lang=effective_lang,
                proxy=self.proxy,
                advanced=True,
            )
            results_list = list(results_iter)
            logger.info(f"Received {len(results_list)} results from GoogleSearch")

            cleaned: List[Dict[str, str]] = []
            for i, r in enumerate(results_list):
                try:
                    cleaned.append(
                        {
                            "title": getattr(r, "title", "") or "",
                            "url": getattr(r, "url", "") or "",
                            "description": getattr(r, "description", "") or "",
                        }
                    )
                    logger.debug(f"Processed result {i+1}: {cleaned[-1]['url']}")
                except Exception as e:
                    logger.debug(f"Skipping result {i+1} due to serialization error: {e}")

            formatted = json.dumps(cleaned, indent=2)
            logger.debug(f"Formatted results JSON length: {len(formatted)}")
            if self.show_results:
                logger.info(f"Google search results:\n{formatted}")
            return formatted
        except Exception as e:
            logger.error(f"Failed to perform Google search: {e}")
            import traceback
            logger.debug(f"Google search error details: {traceback.format_exc()}")
            return f"Error searching Google: {e}"
