from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from controller import admin_documents, admin_logs, chat, health
from controller.security import api_key_dependency
from service.container import Services, build_services, close_services
from settings import get_settings


def _app(services: Services | None, title: str) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        owned = services is None
        if owned:
            app.state.services = await build_services(get_settings())
        yield
        if owned:
            await close_services(app.state.services)

    app = FastAPI(title=title, lifespan=lifespan)
    if services is not None:
        app.state.services = services
    return app


def create_public_app(services: Services | None = None) -> FastAPI:
    """聊天 API + 健康檢查（port 8000，ngrok 只轉發這個）。"""
    settings = services.settings if services else get_settings()
    app = _app(services, "KLIF chatbot")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )
    app.include_router(chat.router)
    app.include_router(health.router)
    return app


def create_admin_app(services: Services | None = None) -> FastAPI:
    """文件管理 + 問答紀錄（port 8001，只綁定本機，ngrok 不轉發）。"""
    settings = services.settings if services else get_settings()
    app = _app(services, "KLIF chatbot admin")
    guard = [Depends(api_key_dependency(settings.admin_api_key.get_secret_value()))]
    app.include_router(admin_documents.router, dependencies=guard)
    app.include_router(admin_logs.router, dependencies=guard)
    return app
