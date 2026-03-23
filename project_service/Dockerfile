FROM python:3.9-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt httpx

COPY project_service/ ./project_service/
COPY frontend/ ./frontend/

ENV PYTHONPATH=/app

CMD ["uvicorn", "project_service.main:app", "--host", "0.0.0.0", "--port", "8012"]