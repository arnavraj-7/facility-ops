# syntax=docker/dockerfile:1
# Build context must be the REPO ROOT so the `src.ai` package path resolves:
#   docker build -f src/ai/Dockerfile .
FROM python:3.11-slim

WORKDIR /app

COPY src/ai/requirements.docker.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ai ./src/ai

EXPOSE 8000
CMD ["uvicorn", "src.ai.main:app", "--host", "0.0.0.0", "--port", "8000"]
