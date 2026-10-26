async def test_empty_session(history):
    assert await history.get("nope") == [] and await history.last_question("nope") is None


async def test_append_and_get_in_order(history):
    await history.append_turn("s", "q1", "a1")
    assert await history.get("s") == [("human", "q1"), ("ai", "a1")]
    assert await history.last_question("s") == "q1"


async def test_trims_to_max_turns(history):
    for i in range(3):
        await history.append_turn("s", f"q{i}", f"a{i}")
    assert [c for _, c in await history.get("s")] == ["q1", "a1", "q2", "a2"]


async def test_ttl_is_set_and_refreshed(history, redis):
    await history.append_turn("s", "q", "a")
    await redis.expire("chat:s", 5)
    await history.append_turn("s", "q", "a")
    assert 3590 <= await redis.ttl("chat:s") <= 3600


async def test_ping(history):
    assert await history.ping() is True
