FROM python:3.11-slim
WORKDIR /app
COPY pyproject.toml ./
RUN pip install --no-cache-dir .
COPY . .
ENV PYTHONPATH=/app
CMD ["uvicorn", "services.api_gateway.app:app", "--host", "0.0.0.0", "--port", "8000"]
