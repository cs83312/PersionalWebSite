import pytest
from fpdf import FPDF

from service.loaders import UnreadableFile, UnsupportedFileType, get_loader


def make_pdf(pages: list[str]) -> bytes:
    pdf = FPDF()
    for text in pages:
        pdf.add_page()
        pdf.set_font("helvetica", size=12)
        if text:
            pdf.cell(text=text)
    return bytes(pdf.output())


def test_md_with_bom():
    pages = get_loader("a.MD")("\ufeff# 標題\n內容".encode("utf-8"))
    assert pages[0].text.startswith("# 標題") and pages[0].page is None


def test_md_non_utf8_is_unreadable():
    with pytest.raises(UnreadableFile):
        get_loader("a.md")("中文".encode("big5"))


def test_pdf_pages_are_one_based_and_blank_pages_skipped():
    pages = get_loader("cv.pdf")(make_pdf(["Hello page one", "", "Page three"]))
    assert [p.page for p in pages] == [1, 3]


def test_corrupt_pdf_is_unreadable():
    with pytest.raises(UnreadableFile):
        get_loader("x.pdf")(b"not a pdf")


def test_unsupported_extension():
    with pytest.raises(UnsupportedFileType):
        get_loader("song.mp3")
