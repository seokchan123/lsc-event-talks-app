import pytest
from app import app, _cache

@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client

def test_index_route(client):
    response = client.get("/")
    assert response.status_code == 200
    html = response.data.decode("utf-8")
    assert "BigQuery Release Notes" in html
    assert "refresh-btn" in html
    assert "tweet-modal" in html
    assert "theme-toggle-btn" in html

def test_api_releases_route(client):
    response = client.get("/api/releases")
    assert response.status_code == 200
    data = response.get_json()
    assert "items" in data
    assert "categories" in data
    assert len(data["items"]) > 0
    assert "title" in data

def test_api_releases_forced_refresh(client):
    # Calling with ?refresh=true
    response = client.get("/api/releases?refresh=true")
    assert response.status_code == 200
    data = response.get_json()
    assert data["cached"] is False
    assert len(data["items"]) > 0

def test_api_health_route(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.get_json()
    assert data["status"] == "healthy"
