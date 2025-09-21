import json
from typing import Optional, List, Dict, Any, Union

from ai.tools import Toolkit
from ai.utils.log import logger

try:  # Newer API objects
    from firecrawl import FirecrawlApp, AsyncFirecrawlApp, V1ScrapeOptions as ScrapeOptions  # type: ignore
except ImportError:  # pragma: no cover
    raise ImportError(
        "`firecrawl-py` not installed. Install with: pip install firecrawl-py"
    )


class FirecrawlTools(Toolkit):
    """Toolkit wrapper for Firecrawl (v2+ API).

    Provides synchronous wrappers around the new Firecrawl methods:
      - scrape_url
      - crawl_url
      - map_url
      - search

    The upstream library exposes both sync (FirecrawlApp) and async (AsyncFirecrawlApp)
    classes. We default to the sync client for easier integration with existing
    synchronous tool execution. If you need high concurrency you could extend this
    to expose async variants.

    Backwards compatibility: For older (<2.0) signatures that expected a single
    params dict we attempt a fallback if the direct call raises a TypeError.
    """

    def __init__(
        self,
        api_key: str = None,
        formats: Optional[List[str]] = None,
        default_limit: int = 5,
        # Backwards-compat / selective registration flags. Older examples
        # sometimes passed scrape=False, crawl=True, etc. We keep them optional
        # so existing code without these args is unaffected.
        scrape: bool = True,
        crawl: bool = True,
        map_site: bool = True,
        search: bool = True,
        **_: Any,  # swallow any legacy / unknown kwargs gracefully
    ):
        super().__init__(name="firecrawl_tools")
        
        self.api_key: Optional[str] = api_key
        if not self.api_key:
            logger.warning("FIRECRAWL_API_KEY not provided. Some functionality may be limited.")
        else:
            logger.info("FirecrawlTools initialized with API key")
            
        self.formats: Optional[List[str]] = formats
        self.default_limit: int = default_limit
        
        logger.debug(f"FirecrawlTools configuration: formats={formats}, default_limit={default_limit}")
        logger.debug(f"Tool registration flags: scrape={scrape}, crawl={crawl}, map_site={map_site}, search={search}")

        # Instantiate sync client
        try:
            self.app: FirecrawlApp = FirecrawlApp(api_key=self.api_key)
            logger.info("Firecrawl client initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize Firecrawl client: {e}")
            raise

        # Register tool functions conditionally based on flags
        registered_tools = []
        if scrape:
            self.register(self.scrape_website)
            registered_tools.append("scrape_website")
        if crawl:
            self.register(self.crawl_website)
            registered_tools.append("crawl_website")
        if map_site:
            self.register(self.map_website)
            registered_tools.append("map_website")
        if search:
            self.register(self.search_web)
            registered_tools.append("search_web")
        
        logger.info(f"FirecrawlTools registered tools: {', '.join(registered_tools)}")

    # ---------------------- Serialization helper ----------------------
    def _serialize(self, obj: Any) -> Any:
        """Best-effort conversion of Firecrawl response objects to JSONable data.

        Handles objects with one of: json(), dict(), model_dump(), to_dict(), __dict__,
        dataclasses, lists / tuples / sets, and nested structures.
        """
        import dataclasses

        if obj is None or isinstance(obj, (str, int, float, bool)):
            return obj
        if isinstance(obj, (list, tuple, set)):
            return [self._serialize(i) for i in obj]
        if isinstance(obj, dict):
            return {k: self._serialize(v) for k, v in obj.items()}
        # Firecrawl responses might have a json() that returns dict/list
        for attr in ("json", "model_dump", "dict", "to_dict"):
            if hasattr(obj, attr) and callable(getattr(obj, attr)):
                try:
                    return self._serialize(getattr(obj, attr)())
                except Exception:
                    pass
        if dataclasses.is_dataclass(obj):
            try:
                return self._serialize(dataclasses.asdict(obj))
            except Exception:
                pass
        if hasattr(obj, "__dict__"):
            try:
                return self._serialize(vars(obj))
            except Exception:
                pass
        # Fallback to string representation
        return str(obj)

    def _to_json(self, obj: Any) -> str:
        try:
            return json.dumps(self._serialize(obj))
        except Exception as e:  # pragma: no cover
            logger.warning(f"Serialization failed: {e}")
            return json.dumps({"error": f"serialization_failed: {e}"})

    # ---------------------- Internal helpers ----------------------
    def _build_scrape_options(
        self,
        formats: Optional[List[str]] = None,
        only_main_content: Optional[bool] = None,
        parse_pdf: Optional[bool] = None,
        max_age: Optional[int] = None,
    ):
        """Create a ScrapeOptions object if any value is provided.

        Note: Current Firecrawl ScrapeOptions (as of 2.16.x) uses camelCase
        attributes internally (onlyMainContent, parsePDF, maxAge). The Python
        wrapper's constructor accepts these either via snake_case (new) or camelCase
        (older examples). We try snake_case first; if that fails we retry with camelCase.
        """
        effective_formats = formats or self.formats
        if not any([effective_formats, only_main_content, parse_pdf, max_age]):
            return None
        try:
            return ScrapeOptions(  # type: ignore[call-arg]
                formats=effective_formats,
                only_main_content=only_main_content,
                parse_pdf=parse_pdf,
                max_age=max_age,
            )
        except TypeError:  # fallback to legacy / camelCase args
            try:
                return ScrapeOptions(  # type: ignore[call-arg]
                    formats=effective_formats,
                    onlyMainContent=only_main_content,
                    parsePDF=parse_pdf,
                    maxAge=max_age,
                )
            except Exception as e:  # pragma: no cover
                logger.warning(f"Could not construct ScrapeOptions: {e}")
                return None

    # ---------------------- Public tools ----------------------
    def scrape_website(
        self,
        url: str,
        formats: Optional[List[str]] = None,
        only_main_content: bool = False,
        parse_pdf: bool = False,
        max_age: Optional[int] = None,
    ) -> str:
        """Scrape a single URL.

        Args:
                url: URL to scrape (include scheme e.g. https://example.com).
                formats: List of output formats (e.g. ["markdown", "html"]).
                only_main_content: If True, restrict to main textual content.
                parse_pdf: Enable PDF parsing for linked PDFs.
                max_age: Cache max age (ms) if supported by backend.
        Returns: JSON string with scrape result or error message.
        """
        logger.info(f"FirecrawlTools scrape requested for: '{url}'")
        logger.debug(f"Scrape parameters: formats={formats}, only_main_content={only_main_content}, parse_pdf={parse_pdf}, max_age={max_age}")
        
        if not url:
            logger.warning("No URL provided for scraping")
            return json.dumps({"error": "No URL provided"})

        try:
            logger.debug("Executing Firecrawl scrape_url API call")
            # Newer API (keyword args)
            result = self.app.scrape_url(
                url=url,
                formats=formats or self.formats,
                only_main_content=only_main_content,
                parse_pdf=parse_pdf,
                max_age=max_age,
            )
        except TypeError:
            logger.debug("Falling back to legacy Firecrawl API for scrape_url")
            # Fallback to legacy param-dict style
            params: Dict[str, Any] = {}
            if formats or self.formats:
                params["formats"] = formats or self.formats
            result = self.app.scrape_url(url, params=params)
        except Exception as e:  # pragma: no cover
            logger.error(f"Failed to scrape website {url}: {e}")
            return json.dumps({"error": str(e)})
        
        logger.debug(f"Raw scrape result type: {type(result)}")
        json_result = self._to_json(result)
        logger.debug(f"Serialized scrape result length: {len(json_result)}")
        logger.info("Scrape completed successfully")
        return json_result

    def crawl_website(
        self,
        url: str,
        limit: Optional[int] = None,
        formats: Optional[List[str]] = None,
        only_main_content: bool = False,
        parse_pdf: bool = False,
        max_age: Optional[int] = None,
    ) -> str:
        """Crawl a site starting from a URL.

        Args:
                url: Starting URL.
                limit: Max pages (defaults to default_limit).
                formats: Output formats for scraped pages.
                only_main_content: Restrict content extraction.
                parse_pdf: Parse PDF documents.
                max_age: Cache max age (ms).
        Returns: JSON string with crawl job result.
        """
        logger.info(f"FirecrawlTools crawl requested for: '{url}'")
        effective_limit = limit or self.default_limit
        logger.debug(f"Crawl parameters: limit={effective_limit} (requested: {limit}, default: {self.default_limit}), formats={formats}, only_main_content={only_main_content}, parse_pdf={parse_pdf}, max_age={max_age}")
        
        if not url:
            logger.warning("No URL provided for crawling")
            return json.dumps({"error": "No URL provided"})

        scrape_opts = self._build_scrape_options(
            formats=formats,
            only_main_content=only_main_content,
            parse_pdf=parse_pdf,
            max_age=max_age,
        )
        logger.debug(f"Built scrape options: {scrape_opts}")

        try:
            logger.debug("Executing Firecrawl crawl_url API call")
            result = self.app.crawl_url(
                url=url,
                limit=effective_limit,
                scrape_options=scrape_opts,
            )
        except TypeError:
            logger.debug("Falling back to legacy Firecrawl API for crawl_url")
            # Legacy style
            params: Dict[str, Any] = {"limit": effective_limit}
            if scrape_opts and (formats or self.formats):
                # mimic older key expected: scrapeOptions
                params["scrapeOptions"] = {"formats": (formats or self.formats)}
            result = self.app.crawl_url(url, params=params, poll_interval=30)
        except Exception as e:  # pragma: no cover
            logger.error(f"Failed to crawl website {url}: {e}")
            return json.dumps({"error": str(e)})
        
        logger.debug(f"Raw crawl result type: {type(result)}")
        json_result = self._to_json(result)
        logger.debug(f"Serialized crawl result length: {len(json_result)}")
        logger.info("Crawl completed successfully")
        return json_result

    def map_website(self, url: str, include_subdomains: bool = False) -> str:
        """Generate a site map / graph of reachable URLs.

        Args:
                url: Root URL to map.
                include_subdomains: Whether to include subdomains.
        """
        logger.info(f"FirecrawlTools map requested for: '{url}'")
        logger.debug(f"Map parameters: include_subdomains={include_subdomains}")
        
        if not url:
            logger.warning("No URL provided for mapping")
            return json.dumps({"error": "No URL provided"})
        
        try:
            logger.debug("Executing Firecrawl map_url API call")
            result = self.app.map_url(url=url, include_subdomains=include_subdomains)
        except Exception as e:  # pragma: no cover
            logger.error(f"Failed to map website {url}: {e}")
            return json.dumps({"error": str(e)})
        
        logger.debug(f"Raw map result type: {type(result)}")
        json_result = self._to_json(result)
        logger.debug(f"Serialized map result length: {len(json_result)}")
        logger.info("Map completed successfully")
        return json_result

    def search_web(
        self,
        query: str,
        limit: int = 5,
        formats: Optional[List[str]] = None,
        only_main_content: bool = False,
        parse_pdf: bool = False,
        max_age: Optional[int] = None,
    ) -> str:
        """Search the web and (optionally) scrape returned pages.

        Args:
                query: Search query string.
                limit: Max number of results.
                formats: Output formats for scraping.
                only_main_content: Restrict content extraction.
                parse_pdf: Parse PDF documents.
                max_age: Cache max age (ms).
        """
        logger.info(f"FirecrawlTools search requested for: '{query}'")
        logger.debug(f"Search parameters: limit={limit}, formats={formats}, only_main_content={only_main_content}, parse_pdf={parse_pdf}, max_age={max_age}")
        
        if not query:
            logger.warning("No query provided for search")
            return json.dumps({"error": "No query provided"})
        
        scrape_opts = self._build_scrape_options(
            formats=formats,
            only_main_content=only_main_content,
            parse_pdf=parse_pdf,
            max_age=max_age,
        )
        logger.debug(f"Built scrape options for search: {scrape_opts}")
        
        try:
            logger.debug("Executing Firecrawl search API call")
            result = self.app.search(
                query=query,
                limit=limit,
                scrape_options=scrape_opts,
            )
        except Exception as e:  # pragma: no cover
            logger.error(f"Failed to search web for '{query}': {e}")
            return json.dumps({"error": str(e)})
        
        logger.debug(f"Raw search result type: {type(result)}")
        json_result = self._to_json(result)
        logger.debug(f"Serialized search result length: {len(json_result)}")
        logger.info("Search completed successfully")
        return json_result
