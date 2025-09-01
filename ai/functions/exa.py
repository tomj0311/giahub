import json
from os import getenv
from typing import Optional, Dict, Any, List

from ai.tools import Toolkit
from ai.utils.log import logger

try:
	from exa_py import Exa
except ImportError:
	raise ImportError("`exa_py` not installed. Please install using `pip install exa_py`")


class ExaTools(Toolkit):
	def __init__(
		self,
		api_key: str = None,
		text: bool = True,
		text_length_limit: int = 1000,
		highlights: bool = True,
		num_results: int = 5,
		start_crawl_date: Optional[str] = None,
		end_crawl_date: Optional[str] = None,
		start_published_date: Optional[str] = None,
		end_published_date: Optional[str] = None,
		use_autoprompt: Optional[bool] = None,
		type: Optional[str] = None,
		category: Optional[str] = None,
		include_domains: Optional[List[str]] = None,
		show_results: bool = False,
	):
		super().__init__(name="exa")

		self.api_key = api_key or getenv("EXA_API_KEY")
		if not self.api_key:
			logger.error("EXA_API_KEY not set. Please set the EXA_API_KEY environment variable.")
		else:
			logger.info("ExaTools initialized with API key")
            
		logger.debug(f"ExaTools configuration: text={text}, highlights={highlights}, text_length_limit={text_length_limit}, num_results={num_results}")
		if include_domains:
			logger.debug(f"Domain filtering enabled: {include_domains}")
		if start_published_date or end_published_date:
			logger.debug(f"Date range: {start_published_date or 'none'} to {end_published_date or 'none'}")

		self.show_results = show_results

		self.text: bool = text
		self.text_length_limit: int = text_length_limit
		self.highlights: bool = highlights
		self.num_results: Optional[int] = num_results
		self.start_crawl_date: Optional[str] = start_crawl_date
		self.end_crawl_date: Optional[str] = end_crawl_date
		self.start_published_date: Optional[str] = start_published_date
		self.end_published_date: Optional[str] = end_published_date
		self.use_autoprompt: Optional[bool] = use_autoprompt
		self.type: Optional[str] = type
		self.include_domains: Optional[List[str]] = include_domains
		self.category: Optional[str] = category

		self.register(self.search_exa)

	def search_exa(self, query: str, num_results: int = 5) -> str:
		"""Use this function to search Exa (a web search engine) for a query.

		Args:
			query (str): The query to search for.
			num_results (int): Number of results to return. Defaults to 5.

		Returns:
			str: The search results in JSON format.
		"""
		logger.info(f"ExaTools search requested for: '{query}'")
		effective_num_results = self.num_results or num_results
		logger.debug(f"Search parameters: effective_num_results={effective_num_results}, requested_num_results={num_results}, tool_default_num_results={self.num_results}")

		if not self.api_key:
			logger.error("Cannot perform search: EXA_API_KEY not set")
			return "Please set the EXA_API_KEY"

		try:
			exa = Exa(self.api_key)
			logger.info(f"Searching exa for: {query}")
			search_kwargs: Dict[str, Any] = {
				"text": self.text,
				"highlights": self.highlights,
				"num_results": effective_num_results, # Use the determined number of results
				"start_crawl_date": self.start_crawl_date,
				"end_crawl_date": self.end_crawl_date,
				"start_published_date": self.start_published_date,
				"end_published_date": self.end_published_date,
				"use_autoprompt": self.use_autoprompt,
				"type": self.type,
				"category": self.category,
				"include_domains": self.include_domains,
			}
			# Clean up the kwargs
			search_kwargs = {k: v for k, v in search_kwargs.items() if v is not None}
			logger.debug(f"Using Exa search parameters: {search_kwargs}")

			logger.debug("Executing Exa search_and_contents API call")
			exa_results = exa.search_and_contents(query, **search_kwargs)
			# Be cautious logging raw results if they can be very large
			logger.debug(f"Raw Exa results object type: {type(exa_results)}")
			# Log a truncated version of the raw results for inspection
			try:
				raw_results_str = str(exa_results)
				logger.debug(f"Raw Exa results (first 1000 chars): {raw_results_str[:1000]}{'...' if len(raw_results_str) > 1000 else ''}")
			except Exception as log_err:
				logger.warning(f"Could not serialize raw Exa results for logging: {log_err}")

			logger.info(f"Received {len(exa_results.results)} results from Exa")

			exa_results_parsed = []
			for i, result in enumerate(exa_results.results):
				logger.debug(f"Processing result {i+1}: {result.url}")
				result_dict = {"url": result.url}
				if result.title:
					result_dict["title"] = result.title
				if result.author and result.author != "":
					result_dict["author"] = result.author
				if result.published_date:
					result_dict["published_date"] = result.published_date
				if result.text:
					_text = result.text
					original_length = len(_text)
					if self.text_length_limit:
						_text = _text[: self.text_length_limit]
						if original_length > self.text_length_limit:
							logger.debug(f"Truncated text from {original_length} to {self.text_length_limit} characters for result {i+1}")
					result_dict["text"] = _text
					logger.debug(f"Result {i+1} text length: {len(_text)}")
				if self.highlights:
					try:
						if result.highlights:  # type: ignore
							logger.debug(f"Found {len(result.highlights)} highlights for result {i+1}")  # type: ignore
							result_dict["highlights"] = result.highlights  # type: ignore
						else:
							logger.debug(f"No highlights found for result {i+1}")
					except Exception as e:
						logger.debug(f"Failed to get highlights for result {i+1}: {e}")
				exa_results_parsed.append(result_dict)
				logger.debug(f"Parsed result {i+1}: {result_dict}")

			parsed_results = json.dumps(exa_results_parsed, indent=4)
			logger.debug(f"Formatted {len(exa_results_parsed)} results into JSON string (length: {len(parsed_results)})")
			# Log truncated parsed results if they are very long
			logger.debug(f"Parsed results JSON (first 1000 chars): {parsed_results[:1000]}{'...' if len(parsed_results) > 1000 else ''}")

			if self.show_results:
				logger.info(f"Exa search results:\n{parsed_results}")

			logger.debug("Exa search completed successfully.")
			return parsed_results
		except Exception as e:
			logger.error(f"Failed to search exa: {e}")
			import traceback
			logger.debug(f"Search error details: {traceback.format_exc()}")
			return f"Error searching Exa: {e}"

