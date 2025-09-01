from typing import List, Iterator

from ai.document import Document
from ai.knowledge.agent import AgentKnowledge


class DocumentKnowledgeBase(AgentKnowledge):
    documents: List[Document]

    @property
    def document_lists(self) -> Iterator[List[Document]]:
        """Iterate over documents and yield lists of documents.
        Each object yielded by the iterator is a list of documents.

        Returns:
            Iterator[List[Document]]: Iterator yielding list of documents
        """

        for _document in self.documents:
            yield [_document]
