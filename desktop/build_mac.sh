#!/usr/bin/env bash
# ============================================================
#   Diffractograph — macOS / Linux build script
#   Requires:  Python 3.10+, Node.js 18+, yarn
# ============================================================
set -e

cd "$(dirname "$0")"

echo
echo "=== Creating Python virtual environment ==="
if [ ! -d .venv ]; then
    python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate

echo
echo "=== Installing build dependencies ==="
python -m pip install --upgrade pip wheel
python -m pip install -r requirements.txt

echo
echo "=== Running build ==="
python build.py

echo
echo "============================================================"
echo "  Done!   Output:  desktop/dist/Diffractograph/"
if [ "$(uname)" = "Darwin" ]; then
    echo "  Run:    open desktop/dist/Diffractograph/Diffractograph"
else
    echo "  Run:    ./desktop/dist/Diffractograph/Diffractograph"
fi
echo "============================================================"
