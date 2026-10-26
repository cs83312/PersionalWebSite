"""docker-compose 啟動後的端到端驗證。

用法（在 backend/ 目錄）：.venv/Scripts/python scripts/smoke.py
全部通過時印出 ALL OK；任何一步失敗都會印出原因並以非 0 結束。
注意：測試用的兩份文件最後會刪除，但問答紀錄會留在 Postgres 裡（session_id 以 smoke- 開頭）。
"""

import math
import sys
import uuid
from pathlib import Path

import httpx
from fpdf import FPDF

API = "http://127.0.0.1:8000"
ADMIN = "http://127.0.0.1:8001"
OLLAMA = "http://127.0.0.1:11434"

MD_TEXT = (
    "# Smoke test document\n\n"
    "ZEPHYR-42 is a hobby project: a solar-powered temperature logger written in Rust. "
    "It sends readings over MQTT every five minutes to a Raspberry Pi in the garage."
)
RELATED_Q = "What is ZEPHYR-42 and how does it send its readings?"
UNRELATED_Q = "如何烤出好吃的戚風蛋糕？"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}")
    sys.exit(1)


def check(cond: bool, msg: str) -> None:
    if not cond:
        fail(msg)
    print(f"ok   {msg}")


def admin_key() -> str:
    for line in Path(".env").read_text(encoding="utf-8").splitlines():
        if line.startswith("ADMIN_API_KEY="):
            return line.split("=", 1)[1].strip()
    fail(".env has no ADMIN_API_KEY")


def make_pdf() -> bytes:
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("helvetica", size=12)
    pdf.multi_cell(0, 8, text="Smoke PDF: the ORCHID-7 board uses an ESP32 and a BME280 sensor.")
    return bytes(pdf.output())


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    return dot / (math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b)))


def print_scores(client: httpx.Client) -> None:
    """印出相關 / 無關問題對文件的相似度，用來調整 SCORE_THRESHOLD。"""
    try:
        r = client.post(f"{OLLAMA}/api/embed", json={"model": "mxbai-embed-large", "input": [MD_TEXT, RELATED_Q, UNRELATED_Q]})
        doc, rel, unrel = r.json()["embeddings"]
        print(f"info score(related)={cosine(doc, rel):.3f} score(unrelated)={cosine(doc, unrel):.3f}")
    except Exception as e:  # 只是輔助資訊
        print(f"info could not compute scores: {e}")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    h = {"X-API-Key": admin_key()}
    session = f"smoke-{uuid.uuid4().hex[:8]}"
    with httpx.Client(timeout=180) as c:
        r = c.get(f"{API}/health")
        check(r.status_code == 200, f"api /health is 200 ({r.text})")
        print_scores(c)

        md = c.post(f"{ADMIN}/admin/documents", headers=h, files={"file": ("smoke-zephyr.md", MD_TEXT.encode())})
        check(md.status_code == 201, f"upload md ({md.status_code} {md.text})")
        pdf = c.post(f"{ADMIN}/admin/documents", headers=h, files={"file": ("smoke-orchid.pdf", make_pdf())})
        check(pdf.status_code == 201, f"upload pdf ({pdf.status_code} {pdf.text})")
        md_id, pdf_id = md.json()["id"], pdf.json()["id"]

        try:
            r = c.post(f"{API}/chat", json={"session_id": session, "message": RELATED_Q}).json()
            print(f"info related answer: {r.get('answer')!r}")
            check(r.get("fallback") is False, "related question is answered (no fallback)")
            check(any(s["filename"] == "smoke-zephyr.md" for s in r["sources"]), "related answer cites smoke-zephyr.md")

            r = c.post(f"{API}/chat", json={"session_id": session + "-x", "message": UNRELATED_Q}).json()
            check(r.get("fallback") is True, f"unrelated question falls back ({r.get('answer')!r})")

            put = c.put(f"{ADMIN}/admin/documents/{md_id}", headers=h,
                        files={"file": ("smoke-zephyr.md", (MD_TEXT + "\nUpdated.").encode())})
            check(put.status_code == 200 and put.json()["id"] == md_id, "PUT replaces md and keeps id")
        finally:
            for doc_id in (md_id, pdf_id):
                c.delete(f"{ADMIN}/admin/documents/{doc_id}", headers=h)
        check(c.get(f"{ADMIN}/admin/documents/{md_id}", headers=h).status_code == 404, "documents deleted")

        logs = c.get(f"{ADMIN}/admin/chat-logs", headers=h, params={"q": "ZEPHYR"}).json()
        check(len(logs) >= 1, "chat logs recorded")
        check(c.get(f"{API}/admin/documents").status_code == 404, "admin routes are not on the public api")
    print("ALL OK")


if __name__ == "__main__":
    main()
