import os
import requests
import pytest

def test_ping_endpoint():
    base_url = os.environ.get("REACT_APP_API_URL", "http://localhost:8000")
    api_url = f"{base_url.rstrip('/')}/api/ping"
    token = os.environ.get("FIREBASE_TEST_TOKEN")
    if not token:
        pytest.skip("FIREBASE_TEST_TOKEN not set")
    headers = {"Authorization": f"Bearer {token}"}
    try:
        resp = requests.get(api_url, headers=headers, timeout=5)
        data = resp.json()
    except Exception as e:
        pytest.skip(f"Backend not running: {e}")
    assert "status" in data
