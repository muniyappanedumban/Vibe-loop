import os
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://localhost/vibeloop_test")
import pytest
from fastapi.testclient import TestClient
from app import seed
from app.main import app

@pytest.fixture()
def client():
    from app.ratelimit import limiter
    seed.run(reset=True); limiter.reset()
    return TestClient(app)

def login(c, email):
    r = c.post("/auth/login", json={"email": email, "password": seed.DEMO_PASSWORD}); assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}
@pytest.fixture()
def riya(client): return login(client, "riya@vibeloop.app")
@pytest.fixture()
def admin(client): return login(client, "admin@vibeloop.app")
