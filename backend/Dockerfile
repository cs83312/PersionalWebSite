FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN useradd --create-home app && mkdir -p /data/uploads && chown -R app /data
USER app

CMD ["uvicorn", "--factory", "main:create_public_app", "--host", "0.0.0.0", "--port", "8000"]
