"""Build orchestrator for the desktop .exe / .app of Diffractograph.

Steps:
  1. Build the React frontend (yarn build) with empty REACT_APP_BACKEND_URL
     so all API calls become same-origin relative URLs.
  2. Copy the React build output into  desktop/build/static/
  3. Run PyInstaller using diffractograph.spec
  4. The output ends up in   desktop/dist/Diffractograph/

Use:
    python build.py            # full build
    python build.py --prepare  # only step 1+2 (debug on Linux/Mac)
    python build.py --pyinstaller-only   # skip the yarn step
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parent
FRONTEND = PROJECT / "frontend"
BUILD_DIR = HERE / "build" / "static"


def run(cmd: list[str], cwd: Path | None = None, env: dict | None = None) -> None:
    print(f"\n>>> {' '.join(cmd)}  (cwd={cwd or os.getcwd()})")
    completed = subprocess.run(cmd, cwd=cwd, env=env, shell=False)
    if completed.returncode != 0:
        sys.exit(completed.returncode)


def build_frontend() -> None:
    yarn = shutil.which("yarn") or shutil.which("yarn.cmd")
    if yarn is None:
        sys.exit("error: yarn not on PATH. Install Node.js + Corepack first.")
    env = os.environ.copy()
    env["REACT_APP_BACKEND_URL"] = ""           # → relative /api URLs
    env["GENERATE_SOURCEMAP"] = "false"
    env["DISABLE_ESLINT_PLUGIN"] = "true"
    print("\n>>> yarn install")
    run([yarn, "install", "--frozen-lockfile"], cwd=FRONTEND, env=env)
    print("\n>>> yarn build")
    run([yarn, "build"], cwd=FRONTEND, env=env)


def copy_frontend_to_bundle() -> None:
    src = FRONTEND / "build"
    if not src.exists():
        sys.exit(f"error: {src} does not exist — run yarn build first")
    if BUILD_DIR.exists():
        shutil.rmtree(BUILD_DIR)
    BUILD_DIR.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(src, BUILD_DIR)
    print(f"copied {src}  →  {BUILD_DIR}")


def run_pyinstaller() -> None:
    pyinstaller = shutil.which("pyinstaller")
    if pyinstaller is None:
        # fall back to invoking via the current python
        cmd = [sys.executable, "-m", "PyInstaller"]
    else:
        cmd = [pyinstaller]
    cmd += ["--noconfirm", "--clean", "diffractograph.spec"]
    run(cmd, cwd=HERE)
    out = HERE / "dist" / "Diffractograph"
    print(f"\n✓ build complete:   {out}")
    if sys.platform.startswith("win"):
        print(f"   run:           {out / 'Diffractograph.exe'}")
    elif sys.platform == "darwin":
        print(f"   run:           open {out}/Diffractograph")
    else:
        print(f"   run:           {out / 'Diffractograph'}")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--prepare", action="store_true", help="only build frontend + copy")
    p.add_argument("--pyinstaller-only", action="store_true", help="skip yarn step")
    args = p.parse_args()

    if not args.pyinstaller_only:
        build_frontend()
        copy_frontend_to_bundle()
    if args.prepare:
        return
    run_pyinstaller()


if __name__ == "__main__":
    main()
