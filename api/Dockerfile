FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY alembic.ini ./
COPY migrations ./migrations
RUN useradd -r -u 10001 madness && chown -R madness /app
USER madness
EXPOSE 8000
# one worker on purpose: the GPU is the bottleneck and limits live in Redis anyway
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
