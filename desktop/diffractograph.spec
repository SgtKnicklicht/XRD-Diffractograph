# PyInstaller spec for Diffractograph desktop build.
# Produces `dist/Diffractograph/` containing the .exe and all DLLs/data.
# Build with:  pyinstaller --noconfirm diffractograph.spec
# (run from the desktop/ directory after `python build.py --prepare`)

# -*- mode: python ; coding: utf-8 -*-
from pathlib import Path
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

HERE = Path(SPECPATH).resolve()
PROJECT = HERE.parent

datas = [
    # bundled React production build  (built into ./build/static)
    (str(HERE / "build" / "static"), "static"),
    # backend module
    (str(PROJECT / "backend" / "server.py"), "backend"),
]
# scipy ships compiled extensions and data; collect everything to be safe
datas += collect_data_files("scipy")

hiddenimports = []
hiddenimports += collect_submodules("scipy")
hiddenimports += collect_submodules("uvicorn")
hiddenimports += [
    "uvicorn.logging",
    "uvicorn.loops.auto",
    "uvicorn.loops.asyncio",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan.on",
    "email_validator",
    "multipart",
]

a = Analysis(
    [str(HERE / "launcher.py")],
    pathex=[str(HERE), str(PROJECT / "backend")],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "tkinter",
        "matplotlib",
        "PIL",
        "pandas",
        "motor",
        "pymongo",
        "boto3",
        "botocore",
        "cryptography",
        "passlib",
        "bcrypt",
        "emergentintegrations",
    ],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="Diffractograph",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    runtime_tmpdir=None,
    console=True,            # keep terminal so user sees the URL + Ctrl+C works
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=str(HERE / "icon.ico") if (HERE / "icon.ico").exists() else None,
)
