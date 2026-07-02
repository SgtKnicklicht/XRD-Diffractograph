from pathlib import Path
import sys

from fastapi.testclient import TestClient


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from server import app  # noqa: E402


client = TestClient(app)


def test_healthz():
    response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_parse_upload_endpoint():
    response = client.post(
        "/api/xrd/parse",
        files={"file": ("sample.xy", b"10 100\n10.5 120\n11 90\n", "text/plain")},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "sample"
    assert data["source_format"] == "xy"
    assert data["points"] == 3
    assert data["x"] == [10.0, 10.5, 11.0]
    assert data["y"] == [100.0, 120.0, 90.0]
