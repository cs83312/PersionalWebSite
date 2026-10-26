from dataclasses import dataclass
from io import BytesIO
from pathlib import PurePath
from typing import Callable

from pypdf import PdfReader


class UnsupportedFileType(Exception):
    pass


class UnreadableFile(Exception):
    pass


@dataclass(frozen=True)
class LoadedPage:
    text: str
    page: int | None


Loader = Callable[[bytes], list[LoadedPage]]


def load_md(data: bytes) -> list[LoadedPage]:
    try:
        return [LoadedPage(data.decode("utf-8-sig"), None)]
    except UnicodeDecodeError as e:
        raise UnreadableFile("markdown file is not valid UTF-8") from e


def load_pdf(data: bytes) -> list[LoadedPage]:
    try:
        reader = PdfReader(BytesIO(data))
        texts = [page.extract_text() or "" for page in reader.pages]
    except Exception as e:
        raise UnreadableFile("could not parse PDF") from e
    return [LoadedPage(t, i) for i, t in enumerate(texts, start=1) if t.strip()]


# 新增檔案類型（例如音訊、影片的逐字稿）時，在這裡註冊一個 loader 即可
LOADERS: dict[str, Loader] = {".md": load_md, ".pdf": load_pdf}


def get_loader(filename: str) -> Loader:
    ext = PurePath(filename).suffix.lower()
    try:
        return LOADERS[ext]
    except KeyError:
        raise UnsupportedFileType(ext or filename) from None
