"""Bare-bones in-memory rate limiter, scoped to the FastAPI app instance
(via app.state) rather than a module-level global — otherwise every test
that builds its own app would still share state with every other test in
the process, which is exactly the kind of bug this is meant to prevent
in production too.

Good enough for a single-process deployment of this size; if we ever run
multiple backend instances this needs to move to something shared
(Redis, etc.) — not worth solving before we know the hosting setup.
"""

import time
from collections import defaultdict, deque

from fastapi import Request

from src.config import get_settings
from src.exceptions import RateLimitedError


class InMemoryRateLimiter:
    def __init__(self, max_requests: int, window_seconds: float = 60.0) -> None:
        self._max_requests = max_requests
        self._window_seconds = window_seconds
        self._hits: dict[str, deque] = defaultdict(deque)

    def check(self, key: str) -> None:
        now = time.monotonic()
        hits = self._hits[key]
        while hits and now - hits[0] > self._window_seconds:
            hits.popleft()
        if len(hits) >= self._max_requests:
            raise RateLimitedError("Too many requests, try again shortly")
        hits.append(now)


def registration_lookup_rate_limiter(request: Request) -> None:
    limiter = getattr(request.app.state, "registration_lookup_limiter", None)
    if limiter is None:
        limiter = InMemoryRateLimiter(max_requests=get_settings().registration_lookup_rate_limit_per_minute)
        request.app.state.registration_lookup_limiter = limiter
    client_key = request.client.host if request.client else "unknown"
    limiter.check(client_key)
