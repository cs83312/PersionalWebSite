from dataclasses import asdict
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse, JSONResponse

from service.ingestion import DocumentNotFound, DuplicateDocument, EmptyDocument
from service.loaders import UnreadableFile, UnsupportedFileType
from service.models import DocumentRecord

router = APIRouter(prefix="/admin/documents")


def _doc(rec: DocumentRecord) -> dict:
    d = asdict(rec)
    d["id"] = str(rec.id)
    d["created_at"] = rec.created_at.isoformat()
    d["updated_at"] = rec.updated_at.isoformat()
    return d


async def _read(request: Request, file: UploadFile) -> bytes:
    limit = request.app.state.services.settings.max_upload_mb * 1024 * 1024
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(status_code=413, detail="file_too_large")
    return data


async def _run(coro):
    try:
        return await coro
    except DocumentNotFound:
        raise HTTPException(status_code=404, detail="not_found") from None
    except UnsupportedFileType:
        raise HTTPException(status_code=415, detail="unsupported_file_type") from None
    except UnreadableFile:
        raise HTTPException(status_code=422, detail="unreadable_file") from None
    except EmptyDocument:
        raise HTTPException(status_code=422, detail="no_text_extracted") from None
    except DuplicateDocument as e:
        # HTTPException 的 detail 只能放一個值，所以直接回傳 JSON
        return JSONResponse({"detail": "duplicate", "existing_id": str(e.existing_id)}, status_code=409)


@router.post("", status_code=201)
async def create(request: Request, file: UploadFile):
    data = await _read(request, file)
    rec = await _run(request.app.state.services.ingestion.create(file.filename or "file", data))
    return rec if isinstance(rec, Response) else _doc(rec)


@router.get("")
async def list_documents(request: Request):
    return [_doc(r) for r in await request.app.state.services.ingestion.list()]


@router.get("/{doc_id}")
async def get(request: Request, doc_id: UUID):
    return _doc(await _run(request.app.state.services.ingestion.get(doc_id)))


@router.get("/{doc_id}/file")
async def download(request: Request, doc_id: UUID):
    ingestion = request.app.state.services.ingestion
    rec = await _run(ingestion.get(doc_id))
    return FileResponse(ingestion.file_path(rec), filename=rec.filename)


@router.put("/{doc_id}")
async def replace(request: Request, doc_id: UUID, file: UploadFile):
    data = await _read(request, file)
    rec = await _run(request.app.state.services.ingestion.replace(doc_id, file.filename or "file", data))
    return rec if isinstance(rec, Response) else _doc(rec)


@router.delete("/{doc_id}", status_code=204)
async def delete(request: Request, doc_id: UUID):
    await _run(request.app.state.services.ingestion.delete(doc_id))
    return Response(status_code=204)
