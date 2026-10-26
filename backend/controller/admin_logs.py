from dataclasses import asdict
from datetime import datetime

from fastapi import APIRouter, Query, Request

from service.models import LogQuery

router = APIRouter(prefix="/admin/chat-logs")


@router.get("")
async def chat_logs(
    request: Request,
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = None,
    session_id: str | None = None,
    q: str | None = None,
    fallback_only: bool = False,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    rows = await request.app.state.services.log_repo.query(
        LogQuery(from_=from_, to=to, session_id=session_id, q=q, fallback_only=fallback_only, limit=limit, offset=offset)
    )
    return [{**asdict(r), "created_at": r.created_at.isoformat()} for r in rows]
