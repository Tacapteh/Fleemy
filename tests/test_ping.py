import os
import requests
import pytest

def test_ping_endpoint():
    base_url = os.environ.get("REACT_APP_API_URL", "http://localhost:8000")
    api_url = f"{base_url.rstrip('/')}/api/ping"
    try:
        resp = requests.get(api_url, timeout=5)
        data = resp.json()
    except Exception as e:
        pytest.skip(f"Backend unavailable: {e}")
    assert "status" in data
