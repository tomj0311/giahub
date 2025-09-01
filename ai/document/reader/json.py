import json
from pathlib import Path
from typing import List

from ai.document.base import Document
from ai.document.reader.base import Reader
from ai.utils.log import logger


class JSONReader(Reader):
    """Reader for JSON files"""

    chunk: bool = False

    def read(self, path: Path) -> List[Document]:
        if not path:
            raise ValueError("No path provided")

        if not path.exists():
            raise FileNotFoundError(f"Could not find file: {path}")

        try:
            logger.info(f"Reading: {path}")
            json_name = path.name.split(".")[0]
            
            # Try multiple encodings for JSON files
            encodings_to_try = ['utf-8', 'utf-16', 'latin1', 'cp1252']
            json_text = None
            
            for encoding in encodings_to_try:
                try:
                    json_text = path.read_text(encoding=encoding)
                    logger.debug(f"Successfully read {path} using {encoding} encoding")
                    break
                except (UnicodeDecodeError, UnicodeError):
                    continue
            
            if json_text is None:
                # Final fallback
                logger.warning(f"Could not decode {path} with standard encodings, using fallback")
                json_text = path.read_bytes().decode('utf-8', errors='replace')
            
            json_contents = json.loads(json_text)

            if isinstance(json_contents, dict):
                json_contents = [json_contents]

            documents = [
                Document(
                    name=json_name,
                    id=f"{json_name}_{page_number}",
                    meta_data={"page": page_number},
                    content=json.dumps(content),
                )
                for page_number, content in enumerate(json_contents, start=1)
            ]
            if self.chunk:
                logger.debug("Chunking documents not yet supported for JSONReader")
                # chunked_documents = []
                # for document in documents:
                #     chunked_documents.extend(self.chunk_document(document))
                # return chunked_documents
            return documents
        except Exception:
            raise
