from dataclasses import dataclass

from langchain_text_splitters import RecursiveCharacterTextSplitter

from service.loaders import LoadedPage


@dataclass(frozen=True)
class Chunk:
    text: str
    chunk_index: int
    page: int | None


def split_pages(pages: list[LoadedPage], chunk_size: int, chunk_overlap: int) -> list[Chunk]:
    splitter = RecursiveCharacterTextSplitter(chunk_size=chunk_size, chunk_overlap=chunk_overlap)
    chunks: list[Chunk] = []
    for page in pages:
        for text in splitter.split_text(page.text):
            if text.strip():
                chunks.append(Chunk(text, len(chunks), page.page))
    return chunks
