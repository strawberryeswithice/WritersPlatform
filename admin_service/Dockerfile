FROM python:3.9-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY admin_service/ ./admin_service/

ENV PYTHONPATH=/app

CMD ["uvicorn", "admin_service.main:app", "--host", "0.0.0.0", "--port", "8013"]
