from service.chunking import split_pages
from service.loaders import LoadedPage


def test_chunks_are_indexed_sequentially_and_keep_page():
    pages = [LoadedPage("a" * 50, 1), LoadedPage("b" * 50, 2)]
    chunks = split_pages(pages, chunk_size=20, chunk_overlap=0)
    assert [c.chunk_index for c in chunks] == list(range(len(chunks)))
    assert {c.page for c in chunks} == {1, 2}
    assert all(len(c.text) <= 20 for c in chunks)


def test_whitespace_only_pages_produce_no_chunks():
    assert split_pages([LoadedPage("   \n", None)], 100, 10) == []
