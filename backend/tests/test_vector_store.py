from service.chunking import Chunk


async def test_ensure_collection_is_idempotent(store):
    await store.ensure_collection()


async def test_upsert_then_search_returns_best_first(store):
    chunks = [Chunk("alpha", 0, 1), Chunk("beta", 1, 2)]
    await store.upsert("d1", "cv.pdf", chunks, [[1, 0, 0, 0], [0, 1, 0, 0]])
    hits = await store.search([1, 0, 0, 0], top_k=2)
    assert hits[0].text == "alpha" and hits[0].page == 1 and hits[0].filename == "cv.pdf"
    assert hits[0].score >= hits[1].score


async def test_delete_doc_removes_only_that_doc(store):
    await store.upsert("d1", "a.md", [Chunk("a", 0, None)], [[1, 0, 0, 0]])
    await store.upsert("d2", "b.md", [Chunk("b", 0, None)], [[1, 0, 0, 0]])
    await store.delete_doc("d1")
    assert {h.doc_id for h in await store.search([1, 0, 0, 0], 10)} == {"d2"}


async def test_ping(store):
    assert await store.ping() is True
