"""XRD pattern viewer backend.

Endpoints:
- GET  /healthz         : service health check
- POST /api/xrd/parse   : upload XRD data, return parsed (x, y) arrays
- POST /api/xrd/smooth  : Savitzky-Golay smoothing
"""
from __future__ import annotations

import io
import logging
import os
import re
import sys
from pathlib import Path
from typing import List, Optional

import numpy as np
from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, File, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from scipy.signal import savgol_filter
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

app = FastAPI(title="XRD Viewer API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("xrd")


# ------------- models -------------
class ParsedPattern(BaseModel):
    name: str
    x: List[float]
    y: List[float]
    points: int
    x_min: float
    x_max: float
    y_max: float
    is_reference: bool = False
    source_format: str = "xy"


class SmoothRequest(BaseModel):
    y: List[float]
    window: int = Field(11, ge=3, le=501)
    polyorder: int = Field(3, ge=1, le=6)


class ProcessedResponse(BaseModel):
    y: List[float]


# ------------- helpers -------------
_NUM_RE = re.compile(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?")


def parse_xy_text(text: str) -> tuple[list[float], list[float]]:
    """Parse a .xy / .xye / two-column text file.

    Skips comments (starting with #, %, ; or non-numeric lines). Accepts
    whitespace, comma or tab separators. If a line has more than 2 numeric
    columns we take the first two.
    """
    xs: list[float] = []
    ys: list[float] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line[0] in "#%;!*/" or line.lower().startswith(("xydata", "data", "name", "x", "2theta")):
            # skip header lines that don't start with a digit/sign
            if not (line[0].isdigit() or line[0] in "+-."):
                continue
        nums = _NUM_RE.findall(line)
        if len(nums) < 2:
            continue
        try:
            x = float(nums[0])
            y = float(nums[1])
        except ValueError:
            continue
        xs.append(x)
        ys.append(y)
    return xs, ys


def parse_pks(text: str) -> tuple[list[float], list[float]]:
    """STOE/Match! Peak File (.pks).

    Data rows have six numeric columns: D  2Theta  I(rel)  I(abs)  I(int)  FWHM.
    We take 2Theta (col 2) and I(rel) (col 3). Data rows always start with a
    digit (after trimming); anything else is treated as header/comment.
    """
    xs: list[float] = []
    ys: list[float] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if not (line[0].isdigit() or line[0] in "+-."):
            continue
        nums = _NUM_RE.findall(line)
        if len(nums) < 6:  # real data rows have exactly 6 columns
            continue
        try:
            two_theta = float(nums[1])
            i_rel = float(nums[2])
        except ValueError:
            continue
        if not (0 < two_theta < 180) or i_rel < 0:
            continue
        xs.append(two_theta)
        ys.append(i_rel)
    return xs, ys


def parse_stoe_theo(text: str) -> tuple[list[float], list[float]]:
    """STOE WinXPOW Theo output.

    Data rows: D  2Theta  H  K  L  Mult  I/Imax  F  LP  Absc
    Some rows contain 'absent' and must be skipped.
    We take 2Theta (col 2) and I/Imax (col 7).
    """
    xs: list[float] = []
    ys: list[float] = []
    in_data = False
    for raw in text.splitlines():
        line = raw.strip()
        if "2Theta" in line and "H" in line and "K" in line and "L" in line and "I/Imax" in line:
            in_data = True
            continue
        if not in_data or not line or "absent" in line.lower():
            continue
        if not (line[0].isdigit() or line[0] in "+-."):
            continue
        parts = line.split()
        if len(parts) < 10:  # real rows have 10 columns
            continue
        try:
            two_theta = float(parts[1])
            i_rel = float(parts[6])
        except ValueError:
            continue
        if not (0 < two_theta < 180) or i_rel < 0:
            continue
        xs.append(two_theta)
        ys.append(i_rel)
    return xs, ys


def parse_semicolon_csv(text: str) -> tuple[list[float], list[float]]:
    """European-locale CSV (; delimited, comma as decimal separator)."""
    xs: list[float] = []
    ys: list[float] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or ";" not in line:
            continue
        a, _, b = line.partition(";")
        a = a.strip().replace(",", ".")
        b = b.split(";")[0].strip().replace(",", ".")
        try:
            x = float(a)
            y = float(b)
        except ValueError:
            continue
        if not (-10 < x < 200):
            continue
        xs.append(x)
        ys.append(y)
    return xs, ys


def parse_stoe_raw(raw: bytes) -> tuple[list[float], list[float]]:
    """STOE Powder Diffraction RAW (magic 'RAW_1.06').

    Empirical layout (derived from real STOE files):
    * bytes 0..7   : magic 'RAW_1.06'
    * byte  342    : step 2θ  (float32 little-endian)
    * byte  0x218  : end 2θ  (float32 little-endian)
    * header ends at offset len-4*N; data is int32 LE counts until end of file,
      trailing zeros are padding.
    Start 2θ is derived as `end - (n_real-1)*step` after trimming trailing zeros.
    """
    import struct
    import numpy as np

    if len(raw) < 32 or raw[:8] != b"RAW_1.06":
        return [], []

    def read_f32(off: int) -> float | None:
        try:
            v = struct.unpack("<f", raw[off:off + 4])[0]
            return v if v == v else None  # filter NaN
        except Exception:  # noqa: BLE001
            return None

    # 1. step size
    step = read_f32(342)
    if not step or not (0.001 < step < 1.0):
        step = None
        for off in range(256, min(2000, len(raw)) - 4):
            v = read_f32(off)
            if v and 0.001 < v < 1.0 and abs(v - round(v, 4)) < 1e-7:
                step = v
                break
    if not step:
        step = 0.015

    # 2. end 2θ
    end_angle = read_f32(0x218)
    if not end_angle or not (1.0 < end_angle < 180.0):
        end_angle = None
        for off in range(0x200, min(0x400, len(raw)) - 4, 4):
            v = read_f32(off)
            if v and 5.0 < v <= 180.0 and abs(v - round(v, 3)) < 1e-5:
                end_angle = v
                break
    if not end_angle:
        end_angle = 60.0

    # 3. data buffer: fills last (file_size - header) bytes as int32 LE.
    # For RAW_1.06 the header is 2948 bytes; fallback: try sizes that produce a
    # plausible int32 count histogram (values mostly small non-negative ints).
    for header_size in (2948, 2944, 2048, 1024):
        if header_size >= len(raw):
            continue
        nbytes = len(raw) - header_size
        if nbytes % 4 != 0:
            continue
        arr = np.frombuffer(raw[header_size:], dtype="<i4")
        if arr.size < 100:
            continue
        if arr.min() < -10 or arr.max() > 1_000_000_000:
            continue
        break
    else:
        return [], []

    # 4. trim trailing zeros (buffer padding)
    nz = np.nonzero(arr)[0]
    if nz.size == 0:
        return [], []
    last = int(nz[-1]) + 1
    data = arr[:last]

    # 5. derive start: `end_angle` in the header marks the scan stop, which
    # sits one step past the last recorded bin, so start = end - N*step.
    start_angle = end_angle - len(data) * step
    xs = [start_angle + i * step for i in range(len(data))]
    ys = [float(v) for v in data]
    return xs, ys


def detect_and_parse(filename: str, raw_bytes: bytes) -> tuple[list[float], list[float], str, bool]:
    """Auto-detect format. Returns (x, y, format_label, is_reference).

    Reference files are peak lists (usually sparse, discrete 2θ values).
    Binary .raw formats operate on bytes; text formats decode as UTF-8.
    """
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    # 0) Binary STOE RAW_1.06
    if ext == "raw" or raw_bytes[:8] == b"RAW_1.06":
        xs, ys = parse_stoe_raw(raw_bytes)
        if len(xs) >= 2:
            return xs, ys, "stoe-raw", False

    # text-based formats below
    text = raw_bytes.decode("utf-8", errors="ignore")
    head = text[:8192].lower()

    # 1) STOE / Match! peak file
    if ext == "pks" or "pks_" in head or "match!" in head:
        xs, ys = parse_pks(text)
        if len(xs) >= 2:
            return xs, ys, "pks", True

    # 2) STOE WinXPOW Theo
    if "winxpow" in head or "stoe powder" in head:
        xs, ys = parse_stoe_theo(text)
        if len(xs) >= 2:
            return xs, ys, "stoe-theo", True

    # 3) Semicolon CSV (European)
    if ext == "csv" or (";" in text[:512] and "," in text[:512]):
        xs, ys = parse_semicolon_csv(text)
        if len(xs) >= 2:
            is_ref = len(xs) <= 200  # sparse list → reference
            return xs, ys, "csv", is_ref

    # 4) default .xy / two-column
    xs, ys = parse_xy_text(text)
    # If few points, treat as reference
    is_ref = 0 < len(xs) <= 150
    return xs, ys, "xy", is_ref


def snip_background(y: np.ndarray, iterations: int = 40) -> np.ndarray:
    """Unused — retained for reference, may return to the UI later."""
    y = np.asarray(y, dtype=float)
    offset = max(0.0, -y.min() + 1.0)
    v = np.log(np.log(np.sqrt(y + offset) + 1.0) + 1.0)
    n = len(v)
    w = v.copy()
    max_p = min(iterations, (n - 1) // 2)
    for p in range(1, max_p + 1):
        a = w[p:n - p]
        b = (w[: n - 2 * p] + w[2 * p:]) / 2.0
        w[p:n - p] = np.minimum(a, b)
    bg = (np.exp(np.exp(w) - 1.0) - 1.0) ** 2 - offset
    return bg


# ------------- routes -------------
@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


@api.get("/")
async def root():
    return {"service": "xrd-viewer", "status": "ok"}


@api.post("/xrd/parse", response_model=ParsedPattern)
async def parse_file(file: UploadFile = File(...)):
    try:
        raw = await file.read()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"could not read file: {exc}")

    filename = file.filename or "pattern"
    xs, ys, fmt, is_ref = detect_and_parse(filename, raw)
    if len(xs) < 2:
        raise HTTPException(
            status_code=400,
            detail=(
                "No numeric two-column data found. Supported: .xy, .xye, .txt, "
                ".csv, .pks (STOE/Match!), .raw (STOE RAW_1.06), WinXPOW Theo output."
            ),
        )

    name = filename.rsplit(".", 1)[0]
    return ParsedPattern(
        name=name,
        x=xs,
        y=ys,
        points=len(xs),
        x_min=min(xs),
        x_max=max(xs),
        y_max=max(ys),
        is_reference=is_ref,
        source_format=fmt,
    )


@api.post("/xrd/smooth", response_model=ProcessedResponse)
async def smooth(req: SmoothRequest):
    y = np.asarray(req.y, dtype=float)
    if len(y) < req.window:
        raise HTTPException(
            status_code=400,
            detail=f"window ({req.window}) larger than data ({len(y)})",
        )
    window = req.window if req.window % 2 == 1 else req.window + 1
    polyorder = min(req.polyorder, window - 1)
    try:
        ys = savgol_filter(y, window_length=window, polyorder=polyorder)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc))
    return ProcessedResponse(y=ys.tolist())


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.environ.get("CORS_ORIGINS", "*").split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Serve the built React frontend if a ./static directory is bundled next to
# this script (used by the desktop / PyInstaller build).
def _resolve_static_dir() -> Path | None:
    candidates = [
        ROOT_DIR / "static",
        ROOT_DIR.parent / "frontend" / "build",
        Path(getattr(sys, "_MEIPASS", "")) / "static" if hasattr(sys, "_MEIPASS") else None,
        Path(sys.argv[0]).resolve().parent / "static" if sys.argv and sys.argv[0] else None,
    ]
    for c in candidates:
        if c and c.is_dir() and (c / "index.html").exists():
            return c
    return None


_static_dir = _resolve_static_dir()
if _static_dir is not None:
    app.mount("/", StaticFiles(directory=str(_static_dir), html=True), name="static")
    log.info("serving frontend from %s", _static_dir)
