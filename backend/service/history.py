import json

from redis.asyncio import Redis


class SessionHistory:
    def __init__(self, redis: Redis, ttl_seconds: int, max_turns: int):
        self._redis = redis
        self._ttl = ttl_seconds
        self._max_turns = max_turns

    @staticmethod
    def _key(session_id: str) -> str:
        return f"chat:{session_id}"

    async def get(self, session_id: str) -> list[tuple[str, str]]:
        raw = await self._redis.lrange(self._key(session_id), 0, -1)
        return [(m["role"], m["content"]) for m in map(json.loads, raw)]

    async def last_question(self, session_id: str) -> str | None:
        for role, content in reversed(await self.get(session_id)):
            if role == "human":
                return content
        return None

    async def append_turn(self, session_id: str, question: str, answer: str) -> None:
        key = self._key(session_id)
        async with self._redis.pipeline(transaction=True) as pipe:
            pipe.rpush(
                key,
                json.dumps({"role": "human", "content": question}, ensure_ascii=False),
                json.dumps({"role": "ai", "content": answer}, ensure_ascii=False),
            )
            pipe.ltrim(key, -2 * self._max_turns, -1)
            pipe.expire(key, self._ttl)
            await pipe.execute()

    async def ping(self) -> bool:
        try:
            return bool(await self._redis.ping())
        except Exception:
            return False
