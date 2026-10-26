import httpx
import pytest
from langchain_core.embeddings import DeterministicFakeEmbedding
from langchain_core.language_models import FakeListChatModel
from langchain_core.messages import SystemMessage

from service.chat import LLMBusy, UpstreamUnavailable, build_messages
from service.models import LogQuery
from service.vector_store import Hit


class ExplodingChatModel(FakeListChatModel):
    responses: list[str] = ["unused"]

    async def astream(self, *args, **kwargs):
        raise AssertionError("LLM must not be called")
        yield  # pragma: no cover


class SpyEmbeddings(DeterministicFakeEmbedding):
    queries: list[str] = []

    async def aembed_query(self, text: str) -> list[float]:
        self.queries.append(text)
        return self.embed_query(text)


class DownEmbeddings(DeterministicFakeEmbedding):
    async def aembed_query(self, text: str) -> list[float]:
        raise httpx.ConnectError("ollama down")


class FailingLogRepo:
    async def add(self, entry):
        raise RuntimeError("postgres down")


async def test_answer_with_hits(chat, log_repo, history):
    r = await chat.answer("s1", "What did KLIF build?")
    assert r.fallback is False and r.answer == "He built an MQTT gateway."
    assert r.sources[0].filename == "cv.md"
    assert len(await history.get("s1")) == 2
    assert (await log_repo.query(LogQuery()))[0].fallback is False


async def test_fallback_skips_llm(make_chat, log_repo):
    chat = make_chat(score_threshold=1.01, llm=ExplodingChatModel())
    r = await chat.answer("s1", "今天天氣如何？")
    assert r.fallback is True and r.answer == "找不到" and r.sources == []
    assert (await log_repo.query(LogQuery()))[0].fallback is True


async def test_followup_query_includes_previous_question(make_chat, history):
    spy = SpyEmbeddings(size=4, queries=[])
    chat = make_chat(embeddings=spy)
    await history.append_turn("s1", "Tell me about MQTT", "...")
    await chat.answer("s1", "And after that?")
    assert spy.queries[-1] == "Tell me about MQTT\nAnd after that?"


async def test_second_caller_gets_busy(chat):
    first = await chat.begin("a", "q")
    with pytest.raises(LLMBusy):
        await chat.begin("b", "q")
    first.release()


async def test_release_after_abandoned_stream(chat):
    turn = await chat.begin("a", "q")
    gen = turn.tokens()
    await gen.__anext__()
    await gen.aclose()
    (await chat.begin("b", "q")).release()  # must not raise LLMBusy


async def test_log_failure_does_not_break_answer(make_chat):
    chat = make_chat(log_repo=FailingLogRepo())
    assert (await chat.answer("s", "q")).answer


async def test_embedding_failure_raises_upstream_unavailable(make_chat):
    with pytest.raises(UpstreamUnavailable):
        await make_chat(embeddings=DownEmbeddings(size=4)).begin("s", "q")


def test_build_messages_layout(persona):
    hit = Hit("d", "cv.pdf", 0, 2, "ctx text", 0.9)
    msgs = build_messages(persona, [hit], [("human", "hi"), ("ai", "yo")], "now?")
    assert isinstance(msgs[0], SystemMessage) and "[cv.pdf p.2] ctx text" in msgs[0].content
    assert [m.content for m in msgs[1:]] == ["hi", "yo", "now?"]
