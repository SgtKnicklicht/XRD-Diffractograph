# Diffractograph — Desktop / Standalone Build

This folder turns the web app into a single self-contained folder
that an end user can drop on their disk and double-click to launch.
The `Diffractograph(.exe)` opens the user's default browser at a
local URL — no installation, no Python, no Node required on their
machine.

```
desktop/
├── launcher.py            ← Python entry-point (starts FastAPI + opens browser)
├── diffractograph.spec    ← PyInstaller config (bundles backend + React build)
├── build.py               ← Orchestrator: yarn build → copy → pyinstaller
├── build_windows.bat      ← One-click Windows builder
├── build_mac.sh           ← One-click macOS / Linux builder
└── requirements.txt       ← Build-time Python dependencies
```

## How it works

1. The React frontend is built with `REACT_APP_BACKEND_URL=""` so all API
   calls become same-origin relative paths (`/api/xrd/...`).
2. The build is copied into `desktop/build/static/`.
3. `launcher.py` starts a `uvicorn` server on a free local port. The
   FastAPI app mounts the bundled React build at `/`, so the user just
   loads `http://127.0.0.1:<port>/` in their browser and gets the full
   app.
4. PyInstaller bundles `launcher.py`, the backend, and the React build
   into a folder + `Diffractograph.exe`.

## Build it (Windows)

Prerequisites on the **build machine** (one-time):

* Python 3.10 or newer (`py -3 --version` should print 3.10+)
* Node.js 18 or newer + Corepack/Yarn (`yarn --version`)

Then:

```cmd
cd desktop
build_windows.bat
```

When the script finishes you get:

```
desktop\dist\Diffractograph\
    Diffractograph.exe
    _internal\... (DLLs, scipy, numpy, react bundle, …)
```

Zip that whole `Diffractograph` folder and ship it.  The end user only
needs to:

1. extract / drag the folder onto their hard drive
2. double-click `Diffractograph.exe`
3. their default browser opens at `http://127.0.0.1:<port>` automatically

To stop the app, close the console window (or `Ctrl+C`).

## Build it (macOS or Linux)

```bash
cd desktop
chmod +x build_mac.sh
./build_mac.sh
```

Output:  `desktop/dist/Diffractograph/Diffractograph` — a Mach-O / ELF
binary that behaves identically to the Windows one.  On macOS you can
optionally bundle this into a `.app` later with `briefcase` or by
hand, but the unzipped folder works fine for personal use.

> ⚠️ **Cross-compiling does not work** — to make a Windows `.exe` you
> must run `build_windows.bat` on a Windows machine; for a macOS
> binary you must run `build_mac.sh` on a Mac.  GitHub Actions can
> automate both with `windows-latest` and `macos-latest` runners.

## Customising

* **App icon**: drop a `icon.ico` (Windows) or `icon.icns` (macOS) into
  this folder before building.  The spec file picks it up automatically.
* **Console window**: set `console=True` in `diffractograph.spec`
  to keep a terminal open (useful for debugging).
* **One file vs one folder**: the spec uses `COLLECT` (one folder, fast
  startup, ~250 MB).  Change to a single `.exe` by replacing the
  `COLLECT` block with `EXE(... a.binaries, a.datas, ...)` and the
  `--onefile` flag — startup will then take ~5 seconds while it extracts.

## Sanity-test on Linux without PyInstaller

You can verify the static-file flow works before shipping:

```bash
cd desktop
python build.py --prepare       # only does yarn build + copy
cd ..
PYTHONPATH=backend python desktop/launcher.py
# → opens browser at the printed http://127.0.0.1:<port>
```
