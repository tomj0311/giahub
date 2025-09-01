from pathlib import Path
from typing import List, Union, IO, Any
from ai.document.base import Document
from ai.document.reader.base import Reader
from ai.utils.log import logger


class TextReader(Reader):
    """Reader for Text files"""

    def read(self, file: Union[Path, IO[Any]]) -> List[Document]:
        if not file:
            raise ValueError("No file provided")

        try:
            if isinstance(file, Path):
                if not file.exists():
                    raise FileNotFoundError(f"Could not find file: {file}")
                logger.info(f"Reading: {file}")
                file_name = file.stem
                
                # Try multiple encodings to handle various file types
                encodings_to_try = ['utf-8', 'utf-16', 'latin1', 'cp1252']
                file_contents = None
                
                for encoding in encodings_to_try:
                    try:
                        file_contents = file.read_text(encoding=encoding)
                        logger.debug(f"Successfully read {file} using {encoding} encoding")
                        break
                    except (UnicodeDecodeError, UnicodeError):
                        continue
                
                if file_contents is None:
                    # Final fallback: read as binary and decode with error handling
                    logger.warning(f"Could not decode {file} with standard encodings, using fallback")
                    file_contents = file.read_bytes().decode('utf-8', errors='replace')
                    
            else:
                logger.info(f"Reading uploaded file: {file.name}")
                file_name = file.name.split(".")[0]
                file.seek(0)
                
                # Try to decode uploaded file content with encoding fallback
                raw_content = file.read()
                encodings_to_try = ['utf-8', 'utf-16', 'latin1', 'cp1252']
                file_contents = None
                
                for encoding in encodings_to_try:
                    try:
                        file_contents = raw_content.decode(encoding)
                        logger.debug(f"Successfully decoded uploaded file using {encoding} encoding")
                        break
                    except (UnicodeDecodeError, UnicodeError):
                        continue
                
                if file_contents is None:
                    # Final fallback: decode with error handling
                    logger.warning(f"Could not decode uploaded file with standard encodings, using fallback")
                    file_contents = raw_content.decode('utf-8', errors='replace')

            documents = [
                Document(
                    name=file_name,
                    id=file_name,
                    content=file_contents,
                )
            ]
            if self.chunk:
                chunked_documents = []
                for document in documents:
                    chunked_documents.extend(self.chunk_document(document))
                return chunked_documents
            return documents
        except Exception as e:
            logger.error(f"Error reading: {file}: {e}")
            return []
