"""Gunicorn settings for the API container. Everything overridable by env."""
import multiprocessing, os

bind = os.environ.get("BIND", "0.0.0.0:8000")
worker_class = "uvicorn.workers.UvicornWorker"
# Default: 2 × CPUs + 1, capped. Each worker has its own DB pool (POOL_SIZE + MAX_OVERFLOW) — size PgBouncer accordingly.
workers = int(os.environ.get("WEB_CONCURRENCY", min(multiprocessing.cpu_count() * 2 + 1, 8)))
# Sync endpoints run in each worker's thread pool; this bounds per-worker concurrency on the DB pool too.
timeout = int(os.environ.get("GUNICORN_TIMEOUT", "60"))          # hard-kill a stuck worker (heartbeat), > REQUEST_TIMEOUT_SEC
graceful_timeout = int(os.environ.get("GRACEFUL_TIMEOUT", "25"))  # SIGTERM → finish in-flight requests (k8s grace period is 30 s)
keepalive = int(os.environ.get("KEEPALIVE", "75"))                # > nginx upstream keepalive_timeout (60 s) to avoid races
max_requests = int(os.environ.get("MAX_REQUESTS", "20000"))       # recycle workers to cap slow leaks
max_requests_jitter = 2000
forwarded_allow_ips = os.environ.get("FORWARDED_ALLOW_IPS", "*")   # only the LB can reach the container network
accesslog = None  # the app writes one JSON log line per request already
errorlog = "-"
