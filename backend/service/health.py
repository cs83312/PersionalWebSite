import asyncio
from collections.abc import Awaitable, Callable

CHECK_TIMEOUT_SECONDS = 3


class HealthChecker:
    def __init__(self, checks: dict[str, Callable[[], Awaitable[bool]]]):
        self._checks = checks

    async def run(self) -> dict[str, bool]:
        async def one(check: Callable[[], Awaitable[bool]]) -> bool:
            try:
                return bool(await asyncio.wait_for(check(), CHECK_TIMEOUT_SECONDS))
            except Exception:
                return False

        results = await asyncio.gather(*(one(c) for c in self._checks.values()))
        return dict(zip(self._checks, results))
