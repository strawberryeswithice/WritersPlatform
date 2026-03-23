FROM python:3.9-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY auth_service/ ./auth_service/
COPY frontend/ ./frontend/

ENV PYTHONPATH=/app

CMD ["uvicorn", "auth_service.main:app", "--host", "0.0.0.0", "--port", "8010"]