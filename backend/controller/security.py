import hmac
import time
from collections.abc import Callable

from fastapi import Header, HTTPException, Request
from redis.asyncio import Redis


def api_key_dependency(expected: str) -> Callable:
    expected_bytes = expected.encode()

    async def check(x_api_key: str | None = Header(default=None)) -> None:
        if x_api_key is None or not hmac.compare_digest(x_api_key.encode(), expected_bytes):
            raise HTTPException(status_code=401, detail="invalid_api_key")

    return check


def client_ip(request: Request) -> str:
    # ngrok 會把真實 IP 附加在 X-Forwarded-For 最後面；前面的值可能是訪客偽造的
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        last = forwarded.split(",")[-1].strip()
        if last:
            return last
    return request.client.host if request.client else "unknown"


class RateLimiter:
    def __init__(self, redis: Redis, per_minute: int):
        self._redis = redis
        self._per_minute = per_minute

    async def allow(self, key: str) -> bool:
        bucket = f"rl:{key}:{int(time.time() // 60)}"
        count = await self._redis.incr(bucket)
        if count == 1:
            await self._redis.expire(bucket, 60)
        return count <= self._per_minute
