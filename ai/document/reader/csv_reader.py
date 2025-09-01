import csv
import os
from pathlib import Path
from typing import List, Union, IO, Any
from urllib.parse import urlparse

from ai.document.base import Document
from ai.document.reader.base import Reader
from ai.utils.log import logger
import io


class CSVReader(Reader):
    """Reader for CSV files"""

    def read(self, file: Union[Path, IO[Any]], delimiter: str = ",", quotechar: str = '"') -> List[Document]:
        if not file:
            raise ValueError("No file provided")

        try:
            if isinstance(file, Path):
                if not file.exists():
                    raise FileNotFoundError(f"Could not find file: {file}")
                logger.info(f"Reading: {file}")
                
                # Try multiple encodings for CSV files
                encodings_to_try = ['utf-8', 'utf-16', 'latin1', 'cp1252']
                file_content = None
                
                for encoding in encodings_to_try:
                    try:
                        file_content = file.open(newline="", mode="r", encoding=encoding)
                        logger.debug(f"Successfully opened {file} using {encoding} encoding")
                        break
                    except (UnicodeDecodeError, UnicodeError):
                        continue
                
                if file_content is None:
                    # Final fallback: read as binary and create StringIO
                    logger.warning(f"Could not decode {file} with standard encodings, using fallback")
                    raw_content = file.read_bytes().decode('utf-8', errors='replace')
                    file_content = io.StringIO(raw_content)
                    
            else:
                logger.info(f"Reading uploaded file: {file.name}")
                file.seek(0)
                
                # Try to decode uploaded file content with encoding fallback
                raw_content = file.read()
                encodings_to_try = ['utf-8', 'utf-16', 'latin1', 'cp1252']
                decoded_content = None
                
                for encoding in encodings_to_try:
                    try:
                        decoded_content = raw_content.decode(encoding)
                        logger.debug(f"Successfully decoded uploaded CSV using {encoding} encoding")
                        break
                    except (UnicodeDecodeError, UnicodeError):
                        continue
                
                if decoded_content is None:
                    # Final fallback
                    logger.warning(f"Could not decode uploaded CSV with standard encodings, using fallback")
                    decoded_content = raw_content.decode('utf-8', errors='replace')
                
                file_content = io.StringIO(decoded_content)

            csv_name = Path(file.name).stem if isinstance(file, Path) else file.name.split(".")[0]
            csv_content = ""
            with file_content as csvfile:
                csv_reader = csv.reader(csvfile, delimiter=delimiter, quotechar=quotechar)
                for row in csv_reader:
                    csv_content += ", ".join(row) + "\n"

            documents = [
                Document(
                    name=csv_name,
                    id=csv_name,
                    content=csv_content,
                )
            ]
            if self.chunk:
                chunked_documents = []
                for document in documents:
                    chunked_documents.extend(self.chunk_document(document))
                return chunked_documents
            return documents
        except Exception as e:
            logger.error(f"Error reading: {file.name if isinstance(file, IO) else file}: {e}")
            return []


class CSVUrlReader(Reader):
    """Reader for CSV files"""

    def read(self, url: str) -> List[Document]:
        if not url:
            raise ValueError("No URL provided")

        try:
            import httpx
        except ImportError:
            raise ImportError("`httpx` not installed")

        logger.info(f"Reading: {url}")
        response = httpx.get(url)

        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error occurred: {e.response.status_code} - {e.response.text}")
            raise

        parsed_url = urlparse(url)
        filename = os.path.basename(parsed_url.path) or "data.csv"

        file_obj = io.BytesIO(response.content)
        file_obj.name = filename

        documents = CSVReader().read(file=file_obj)

        file_obj.close()

        return documents
