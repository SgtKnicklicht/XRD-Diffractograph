"""Desktop launcher for Diffractograph.

Starts the FastAPI server on a free local port (with the bundled React
frontend) and opens the user's default browser to the local URL.
"""
from __future__ import annotations

import os
import socket
import sys
import threading
import time
import webbrowser
from pathlib import Path

# Make the bundled `backend/` directory importable regardless of where the
# .exe is launched from. PyInstaller sets `sys._MEIPASS` to the temp extract
# dir for one-file builds; for one-folder builds we fall back to argv[0].
def _bundle_dir() -> Path:
    if hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS)  # type: ignore[attr-defined]
    return Path(sys.argv[0]).resolve().parent

BUNDLE = _bundle_dir()
sys.path.insert(0, str(BUNDLE))
sys.path.insert(0, str(BUNDLE / "backend"))

# Ensure CORS is permissive locally
os.environ.setdefault("CORS_ORIGINS", "*")


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main() -> None:
    import uvicorn  # imported here so PyInstaller picks it up
    from server import app  # noqa: E402

    port = find_free_port()
    url = f"http://127.0.0.1:{port}"

    def open_browser() -> None:
        # small delay so uvicorn is ready
        time.sleep(1.2)
        try:
            webbrowser.open(url, new=2)
        except Exception:  # noqa: BLE001
            pass

    print(f"\n  Diffractograph running at  {url}\n  press Ctrl+C to quit\n")
    threading.Thread(target=open_browser, daemon=True).start()

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=port,
        log_level="warning",
        access_log=False,
    )


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
