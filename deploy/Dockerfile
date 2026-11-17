# VibeLoop API image. Build from the repo root:  docker build -f deploy/Dockerfile -t vibeloop-api .
FROM python:3.12-slim AS build
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /src
COPY backend/requirements.txt .
RUN python -m venv /opt/venv && /opt/venv/bin/pip install -r requirements.txt

FROM python:3.12-slim
ENV PATH=/opt/venv/bin:$PATH PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 \
    ENV=prod MEDIA_DIR=/var/lib/vibeloop/media WEB_CONCURRENCY=4
RUN groupadd -r -g 10001 app && useradd -r -u 10001 -g app -d /app -s /usr/sbin/nologin app \
 && mkdir -p /var/lib/vibeloop/media && chown -R app:app /var/lib/vibeloop
COPY --from=build /opt/venv /opt/venv
WORKDIR /app
COPY --chown=app:app backend/app ./app
COPY --chown=app:app backend/migrations ./migrations
COPY --chown=app:app backend/alembic.ini ./alembic.ini
COPY --chown=app:app deploy/gunicorn.conf.py ./gunicorn.conf.py
USER 10001:10001
EXPOSE 8000
# Liveness only (no DB) — orchestrators use /health/ready for routing.
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys;sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health/live',timeout=2).status==200 else 1)"
CMD ["gunicorn", "app.main:app", "-c", "gunicorn.conf.py"]
