FROM python:3.9-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY catalog_service/ ./catalog_service/
COPY frontend/ ./frontend/

ENV PYTHONPATH=/app

CMD ["uvicorn", "catalog_service.main:app", "--host", "0.0.0.0", "--port", "8011"]